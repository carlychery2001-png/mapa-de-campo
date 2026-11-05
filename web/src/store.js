// Ajustes y estado persistente (localStorage del WebView).

const KEY_SETTINGS = 'mc.settings.v1';
const KEY_LAYERS = 'mc.layers.v1';
const KEY_WAYPOINTS = 'mc.waypoints.v1';
const KEY_TRACK = 'mc.track.v1';
const KEY_VIEW = 'mc.view.v1';
const KEY_NAV = 'mc.nav.v1';

export const DEFAULTS = {
  coordFormat: 'dd',        // dd | dms | utm | crtm05 | crtm05cr05
  arrivalRadius: 3,         // m
  offRouteAlert: 3,         // m
  autoAdvance: true,
  vibrate: true,
  keepScreenOn: true,
  labels: true,
  osm: false,
  trackMinDist: 2,          // m entre puntos del track
  trackMaxAcc: 25,          // m: descarta lecturas peores
  firstRun: true,
  lang: 'auto',             // auto (idioma del teléfono) | es | en | fr | pt
  theme: 'auto',            // auto (el del teléfono) | light | dark | sun (alto contraste para el sol)
  textSize: 'auto',         // auto (tamaño de letra del teléfono) | 0.9 | 1 | 1.15 | 1.3 | 1.5
  gloves: false,            // botones grandes para usar con guantes
  units: 'metric',          // metric | imperial (solo para mostrar medidas; los campos se escriben en metros)
  region: null,             // 'earth' (Universidad EARTH, Costa Rica) | 'other'; se elige la primera vez
};

function read(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('No se pudo guardar', key, e);
    return false;
  }
}

export const settings = Object.assign({}, DEFAULTS, read(KEY_SETTINGS, {}));
// Versiones anteriores: «Modo nocturno» (night) pasa a ser el tema oscuro; quien ya usaba la app
// antes de la 1.5 trabajaba en EARTH (el paquete de EARTH ya está instalado).
if (settings.night === true && settings.theme === 'auto') settings.theme = 'dark';
delete settings.night;
if (!settings.region && settings.firstRun === false) settings.region = 'earth';
if (settings.firstRun === false && settings.setupDone === undefined) settings.setupDone = true; // ya tenía sus capas
export function saveSettings() {
  write(KEY_SETTINGS, settings);
}

export const loadLayers = () => read(KEY_LAYERS, []);
export const saveLayers = (list) => write(KEY_LAYERS, list);

export const loadWaypoints = () => read(KEY_WAYPOINTS, []);
export const saveWaypoints = (list) => write(KEY_WAYPOINTS, list);

export const loadTrack = () => read(KEY_TRACK, {points: [], recording: false});
export const saveTrack = (t) => write(KEY_TRACK, t);

export const loadView = () => read(KEY_VIEW, null);
export const saveView = (v) => write(KEY_VIEW, v);

export const loadNav = () => read(KEY_NAV, null);
export const saveNav = (v) => write(KEY_NAV, v);
