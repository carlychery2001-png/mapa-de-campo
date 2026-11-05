// Idiomas de la interfaz.
//
// El texto en español es la clave: t('Capas') devuelve «Capas», «Layers», «Couches» o «Camadas»
// según el idioma elegido. Las traducciones viven en src/i18n/*.js (una tabla por grupo de
// módulos, con la forma {'texto en español': {en, fr, pt}}). test/test_i18n.mjs comprueba que
// cada texto marcado con t(), tn() o N_() tenga las tres traducciones, con los mismos {marcadores}
// y las mismas etiquetas HTML, y avisa de textos de la interfaz que quedaron sin marcar.
//
// Reglas para escribir textos:
// - Nada de concatenar frases: t('Guardado: {name}', {name}) en vez de 'Guardado: ' + name.
// - Plurales con tn(n, '{n} punto', '{n} puntos'): la forma la decide la regla de cada idioma
//   (en francés 0 es singular; en español, plural).
// - Textos que se definen antes de saber el idioma (listas de opciones, etc.): márquelos con
//   N_('texto') y tradúzcalos al mostrarlos con t(valor) en una línea que lleve «i18n-dynamic».
// - Números con fmtNum(); fechas con fmtDateTime() / fmtDate(). Las coordenadas siempre con punto
//   decimal (son para copiar a otros programas), así que no pasan por fmtNum().
import {settings} from './store.js';
import TABLES from './i18n/index.js';

export const LANGS = [
  {code: 'es', name: 'Español', locale: 'es'},
  {code: 'en', name: 'English', locale: 'en'},
  {code: 'fr', name: 'Français', locale: 'fr'},
  {code: 'pt', name: 'Português', locale: 'pt-BR'},
];
const CODES = LANGS.map((l) => l.code);

const dict = Object.create(null);
for (const table of TABLES) for (const k of Object.keys(table)) dict[k] = table[k];

/** Primer idioma del teléfono que la app tiene; si no tiene ninguno, inglés. */
export function deviceLang(list) {
  const tags = list || (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
  for (const tag of tags) {
    const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
    if (CODES.includes(base)) return base;
  }
  return 'en';
}

let lang = CODES.includes(settings.lang) ? settings.lang : deviceLang();

/** Código del idioma en uso: 'es', 'en', 'fr' o 'pt'. */
export const getLang = () => lang;
/** Etiqueta BCP 47 para Intl (p. ej. 'pt-BR'). */
export const locale = () => LANGS.find((l) => l.code === lang).locale;

/** Cambia el idioma en memoria (la app recarga la página tras elegirlo en Ajustes). */
export function setLang(code) {
  lang = CODES.includes(code) ? code : deviceLang();
  nfCache.clear();
  pluralRules = null;
  if (typeof document !== 'undefined') document.documentElement.lang = locale();
  return lang;
}

function fill(s, params) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

/** Traduce un texto de la interfaz (clave = español) y rellena sus {marcadores}. */
export function t(src, params) {
  const e = lang === 'es' ? null : dict[src];
  return fill((e && e[lang]) || src, params);
}

let pluralRules = null;
function pluralCat(n) {
  if (!pluralRules) pluralRules = new Intl.PluralRules(locale());
  return pluralRules.select(Math.abs(Number(n)) || 0);
}

/**
 * Texto con plural. Las dos formas son las del español (singular y plural); {n} se rellena con el
 * número ya formateado según el idioma, salvo que params traiga su propio n.
 */
export function tn(n, one, other, params) {
  const src = pluralCat(n) === 'one' ? one : other;
  return t(src, Object.assign({n: fmtNum(n, Number.isInteger(Number(n)) ? 0 : 1)}, params)); // i18n-dynamic
}

/** El texto en todos los idiomas (español primero), p. ej. para reconocer «Punto 7» o «Point 7». */
export function variants(src) {
  const e = dict[src];
  return [src, ...(e ? [e.en, e.fr, e.pt] : [])].filter((x, i, a) => x && a.indexOf(x) === i);
}

/** Marca un texto para traducir más tarde con t(valor). No hace nada en tiempo de ejecución. */
export const N_ = (s) => s;

// ---------------------------------------------------------------------------
// Números y fechas según el idioma

const nfCache = new Map();
/** Número con `dec` decimales y separadores del idioma (1 234,5 en francés; 1,234.5 en inglés). */
export function fmtNum(v, dec = 0) {
  const x = Number(v);
  if (!Number.isFinite(x)) return '—';
  let nf = nfCache.get(dec);
  if (!nf) {
    nf = new Intl.NumberFormat(locale(), {minimumFractionDigits: dec, maximumFractionDigits: dec});
    nfCache.set(dec, nf);
  }
  return nf.format(x);
}

/** Fecha y hora cortas (p. ej. 05/11/2026 14:32 o 11/5/26, 2:32 PM). */
export function fmtDateTime(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), {dateStyle: 'short', timeStyle: 'short'}).format(d);
}

/** Solo la fecha corta. */
export function fmtDate(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), {dateStyle: 'short'}).format(d);
}

/** Lee un número escrito por el usuario con coma o punto decimal («12,5» o «12.5»). */
export function parseLocaleNumber(text) {
  const s = String(text ?? '').trim().replace(/\s| | /g, '');
  if (!s) return NaN;
  // Un solo separador: es el decimal. Con ambos, el último es el decimal y el otro agrupa miles.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let norm = s;
  if (lastComma >= 0 && lastDot >= 0) {
    norm = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    norm = s.replace(',', '.');
  }
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(norm) ? Number(norm) : NaN;
}

// ---------------------------------------------------------------------------
// Textos fijos de index.html: data-i18n (texto), data-i18n-aria (aria-label), data-i18n-title.

export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n))); // i18n-dynamic
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria))); // i18n-dynamic
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle))); // i18n-dynamic
  if (root === document) {
    document.documentElement.lang = locale();
    document.title = t('Mapa de Campo');
    document.documentElement.classList.remove('booting');
  }
}

if (typeof document !== 'undefined') document.documentElement.lang = locale();
