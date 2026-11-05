// Utilidades de interfaz: iconos, hoja inferior, diálogos, selector de sistema de coordenadas y avisos.

import {t, fmtNum} from './i18n.js';
import {
  CRS, REGIONS, FAMILIES, normalizeCode, crsName, crsDescription, crsNote, crsIndex, crsMatches, suggestCrs, safeToWgs84,
  inCrsArea, unknownCrsHelp, addCustomCrs, removeCustomCrs,
} from './crs.js';
import {fmtDist, inverse} from './geodesy.js';

// Iconos de 24 × 24 con trazo de 2 px. Un icono por significado (ver docs/UI_GLOSARIO.md).
// Valor: un trazo (texto) o una lista de partes [{d, fill}] para los que mezclan trazo y relleno.
const P = {
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M19 12H5M11 6l-6 6 6 6',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  pin: 'M12 22s7-7.6 7-13a7 7 0 10-14 0c0 5.4 7 13 7 13zM12 11.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  markPlus: 'M12 22s7-7.6 7-13a7 7 0 10-14 0c0 5.4 7 13 7 13zM12 5.5v7M8.5 9h7',
  rec: 'M12 18a6 6 0 110-12 6 6 0 010 12z',
  recRing: [{d: 'M12 21a9 9 0 110-18 9 9 0 010 18z'}, {d: 'M12 16.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z', fill: true}],
  stop: 'M7 7h10v10H7z',
  locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 19a7 7 0 110-14 7 7 0 010 14zM12 14.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  follow: 'M12 2l7 19-7-4-7 4 7-19z',
  compass: 'M12 22a10 10 0 110-20 10 10 0 010 20zM15.5 8.5l-2 5-5 2 2-5 5-2z',
  route: 'M6 19a2 2 0 110-4 2 2 0 010 4zM18 9a2 2 0 110-4 2 2 0 010 4zM8 17h7a3 3 0 000-6H9a3 3 0 010-6h7',
  flag: 'M5 22V3M5 4h12l-2.5 4.5L17 13H5',
  // Engranaje (ajustes)
  gear: 'M9.4 4.6L9.9 1.7L14.1 1.7L14.6 4.6L15.4 5L17.8 3.2L20.8 6.2L19 8.6L19.4 9.4L22.3 9.9L22.3 14.1L19.4 14.6L19 15.4L20.8 17.8L17.8 20.8L15.4 19L14.6 19.4L14.1 22.3L9.9 22.3L9.4 19.4L8.6 19L6.2 20.8L3.2 17.8L5 15.4L4.6 14.6L1.7 14.1L1.7 9.9L4.6 9.4L5 8.6L3.2 6.2L6.2 3.2L8.6 5zM12 15a3 3 0 110-6 3 3 0 010 6z',
  // Controles deslizantes (opciones de una herramienta)
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
  info: 'M12 22a10 10 0 110-20 10 10 0 010 20zM12 11v6M12 7.5v.5',
  help: 'M12 22a10 10 0 110-20 10 10 0 010 20zM9.2 9.2a2.9 2.9 0 015.6 1c0 1.9-2.8 2.4-2.8 4.3M12 17.6v.4',
  globe: 'M12 22a10 10 0 110-20 10 10 0 010 20zM2.5 9h19M2.5 15h19M12 2c2.6 2.6 3.9 6 3.9 10s-1.3 7.4-3.9 10c-2.6-2.6-3.9-6-3.9-10S9.4 4.6 12 2z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 110-6 3 3 0 010 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3 3.9M6.6 6.6A17 17 0 002 12s3.5 7 10 7a9.6 9.6 0 004.4-1',
  zoom: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  sync: 'M20 11a8 8 0 00-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0014.3 4.9L20 16M20 20v-4h-4',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  download: 'M12 3v12M7 10l5 5 5-5M5 20h14',
  folder: 'M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  sat: 'M4 20l4-4M7 9l3-3 8 8-3 3zM13 4l2-2 7 7-2 2M2 13l2-2 7 7-2 2',
  crosshair: 'M12 3v6M12 15v6M3 12h6M15 12h6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  avg: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 7v5l3 3',
  file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4',
  north: 'M12 2l5 14-5-3-5 3 5-14z',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  select: 'M5 3l13 7.5-5.5 1.5-2 5.5z',
  line: 'M4 19l5-9 5 5 6-11',
  poly: 'M5 19l2-13 11-2 2 11z',
  vertex: 'M5 18l7-12 7 12zM5 18h.01M12 6h.01M19 18h.01',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  magnet: 'M6 4v8a6 6 0 0012 0V4h-4v8a2 2 0 01-4 0V4zM6 8h4M14 8h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  cut: 'M6 9a3 3 0 110-6 3 3 0 010 6zM6 21a3 3 0 110-6 3 3 0 010 6zM8.5 7.5L20 18M8.5 16.5L20 6',
  search: 'M10.5 18a7.5 7.5 0 110-15 7.5 7.5 0 010 15zM16 16l5 5',
  sun: 'M12 16.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zM12 1.5v2.5M12 20v2.5M4.2 4.2L6 6M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8',
  moon: 'M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z',
  // Tamaño del texto: una T grande y una pequeña
  text: 'M3 6V4h11v2M8.5 4v16M6 20h5M14 12v-1.5h7V12M17.5 10.5V20M16 20h3',
  // Guantes (botones grandes): una mano abierta
  hand: 'M7 12.5V6a1.5 1.5 0 013 0v5M10 10.5V4.5a1.5 1.5 0 013 0v6M13 10.5V5.5a1.5 1.5 0 013 0v6M16 11.5V8.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1a6 6 0 01-4.6-2.2L3.2 15a1.6 1.6 0 012.4-2l1.4 1.5',
  // Idioma: «A» y un carácter
  lang: 'M3 5h9M7.5 3v2M10.5 5c-.9 4-3.4 7.2-6.8 8.8M5.8 8.6c1.2 2 3 3.6 5.2 4.5M12.5 21l4.2-10 4.3 10M14 17.5h5.4',
  shield: 'M12 22s8-3.6 8-10V5.2L12 2 4 5.2V12c0 6.4 8 10 8 10zM8.6 12l2.4 2.4 4.5-4.8',
};
const FILLED = new Set(['rec', 'stop', 'north', 'follow']);
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Devuelve un SVG en línea para el icono indicado (decorativo: el botón lleva su propio texto o aria-label). */
export function icon(name, cls = '') {
  const v = P[name] || P.info;
  const parts = Array.isArray(v) ? v : [{d: v, fill: FILLED.has(name)}];
  const paths = parts.map((p) => `<path d="${p.d}" ${p.fill ? 'fill="currentColor" stroke="none"' : STROKE}/>`).join('');
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]); // i18n-ok
}

// ---------------------------------------------------------------------------
// Aviso breve (toast). Dura según el largo del texto: las traducciones son más largas y en el
// campo hace falta tiempo para leerlo (entre 2,5 y 10 s, y nunca menos de lo que pida quien llama).

let toastTimer = null;
export function toast(msg, ms = 2600) {
  const el = $('#toast');
  if (!el) return;
  const text = String(msg ?? '');
  if (!el.hasAttribute('role')) {
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  const dur = Math.max(ms, Math.min(10000, Math.max(2500, 1500 + 55 * text.length)));
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ---------------------------------------------------------------------------
// Hoja inferior (paneles)
const sheetStack = [];

/**
 * Abre un panel inferior (reemplaza al que estuviera abierto).
 * @param {string} title
 * @param {string} html
 * @param {{onClose?: () => void, wide?: boolean, onBack?: () => void}} [opts]
 *   onBack: muestra una flecha «Atrás» que vuelve al panel anterior (y la usa sheetBack()).
 */
export function openSheet(title, html, {onClose, wide, onBack} = {}) {
  const sheet = $('#sheet');
  if (sheetStack.length) {
    const prev = sheetStack[sheetStack.length - 1];
    if (prev.onClose) prev.onClose();
    sheetStack.pop();
  }
  const back = onBack ? `<button type="button" class="icon-btn" data-back aria-label="${esc(t('Atrás'))}">${icon('back')}</button>` : '';
  sheet.innerHTML = `<div class="sheet-head">${back}<h2 id="sheetTitle" tabindex="-1">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="${esc(t('Cerrar'))}">${icon('close')}</button></div><div class="sheet-body">${html}</div>`;
  sheet.classList.toggle('wide', !!wide);
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-labelledby', 'sheetTitle');
  $('[data-close]', sheet).addEventListener('click', closeSheet);
  if (onBack) $('[data-back]', sheet).addEventListener('click', () => sheetBack());
  sheetStack.push({onClose, onBack});
  // El lector de pantalla anuncia el panel nuevo (sin mover la vista)
  const h = $('#sheetTitle', sheet);
  try {
    h.focus({preventScroll: true});
  } catch {
    // navegadores sin opciones de focus()
  }
  return $('.sheet-body', sheet);
}

export function closeSheet() {
  const sheet = $('#sheet');
  if (!sheet.classList.contains('open')) return false;
  const top = sheetStack.pop();
  if (top && top.onClose) top.onClose();
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  return true;
}

/** Vuelve al panel anterior si el abierto tiene «Atrás» (para el botón Atrás de Android). */
export function sheetBack() {
  const top = sheetStack[sheetStack.length - 1];
  if (!sheetIsOpen() || !top || !top.onBack) return false;
  top.onBack();
  return true;
}

export function sheetIsOpen() {
  return $('#sheet').classList.contains('open');
}

// ---------------------------------------------------------------------------
// Diálogos modales

/** Devuélvalo desde el value() de un botón para dejar el diálogo abierto (p. ej. un dato no válido). */
export const KEEP_OPEN = Symbol('keep-open');
const modalStack = [];
let dlgSeq = 0;

/**
 * Diálogo modal.
 * @param {string} title
 * @param {string} html
 * @param {{label: string, value?: any, primary?: boolean, danger?: boolean, tonal?: boolean, disabled?: boolean, icon?: string}[]} buttons
 *   value: valor que devuelve, o función (wrap) => valor; si devuelve KEEP_OPEN, el diálogo sigue abierto.
 * @param {(wrap: HTMLElement) => void} [onOpen]
 * @returns {Promise<any>} el valor del botón, su texto si no tiene valor, o null si se cierra sin elegir
 */
export function dialog(title, html, buttons, onOpen) {
  return new Promise((resolve) => {
    const id = `dlgTitle${++dlgSeq}`;
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="${id}"><h3 id="${id}" tabindex="-1">${esc(title)}</h3><div class="modal-body">${html}</div><div class="modal-actions">${buttons
      .map((b, i) => {
        const cls = [b.primary ? 'primary' : '', b.danger ? 'danger' : '', b.tonal ? 'tonal' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="btn ${cls}" data-i="${i}"${b.disabled ? ' disabled' : ''}>${b.icon ? icon(b.icon) : ''}${esc(b.label)}</button>`;
      })
      .join('')}</div></div>`;
    document.body.appendChild(wrap);
    let closed = false;
    const done = (v) => {
      if (closed) return;
      closed = true;
      wrap.remove();
      const k = modalStack.indexOf(entry);
      if (k >= 0) modalStack.splice(k, 1);
      if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') {
        try {
          prevFocus.focus({preventScroll: true});
        } catch {
          // sin foco que devolver
        }
      }
      resolve(v);
    };
    const entry = () => done(null);
    modalStack.push(entry);
    const press = (i) => {
      const btn = buttons[i];
      const el = wrap.querySelector(`[data-i="${i}"]`);
      if (!btn || (el && el.disabled)) return;
      const v = btn.value !== undefined ? (typeof btn.value === 'function' ? btn.value(wrap) : btn.value) : btn.label;
      if (v !== KEEP_OPEN) done(v);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) press(Number(b.dataset.i));
      else if (e.target === wrap) done(null);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done(null);
      } else if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range])')) {
        // Enter en un campo de texto = botón principal
        const p = buttons.findIndex((b) => b.primary);
        if (p >= 0) {
          e.preventDefault();
          press(p);
        }
      }
    });
    if (onOpen) onOpen(wrap);
    if (!wrap.contains(document.activeElement)) {
      try {
        wrap.querySelector(`#${id}`).focus({preventScroll: true});
      } catch {
        // sin foco
      }
    }
  });
}

export function closeModal() {
  const top = modalStack[modalStack.length - 1];
  if (top) {
    top();
    return true;
  }
  return false;
}

export function confirmDialog(title, msg, okLabel = t('Aceptar'), danger = false) {
  return dialog(title, `<p>${esc(msg)}</p>`, [
    {label: t('Cancelar'), value: false},
    {label: okLabel, value: true, primary: !danger, danger},
  ]);
}

/**
 * Pide un texto.
 * @param {{placeholder?: string, inputmode?: string, hint?: string}} [opts]
 */
export function promptDialog(title, label, value = '', opts = {}) {
  const extra = `${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ''}${opts.inputmode ? ` inputmode="${esc(opts.inputmode)}"` : ''}`;
  return dialog(
    title,
    `<label class="field"><span>${esc(label)}</span><input type="text" id="promptInput" value="${esc(value)}" autocomplete="off"${extra}>${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}</label>`,
    [
      {label: t('Cancelar'), value: null},
      {label: t('Aceptar'), primary: true, value: (w) => w.querySelector('#promptInput').value.trim()},
    ],
    (w) => {
      const inp = w.querySelector('#promptInput');
      inp.focus();
      inp.select();
    },
  );
}

// ---------------------------------------------------------------------------
// Selector de sistema de coordenadas

const REGION_LABEL = Object.fromEntries(REGIONS);
const PROJ_EXAMPLE = '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs'; // i18n-ok (ejemplo de código, no se traduce)

/**
 * Selector de sistema de coordenadas: buscador (nombre, país o código EPSG), sugerencias primero
 * (lo que indica el archivo, el sistema del lugar donde está, WGS 84), sistemas agrupados por región
 * y la opción de pegar una definición PROJ propia. Nunca deja elegido de antemano un sistema de
 * Costa Rica si ni los datos ni la ubicación están en Costa Rica.
 *
 * @param {string} title
 * @param {string} msg texto ya traducido que explica por qué se pregunta (se muestra como texto)
 * @param {{code: string, name?: string}[]|null} [options] códigos permitidos (null = todos los conocidos)
 * @param {string|null} [preselect] sin ctx (llamada antigua): pista del archivo; con ctx: el sistema
 *   que la capa usa ahora
 * @param {{hint?: string|null, sample?: number[]|null, lonLat?: number[]|null, unknownCode?: string|null}} [ctx]
 *   hint: sistema que indica el archivo; sample: primera coordenada [x, y] del archivo; lonLat: lugar de
 *   referencia (si falta, la última posición GPS o el centro del mapa); unknownCode: código que el
 *   archivo declara y la app no conoce
 * @returns {Promise<string|null>} el código elegido o null si se cancela
 */
export function crsDialog(title, msg, options, preselect, ctx) {
  const legacy = ctx === undefined || ctx === null;
  const c = ctx || {};
  const allowed = Array.isArray(options) && options.length ? new Set(options.map((o) => normalizeCode(o.code) || o.code)) : null;
  const sample = Array.isArray(c.sample) && Number.isFinite(c.sample[0]) && Number.isFinite(c.sample[1]) ? c.sample : null;
  const sug = suggestCrs({hint: legacy ? preselect : c.hint, current: legacy ? null : preselect, sample, lonLat: c.lonLat, legacy});
  let selected = sug.pick && (!allowed || allowed.has(sug.pick) || CRS[sug.pick].custom) ? sug.pick : null;
  const unknown = normalizeCode(c.unknownCode) || (c.unknownCode ? String(c.unknownCode) : null);
  let query = '';
  /** @type {Map<string, object>} índice de búsqueda de la lista mostrada */
  let byCode = new Map();

  const listHtml = () => {
    const codes = Object.keys(CRS).filter((k) => !allowed || allowed.has(k) || CRS[k].custom);
    const index = crsIndex(codes);
    byCode = new Map(index.map((e) => [e.code, e]));
    const byRegion = new Map(REGIONS.map(([id]) => [id, []]));
    for (const e of index) (byRegion.get(e.info.region) || byRegion.get('world')).push(e);
    // La región del lugar de referencia va justo después de las sugerencias
    const order = REGIONS.map(([id]) => id);
    const firstLocal = sug.list.map((x) => CRS[x.code] && CRS[x.code].region).find((r) => r && r !== 'world');
    if (firstLocal) order.sort((a, b) => (a === firstLocal ? -1 : b === firstLocal ? 1 : 0));
    const row = (e, reason, group) => {
      const on = e.code === selected;
      const sub = [e.code, crsDescription(e.code)].filter(Boolean).join(' · ');
      return `<button type="button" class="list-row${on ? ' on' : ''}" role="option" aria-selected="${on}" data-code="${esc(e.code)}" data-group="${group}"${e.info.family && FAMILIES[e.info.family] ? ` data-fold="${esc(e.info.family)}"` : ''}>`
        + `<span data-ic>${icon(on ? 'check' : 'globe')}</span><span style="min-width:0;overflow-wrap:anywhere"><b>${esc(e.info.name)}</b><small>${esc(sub)}</small>${reason ? `<small><b>${esc(reason)}</b></small>` : ''}</span></button>`;
    };
    let html = '';
    const sugRows = sug.list.filter((x) => byCode.has(x.code)).map((x) => row(byCode.get(x.code), t(x.reason), 'suggested')).join(''); // i18n-dynamic
    if (sugRows) html += `<div class="section-title" data-head="suggested">${esc(t('Sugeridos'))}</div>${sugRows}`;
    for (const id of order) {
      const list = byRegion.get(id);
      if (!list || !list.length) continue;
      html += `<div class="section-title" data-head="${id}">${esc(t(REGION_LABEL[id]))}</div>`; // i18n-dynamic
      const folded = new Set();
      for (const e of list) {
        const fam = e.info.family && FAMILIES[e.info.family];
        if (fam && !folded.has(e.info.family)) {
          folded.add(e.info.family);
          const zones = t(fam.zones, {from: fam.from, to: fam.to}); // i18n-dynamic
          html += `<button type="button" class="list-row" data-family="${esc(e.info.family)}" data-group="${id}">${icon('search')}<span style="min-width:0"><b>${esc(fam.name)}</b><small>${esc(t('{zones} · toque para ver las zonas', {zones}))}</small></span></button>`;
        }
        html += row(e, '', id);
      }
    }
    html += `<p class="muted text-sm" data-empty hidden></p>`;
    return html;
  };

  const body = `<p>${esc(msg)}</p>${unknown ? `<p class="note info">${esc(unknownCrsHelp(unknown))}</p>` : ''}
    <label class="field"><span>${esc(t('Buscar un sistema'))}</span><input type="search" id="crsQ" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${esc(t('País, nombre, zona UTM o código EPSG'))}"></label>
    <div id="crsList" class="choice" role="listbox" aria-label="${esc(t('Sistemas de coordenadas'))}" style="max-height:min(46vh,440px);overflow-y:auto;margin:8px 0;padding:2px">${listHtml()}</div>
    <div id="crsPrev" class="note" role="status" aria-live="polite" hidden></div>
    <div class="row-actions"><button type="button" class="btn text" id="crsAddBtn" aria-expanded="false">${icon('plus')}${esc(t('Pegar definición PROJ'))}</button></div>
    <div id="crsAdd" hidden>
      <label class="field"><span>${esc(t('Definición PROJ (o WKT)'))}</span><textarea id="crsDef" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${PROJ_EXAMPLE}"></textarea><small>${esc(t('La encuentra en epsg.io (formato PROJ.4) o en QGIS: Propiedades de la capa → Información.'))}</small></label>
      <label class="field"><span>${esc(t('Nombre (opcional)'))}</span><input type="text" id="crsDefName" autocomplete="off" maxlength="80"></label>
      <label class="field"><span>${esc(t('Código EPSG (opcional)'))}</span><input type="text" id="crsDefCode" inputmode="numeric" autocomplete="off" value="${unknown && unknown.startsWith('EPSG:') ? esc(unknown.slice(5)) : ''}"><small>${esc(t('Así la app lo reconoce sola en los próximos archivos.'))}</small></label>
      <div class="row-actions"><button type="button" class="btn tonal" id="crsDefSave">${icon('check')}${esc(t('Comprobar y guardar'))}</button></div>
      <p id="crsDefMsg" class="note" role="alert" hidden></p>
    </div>`;

  return dialog(
    title,
    body,
    [
      {label: t('Cancelar'), value: null},
      {label: t('Usar este sistema'), primary: true, disabled: !selected, value: () => selected || KEEP_OPEN},
    ],
    (w) => {
      const q = $('#crsQ', w), listEl = $('#crsList', w), prev = $('#crsPrev', w), useBtn = w.querySelector('.modal-actions [data-i="1"]');

      const applyFilter = () => {
        const words = query.trim();
        let shown = 0;
        const rows = $$('[data-code], [data-family]', listEl);
        const visibleGroups = new Set();
        for (const r of rows) {
          let vis;
          if (r.dataset.family) vis = !words;
          else if (!words) vis = r.dataset.group === 'suggested' || !r.dataset.fold;
          else vis = r.dataset.group !== 'suggested' && crsMatches(byCode.get(r.dataset.code), words) && shown < 200;
          r.hidden = !vis;
          if (vis) {
            visibleGroups.add(r.dataset.group);
            if (r.dataset.code) shown++;
          }
        }
        $$('[data-head]', listEl).forEach((h) => (h.hidden = !visibleGroups.has(h.dataset.head)));
        const empty = $('[data-empty]', listEl);
        if (words && !shown) {
          const m = words.match(/^(?:epsg\s*:?\s*)?(\d{4,6})$/i);
          empty.textContent = m
            ? t('EPSG:{n} no está en la lista. Toque «Pegar definición PROJ» y pegue la definición que da epsg.io/{n}.', {n: m[1]})
            : t('Ningún sistema coincide con «{q}». Pruebe con el país, la zona UTM (por ejemplo 33N) o el código EPSG.', {q: words});
          empty.hidden = false;
          if (m) $('#crsDefCode', w).value = m[1];
        } else empty.hidden = true;
      };

      const showPreview = () => {
        if (!selected) {
          prev.hidden = true;
          return;
        }
        const lines = [];
        let cls = 'info';
        const note = crsNote(selected);
        if (sample) {
          const ll = safeToWgs84(selected, sample);
          if (!ll) {
            cls = 'bad';
            lines.push(t('Con este sistema, las coordenadas del archivo no dan un lugar válido. Elija otro.'));
          } else {
            lines.push(t('La primera coordenada quedaría en {lat}, {lon} (latitud, longitud).', {lat: ll[1].toFixed(5), lon: ll[0].toFixed(5)}));
            if (!inCrsArea(selected, ll, 1)) {
              cls = 'warn';
              lines.push(t('Ese punto queda fuera de la zona donde se usa este sistema. Si los datos aparecen en otro lugar del mapa, elija otro.'));
            }
            if (sug.pos && sug.pos.source !== 'data') {
              const d = inverse(sug.pos.ll, ll).distance;
              const where = sug.pos.source === 'gps' ? t('Está a {dist} de su ubicación.', {dist: fmtDist(d)}) : t('Está a {dist} del centro del mapa.', {dist: fmtDist(d)});
              lines.push(where);
              if (d > 500e3 && cls === 'info') cls = 'warn';
            }
          }
        }
        if (note) lines.push(note);
        if (CRS[selected] && CRS[selected].custom) lines.push(t('Sistema propio guardado en este teléfono.'));
        prev.className = `note ${cls}`;
        prev.innerHTML = lines.map((x) => `<span style="display:block">${esc(x)}</span>`).join('')
          + (CRS[selected] && CRS[selected].custom ? `<button type="button" class="btn small text" id="crsDel" style="margin-top:4px">${icon('trash')}${esc(t('Borrar este sistema propio'))}</button>` : '');
        prev.hidden = !lines.length;
        const del = $('#crsDel', prev);
        if (del) {
          del.onclick = () => {
            if (del.dataset.armed !== '1') {
              del.dataset.armed = '1';
              del.lastChild.textContent = t('Toque otra vez para borrarlo (las capas que lo usan tendrán que elegir otro)');
              return;
            }
            removeCustomCrs(selected);
            select(null);
            listEl.innerHTML = listHtml();
            applyFilter();
          };
        }
      };

      const select = (code) => {
        selected = code;
        $$('[data-code]', listEl).forEach((r) => {
          const on = r.dataset.code === code;
          r.classList.toggle('on', on);
          r.setAttribute('aria-selected', String(on));
          const ic = $('[data-ic]', r);
          if (ic) ic.innerHTML = icon(on ? 'check' : 'globe');
        });
        useBtn.disabled = !code;
        showPreview();
      };

      listEl.addEventListener('click', (e) => {
        const fam = e.target.closest('[data-family]');
        if (fam) {
          query = FAMILIES[fam.dataset.family].search;
          q.value = query;
          applyFilter();
          listEl.scrollTop = 0;
          return;
        }
        const r = e.target.closest('[data-code]');
        if (r) select(r.dataset.code);
      });
      q.addEventListener('input', () => {
        query = q.value;
        applyFilter();
        listEl.scrollTop = 0;
      });
      q.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        const vis = $$('[data-code]', listEl).filter((r) => !r.hidden);
        if (vis.length === 1) select(vis[0].dataset.code);
        q.blur(); // cierra el teclado para ver la lista
      });

      const addBox = $('#crsAdd', w), addBtn = $('#crsAddBtn', w), msgEl = $('#crsDefMsg', w);
      const openAdd = (open) => {
        addBox.hidden = !open;
        addBtn.setAttribute('aria-expanded', String(open));
      };
      addBtn.onclick = () => {
        openAdd(addBox.hidden);
        if (!addBox.hidden) $('#crsDef', w).focus();
      };
      if (unknown) openAdd(true);
      const save = () => {
        try {
          const code = addCustomCrs({def: $('#crsDef', w).value, name: $('#crsDefName', w).value, epsg: $('#crsDefCode', w).value}, {sample, lonLat: sug.pos && sug.pos.ll});
          msgEl.className = 'note ok';
          msgEl.textContent = crsName(code) === code
            ? t('Guardado como {code}. Ya está elegido; toque «Usar este sistema».', {code})
            : t('Guardado como «{name}» ({code}). Ya está elegido; toque «Usar este sistema».', {name: crsName(code), code});
          msgEl.hidden = false;
          listEl.innerHTML = listHtml();
          query = '';
          q.value = '';
          applyFilter();
          select(code);
          const r = listEl.querySelector(`[data-code="${CSS.escape(code)}"]:not([hidden])`);
          if (r) r.scrollIntoView({block: 'nearest'});
        } catch (err) {
          msgEl.className = 'note bad';
          msgEl.textContent = err && err.message ? err.message : String(err);
          msgEl.hidden = false;
        }
      };
      $('#crsDefSave', w).onclick = save;
      // Enter en los campos del sistema propio = comprobar y guardar (no «Usar este sistema»)
      ['#crsDefName', '#crsDefCode'].forEach((sel) => $(sel, w).addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        save();
      }));

      applyFilter();
      showPreview();
      const cur = selected && listEl.querySelector(`[data-code="${CSS.escape(selected)}"]:not([hidden])`);
      if (cur) cur.scrollIntoView({block: 'nearest'});
      // Sin elección previa, el texto de ayuda dice qué hacer
      if (!selected) {
        prev.className = 'note info';
        prev.textContent = sug.pos ? t('Elija el sistema en que están las coordenadas del archivo. Los sugeridos están arriba.') : t('Elija el sistema en que están las coordenadas del archivo. Si no lo sabe, pregunte a quien le dio el archivo o búsquelo por país.');
        prev.hidden = false;
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Formatos

/** Tamaño de un archivo con las unidades del idioma (KB / Ko). */
export function fmtBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return t('{n} B', {n: fmtNum(n, 0)});
  if (n < 1024 ** 2) return t('{n} KB', {n: fmtNum(n / 1024, 0)});
  if (n < 1024 ** 3) return t('{n} MB', {n: fmtNum(n / 1024 ** 2, 1)});
  return t('{n} GB', {n: fmtNum(n / 1024 ** 3, 2)});
}

/** Duración como h:mm:ss o m:ss (igual en todos los idiomas). */
export function fmtTime(ms) {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
}
