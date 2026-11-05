// Mapas base en línea (opcionales; requieren internet): OpenStreetMap,
// Google Maps Platform (Map Tiles API, con la clave del propio usuario) y
// mapas base XYZ que el usuario agrega igual que en QGIS (ver xyz.js).
//
// Google: se usa la API oficial de teselas 2D (sesión + teselas + atribución
// por ventana) a través de ol/source/Google. Las condiciones de Google exigen
// mostrar el logotipo y la atribución de datos sobre el mapa y no permiten
// guardar las teselas para usarlas sin conexión, por eso este mapa base solo
// funciona con internet y la app no lo almacena.

import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import XYZ from 'ol/source/XYZ.js';
import Google from 'ol/source/Google.js';
import Control from 'ol/control/Control.js';
import {tileUrl, escapeHtml} from './xyz.js';
import {t, N_, locale} from './i18n.js';
import {settings} from './store.js';

// Nombres de los mapas base (se traducen al mostrarlos). Los de Google necesitan una clave propia.
const BASEMAP_NAMES = [
  ['none', N_('Sin mapa de fondo (solo sus capas; funciona sin internet)')],
  ['osm', N_('OpenStreetMap (necesita internet)')],
  ['g-satellite', N_('Google · satélite (internet y clave de Google)')],
  ['g-hybrid', N_('Google · satélite con calles y nombres (internet y clave de Google)')],
  ['g-roadmap', N_('Google · calles (internet y clave de Google)')],
  ['g-terrain', N_('Google · relieve (internet y clave de Google)')],
];

/**
 * [id, nombre] de cada mapa base. El nombre se traduce al leerlo (en el idioma en uso), así que
 * `BASEMAPS.map(([k, n]) => …)` ya muestra el texto traducido.
 */
export const BASEMAPS = BASEMAP_NAMES.map(([id, label]) => {
  const row = [id];
  Object.defineProperty(row, 1, {get: () => t(label), enumerable: true}); // i18n-dynamic
  return row;
});

/** Nombre traducido de un mapa base (o null si no es de la lista). */
export function basemapName(id) {
  const r = BASEMAP_NAMES.find((x) => x[0] === id);
  return r ? t(r[1]) : null; // i18n-dynamic
}

/** ¿El mapa base necesita la clave de Google? */
export const needsGoogleKey = (id) => String(id || '').startsWith('g-');

/**
 * Idioma y región de las teselas de Google según el idioma de la app y el país del teléfono
 * (p. ej. «fr» + «CA»). Sin país conocido: EE. UU., la región por omisión de Google.
 * @param {string[]} [tags] idiomas del teléfono (navigator.languages)
 */
export function googleLangRegion(tags) {
  const list = tags || (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
  let region = null;
  for (const tag of list) {
    const m = /^[a-z]{2,3}[-_](?:[a-z]{4}[-_])?([a-z]{2})\b/i.exec(String(tag || ''));
    if (m) {
      region = m[1].toUpperCase();
      break;
    }
  }
  if (!region && settings.region === 'earth') region = 'CR';
  return {language: locale(), region: region || 'US'};
}

const GOOGLE = {
  'g-satellite': {mapType: 'satellite'},
  'g-hybrid': {mapType: 'satellite', layerTypes: ['layerRoadmap']},
  'g-roadmap': {mapType: 'roadmap'},
  'g-terrain': {mapType: 'terrain', layerTypes: ['layerRoadmap']},
};

// Logotipo oficial «Google Maps» (kit de atribución de Google, sin modificar), incluido en la app.
export const GOOGLE_LOGO_URL = 'img/GoogleMaps_Logo_WithLightOutline.svg';
export const GOOGLE_TERMS = 'https://maps.google.com/help/terms_maps/';
export const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

/**
 * La atribución de Google llega por internet para cada vista. Si aún no llegó
 * (mapa en movimiento) o la petición falla, OpenLayers mostraría «undefined»:
 * se conserva siempre la última atribución válida. Se aplica de nuevo en cada
 * renovación de sesión, que reemplaza la función de atribución.
 * @param {Google} source
 */
function guardAttributions(source) {
  const f = source.getAttributions();
  if (!f || f.mcGuarded) return;
  let last = '';
  const guarded = async (frameState) => {
    try {
      const a = await f(frameState);
      if (typeof a === 'string' && a) last = a;
    } catch {
      // sin conexión: se mantiene la última atribución
    }
    return last || [];
  };
  guarded.mcGuarded = true;
  source.setAttributions(guarded);
}

class GoogleLogo extends Control {
  constructor() {
    const el = document.createElement('div');
    el.className = 'google-logo ol-unselectable';
    const img = document.createElement('img');
    img.src = GOOGLE_LOGO_URL;
    img.alt = 'Google Maps';
    el.setAttribute('aria-label', 'Google Maps');
    el.appendChild(img);
    super({element: el});
  }
}

export class Basemap {
  /**
   * @param {import('ol/Map.js').default} map
   * @param {(msg: string) => void} onError
   */
  constructor(map, onError) {
    this.map = map;
    this.onError = onError;
    this.layer = new TileLayer({zIndex: -100, preload: 1, visible: false});
    this.layer.set('system', true);
    map.addLayer(this.layer);
    this.logo = new GoogleLogo();
    this.id = 'none';
    this.key = '';
    /** @type {{id:string, name:string, url:string, zmin:number, zmax:number, attribution?:string}[]} */
    this.xyz = [];
    // Al volver la señal, reintenta Google si había fallado por falta de internet
    window.addEventListener('online', () => {
      const src = this.layer.getSource();
      if (this.isGoogle() && this.key && src instanceof Google && src.getState() === 'error') this.set(this.id, this.key);
      else if (this.isXyz() && src) src.refresh(); // vuelve a pedir las teselas que fallaron sin señal
    });
  }

  isGoogle(id = this.id) {
    return id.startsWith('g-');
  }

  isXyz(id = this.id) {
    return id.startsWith('xyz:');
  }

  /** Conexión XYZ del usuario para un id «xyz:…». */
  xyzFor(id = this.id) {
    return this.isXyz(id) ? this.xyz.find((c) => `xyz:${c.id}` === id) || null : null;
  }

  /**
   * Activa un mapa base. Devuelve false si falta la clave de Google.
   * @param {string} id
   * @param {string} [key] clave de la Map Tiles API
   */
  set(id, key) {
    this.id = id;
    this.key = key || '';
    this.map.removeControl(this.logo);
    document.body.classList.remove('google-base');
    // Libera la fuente anterior (su caché, sus escuchas y la renovación de sesión de Google)
    const old = this.layer.getSource();
    this.layer.setSource(null);
    if (old) old.dispose();
    // Google prohíbe pre-cargar teselas, y en un servidor XYZ ajeno conviene pedir solo
    // las del zoom visible: menos datos móviles y menos carga para ese servidor.
    this.layer.setPreload(this.isGoogle(id) || this.isXyz(id) ? 0 : 1);
    if (id === 'none') {
      this.layer.setVisible(false);
      return true;
    }
    if (id === 'osm') {
      this.layer.setSource(new OSM({attributions: t('© {osm} colaboradores', {osm: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'})}));
      this.layer.setVisible(true);
      return true;
    }
    if (this.isXyz(id)) {
      const c = this.xyzFor(id);
      if (!c) return this.set('none');
      const source = new XYZ({
        // Por debajo del zoom mínimo no se pide ninguna tesela (con minZoom, OpenLayers pediría
        // miles de teselas del zoom mínimo para cubrir una vista lejana).
        tileUrlFunction: (tc) => (tc[0] < c.zmin ? undefined : tileUrl(c.url, tc[0], tc[1], tc[2])), // i18n-ok
        maxZoom: c.zmax, // más allá se amplían las teselas del zoom máximo, como en QGIS
        attributions: c.attribution ? escapeHtml(c.attribution) : undefined,
        transition: 150,
      });
      let lastErr = 0;
      source.on('tileloaderror', () => {
        if (this.layer.getSource() !== source || Date.now() - lastErr < 60000) return;
        lastErr = Date.now();
        this.onError(
          navigator.onLine === false
            ? t('Sin internet: el mapa base «{name}» no puede cargar imágenes. Sin señal, use sus propios mapas (GeoTIFF).', {name: c.name})
            : t('El servidor de «{name}» no entregó algunas imágenes. Revise la URL, el zoom máximo y su conexión; algunos servidores limitan o bloquean las peticiones.', {name: c.name}),
        );
      });
      this.layer.setSource(source);
      this.layer.setVisible(true);
      return true;
    }
    const g = GOOGLE[id];
    if (!g) return this.set('none');
    if (!key) {
      this.layer.setVisible(false);
      return false;
    }
    const OFFLINE = 'mc-offline'; // marca interna (no se muestra)
    const {language, region} = googleLangRegion();
    const source = new Google({
      key,
      ...g,
      language,
      region,
      scale: 'scaleFactor2x',
      highDpi: true,
      attributionsCollapsible: false,
      // Sin internet, fetch() rechaza y OpenLayers se quedaría «cargando» para siempre:
      // se convierte en una respuesta de error para que la app lo avise y reintente.
      fetchSessionToken: (url, config) =>
        fetch(url, config).catch(() => new Response(JSON.stringify({error: {message: OFFLINE}}), {status: 503, headers: {'Content-Type': 'application/json'}})),
    });
    source.on('change', () => {
      if (this.layer.getSource() !== source) return; // fuente ya reemplazada
      const st = source.getState();
      if (st === 'error') {
        const err = source.getError && source.getError();
        const msg = err && err.message ? String(err.message).replace(/\.+$/, '') : '';
        if (msg === OFFLINE) this.onError(t('Sin internet: el mapa de Google no se puede cargar. Se reintentará solo al volver la señal; mientras tanto, use sus propios mapas (GeoTIFF).'));
        else if (msg) this.onError(t('Google Maps no respondió ({detail}). Revise la clave, que la Map Tiles API esté habilitada y que la facturación esté activa.', {detail: msg}));
        else this.onError(t('Google Maps no respondió. Revise la clave, que la Map Tiles API esté habilitada y que la facturación esté activa.'));
      } else if (st === 'ready') {
        guardAttributions(source);
      }
    });
    let lastTileError = 0;
    source.on('tileloaderror', () => {
      if (this.layer.getSource() !== source || Date.now() - lastTileError < 60000) return;
      lastTileError = Date.now();
      this.onError(
        navigator.onLine === false
          ? t('Sin internet: Google Maps no puede cargar imágenes. Sin señal, use sus propios mapas (GeoTIFF).')
          : t('Google Maps no entregó algunas imágenes: puede ser el cupo diario agotado, la facturación desactivada o señal débil.'),
      );
    });
    this.layer.setSource(source);
    this.layer.setVisible(true);
    this.map.addControl(this.logo);
    document.body.classList.add('google-base');
    return true;
  }
}
