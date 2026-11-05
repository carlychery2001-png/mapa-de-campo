// Sistemas de coordenadas (SRC) conocidos por la app, para cualquier lugar del mundo.
//
// Las definiciones proj4 son las de la base EPSG distribuida con PROJ (comprobadas en epsg.io,
// noviembre de 2026). La app funciona sin internet, así que no consulta epsg.io: si un archivo
// usa un código que no está aquí, el usuario puede elegir otro sistema o pegar la definición
// PROJ del suyo («sistema propio», guardado en este teléfono).
//
// Cambios de datum: ETRS89, NAD83, NAD83(2011), SIRGAS 2000, MAGNA-SIRGAS, GDA94/GDA2020, NZGD2000
// y el ITRF2008 de México se tratan como WGS 84 (+towgs84=0), que es la práctica habitual (las
// transformaciones nulas de EPSG tienen una exactitud de 1 a 3 m, del orden del GPS del teléfono).
// Los datums clásicos (OSGB36, CH1903+, Amersfoort, Arc 1960, CR05, Ocotepeque) llevan su
// transformación de Helmert de EPSG; las cuadrículas (+nadgrids) no se pueden usar sin conexión.
//
// Los nombres son los oficiales de EPSG (iguales que en QGIS): sirven para buscar y no se
// traducen. Lo que se traduce es la descripción (dónde se usa) y la nota.

import proj4 from 'proj4';
import {register} from 'ol/proj/proj4.js';
import Projection from 'ol/proj/Projection.js';
import {get as getProjection, addProjection, addCoordinateTransforms, createSafeCoordinateTransform} from 'ol/proj.js';
import {t, N_} from './i18n.js';
import DATA from './i18n/data.js';
import {settings, loadView} from './store.js';

const KEY_CUSTOM = 'mc.crs.custom.v1';
const MAX_CUSTOM = 30;

// ---------------------------------------------------------------------------
// Regiones (para agrupar el selector)

/** Regiones del selector, en orden: [código, nombre que se traduce al mostrarlo]. */
export const REGIONS = [
  ['world', N_('Todo el mundo')],
  ['europe', N_('Europa')],
  ['north-america', N_('Canadá y Estados Unidos')],
  ['latin-america', N_('América Latina')],
  ['costa-rica', N_('Costa Rica')],
  ['africa', N_('África')],
  ['oceania', N_('Australia y Nueva Zelanda')],
  ['custom', N_('Mis sistemas')],
];

// Zonas de uso aproximadas [oeste, sur, este, norte] en grados (EPSG), para sugerir sistemas
const BOX = {
  world: [-180, -90, 180, 90],
  europe: [-16.1, 32.88, 40.18, 84.73],
  nad83: [-172.54, 14.92, -47.74, 86.46],
  canada: [-141.01, 40.04, -47.74, 86.46],
  usa: [-180, 14.92, 180, 74.71],
  latam: [-122.19, -59.87, -25.28, 32.72],
  mexico: [-122.19, 12.1, -84.64, 32.72],
  australia: [93.41, -60.56, 173.35, -8.47],
  eastAfrica: [28.85, -11.75, 41.91, 4.63],
  argentina: [-73.59, -58.41, -52.63, -21.78],
  costaRica: [-86.3, 7.9, -82.5, 11.3],
};

/**
 * @typedef {object} CrsInfo
 * @property {string} name nombre oficial (EPSG), no se traduce
 * @property {string} def definición proj4
 * @property {string} region código de REGIONS
 * @property {string} [desc] descripción para traducir con t(desc, params)
 * @property {object} [params] marcadores de desc (p. ej. {zone: '17N'})
 * @property {string} [note] nota para traducir (exactitud del cambio de datum, etc.)
 * @property {number[]} [area] zona de uso [oeste, sur, este, norte] en grados
 * @property {string} [family] familia (UTM de un datum)
 * @property {boolean} [grid] sistema nacional o regional (no UTM)
 * @property {boolean} [geographic] latitud/longitud en grados
 * @property {boolean} [suggest] false = no sugerirlo por la ubicación
 * @property {boolean} [custom] definido por el usuario
 * @property {string} [aliases] palabras de búsqueda extra (sin traducir)
 */

/** @type {Record<string, CrsInfo>} */
export const CRS = {};

const GRS80_0 = '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0';
const NOTE_WGS84 = N_('Este datum se trata como WGS 84 (diferencia de 1 a 2 m).');

function add(code, info) {
  CRS[code] = info;
}

// --- Todo el mundo
add('EPSG:4326', {
  name: 'WGS 84', def: '+proj=longlat +datum=WGS84 +no_defs +type=crs', region: 'world', geographic: true, area: BOX.world,
  desc: N_('Latitud y longitud en grados: GPS, Google Earth, KML y GPX'), aliases: 'gps lat lon latitude longitude crs84 4326 degrees',
});
add('EPSG:3857', {
  name: 'WGS 84 / Pseudo-Mercator', def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs',
  region: 'world', area: [-180, -85.06, 180, 85.06], suggest: false,
  desc: N_('Mercator web (OpenStreetMap, Google Maps); no sirve para medir'), aliases: 'web mercator google 900913 3785',
});

/** Zona UTM: [oeste, este] en grados. */
const zoneLon = (z) => [-180 + (z - 1) * 6, -180 + z * 6];
function intersect(a, b) {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}

/**
 * Agrega una familia UTM.
 * @param {string} family
 * @param {(z:number, south:boolean) => string|null} codeOf
 * @param {{name:string, datum:string, region:string, box:number[], desc:string, note?:string, zonesN?:number[], zonesS?:number[], mga?:boolean}} o
 */
function utmFamily(family, codeOf, o) {
  const one = (z, south) => {
    const code = codeOf(z, south);
    if (!code) return;
    const [w, e] = zoneLon(z);
    const area = intersect([w, south ? -80 : 0, e, south ? 0 : 84], o.box);
    const zone = o.mga ? String(z) : `${z}${south ? 'S' : 'N'}`;
    add(code, {
      name: o.mga ? `${o.name} / MGA zone ${z}` : `${o.name} / UTM zone ${zone}`,
      def: `+proj=utm +zone=${z}${south ? ' +south' : ''} ${o.datum} +units=m +no_defs +type=crs`,
      region: o.region, family, area: area || [w, south ? -80 : 0, e, south ? 0 : 84], desc: o.desc, note: o.note, params: {zone, w, e},
      aliases: `utm ${zone} ${z}${south ? 's' : 'n'}${o.mga ? ' mga' : ''}`,
    });
  };
  (o.zonesN || []).forEach((z) => one(z, false));
  (o.zonesS || []).forEach((z) => one(z, true));
}
const range = (a, b) => Array.from({length: b - a + 1}, (_, i) => a + i);

// WGS 84 / UTM, todas las zonas (EPSG:32601–32660 norte, 32701–32760 sur)
utmFamily('utm-wgs84', (z, s) => `EPSG:${s ? 327 : 326}${String(z).padStart(2, '0')}`, {
  name: 'WGS 84', datum: '+datum=WGS84', region: 'world', box: BOX.world, zonesN: range(1, 60), zonesS: range(1, 60),
  desc: N_('UTM zona {zone} · longitud {w}° a {e}°'),
});

// --- Europa
add('EPSG:4258', {
  name: 'ETRS89', def: `+proj=longlat ${GRS80_0} +no_defs +type=crs`, region: 'europe', geographic: true, area: BOX.europe, suggest: false,
  desc: N_('Latitud y longitud en Europa'), note: NOTE_WGS84,
});
// ETRS89 / UTM 28N–38N (EPSG:25828–25838)
utmFamily('utm-etrs89', (z) => `EPSG:${25800 + z}`, {
  name: 'ETRS89', datum: GRS80_0, region: 'europe', box: BOX.europe, zonesN: range(28, 38),
  desc: N_('Europa, UTM zona {zone} · longitud {w}° a {e}°'), note: NOTE_WGS84,
});
add('EPSG:3035', {
  name: 'ETRS89-extended / LAEA Europe', def: `+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'europe', grid: true, area: [-35.58, 24.6, 44.83, 84.73], suggest: false,
  desc: N_('Mapas estadísticos de toda Europa (Copernicus, Eurostat)'), aliases: 'laea inspire',
});
add('EPSG:2154', {
  name: 'RGF93 v1 / Lambert-93', def: `+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'europe', grid: true, area: [-9.86, 41.15, 10.38, 51.56], desc: N_('Francia continental y Córcega'), aliases: 'lambert 93 l93 rgf93 france',
});
add('EPSG:27700', {
  name: 'OSGB36 / British National Grid',
  // EPSG:1314 «OSGB36 to WGS 84 (6)», vector de posición, exactitud 2 m (sin la cuadrícula OSTN15)
  def: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs +type=crs',
  region: 'europe', grid: true, area: [-9.01, 49.75, 2.01, 61.01], desc: N_('Gran Bretaña (Ordnance Survey)'),
  note: N_('Cambio de datum aproximado, exactitud de unos 2 m.'), aliases: 'bng osgb ordnance survey uk united kingdom great britain',
});
add('EPSG:2157', {
  name: 'IRENET95 / Irish Transverse Mercator', def: `+proj=tmerc +lat_0=53.5 +lon_0=-8 +k=0.99982 +x_0=600000 +y_0=750000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'europe', grid: true, area: [-10.56, 51.39, -5.34, 55.43], desc: N_('Irlanda e Irlanda del Norte'), aliases: 'itm ireland eire',
});
add('EPSG:3763', {
  name: 'ETRS89 / Portugal TM06', def: `+proj=tmerc +lat_0=39.6682583333333 +lon_0=-8.13310833333333 +k=1 +x_0=0 +y_0=0 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'europe', grid: true, area: [-9.56, 36.95, -6.19, 42.16], desc: N_('Portugal continental'), aliases: 'pt-tm06 tm06 portugal',
});
add('EPSG:2056', {
  name: 'CH1903+ / LV95',
  def: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs +type=crs',
  region: 'europe', grid: true, area: [5.96, 45.82, 10.49, 47.81], desc: N_('Suiza y Liechtenstein'),
  note: N_('Cambio de datum aproximado, exactitud de alrededor de 1 m.'), aliases: 'lv95 swiss switzerland schweiz suisse svizzera',
});
add('EPSG:28992', {
  name: 'Amersfoort / RD New',
  // EPSG:15739 «Amersfoort to WGS 84 (3)», 7 parámetros (vector de posición). La versión de epsg.io
  // (EPSG:4833, Molodensky-Badekas) no se puede escribir como +towgs84: en proj4js deja el origen
  // de Amersfoort a 157 m; esta lo deja a menos de 0,5 m (comprobado en test/test_crs.mjs).
  def: '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.2369,50.0087,465.658,-0.406857,0.350733,-1.87035,4.0812 +units=m +no_defs +type=crs',
  region: 'europe', grid: true, area: [3.2, 50.75, 7.22, 53.7], desc: N_('Países Bajos'),
  note: N_('Cambio de datum aproximado, exactitud de alrededor de 1 m.'), aliases: 'rd new rijksdriehoek netherlands nederland holland',
});
add('EPSG:3812', {
  name: 'ETRS89 / Belgian Lambert 2008',
  def: `+proj=lcc +lat_0=50.797815 +lon_0=4.35921583333333 +lat_1=49.8333333333333 +lat_2=51.1666666666667 +x_0=649328 +y_0=665262 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'europe', grid: true, area: [2.5, 49.5, 6.41, 51.51], desc: N_('Bélgica'), aliases: 'lambert 2008 belgium belgique belgie',
});

// --- Canadá y Estados Unidos
add('EPSG:4269', {
  name: 'NAD83', def: `+proj=longlat ${GRS80_0} +no_defs +type=crs`, region: 'north-america', geographic: true, area: BOX.nad83, suggest: false,
  desc: N_('Latitud y longitud en Canadá y Estados Unidos'), note: NOTE_WGS84,
});
// NAD83 / UTM 1N–23N (EPSG:26901–26923)
utmFamily('utm-nad83', (z) => `EPSG:${26900 + z}`, {
  name: 'NAD83', datum: GRS80_0, region: 'north-america', box: BOX.nad83, zonesN: range(1, 23),
  desc: N_('Canadá y Estados Unidos, UTM zona {zone} · longitud {w}° a {e}°'), note: NOTE_WGS84,
});
// NAD83(CSRS) / UTM 7N–22N: EPSG:3154–3157 (7–10N), 2955–2957 (11–13N), 3158–3160 (14–16N), 2958–2962 (17–21N), 3761 (22N)
const CSRS = {7: 3154, 8: 3155, 9: 3156, 10: 3157, 11: 2955, 12: 2956, 13: 2957, 14: 3158, 15: 3159, 16: 3160, 17: 2958, 18: 2959, 19: 2960, 20: 2961, 21: 2962, 22: 3761};
utmFamily('utm-csrs', (z) => (CSRS[z] ? `EPSG:${CSRS[z]}` : null), {
  name: 'NAD83(CSRS)', datum: '+ellps=GRS80 +towgs84=-0.991,1.9072,0.5129,-1.25033e-07,-4.6785e-08,-5.6529e-08,0', region: 'north-america', box: BOX.canada,
  zonesN: range(7, 22), desc: N_('Canadá, UTM zona {zone} · longitud {w}° a {e}°'),
});
// NAD83(2011) / UTM: EPSG:6328–6329 (59N, 60N) y 6330–6348 (1N–19N)
utmFamily('utm-nad83-2011', (z) => `EPSG:${z >= 59 ? 6328 + z - 59 : 6329 + z}`, {
  name: 'NAD83(2011)', datum: GRS80_0, region: 'north-america', box: BOX.usa, zonesN: [...range(1, 19), 59, 60],
  desc: N_('Estados Unidos, UTM zona {zone} · longitud {w}° a {e}°'), note: NOTE_WGS84,
});

// --- América Latina
add('EPSG:4674', {
  name: 'SIRGAS 2000', def: `+proj=longlat ${GRS80_0} +no_defs +type=crs`, region: 'latin-america', geographic: true, area: BOX.latam, suggest: false,
  desc: N_('Latitud y longitud en América Latina'),
});
// SIRGAS 2000 / UTM: 31965–31976 = zonas 11N–22N; 31977–31985 = zonas 17S–25S
utmFamily('utm-sirgas', (z, s) => `EPSG:${s ? 31977 + z - 17 : 31965 + z - 11}`, {
  name: 'SIRGAS 2000', datum: GRS80_0, region: 'latin-america', box: BOX.latam, zonesN: range(11, 22), zonesS: range(17, 25),
  desc: N_('América Latina, UTM zona {zone} · longitud {w}° a {e}°'),
});
add('EPSG:6372', {
  name: 'Mexico ITRF2008 / LCC', def: `+proj=lcc +lat_0=12 +lon_0=-102 +lat_1=17.5 +lat_2=29.5 +x_0=2500000 +y_0=0 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'latin-america', grid: true, area: BOX.mexico, desc: N_('México (cónica conforme de Lambert, INEGI)'), aliases: 'mexico lambert inegi',
});
// Mexico ITRF2008 / UTM 11N–16N (EPSG:6366–6371)
utmFamily('utm-mexico', (z) => `EPSG:${6355 + z}`, {
  name: 'Mexico ITRF2008', datum: GRS80_0, region: 'latin-america', box: BOX.mexico, zonesN: range(11, 16),
  desc: N_('México, UTM zona {zone} · longitud {w}° a {e}°'),
});
add('EPSG:9377', {
  name: 'MAGNA-SIRGAS 2018 / Origen-Nacional', def: `+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'latin-america', grid: true, area: [-79.1, -4.23, -66.87, 12.6], desc: N_('Colombia (origen único nacional, CTM12)'), aliases: 'colombia ctm12 igac origen nacional',
});
add('EPSG:3116', {
  name: 'MAGNA-SIRGAS / Colombia Bogota zone', def: `+proj=tmerc +lat_0=4.59620041666667 +lon_0=-74.0775079166667 +k=1 +x_0=1000000 +y_0=1000000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'latin-america', grid: true, area: [-75.59, -4.23, -72.58, 11.82], desc: N_('Colombia, zona Bogotá (sistema anterior)'), aliases: 'colombia bogota magna',
});
// POSGAR 2007 / Argentina 1–7 (EPSG:5343–5349): fajas de 3° con meridiano central −72° … −54°
for (let f = 1; f <= 7; f++) {
  const lon0 = -72 + (f - 1) * 3;
  const w = f === 1 ? BOX.argentina[0] : lon0 - 1.5, e = f === 7 ? BOX.argentina[2] : lon0 + 1.5;
  add(`EPSG:${5342 + f}`, {
    name: `POSGAR 2007 / Argentina ${f}`,
    def: `+proj=tmerc +lat_0=-90 +lon_0=${lon0} +k=1 +x_0=${f * 1000000 + 500000} +y_0=0 +ellps=WGS84 +towgs84=-0.41,0.46,-0.35,0,0,0,0 +units=m +no_defs +type=crs`,
    region: 'latin-america', grid: true, family: 'posgar', area: [w, BOX.argentina[1], e, BOX.argentina[3]],
    desc: N_('Argentina, faja {zone} · longitud {w}° a {e}°'), params: {zone: String(f), w: Math.round(w * 10) / 10, e: Math.round(e * 10) / 10},
    aliases: `argentina gauss kruger faja ${f}`,
  });
}

// --- Costa Rica
const CR_SIRGAS = '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0';
// EPSG:9752 «CR05 to WGS 84 (2)», rotación de marco (CF); proj4 usa el convenio de vector de
// posición, así que las rotaciones cambian de signo.
const CR05 = '+ellps=WGS84 +towgs84=-0.16959,0.35312,0.51846,0.03385,-0.16325,0.03446,0.03693';
const CRTM05 = '+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0';
add('EPSG:8908', {
  name: 'CR-SIRGAS / CRTM05', def: `${CRTM05} ${CR_SIRGAS} +units=m +no_defs +type=crs`, region: 'costa-rica', grid: true, area: BOX.costaRica,
  desc: N_('Costa Rica · sistema oficial desde 2018'), note: N_('Datum CR-SIRGAS (época 2014.59), alineado a ITRF; se trata como WGS 84 al nivel del metro.'),
  aliases: 'crtm05 costa rica ign',
});
add('EPSG:8910', {
  name: 'CR-SIRGAS / UTM zone 17N', def: `+proj=utm +zone=17 ${CR_SIRGAS} +units=m +no_defs +type=crs`, region: 'costa-rica', area: [-84, 7.9, -82.5, 11.3],
  desc: N_('Costa Rica, UTM zona {zone}'), params: {zone: '17N'}, aliases: 'utm 17n costa rica',
});
add('EPSG:8909', {
  name: 'CR-SIRGAS / UTM zone 16N', def: `+proj=utm +zone=16 ${CR_SIRGAS} +units=m +no_defs +type=crs`, region: 'costa-rica', area: [-86.3, 7.9, -84, 11.3],
  desc: N_('Costa Rica, UTM zona {zone}'), params: {zone: '16N'}, aliases: 'utm 16n costa rica',
});
add('EPSG:8912', {
  name: 'CR-SIRGAS / CRTM05 + DACR52 height', def: `${CRTM05} ${CR_SIRGAS} +units=m +no_defs +type=crs`, region: 'costa-rica', grid: true, area: BOX.costaRica, suggest: false,
  desc: N_('Costa Rica · se usa solo la parte horizontal'), aliases: 'crtm05 dacr52',
});
add('EPSG:5367', {
  name: 'CR05 / CRTM05', def: `${CRTM05} ${CR05} +units=m +no_defs +type=crs`, region: 'costa-rica', grid: true, area: BOX.costaRica,
  desc: N_('Costa Rica · sistema anterior a 2018'),
  note: N_('Datum CR05, reemplazado por CR-SIRGAS en 2018 (diferencias de hasta unos 10 cm). Transformación EPSG:9752, exactitud 1 m.'), aliases: 'crtm05 cr05 costa rica',
});
add('EPSG:5365', {
  name: 'CR05', def: `+proj=longlat ${CR05} +no_defs +type=crs`, region: 'costa-rica', geographic: true, area: BOX.costaRica, suggest: false,
  desc: N_('Latitud y longitud en Costa Rica (CR05)'),
});
add('EPSG:8907', {
  name: 'CR-SIRGAS', def: `+proj=longlat ${CR_SIRGAS} +no_defs +type=crs`, region: 'costa-rica', geographic: true, area: BOX.costaRica, suggest: false,
  desc: N_('Latitud y longitud en Costa Rica (CR-SIRGAS)'),
});
// EPSG:5470 «Ocotepeque 1935 to WGS 84 (1)», traslaciones geocéntricas, exactitud 8 m
const OCOTEPEQUE = '+ellps=clrk66 +towgs84=213.11,9.37,-74.95,0,0,0,0';
const NOTE_IGN = N_('Mapas antiguos del IGN (1:50 000). Cambio de datum EPSG:5470, exactitud de unos 8 m.');
add('EPSG:5456', {
  name: 'Ocotepeque 1935 / Costa Rica Norte',
  def: `+proj=lcc +lat_1=10.4666666666667 +lat_0=10.4666666666667 +lon_0=-84.3333333333333 +k_0=0.99995696 +x_0=500000 +y_0=271820.522 ${OCOTEPEQUE} +units=m +no_defs +type=crs`,
  region: 'costa-rica', grid: true, area: [-86.3, 9.5, -82.5, 11.3], suggest: false, desc: N_('Costa Rica · Lambert Norte (mapas antiguos)'), note: NOTE_IGN, aliases: 'lambert norte ign',
});
add('EPSG:5457', {
  name: 'Ocotepeque 1935 / Costa Rica Sur',
  def: `+proj=lcc +lat_1=9 +lat_0=9 +lon_0=-83.6666666666667 +k_0=0.99995696 +x_0=500000 +y_0=327987.436 ${OCOTEPEQUE} +units=m +no_defs +type=crs`,
  region: 'costa-rica', grid: true, area: [-86.3, 7.9, -82.5, 10.0], suggest: false, desc: N_('Costa Rica · Lambert Sur (mapas antiguos)'), note: NOTE_IGN, aliases: 'lambert sur ign',
});

// --- África
// Arc 1960 / UTM 35S–37S (EPSG:21035–21037) y 35N–37N (EPSG:21095–21097); EPSG:1122, exactitud 20 m
utmFamily('arc1960', (z, s) => `EPSG:${s ? 21000 + z : 21060 + z}`, {
  name: 'Arc 1960', datum: '+a=6378249.145 +rf=293.465 +towgs84=-160,-6,-302,0,0,0,0', region: 'africa', box: BOX.eastAfrica,
  zonesN: range(35, 37), zonesS: range(35, 37), desc: N_('Kenia, Tanzania y Uganda, UTM zona {zone}'),
  note: N_('Cambio de datum aproximado, exactitud de unos 20 m.'),
});

// --- Australia y Nueva Zelanda
add('EPSG:7844', {
  name: 'GDA2020', def: `+proj=longlat ${GRS80_0} +no_defs +type=crs`, region: 'oceania', geographic: true, area: BOX.australia, suggest: false,
  desc: N_('Latitud y longitud en Australia'),
});
// GDA2020 / MGA 46–59 (EPSG:7846–7859) y GDA94 / MGA 48–58 (EPSG:28348–28358)
utmFamily('utm-gda2020', (z) => `EPSG:${7800 + z}`, {
  name: 'GDA2020', datum: GRS80_0, region: 'oceania', box: BOX.australia, zonesS: range(46, 59), mga: true,
  desc: N_('Australia, MGA zona {zone} · longitud {w}° a {e}°'),
});
utmFamily('utm-gda94', (z) => `EPSG:${28300 + z}`, {
  name: 'GDA94', datum: GRS80_0, region: 'oceania', box: BOX.australia, zonesS: range(48, 58), mga: true,
  desc: N_('Australia, MGA zona {zone} (GDA94, anterior a 2020) · longitud {w}° a {e}°'), note: NOTE_WGS84,
});
add('EPSG:2193', {
  name: 'NZGD2000 / New Zealand Transverse Mercator 2000', def: `+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 ${GRS80_0} +units=m +no_defs +type=crs`,
  region: 'oceania', grid: true, area: [166.37, -47.33, 178.63, -34.1], desc: N_('Nueva Zelanda'), aliases: 'nztm new zealand aotearoa',
});

/** Familias UTM que el selector muestra plegadas (se ven al buscar o al tocarlas). */
export const FAMILIES = {
  'utm-wgs84': {name: 'WGS 84 / UTM', search: 'WGS 84 UTM', zones: N_('Zonas {from} a {to}, norte y sur'), from: '1', to: '60'},
  'utm-etrs89': {name: 'ETRS89 / UTM', search: 'ETRS89 UTM', zones: N_('Zonas {from} a {to}'), from: '28N', to: '38N'},
  'utm-nad83': {name: 'NAD83 / UTM', search: 'NAD83 / UTM', zones: N_('Zonas {from} a {to}'), from: '1N', to: '23N'},
  'utm-csrs': {name: 'NAD83(CSRS) / UTM', search: 'CSRS', zones: N_('Zonas {from} a {to}'), from: '7N', to: '22N'},
  'utm-nad83-2011': {name: 'NAD83(2011) / UTM', search: 'NAD83(2011)', zones: N_('Zonas {from} a {to}'), from: '1N', to: '19N'},
  'utm-sirgas': {name: 'SIRGAS 2000 / UTM', search: 'SIRGAS 2000 UTM', zones: N_('Zonas {from} a {to}'), from: '11N', to: '25S'},
  'utm-gda2020': {name: 'GDA2020 / MGA', search: 'GDA2020 MGA', zones: N_('Zonas {from} a {to}'), from: '46', to: '59'},
  'utm-gda94': {name: 'GDA94 / MGA', search: 'GDA94 MGA', zones: N_('Zonas {from} a {to}'), from: '48', to: '58'},
};

/** SRC que se ofrecen primero en los selectores (válidos en todo el mundo). */
export const COMMON_CRS = ['EPSG:4326', 'EPSG:3857'];

// ---------------------------------------------------------------------------
// Registro en proj4 y OpenLayers

let registered = false;
const olDone = new Set();

/**
 * Registra un SRC en OpenLayers con sus transformaciones a EPSG:4326 y EPSG:3857 (la vista).
 * No se usa register(proj4) con todo el catálogo porque crea las transformaciones entre todos los
 * pares (n²): con 350 sistemas tardaría segundos al abrir la app en un teléfono.
 */
function addToOl(code) {
  const def = proj4.defs(code);
  if (!def) return false;
  let units = def.units;
  if (!units && def.projName === 'longlat') units = 'degrees';
  const proj = new Projection({code, axisOrientation: def.axis, metersPerUnit: def.to_meter, units});
  addProjection(proj);
  for (const other of ['EPSG:4326', 'EPSG:3857']) {
    const p2 = getProjection(other);
    const tr = proj4(code, other);
    addCoordinateTransforms(proj, p2, createSafeCoordinateTransform(proj, p2, tr.forward), createSafeCoordinateTransform(p2, proj, tr.inverse));
  }
  olDone.add(code);
  return true;
}

/** Registra todas las definiciones (incluidos los sistemas propios del usuario) en proj4 y en OpenLayers. */
export function registerAll() {
  if (registered) return;
  loadCustom();
  register(proj4); // solo las definiciones que trae proj4 (pocas): deja proj4 enlazado con OpenLayers
  for (const [code, info] of Object.entries(CRS)) {
    if (code === 'EPSG:4326' || code === 'EPSG:3857') continue; // ya existen en OpenLayers
    try {
      proj4.defs(code, info.def);
      addToOl(code);
    } catch (e) {
      console.warn('SRC no válido', code, e);
      if (info.custom) delete CRS[code];
    }
  }
  registered = true;
}

/** Comprueba que un SRC esté registrado en OpenLayers (lo registra si hace falta). */
export function ensureCrs(code) {
  const c = normalizeCode(code);
  if (!c || !CRS[c]) return !!(c && getProjection(c));
  if (c === 'EPSG:4326' || c === 'EPSG:3857' || olDone.has(c)) return true;
  try {
    proj4.defs(c, CRS[c].def);
    return addToOl(c);
  } catch {
    return false;
  }
}

/**
 * Normaliza 'epsg:5367', 'EPSG::5367', 'urn:ogc:def:crs:EPSG::5367', 'urn:ogc:def:crs:EPSG:6.6:5367',
 * 'http://www.opengis.net/def/crs/EPSG/0/5367', 5367 → 'EPSG:5367'. Los sistemas propios: 'USER:3'.
 */
export function normalizeCode(code) {
  if (code === null || code === undefined) return null;
  const s = String(code).trim();
  if (/^\d+$/.test(s)) return `EPSG:${s}`;
  if (/CRS:?84$/i.test(s)) return 'EPSG:4326';
  const u = s.match(/^USER:(\d+)$/i);
  if (u) return `USER:${u[1]}`;
  const m = s.match(/EPSG(?::+|\/0\/|\/)(\d+)$/i) || s.match(/EPSG:[\d.]*:(\d+)$/i) || s.match(/EPSG::?(\d+)/i);
  return m ? `EPSG:${m[1]}` : null;
}

export function isKnown(code) {
  const c = normalizeCode(code);
  return !!c && !!CRS[c] && ensureCrs(c) && !!getProjection(c);
}

/** Nombre oficial del SRC (no se traduce), o el código si no se conoce. */
export function crsName(code) {
  const c = normalizeCode(code);
  return (c && CRS[c] && CRS[c].name) || c || t('desconocido');
}

/** Dónde se usa el SRC, traducido (vacío si no hay descripción). */
export function crsDescription(code) {
  const info = CRS[normalizeCode(code)];
  if (!info) return '';
  if (info.custom) return t('Sistema propio (definición PROJ)');
  return info.desc ? t(info.desc, info.params) : ''; // i18n-dynamic
}

/** Nota sobre la exactitud del sistema, traducida (vacía si no hay). */
export function crsNote(code) {
  const info = CRS[normalizeCode(code)];
  return info && info.note ? t(info.note) : ''; // i18n-dynamic
}

export const isCostaRicaCrs = (code) => !!(CRS[code] && CRS[code].region === 'costa-rica');

/** Explicación para un código que la app no conoce (o un archivo sin código). */
export function unknownCrsHelp(code) {
  const c = normalizeCode(code) || (code ? String(code).slice(0, 80) : null);
  if (!c) return t('El archivo no dice en qué sistema de coordenadas está. Elija el sistema con el que se crearon los datos; si no lo sabe, pregunte a quien le dio el archivo.');
  return t('La app no conoce {code}. Si sabe en qué sistema están los datos, búsquelo en la lista. Si no está, copie su definición PROJ desde epsg.io (o desde QGIS: Propiedades de la capa → Información) y agréguela con «Pegar definición PROJ».', {code: c});
}

// ---------------------------------------------------------------------------
// Conversiones

/** Zona UTM (1–60) para una longitud; maneja la longitud 180. */
export function utmZone(lon) {
  let z = Math.floor((lon + 180) / 6) + 1;
  if (z > 60) z = 60;
  if (z < 1) z = 1;
  return z;
}

/** Código EPSG de WGS 84 / UTM para un punto lon/lat. */
export function utmCodeFor(lon, lat) {
  const z = String(utmZone(lon)).padStart(2, '0');
  return lat >= 0 ? `EPSG:326${z}` : `EPSG:327${z}`;
}

/**
 * Conversor a un plano local Transverso de Mercator centrado en (lon0, lat0),
 * con k0 = 1 sobre el elipsoide WGS 84. En un radio de unos pocos km el factor
 * de escala difiere de 1 en menos de 1e-6 (Snyder, 1987), así que las
 * distancias y áreas calculadas en este plano son prácticamente distancias
 * sobre el elipsoide.
 */
export function localPlane(lon0, lat0) {
  const def = `+proj=tmerc +lat_0=${lat0.toFixed(9)} +lon_0=${lon0.toFixed(9)} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
  const conv = proj4('EPSG:4326', def);
  return {
    def,
    lon0,
    lat0,
    /** @param {number[]} ll [lon, lat] */
    fwd: (ll) => conv.forward([ll[0], ll[1]]),
    /** @param {number[]} xy [x, y] */
    inv: (xy) => conv.inverse([xy[0], xy[1]]),
  };
}

const defOf = (code) => (CRS[code] ? CRS[code].def : code);

/** Transforma [lon, lat] (WGS 84) al SRC indicado. */
export function fromWgs84(code, ll) {
  return proj4('EPSG:4326', defOf(code), [ll[0], ll[1]]);
}

/** Transforma [x, y] del SRC indicado a [lon, lat] WGS 84. */
export function toWgs84(code, xy) {
  return proj4(defOf(code), 'EPSG:4326', [xy[0], xy[1]]);
}

/** Como toWgs84, pero devuelve null si el resultado no es un lugar válido. */
export function safeToWgs84(code, xy) {
  try {
    const ll = toWgs84(code, xy);
    return Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && Math.abs(ll[1]) <= 90 && Math.abs(ll[0]) <= 540 ? [((ll[0] + 540) % 360) - 180, ll[1]] : null;
  } catch {
    return null;
  }
}

/** Caja aproximada de Costa Rica continental (para mostrar CRTM05 solo donde aplica). */
export function inCostaRica(lon, lat) {
  return lon > -86.2 && lon < -82.4 && lat > 7.9 && lat < 11.3;
}

/** ¿El punto [lon, lat] cae en la zona de uso del SRC? margin en grados. */
export function inCrsArea(code, ll, margin = 0) {
  const a = CRS[code] && CRS[code].area;
  if (!a || !ll) return true;
  return ll[0] >= a[0] - margin && ll[0] <= a[2] + margin && ll[1] >= a[1] - margin && ll[1] <= a[3] + margin; // i18n-ok
}

// ---------------------------------------------------------------------------
// Ubicación de referencia para sugerir sistemas

let here = null;

/** main.js la actualiza con cada posición GPS: ayuda a sugerir la zona UTM y el sistema del país. */
export function setPositionHint(ll) {
  if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1]) && Math.abs(ll[1]) <= 90) here = {ll: [ll[0], ll[1]], time: Date.now()};
}

/**
 * Lugar de referencia: la última posición GPS (menos de 12 h) o el centro del mapa guardado
 * (si está acercado al menos a nivel de país).
 * @returns {{ll: number[], source: 'gps'|'map'}|null}
 */
export function positionHint() {
  if (here && Date.now() - here.time < 12 * 3600e3) return {ll: here.ll, source: 'gps'};
  try {
    const v = loadView();
    if (v && v.center && v.zoom >= 5) {
      const R = 6378137;
      const ll = [(v.center[0] / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(v.center[1] / R)) - Math.PI / 2) * (180 / Math.PI)];
      if (Number.isFinite(ll[0]) && Number.isFinite(ll[1])) return {ll: [((ll[0] + 540) % 360) - 180, ll[1]], source: 'map'};
    }
  } catch {
    // sin vista guardada
  }
  return null;
}

function distKm(a, b) {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Superficie de la zona de uso (en grados²), para preferir los sistemas más locales. */
const areaSize = (code) => {
  const a = CRS[code].area;
  return a ? (a[2] - a[0]) * (a[3] - a[1]) : 1e9;
};

/** Sistemas que se usan en un lugar: nacionales primero, luego UTM del datum regional y WGS 84 / UTM. */
function systemsAt(ll) {
  const grids = [], regional = [];
  const z = utmZone(ll[0]);
  for (const [code, info] of Object.entries(CRS)) {
    if (info.custom || info.suggest === false || info.geographic || !inCrsArea(code, ll)) continue;
    if (info.family === 'utm-wgs84') continue;
    if (info.grid) grids.push(code);
    else regional.push(code);
  }
  // Los de zona más pequeña primero (más propios del lugar)
  grids.sort((a, b) => areaSize(a) - areaSize(b));
  regional.sort((a, b) => areaSize(a) - areaSize(b));
  // Zonas vecinas (datos de un área que cruza el límite de zona)
  const near = [];
  for (const dz of [-1, 1]) {
    const zz = z + dz;
    if (zz >= 1 && zz <= 60) near.push( // i18n-ok
      `EPSG:${ll[1] >= 0 ? 326 : 327}${String(zz).padStart(2, '0')}`);
  }
  return {main: [...grids, ...regional, utmCodeFor(ll[0], ll[1])], near};
}

/**
 * Sistemas sugeridos para un archivo, en orden.
 * @param {{hint?: string|null, sample?: number[]|null, lonLat?: number[]|null, current?: string|null, legacy?: boolean}} ctx
 *   hint: el que indica el archivo; sample: primera coordenada [x, y] del archivo; lonLat: lugar de
 *   referencia (si no, la última posición GPS o el centro del mapa); current: el que ya tiene la capa;
 *   legacy: la pista viene de la llamada antigua de main.js (puede ser el EPSG:8908 por defecto).
 * @returns {{list: {code: string, reason: string, strong: boolean}[], pick: string|null, pos: {ll: number[], source: string}|null}}
 *   reason es un texto para traducir con t(); pick es el que conviene dejar elegido (o null).
 */
export function suggestCrs(ctx = {}) {
  const list = [];
  const seen = new Set();
  const push = (code, reason, strong = false) => {
    const c = normalizeCode(code);
    if (!c || !CRS[c] || seen.has(c)) return;
    seen.add(c);
    list.push({code: c, reason, strong});
  };
  const s = Array.isArray(ctx.sample) && Number.isFinite(ctx.sample[0]) && Number.isFinite(ctx.sample[1]) ? ctx.sample : null;
  const geoSample = !!s && Math.abs(s[0]) <= 180 && Math.abs(s[1]) <= 90;
  let pos = null;
  if (Array.isArray(ctx.lonLat) && Number.isFinite(ctx.lonLat[0]) && Number.isFinite(ctx.lonLat[1])) pos = {ll: ctx.lonLat, source: 'gps'};
  else if (geoSample) pos = {ll: s, source: 'data'};
  else pos = positionHint();
  const crOk = (pos && inCostaRica(pos.ll[0], pos.ll[1])) || settings.region === 'earth';
  let hint = normalizeCode(ctx.hint);
  // En la llamada antigua, la pista puede ser el EPSG:8908 que se ponía siempre por defecto
  if (hint && ctx.legacy && isCostaRicaCrs(hint) && !crOk) hint = null;

  if (ctx.current) push(ctx.current, N_('El que usa ahora esta capa'), true);
  if (hint) push(hint, N_('Lo indica el archivo'), true);
  if (geoSample) push('EPSG:4326', N_('Las coordenadas parecen latitud y longitud'), true);
  if (s && !geoSample && pos) {
    // Sistemas en los que la primera coordenada cae cerca del lugar de referencia
    const at = systemsAt(pos.ll);
    const near = [];
    [...at.main, ...at.near].forEach((code, order) => {
      const ll = safeToWgs84(code, s);
      if (ll) {
        const d = distKm(ll, pos.ll);
        if (d < 300) near.push({d, code, order});
      }
    });
    // A igual distancia (±5 km), el sistema más propio del lugar
    near.sort((a, b) => Math.floor(a.d / 5) - Math.floor(b.d / 5) || a.order - b.order);
    for (const {code} of near) push(code, pos.source === 'gps' ? N_('Los datos caen cerca de su ubicación') : N_('Los datos caen cerca del centro del mapa'), true);
  }
  if (pos && pos.source !== 'data') {
    for (const code of systemsAt(pos.ll).main) {
      if (isCostaRicaCrs(code) && !crOk) continue;
      push(code, CRS[code].family ? N_('Zona UTM del lugar donde está') : N_('Se usa en el lugar donde está'));
    }
  }
  if (s && !geoSample && !pos) {
    // Sin lugar de referencia: un sistema nacional solo si es el único en cuya zona caen las
    // coordenadas del archivo (los orígenes de cada país suelen ser inconfundibles, p. ej. Lambert-93)
    const groups = new Map();
    for (const [code, info] of Object.entries(CRS)) {
      if (!info.grid || info.family || info.suggest === false) continue;
      const ll = safeToWgs84(code, s);
      if (ll && inCrsArea(code, ll)) {
        const k = info.area.join();
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(code);
      }
    }
    if (groups.size === 1) {
      for (const code of [...groups.values()][0]) if (!isCostaRicaCrs(code) || crOk) push(code, N_('Las coordenadas del archivo caen en su zona'));
    }
  }
  if (crOk && settings.region === 'earth') push('EPSG:8908', N_('Sistema oficial de Costa Rica'));
  push('EPSG:4326', N_('Latitud y longitud (GPS)'));
  const strong = list.find((x) => x.strong);
  return {list: list.slice(0, 8), pick: strong ? strong.code : null, pos};
}

// ---------------------------------------------------------------------------
// Búsqueda

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function fillAll(key, params) {
  // La descripción en los cuatro idiomas, para encontrar «zona», «zone» o «France» en cualquier idioma
  const e = DATA[key];
  const texts = [key, ...(e ? [e.en, e.fr, e.pt] : [])];
  return texts.map((s) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : ''))).join(' ');
}
const regionAll = (id) => {
  const r = REGIONS.find((x) => x[0] === id);
  return r ? fillAll(r[1]) : '';
};

/**
 * Índice para el selector: un elemento por SRC con su texto de búsqueda (en todos los idiomas).
 * @param {string[]} [codes] códigos permitidos (por omisión, todos)
 */
export function crsIndex(codes) {
  const out = [];
  for (const code of codes || Object.keys(CRS)) {
    const info = CRS[code];
    if (!info) continue;
    const hay = fold([code, code.replace(':', ' '), info.name, info.aliases || '', info.desc ? fillAll(info.desc, info.params) : '', regionAll(info.region), info.custom ? info.def : ''].join(' '));
    out.push({code, info, hay});
  }
  return out;
}

/**
 * ¿El texto de búsqueda coincide? Cada palabra debe aparecer (sin tildes ni mayúsculas). Las que
 * empiezan con cifra deben empezar un número («93» encuentra «Lambert-93», no «1935»).
 */
export function crsMatches(entry, query) {
  const words = fold(query).replace(/epsg\s*:\s*/g, 'epsg:').split(/[\s,;]+/).filter(Boolean);
  return words.every((w) => {
    if (!/^\d/.test(w)) return entry.hay.includes(w);
    let i = entry.hay.indexOf(w);
    while (i >= 0) {
      if (i === 0 || !/\d/.test(entry.hay[i - 1])) return true;
      i = entry.hay.indexOf(w, i + 1);
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Sistemas propios (definición PROJ pegada por el usuario)

function readCustom() {
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_CUSTOM) : null;
    const list = s ? JSON.parse(s) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.code === 'string' && typeof x.def === 'string') : [];
  } catch {
    return [];
  }
}

function writeCustom(list) {
  try {
    localStorage.setItem(KEY_CUSTOM, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

function loadCustom() {
  for (const c of readCustom()) {
    const code = normalizeCode(c.code);
    if (!code || (CRS[code] && !CRS[code].custom)) continue; // un código del catálogo no se reemplaza
    CRS[code] = customInfo(code, c);
  }
}

function customInfo(code, c) {
  let geographic = false;
  try {
    geographic = new proj4.Proj(c.def).projName === 'longlat';
  } catch {
    geographic = false;
  }
  return {name: c.name || code, def: c.def, region: 'custom', custom: true, code, geographic, aliases: 'proj custom propio'};
}

/** Sistemas propios guardados en este teléfono: [{code, name, def}]. */
export const customCrsList = () => readCustom();

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Comprueba una definición PROJ (proj4) o WKT antes de guardarla.
 * @param {string} def
 * @param {{sample?: number[]|null, lonLat?: number[]|null}} [test] coordenada del archivo o lugar para probarla
 * @returns {{def: string, geographic: boolean, name: string|null}}
 * @throws Error con .code: 'EMPTY' | 'GRID' | 'INVALID'
 */
export function validateProjDef(def, test = {}) {
  const text = String(def || '').trim().replace(/\s+/g, ' ');
  if (!text) throw fail('EMPTY', t('Pegue la definición PROJ, por ejemplo: +proj=utm +zone=33 +datum=WGS84 +units=m'));
  const isWkt = /^(PROJCS|GEOGCS|PROJCRS|GEOGCRS|GEODCRS|COMPD_CS|COMPOUNDCRS|PROJECTEDCRS|GEOGRAPHICCRS)\s*\[/i.test(text);
  if (!isWkt && !/(^|\s)\+proj=/.test(text)) throw fail('INVALID', t('Eso no parece una definición PROJ. Debe empezar con +proj=… (o ser un texto WKT que empiece con PROJCS[…]).'));
  const grids = text.match(/\+(nadgrids|geoidgrids)=([^\s]+)/);
  if (grids && grids[2] !== '@null') throw fail('GRID', t('La definición usa una cuadrícula de cambio de datum ({grid}), que la app no tiene sin conexión. Busque la versión con +towgs84 (en epsg.io, en la lista de transformaciones).', {grid: grids[2]}));
  let p;
  try {
    p = new proj4.Proj(text);
  } catch {
    p = null;
  }
  if (!p || !p.projName || typeof p.forward !== 'function') throw fail('INVALID', t('La app no reconoce esa definición. Cópiela completa desde epsg.io (formato PROJ.4) o desde QGIS.'));
  const geographic = p.projName === 'longlat';
  const deg = 180 / Math.PI;
  try {
    const conv = proj4('EPSG:4326', text);
    let ll;
    const s = test.sample;
    if (s && Number.isFinite(s[0]) && Number.isFinite(s[1]) && !geographic && (Math.abs(s[0]) > 180 || Math.abs(s[1]) > 90)) {
      ll = conv.inverse([s[0], s[1]]);
    } else if (test.lonLat && Number.isFinite(test.lonLat[0])) {
      ll = test.lonLat;
    } else {
      const lon0 = Number.isFinite(p.long0) ? p.long0 * deg : 0;
      const lat0 = Number.isFinite(p.lat0) ? p.lat0 * deg : 0;
      ll = [lon0 + 0.5, Math.max(-80, Math.min(80, lat0 + 0.5))];
    }
    const xy = conv.forward([ll[0], ll[1]]);
    const back = conv.inverse(xy);
    const ok = [ll[0], ll[1], xy[0], xy[1], back[0], back[1]].every(Number.isFinite) && Math.abs(back[1] - ll[1]) < 1e-6 && Math.abs(((back[0] - ll[0] + 540) % 360) - 180) < 1e-6;
    if (!ok) throw new Error('round-trip');
  } catch {
    throw fail('INVALID', t('Con esa definición las coordenadas no se pueden convertir. Revise que esté completa (cópiela otra vez desde epsg.io o QGIS).'));
  }
  const title = (text.match(/\+title=("[^"]*"|\S+)/) || [])[1] || (isWkt ? (text.match(/^\w+\s*\[\s*"([^"]+)"/) || [])[1] : null);
  return {def: text, geographic, name: title ? title.replace(/^"|"$/g, '') : null};
}

/**
 * Guarda un sistema propio y lo registra para usarlo ya.
 * @param {{def: string, name?: string, epsg?: string|number|null}} o epsg: código EPSG que representa (opcional)
 * @param {{sample?: number[]|null, lonLat?: number[]|null}} [test]
 * @returns {string} el código con el que quedó (EPSG:nnnn o USER:n)
 * @throws Error con .code: 'EMPTY' | 'GRID' | 'INVALID' | 'EXISTS' | 'BAD_CODE' | 'FULL' | 'STORAGE'
 */
export function addCustomCrs(o, test = {}) {
  const v = validateProjDef(o.def, test);
  const list = readCustom();
  let code = null;
  const raw = o.epsg === undefined || o.epsg === null ? '' : String(o.epsg).trim();
  if (raw) {
    const m = raw.match(/^(?:EPSG\s*:?\s*)?(\d{4,6})$/i);
    if (!m) throw fail('BAD_CODE', t('El código EPSG debe ser un número, por ejemplo 3400. Déjelo vacío si no lo sabe.'));
    code = `EPSG:${m[1]}`;
    if (CRS[code] && !CRS[code].custom) throw fail('EXISTS', t('{code} ya está en la lista: búsquelo y elíjalo allí.', {code}));
  } else {
    let n = 1;
    const used = new Set(list.map((x) => x.code));
    while (used.has(`USER:${n}`)) n++;
    code = `USER:${n}`;
  }
  const others = list.filter((x) => x.code !== code);
  if (others.length >= MAX_CUSTOM) throw fail('FULL', t('Ya tiene {n} sistemas propios. Borre alguno que no use para agregar otro.', {n: MAX_CUSTOM}));
  const name = String(o.name || '').trim().slice(0, 80) || v.name || (code.startsWith('EPSG:') ? code : t('Sistema propio {n}', {n: code.slice(5)}));
  const entry = {code, name, def: v.def};
  if (!writeCustom([...others, entry])) throw fail('STORAGE', t('No se pudo guardar en el teléfono (memoria llena). Libere espacio e inténtelo otra vez.'));
  CRS[code] = customInfo(code, entry);
  proj4.defs(code, v.def);
  olDone.delete(code);
  addToOl(code);
  return code;
}

/** Borra un sistema propio. Las capas que lo usaban tendrán que elegir otro sistema. */
export function removeCustomCrs(code) {
  const c = normalizeCode(code);
  if (!c || !CRS[c] || !CRS[c].custom) return false;
  writeCustom(readCustom().filter((x) => x.code !== c));
  delete CRS[c];
  return true;
}
