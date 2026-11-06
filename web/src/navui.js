// Interfaz de navegación: seguir una línea (con barra de guía lateral),
// recorrer puntos en orden (replanteo) o ir a un punto.
//
// La tarjeta (#navCard) va abajo del todo (mientras se navega no hay barra inferior ni barra de
// coordenadas) y no debe pasar del 46 % de la altura de la pantalla en un teléfono de 320×568:
// cabecera con el nombre y «Detener», una fila con los 2 o 3 números clave, la barra de guía (solo
// al seguir una línea), una frase de guía (2 renglones reservados; más solo con texto grande) y,
// al recorrer puntos, los botones Anterior / Llegué / Siguiente. Lo demás va en «Detalles», que se
// despliega. Nada cambia de tamaño cuando cambian los números, para que los botones no salten bajo
// el dedo: un número que no cabe en su celda se achica (fitNum), nunca se le cortan cifras.
//
// Seguridad: si la posición es vieja, imprecisa o aproximada, la guía se pausa (números en —,
// flecha y marca de la barra apagadas) y la frase dice por qué y qué hacer.

import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import {Style, Stroke, Fill, Circle as CircleStyle, Text} from 'ol/style.js';
import {RouteFollower, PointSequence, toTarget} from './nav.js';
import {fromLL} from './formats.js';
import {fmtDist, cardinal, angleDiff} from './geodesy.js';
import {t, tn, fmtNum} from './i18n.js';
import {settings, saveNav, loadNav} from './store.js';
import {$, icon, esc, toast, confirmDialog} from './ui.js';
import {call, HAS_NATIVE} from './native.js';

const GUIDE_MAX_AGE = 3000;  // ms: una lectura más vieja no sirve para guiar
const GUIDE_MAX_ACC = 50;    // m: con una precisión peor, la guía se pausa
const ARRIVE_MAX_ACC = 8;    // m: precisión necesaria para marcar la llegada sola
const OFF_REPEAT_MS = 10000; // repite la vibración mientras siga fuera de la línea
const SAVE_EVERY_MS = 15000; // guarda el avance en la línea (por si Android cierra la app)

// Glifos: la forma acompaña siempre al color (✓ bien, ! atención, ✕ fuera, i información, ‖ pausa)
const GLYPHS = {
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 5.5v8.5M12 18.5v.01',
  bad: 'M7 7l10 10M17 7L7 17',
  info: 'M12 11v6.5M12 6.5v.01',
  pause: 'M9 6v12M15 6v12',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  up: 'M12 20V5M6 11l6-6 6 6',
  end: 'M6 21V4h11l-2.5 4L17 12H6',
  more: 'M6 9l6 6 6-6',
  less: 'M6 15l6-6 6 6',
};
const glyph = (k, cls = '') =>
  `<svg class="ng ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS[k]}"/></svg>`;
const ARROW_SVG = '<svg id="navArrow" class="nav-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 19-7-4-7 4z" fill="currentColor" style="stroke: var(--surface)" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/** «12,3 m» → número grande con la unidad más chica (para que quepa en la fila de números). */
function numHtml(txt) {
  const m = /^(.*?)(\s?(?:m|km|ft|mi))$/.exec(txt);
  return m ? `${esc(m[1])}<small>${esc(m[2])}</small>` : esc(txt);
}

export class NavUI {
  constructor(map, gps) {
    this.map = map;
    this.gps = gps;
    this.mode = null; // 'line' | 'points' | 'target'
    this.src = new VectorSource();
    this.layer = new VectorLayer({source: this.src, zIndex: 800, updateWhileAnimating: true, updateWhileInteracting: true});
    this.layer.set('system', true);
    map.addLayer(this.layer);
    this.card = $('#navCard');
    this.offAlerted = false;
    this.arrivedAlerted = -1;
    this.detailsOpen = false;
    // Navegación guardada al cerrarse la app: se usa una sola vez, al reanudarla (main.js)
    this.saved = loadNav();
    gps.onChange((type) => {
      if (type === 'fix' || type === 'heading' || type === 'stale' || type === 'permission' || type === 'sim') this.update();
    });
    // Al girar el teléfono cambia el ancho de las celdas: se vuelven a ajustar los números
    if (typeof window !== 'undefined') window.addEventListener('resize', () => this.refitNums());
  }

  vibrate(ms) {
    if (!settings.vibrate) return;
    if (call('vibrate', ms) === null && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
  }

  // -------------------------------------------------------------------------
  startLine(coords, name, opts = {}) {
    const saved = this.takeSaved();
    this.stop(false);
    this.lastLineState = null;
    this.finishedAlerted = false;
    this.turnAlerted = -1;
    const c = opts.reverse ? [...coords].reverse() : coords;
    this.follower = new RouteFollower(c, {name});
    this.mode = 'line';
    this.meta = {name, coords, reverse: !!opts.reverse, layerId: opts.layerId};
    // Reanudar en el mismo punto de la línea (la app se cerró en el campo)
    if (saved && saved.mode === 'line' && saved.name === name && saved.layerId === opts.layerId && !!saved.reverse === !!opts.reverse && saved.chainage > 0) {
      this.follower.setChainage(saved.chainage);
    }
    this.drawRouteBase();
    this.buildCard();
    this.saveLine(true);
    if (!opts.quiet) toast(t('Siguiendo «{name}» ({len})', {name, len: fmtDist(this.follower.length)}));
    this.update();
  }

  startPoints(points, name, opts = {}) {
    const saved = this.takeSaved();
    this.stop(false);
    this.inside = 0;
    this.arrivedAlerted = -1;
    this.insideIdx = null;
    this.allDoneAlerted = false;
    this.seq = new PointSequence(points);
    if (opts.startIndex) this.seq.goTo(opts.startIndex);
    this.mode = 'points';
    this.meta = {name, points, layerId: opts.layerId};
    // Reanudar: vuelve a marcar los puntos que ya se visitaron
    if (saved && saved.mode === 'points' && saved.name === name && saved.layerId === opts.layerId && Array.isArray(saved.visited)) {
      const byName = new Map(points.map((p, i) => [p.name, i]));
      for (const n of saved.visited) if (byName.has(n)) this.seq.visited.add(byName.get(n));
    }
    this.buildCard();
    this.savePoints(true);
    if (!opts.quiet) toast(tn(points.length, 'Recorriendo {n} punto de «{name}»', 'Recorriendo {n} puntos de «{name}»', {name}));
    this.update(true);
  }

  startTarget(ll, name) {
    this.takeSaved();
    this.stop(false);
    this.target = {ll, name};
    this.mode = 'target';
    this.meta = {name};
    this.buildCard();
    saveNav(null);
    this.update();
  }

  /** Lo guardado al cerrarse la app solo sirve para la primera navegación que se abre. */
  takeSaved() {
    const s = this.saved;
    this.saved = null;
    return s;
  }

  stop(notify = true) {
    this.mode = null;
    this.follower = null;
    this.seq = null;
    this.target = null;
    this.lastLineState = null;
    this.src.clear();
    this.card.hidden = true;
    this.card.classList.remove('off', 'paused', 'details-open', 'has-action');
    document.body.classList.remove('navigating');
    saveNav(null);
    if (notify) toast(t('Navegación terminada'));
  }

  /** Botón «Detener»: pide confirmación solo si se perdería avance. */
  async askStop() {
    let msg = null;
    const v = this.seq ? this.seq.visited.size : 0;
    if (this.mode === 'points' && v && v !== this.seq.points.length) {
      msg = t('Se olvidará qué puntos ya visitó.');
    } else if (this.mode === 'line' && this.lastLineState && this.lastLineState.chainage > 20 && !this.lastLineState.finished) {
      msg = t('Se perderá el avance en la línea.');
    }
    if (msg && !(await confirmDialog(t('¿Dejar de navegar?'), msg, t('Detener'), true))) return;
    if (this.mode) this.stop();
  }

  isActive() {
    return !!this.mode;
  }

  saveLine(force = false) {
    if (this.mode !== 'line') return;
    const s = this.follower.chainage;
    if (!force && (Date.now() - (this.lastSave || 0) < SAVE_EVERY_MS || Math.abs(s - (this.savedChainage ?? -99)) < 5)) return;
    this.lastSave = Date.now();
    this.savedChainage = s;
    saveNav({mode: 'line', ...this.meta, chainage: s});
  }

  savePoints(force = false) {
    if (this.mode !== 'points') return;
    const key = `${this.seq.index}|${this.seq.visited.size}`;
    if (!force && key === this.savedKey) return;
    this.savedKey = key;
    const visited = [...this.seq.visited].map((i) => this.seq.points[i].name);
    saveNav({mode: 'points', name: this.meta.name, layerId: this.meta.layerId, index: this.seq.index, target: this.seq.current && this.seq.current.name, visited});
  }

  // -------------------------------------------------------------------------
  // Dibujo en el mapa (colores fijos: tienen que verse sobre cualquier ortofoto)
  drawRouteBase() {
    this.src.clear();
    const f = this.follower;
    const label = (text) => new Text({text, offsetY: -18, font: '700 14px system-ui, sans-serif', fill: new Fill({color: '#000'}), stroke: new Stroke({color: '#fff', width: 4})});
    const all = new Feature(new LineString(f.ll.map(fromLL)));
    all.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 9, lineCap: 'round'})}), new Style({stroke: new Stroke({color: '#008295', width: 5, lineCap: 'round'})})]);
    this.done = new Feature();
    this.done.setStyle(new Style({stroke: new Stroke({color: 'rgba(60,60,60,0.75)', width: 5, lineCap: 'round'})}));
    this.seg = new Feature();
    this.seg.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 11, lineCap: 'round'})}), new Style({stroke: new Stroke({color: '#e6007e', width: 6, lineCap: 'round'})})]);
    this.link = new Feature();
    this.link.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 4})}), new Style({stroke: new Stroke({color: '#e6007e', width: 2, lineDash: [6, 6]})})]);
    this.vtx = new Feature();
    this.vtx.setStyle(new Style({image: new CircleStyle({radius: 8, fill: new Fill({color: '#ffeb3b'}), stroke: new Stroke({color: '#000', width: 2})})}));
    const start = new Feature(new Point(fromLL(f.ll[0])));
    start.setStyle(new Style({image: new CircleStyle({radius: 8, fill: new Fill({color: '#00c853'}), stroke: new Stroke({color: '#fff', width: 3})}), text: label(t('Inicio'))}));
    const end = new Feature(new Point(fromLL(f.ll[f.ll.length - 1])));
    end.setStyle(new Style({image: new CircleStyle({radius: 8, fill: new Fill({color: '#d50000'}), stroke: new Stroke({color: '#fff', width: 3})}), text: label(t('Fin'))}));
    this.src.addFeatures([all, this.done, this.seg, this.link, this.vtx, start, end]);
  }

  drawPoints(state) {
    this.src.clear();
    const feats = this.seq.points.map((p, i) => {
      const ft = new Feature(new Point(fromLL(p.ll)));
      const visited = this.seq.visited.has(i);
      const cur = i === this.seq.index;
      // Actual: grande, amarillo y con nombre; visitado: verde con borde blanco; pendiente: blanco con borde negro
      ft.setStyle(
        new Style({
          image: new CircleStyle({
            radius: cur ? 11 : visited ? 4.5 : 5.5,
            fill: new Fill({color: cur ? '#ffeb3b' : visited ? '#00c853' : '#ffffff'}),
            stroke: new Stroke({color: cur ? '#e6007e' : visited ? '#ffffff' : '#000000', width: cur ? 4 : 1.5}),
          }),
          text: cur ? new Text({text: String(p.name ?? ''), offsetY: -20, font: '700 14px system-ui, sans-serif', fill: new Fill({color: '#000'}), stroke: new Stroke({color: '#fff', width: 4})}) : undefined,
          zIndex: cur ? 10 : visited ? 1 : 2,
        }),
      );
      return ft;
    });
    this.link = new Feature();
    this.link.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 4.5})}), new Style({stroke: new Stroke({color: '#e6007e', width: 2.5, lineDash: [8, 6]})})]);
    this.src.addFeatures([...feats, this.link]);
    if (state && this.gps.fix && this.usable()) this.link.setGeometry(new LineString([fromLL([this.gps.fix.lon, this.gps.fix.lat]), fromLL(state.targetLL)]));
  }

  // -------------------------------------------------------------------------
  // Tarjeta
  buildCard() {
    document.body.classList.add('navigating');
    const c = this.card;
    c.hidden = false;
    c.classList.remove('off', 'paused', 'has-action');
    c.classList.toggle('details-open', this.detailsOpen);
    // La frase de guía se anuncia aparte (#navLive) solo cuando cambia de caso; la tarjeta no
    c.setAttribute('aria-live', 'off');
    c.setAttribute('aria-label', t('Guía de navegación'));
    this.cache = {};
    this.liveKey = null;
    const isLine = this.mode === 'line';
    const headIcon = icon(isLine ? 'route' : 'follow');
    const title = this.mode === 'points' ? '' : esc(this.meta.name);
    const head = `
      <div class="nav-head">
        <button id="navMore" class="nav-head-btn" aria-controls="navDetails" aria-expanded="${this.detailsOpen}">
          <span class="nav-head-ic">${headIcon}</span>
          <span class="nav-head-txt"><span id="navTitle" class="nav-title">${title}</span><span class="nav-sub"><span id="navAcc" class="nav-acc"></span><span id="navSub"></span></span></span>
          <span id="navMoreIc" class="nav-more-ic" aria-hidden="true">${glyph(this.detailsOpen ? 'less' : 'more')}</span>
          <span class="nav-sr">${t('Detalles')}</span>
        </button>
        <button id="navStop" class="btn danger nav-stop">${icon('stop')}<span>${t('Detener')}</span></button>
      </div>`;
    const guide = `<div id="navGuide" class="nav-guide" data-state="info"><span id="navGuideIc">${glyph('info')}</span><span id="navGuideTxt" class="ng-txt"></span></div>
      <button id="navAction" class="btn primary nav-action" hidden></button>
      <span id="navLive" class="nav-sr" aria-live="polite"></span>`;
    let nums, middle = '', actions = '', details;
    if (isLine) {
      nums = `
        <div class="nav-nums">
          <div class="nav-cell"><div class="lbl">${t('Corrija')}</div><div id="navXte" class="big">—</div></div>
          <div class="nav-cell"><div id="navTurnLbl" class="lbl">${t('Giro en')}</div><div id="navTurn" class="big">—</div></div>
          <div class="nav-cell opt"><div class="lbl">${t('Falta')}</div><div id="navLeft" class="big">—</div></div>
        </div>`;
      middle = `
        <div class="lightbar" role="img" aria-label="${esc(t('Barra de guía: el punto es usted y la raya del centro es la línea.'))}">
          <div id="lbTrack" class="lb-track"><i class="lb-out l"></i><i class="lb-out r"></i><i class="lb-ok"></i><i class="lb-tick l"></i><i class="lb-tick r"></i><i class="lb-center"></i><div id="lbMark" class="lb-mark none"></div></div>
        </div>`;
      details = `
        <div class="nav-progress"><div id="navProg" class="bar"><i></i></div><span id="navProgTxt"></span></div>
        <p id="navDetGps" class="nav-det"></p>
        <p id="navDetLegend" class="nav-det muted"></p>
        <div class="nav-det-actions">
          <button id="navResync" class="btn">${icon('sync')}<span>${t('Ubicarme en la ruta')}</span></button>
          <button id="navReverse" class="btn">${icon('swap')}<span>${t('Invertir sentido')}</span></button>
        </div>`;
    } else {
      nums = `
        <div class="nav-nums tall">
          <div class="nav-cell"><div class="lbl">${t('Distancia')}</div><div id="navDist" class="big">—</div></div>
          <div class="nav-cell"><div class="lbl">${t('Dirección')}</div><div class="big">${ARROW_SVG}<span class="nav-brg"><b id="navBrgCard">—</b><small id="navBrgDeg"></small></span></div></div>
        </div>`;
      details = `
        ${this.mode === 'points' ? `<div class="nav-progress"><div id="navProg" class="bar"><i></i></div><span id="navProgTxt"></span></div><p class="nav-det">${esc(t('Capa: {name}', {name: this.meta.name}))}</p>` : ''}
        <p id="navDetGps" class="nav-det"></p>
        ${this.mode === 'points' ? '<p id="navDetArr" class="nav-det muted"></p>' : ''}
        <p id="navDetHead" class="nav-det muted"></p>`;
      if (this.mode === 'points') {
        actions = `
          <div class="nav-actions">
            <button id="navPrev" class="btn nav-step" aria-label="${esc(t('Punto anterior'))}">${glyph('left')}<span class="nav-step-lbl">${t('Anterior')}</span></button>
            <button id="navHere" class="btn primary nav-here">${icon('check')}<span>${t('Llegué')}</span></button>
            <button id="navNext" class="btn nav-step" aria-label="${esc(t('Punto siguiente'))}"><span class="nav-step-lbl">${t('Siguiente')}</span>${glyph('right')}</button>
          </div>`;
      }
    }
    c.innerHTML = `${head}${nums}${middle}${guide}<div id="navDetails" class="nav-details" ${this.detailsOpen ? '' : 'hidden'}>${details}</div>${actions}`;

    $('#navStop').onclick = () => this.askStop();
    $('#navMore').onclick = () => this.toggleDetails();
    if (isLine) {
      $('#navResync').onclick = () => {
        this.follower.resync();
        this.lastFixKey = null;
        this.lastLineState = null;
        toast(t('Buscando su posición en toda la ruta'));
        this.update();
      };
      $('#navReverse').onclick = () => this.reverse();
    } else if (this.mode === 'points') {
      $('#navPrev').onclick = () => { this.seq.prev(); this.arrivedAlerted = -1; this.inside = 0; this.update(true); };
      $('#navNext').onclick = () => { this.seq.next(); this.arrivedAlerted = -1; this.inside = 0; this.update(true); };
      $('#navHere').onclick = () => this.arrivedHere();
    } else {
      const feat = new Feature(new Point(fromLL(this.target.ll)));
      feat.setStyle(new Style({image: new CircleStyle({radius: 10, fill: new Fill({color: '#ffeb3b'}), stroke: new Stroke({color: '#e6007e', width: 4})})}));
      this.link = new Feature();
      this.link.setStyle([new Style({stroke: new Stroke({color: '#ffffff', width: 4.5})}), new Style({stroke: new Stroke({color: '#e6007e', width: 2.5, lineDash: [8, 6]})})]);
      this.src.clear();
      this.src.addFeatures([feat, this.link]);
    }
    if (this.mode === 'points') this.drawPoints(null);
  }

  toggleDetails() {
    this.detailsOpen = !this.detailsOpen;
    const d = $('#navDetails'), b = $('#navMore');
    if (d) d.hidden = !this.detailsOpen;
    if (b) b.setAttribute('aria-expanded', String(this.detailsOpen));
    this.setHtml('navMoreIc', glyph(this.detailsOpen ? 'less' : 'more'));
    this.card.classList.toggle('details-open', this.detailsOpen);
  }

  reverse() {
    if (this.mode !== 'line') return;
    this.startLine(this.meta.coords, this.meta.name, {reverse: !this.meta.reverse, layerId: this.meta.layerId, quiet: true});
    toast(t('Sentido invertido: ahora va hacia el otro extremo.'));
  }

  /** Botón «Llegué»: marca el punto como visitado y pasa al siguiente. */
  arrivedHere() {
    const seq = this.seq;
    seq.markVisited();
    if (seq.index < seq.points.length - 1) seq.next();
    else this.lastPointSummary();
    this.arrivedAlerted = -1;
    this.inside = 0;
    this.update(true);
  }

  /** Aviso al llegar al último punto: cuántos se visitaron y cuáles faltan. */
  lastPointSummary() {
    const missing = this.seq.missing();
    if (!missing.length) {
      toast(tn(this.seq.points.length, 'Visitó el punto ({n}).', 'Visitó todos los puntos ({n}).'), 5000);
      return;
    }
    const list = missing.slice(0, 5).join(', ') + (missing.length > 5 ? ', …' : '');
    toast(tn(missing.length, 'Último punto. Falta {n}: {list}', 'Último punto. Faltan {n}: {list}', {list}), 7000);
  }

  // -------------------------------------------------------------------------
  usability() {
    return this.gps.usability({maxAge: GUIDE_MAX_AGE, maxAcc: GUIDE_MAX_ACC});
  }

  usable() {
    return this.usability().ok;
  }

  update(redraw = false) {
    if (!this.mode) return;
    const fix = this.gps.fix;
    // Lecturas viejas, muy imprecisas o con permiso aproximado no sirven para guiar
    const u = this.usability();
    if (!u.ok) {
      if (redraw && this.mode === 'points') this.drawPoints(null);
      this.render(null, null, u);
      return;
    }
    const ll = [fix.lon, fix.lat];
    // Los eventos de brújula llegan ~10 veces por segundo: el ajuste a la ruta y
    // los contadores de lecturas consecutivas solo avanzan con una lectura GNSS nueva.
    const fixKey = `${fix.time}|${fix.lat}|${fix.lon}`;
    const newFix = fixKey !== this.lastFixKey;
    this.lastFixKey = fixKey;
    if (this.mode === 'line') {
      if (newFix || !this.lastLineState) {
        const motion = !(fix.courseAcc > 30) ? {course: fix.course, speed: fix.speed} : null;
        this.lastLineState = this.follower.update(ll, motion);
        this.alerts(this.lastLineState, fix);
        this.saveLine();
      }
      this.render(this.lastLineState, fix);
    } else if (this.mode === 'points') {
      let st = this.seq.update(ll, settings.arrivalRadius);
      // Llegada: 2 lecturas seguidas dentro del radio y precisión no peor que 8 m
      st.lowAcc = fix.acc > ARRIVE_MAX_ACC;
      if (newFix) {
        this.inside = st.arrived && !st.lowAcc ? (this.insideIdx === st.index ? this.inside + 1 : 1) : 0;
        this.insideIdx = st.index;
      }
      st.arrived = this.inside >= 2;
      if (st.arrived && this.arrivedAlerted !== st.index) {
        this.arrivedAlerted = st.index;
        this.vibrate(400);
        this.seq.markVisited();
        if (settings.autoAdvance && !st.isLast) {
          const nextName = this.seq.points[st.index + 1].name;
          toast(t('Llegó a {name}. Siguiente punto: {next}.', {name: st.name, next: nextName}));
          this.seq.next();
          this.inside = 0;
          st = this.seq.update(ll, settings.arrivalRadius);
          st.lowAcc = fix.acc > ARRIVE_MAX_ACC;
          redraw = true;
        } else if (st.isLast) {
          this.lastPointSummary();
        } else toast(t('Llegó a {name}.', {name: st.name}));
      }
      if (redraw || this.drawnIndex !== this.seq.index) {
        this.drawPoints(st);
        this.drawnIndex = this.seq.index;
      } else if (this.link) {
        this.link.setGeometry(new LineString([fromLL(ll), fromLL(st.targetLL)]));
      }
      this.savePoints();
      this.render(st, fix);
    } else {
      const r = toTarget(ll, this.target.ll);
      this.link.setGeometry(new LineString([fromLL(ll), fromLL(this.target.ll)]));
      this.render({mode: 'target', distance: r.distance, bearing: r.bearing}, fix);
    }
  }

  alerts(st, fix) {
    // No se vibra por desvíos menores que la precisión del GPS (el aviso sería ruido)
    const thr = Math.max(settings.offRouteAlert, fix ? fix.acc : 0, 0.5);
    const ax = Math.abs(st.xte);
    if (ax > thr) {
      const now = Date.now();
      if (!this.offAlerted || now - (this.lastOffVibe || 0) > OFF_REPEAT_MS) {
        this.offAlerted = true;
        this.lastOffVibe = now;
        this.vibrate(250);
      }
    } else if (ax < thr * 0.8) this.offAlerted = false;
    // Aviso corto al llegar a un giro
    const nt = st.nextTurn;
    if (nt && nt.dir !== 'end' && nt.dir !== 'straight' && nt.dist < Math.max(3, settings.offRouteAlert) && this.turnAlerted !== nt.vertex) {
      this.turnAlerted = nt.vertex;
      this.vibrate(120);
    }
    if (st.finished && !this.finishedAlerted) {
      this.finishedAlerted = true;
      this.vibrate(600);
      toast(t('Fin de la ruta'));
    }
  }

  // -------------------------------------------------------------------------
  // Pintar la tarjeta. Solo se toca el DOM cuando un valor cambia.
  setText(id, v) {
    if (this.cache[id] === v) return;
    this.cache[id] = v;
    const e = document.getElementById(id);
    if (e) e.textContent = v;
  }

  setHtml(id, v) {
    if (this.cache['h:' + id] === v) return;
    this.cache['h:' + id] = v;
    const e = document.getElementById(id);
    if (!e) return;
    e.innerHTML = v;
    if (e.classList.contains('big')) this.fitNum(e);
  }

  /**
   * Número grande que no cabe en su celda (p. ej. «4 999 ft» junto a la flecha de giro, o con texto
   * grande): se achica la letra del número, hasta el 60 %, en vez de cortarle cifras sin aviso.
   * La celda no cambia de alto. Si ni así cabe, el CSS muestra «…».
   */
  fitNum(e) {
    const s = e.querySelector(':scope > span');
    if (!s) return;
    s.style.fontSize = '';
    const need = s.scrollWidth, room = s.clientWidth;
    if (room > 0 && need > room) s.style.fontSize = `${Math.max(0.6, Math.floor((room / need) * 100) / 100)}em`;
  }

  refitNums() {
    if (!this.mode || this.card.hidden) return;
    this.card.querySelectorAll('.big[id]').forEach((e) => this.fitNum(e));
  }

  /**
   * Frase de guía (una por caso; reserva 2 renglones). state: 'ok' | 'warn' | 'bad' | 'info' | 'pause'.
   * key identifica el caso para anunciarlo a TalkBack solo cuando cambia.
   */
  guide(state, text, key, action = null) {
    const box = document.getElementById('navGuide');
    if (!box) return;
    if (box.dataset.state !== state) {
      box.dataset.state = state;
      this.setHtml('navGuideIc', glyph(state));
    }
    this.setText('navGuideTxt', text);
    // Acción de la frase (p. ej. «Invertir sentido»): botón ancho que ocupa el lugar de la barra
    // de guía o de los botones de puntos mientras haga falta, para que la tarjeta no crezca
    const btn = document.getElementById('navAction');
    if (btn) {
      btn.hidden = !action;
      this.card.classList.toggle('has-action', !!action);
      if (action) {
        this.setText('navAction', action.label);
        btn.onclick = action.fn;
      }
    }
    if (key !== this.liveKey) {
      this.liveKey = key;
      this.setText('navLive', text);
    }
  }

  /** La guía está en pausa: explica por qué y qué hacer. */
  pausedGuide(u) {
    const openSettings = HAS_NATIVE ? {label: t('Ajustes de la app'), fn: () => call('openAppSettings')} : null;
    switch (u.code) {
      case 'denied': return this.guide('bad', t('Sin permiso de ubicación: guía en pausa.'), 'p-denied', openSettings);
      case 'off': return this.guide('bad', t('Ubicación del teléfono apagada: guía en pausa.'), 'p-off');
      case 'approximate': return this.guide('warn', t('Solo ubicación aproximada: active «Ubicación precisa».'), 'p-approx', openSettings);
      case 'none': return this.guide('pause', t('Buscando señal GPS… Salga a cielo abierto.'), 'p-none');
      case 'stale':
        return this.guide('pause', u.age < 120000
          ? t('Sin señal GPS hace {s} s: guía en pausa.', {s: fmtNum(u.age / 1000, 0)})
          : t('Sin señal GPS hace {m} min: guía en pausa.', {m: fmtNum(u.age / 60000, 0)}), 'p-stale');
      default: return this.guide('pause', t('GPS muy impreciso (±{acc}): guía en pausa.', {acc: fmtDist(u.acc)}), 'p-poor');
    }
  }

  /** Línea de precisión (cabecera y detalles). warnThr: alerta de desvío, si aplica. */
  renderAcc(fix, warnThr) {
    if (!fix) {
      this.setHtml('navAcc', '');
      this.setText('navDetGps', t('Sin posición GPS.'));
      return;
    }
    const acc = fmtDist(fix.acc);
    const worse = warnThr !== undefined && fix.acc > warnThr;
    const accEl = document.getElementById('navAcc');
    if (accEl) accEl.classList.toggle('warn', worse);
    this.setHtml('navAcc', worse ? `${glyph('warn')}±${esc(acc)}` : '');
    this.setText('navDetGps', worse
      ? t('El GPS (±{acc}) es menos preciso que su alerta de desvío ({thr}): las indicaciones pueden fallar.', {acc, thr: fmtDist(warnThr)})
      : t('Precisión del GPS: ±{acc}.', {acc}));
  }

  render(st, fix, u) {
    if (!this.mode) return;
    const paused = !st;
    this.card.classList.toggle('paused', paused);
    if (paused) {
      this.card.classList.remove('off');
      ['navXte', 'navTurn', 'navLeft', 'navDist', 'navBrgCard'].forEach((id) => this.setHtml(id, '—'));
      this.setText('navBrgDeg', '');
      const mark = document.getElementById('lbMark');
      if (mark) mark.className = 'lb-mark none';
      const arrow = document.getElementById('navArrow');
      if (arrow) arrow.classList.add('dim');
      if (this.link) this.link.setGeometry(null);
      this.renderAcc(null);
      this.renderHeader(null);
      this.pausedGuide(u || this.usability());
      return;
    }
    this.renderHeader(st);
    if (st.mode === 'line') this.renderLine(st, fix);
    else this.renderPoint(st, fix);
  }

  renderHeader(st) {
    if (this.mode === 'line') {
      const f = this.follower;
      let sub;
      if (!st) sub = f.lines ? tn(f.lines.count, '{n} línea · {len}', '{n} líneas · {len}', {len: fmtDist(f.length)}) : fmtDist(f.length);
      else if (st.lines) sub = st.connector ? t('Hacia la línea {k} de {n}', {k: st.line, n: st.lines}) : t('Línea {k} de {n}', {k: st.line, n: st.lines});
      else sub = t('Tramo {k} de {n}', {k: st.segment, n: st.segments});
      this.setText('navSub', sub);
    } else if (this.mode === 'points') {
      const seq = this.seq;
      const pt = seq.current;
      this.setText('navTitle', pt.line ? t('{name} · línea {line}', {name: pt.name, line: pt.line}) : String(pt.name));
      const v = seq.visited.size, n = seq.points.length;
      this.setText('navSub', t('Punto {k} de {n}', {k: seq.index + 1, n}));
      const bar = document.querySelector('#navProg i');
      if (bar) bar.style.width = `${((v / n) * 100).toFixed(1)}%`;
      this.setText('navProgTxt', t('Visitados: {v} de {n}', {v: fmtNum(v, 0), n: fmtNum(n, 0)}));
      this.setText('navDetArr', t('Radio de llegada: {r}. La llegada se marca sola con GPS ±{acc} o mejor; si no, toque «Llegué».', {r: fmtDist(settings.arrivalRadius), acc: fmtDist(ARRIVE_MAX_ACC)}));
    } else {
      this.setText('navSub', t('Ir al punto'));
    }
  }

  renderLine(st, fix) {
    const thr = Math.max(0.1, settings.offRouteAlert);
    const okThr = thr / 2; // un solo umbral «sobre la línea» para el color, el glifo y la frase
    const ax = Math.abs(st.xte);
    const zone = ax <= okThr ? 'ok' : ax <= thr ? 'warn' : 'bad';
    const dir = st.correction; // 'right' | 'left' | null
    const d = fmtDist(ax);
    this.card.classList.toggle('off', zone === 'bad');
    this.renderAcc(fix, thr);

    // Números: corrección (flecha hacia donde moverse), próximo giro y lo que falta
    this.setHtml('navXte', `${glyph(zone === 'ok' || !dir ? 'ok' : dir)}<span>${numHtml(d)}</span>`);
    const nt = st.nextTurn;
    this.setText('navTurnLbl', nt.dir === 'end' ? t('Fin en') : t('Giro en'));
    const turnIc = nt.dir === 'end'
      ? glyph('end')
      : `<svg class="ng" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${Math.max(-150, Math.min(150, Math.round(nt.angle)))}deg)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${GLYPHS.up}"/></svg>`;
    this.setHtml('navTurn', `${turnIc}<span>${numHtml(fmtDist(nt.dist))}</span>`);
    this.setHtml('navLeft', `<span>${numHtml(fmtDist(st.remaining))}</span>`);

    // Barra de guía: zona verde = ±la mitad de la alerta; rayas = ±alerta; afuera, rayado
    const range = Math.max(1, thr * 2.5);
    const trk = document.getElementById('lbTrack');
    const cfg = `${thr}|${range}`;
    if (trk && this.cache.lb !== cfg) {
      this.cache.lb = cfg;
      trk.style.setProperty('--lb-ok', `${((okThr / range) * 50).toFixed(2)}%`);
      trk.style.setProperty('--lb-thr', `${((thr / range) * 50).toFixed(2)}%`);
      this.setText('navDetLegend', t('El punto es usted y la raya del centro es la línea. Verde: a menos de {ok}. Rayado: a más de {thr} (su alerta de desvío).', {ok: fmtDist(okThr), thr: fmtDist(thr)}));
    }
    const mark = document.getElementById('lbMark');
    if (mark) {
      // xte > 0: el usuario está a la izquierda → la marca se dibuja a la izquierda del centro
      const pos = Math.max(-1, Math.min(1, -st.xte / range));
      mark.style.left = `${(50 + pos * 50).toFixed(1)}%`;
      if (this.cache.mark !== zone) {
        this.cache.mark = zone;
        mark.className = `lb-mark ${zone}`;
        mark.innerHTML = glyph(zone);
      }
    }

    // Avance (en Detalles)
    const bar = document.querySelector('#navProg i');
    if (bar) bar.style.width = `${(st.progress * 100).toFixed(1)}%`;
    this.setText('navProgTxt', t('{done} de {total} · {pct} %', {done: fmtDist(st.chainage), total: fmtDist(st.length), pct: fmtNum(Math.round(st.progress * 100), 0)}));

    // Frase de guía, por prioridad
    const soon = Math.max(8, thr * 3);
    if (st.wrongWay) {
      this.guide('warn', t('Va en sentido contrario a la línea.'), 'wrong', {label: t('Invertir sentido'), fn: () => this.reverse()});
    } else if (st.finished) {
      this.guide('ok', t('Fin de la ruta. Toque «Detener» para salir.'), 'finished');
    } else if (zone === 'bad') {
      this.guide('bad', dir === 'right' ? t('Muévase {d} a la derecha: está fuera de la línea.', {d}) : t('Muévase {d} a la izquierda: está fuera de la línea.', {d}), `bad-${dir}`);
    } else if (nt.dist <= soon && nt.dir !== 'straight') {
      const p = {d: fmtDist(nt.dist)};
      const txt = nt.dir === 'right' ? t('En {d}, gire a la derecha.', p) : nt.dir === 'left' ? t('En {d}, gire a la izquierda.', p) : t('En {d}, termina la ruta.', p);
      this.guide('info', txt, `turn-${nt.vertex}`);
    } else if (zone === 'warn') {
      this.guide('warn', dir === 'right' ? t('Muévase {d} a la derecha.', {d}) : t('Muévase {d} a la izquierda.', {d}), `warn-${dir}`);
    } else {
      this.guide('ok', t('Va sobre la línea. Siga así.'), 'ok');
    }

    // Geometrías de avance
    const f = this.follower;
    const doneCoords = f.ll.slice(0, st.segment).concat([st.snappedLL]);
    this.done.setGeometry(doneCoords.length > 1 ? new LineString(doneCoords.map(fromLL)) : null);
    this.seg.setGeometry(new LineString([fromLL(st.snappedLL), fromLL(f.ll[st.nextVertex])]));
    this.vtx.setGeometry(new Point(fromLL(f.ll[st.nextVertex])));
    this.link.setGeometry(fix ? new LineString([fromLL([fix.lon, fix.lat]), fromLL(st.snappedLL)]) : null);
  }

  renderPoint(st, fix) {
    this.card.classList.remove('off');
    this.renderAcc(fix);
    this.setHtml('navDist', `<span>${numHtml(fmtDist(st.distance))}</span>`);
    this.setText('navBrgCard', cardinal(st.bearing));
    this.setText('navBrgDeg', `${fmtNum(Math.round(st.bearing) % 360, 0)}°`);
    const h = this.gps.displayHeading();
    const arrow = document.getElementById('navArrow');
    if (arrow) {
      const rot = h ? angleDiff(st.bearing, h.deg) : angleDiff(st.bearing, (-this.map.getView().getRotation() * 180) / Math.PI);
      arrow.style.transform = `rotate(${rot.toFixed(0)}deg)`;
      arrow.classList.toggle('dim', !!(h && h.uncalibrated));
    }
    this.setText('navDetHead', !h ? t('La flecha se orienta con el mapa: no hay brújula ni marcha.') : h.src === 'compass' ? t('La flecha usa la brújula del teléfono.') : t('La flecha usa su dirección de marcha (GPS).'));

    // Frase de guía, por prioridad
    const acc = fmtDist(fix.acc);
    if (st.mode === 'points') {
      const seq = this.seq;
      if (seq.visited.size === seq.points.length) {
        if (!this.allDoneAlerted) {
          this.allDoneAlerted = true;
          this.vibrate(600);
        }
        return this.guide('ok', tn(seq.points.length, 'Visitó el punto ({n}).', 'Visitó todos los puntos ({n}).'), 'all');
      }
      if (st.arrived) {
        return this.guide('ok', settings.autoAdvance || st.isLast ? t('Llegó a {name}.', {name: st.name}) : t('Llegó a {name}. Toque → para seguir.', {name: st.name}), `arr-${st.index}`);
      }
      if (st.lowAcc && st.distance <= settings.arrivalRadius + fix.acc + 5) {
        return this.guide('warn', t('GPS ±{acc}: toque «Llegué» cuando esté en el punto.', {acc}), 'lowacc');
      }
    } else if (st.distance <= settings.arrivalRadius) {
      return this.guide('ok', t('Llegó al punto.'), 'arr-target');
    }
    if (st.distance < fix.acc) return this.guide('info', t('Muy cerca: el GPS no puede afinar más (±{acc}).', {acc}), 'near');
    if (!h) return this.guide('info', t('Sin brújula: la flecha sigue el mapa.'), 'nohead');
    if (h.uncalibrated) return this.guide('warn', t('Brújula sin calibrar: haga un 8 con el teléfono.'), 'uncal');
    return this.guide('info', t('Camine hacia donde apunta la flecha.'), 'walk');
  }
}
