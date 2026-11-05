// Cálculos geodésicos sobre el elipsoide WGS 84.
//
// Inverso de Vincenty (1975): distancia y azimuts entre dos puntos, con
// exactitud submilimétrica. Si la iteración no converge (puntos casi
// antipodales, que no ocurren en trabajo de campo) se usa la fórmula
// esférica de haversine como respaldo.
// Vincenty, T. (1975). Direct and inverse solutions of geodesics on the
// ellipsoid with application of nested equations. Survey Review, 23(176), 88–93.
import {settings} from './store.js';
import {fmtNum as fmtLocal, getLang} from './i18n.js';

const A = 6378137.0;
const F = 1 / 298.257223563;
const B = A * (1 - F);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * @param {number[]} p1 [lon, lat] en grados
 * @param {number[]} p2 [lon, lat] en grados
 * @returns {{distance: number, azimuth1: number, azimuth2: number}} metros y grados (0–360, desde el norte verdadero)
 */
export function inverse(p1, p2) {
  const L = (p2[0] - p1[0]) * D2R;
  const U1 = Math.atan((1 - F) * Math.tan(p1[1] * D2R));
  const U2 = Math.atan((1 - F) * Math.tan(p2[1] * D2R));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L;
  let lambdaP;
  let iter = 0;
  let sinSigma, cosSigma, sigma, sinAlpha, cos2Alpha, cos2SigmaM, sinLambda, cosLambda;
  do {
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return {distance: 0, azimuth1: 0, azimuth2: 0}; // mismo punto
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) * F * sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iter < 200); // i18n-ok

  if (iter >= 200) {
    return {distance: haversine(p1, p2), azimuth1: sphericalBearing(p1, p2), azimuth2: NaN};
  }
  const uSq = (cos2Alpha * (A * A - B * B)) / (B * B);
  const AA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const BB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    BB * sinSigma *
    (cos2SigmaM +
      (BB / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (BB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distance = B * AA * (sigma - deltaSigma);
  const az1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  const az2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);
  return {distance, azimuth1: norm360(az1 * R2D), azimuth2: norm360(az2 * R2D)};
}

/** Distancia en una esfera de radio medio (solo respaldo). */
export function haversine(p1, p2) {
  const R = 6371008.8;
  const dLat = (p2[1] - p1[1]) * D2R;
  const dLon = (p2[0] - p1[0]) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(p1[1] * D2R) * Math.cos(p2[1] * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function sphericalBearing(p1, p2) {
  const f1 = p1[1] * D2R, f2 = p2[1] * D2R, dl = (p2[0] - p1[0]) * D2R;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return norm360(Math.atan2(y, x) * R2D);
}

export function norm360(a) {
  return ((a % 360) + 360) % 360;
}

/** Diferencia angular con signo en (-180, 180]. */
export function angleDiff(a, b) {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

// Puntos cardinales abreviados por idioma (16 rumbos, desde el norte en sentido horario).
// Oeste es O en español, francés y portugués y W en inglés; en portugués el este es L (leste).
const CARDINALS = {
  es: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
  en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  fr: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
  pt: ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
};
/** Letras de hemisferio para mostrar coordenadas en sexagesimal: [norte, sur, este, oeste]. */
const HEMI = {es: ['N', 'S', 'E', 'O'], en: ['N', 'S', 'E', 'W'], fr: ['N', 'S', 'E', 'O'], pt: ['N', 'S', 'L', 'O']};
const HEMI_NEUTRAL = ['N', 'S', 'E', 'W']; // la forma que leen QGIS, GDAL y los GPS

/**
 * Punto cardinal abreviado en el idioma de la interfaz (solo para mostrar).
 * @param {number} az rumbo en grados desde el norte
 * @param {8|16} [points] 8 rumbos (N, NE, E…; lo más fácil de leer) o 16 (NNE, ENE…)
 */
export function cardinal(az, points = 8) {
  const list = CARDINALS[getLang()] || CARDINALS.en;
  if (points === 16) return list[Math.round(norm360(az) / 22.5) % 16];
  return list[(Math.round(norm360(az) / 45) % 8) * 2];
}

/**
 * Grados decimales → texto sexagesimal, p. ej. 10°12′53.47″ N. Los segundos llevan siempre punto
 * decimal (es una coordenada). La letra del hemisferio sigue el idioma (83°35′34.71″ O en español,
 * W en inglés); con {neutral: true} usa N/S/E/W, la forma que leen los programas SIG.
 */
export function toDMS(value, isLat, decimals = 2, opts = {}) {
  const h = opts.neutral ? HEMI_NEUTRAL : HEMI[getLang()] || HEMI_NEUTRAL;
  const hemi = isLat ? (value >= 0 ? h[0] : h[1]) : value >= 0 ? h[2] : h[3];
  let v = Math.abs(value);
  let d = Math.floor(v);
  let mFloat = (v - d) * 60;
  let m = Math.floor(mFloat);
  let s = (mFloat - m) * 60;
  // Evita 60.00″ por redondeo
  const p = 10 ** decimals;
  s = Math.round(s * p) / p;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(decimals).padStart(decimals + 3, '0')}″ ${hemi}`;
}

// Medidas en pantalla: separadores del idioma (1 234,5 m en francés) y unidades elegidas en Ajustes
// (métricas o imperiales). Las coordenadas y los archivos exportados no pasan por aquí.
const FT = 0.3048;
const MI = 1609.344;
const AC = 4046.8564224;

/** Distancia: m (o ft) con decimales según la magnitud; km (o mi) desde 1000 m (o 1 mi). */
export function fmtDist(m) {
  if (!isFinite(m)) return '—';
  const a = Math.abs(m);
  if (settings.units === 'imperial') {
    const ft = m / FT;
    if (Math.abs(ft) < 10) return `${fmtLocal(ft, 1)} ft`;
    if (a < MI) return `${fmtLocal(Math.round(ft), 0)} ft`;
    return `${fmtLocal(m / MI, a < 10 * MI ? 2 : 1)} mi`;
  }
  if (a < 10) return `${fmtLocal(m, 1)} m`;
  if (a < 1000) return `${fmtLocal(Math.round(m), 0)} m`;
  return `${fmtLocal(m / 1000, a < 10000 ? 2 : 1)} km`;
}

/** Área: m² hasta 1 ha y luego ha (1 ha = 10 000 m²); en imperiales, ft² hasta 1 acre y luego acres. */
export function fmtArea(m2) {
  if (!isFinite(m2)) return '—';
  if (settings.units === 'imperial') {
    if (m2 < AC) return `${fmtLocal(Math.round(m2 / (FT * FT)), 0)} ft²`;
    return `${fmtLocal(m2 / AC, m2 < 1e6 ? 3 : 1)} ac`;
  }
  if (m2 < 10000) return `${fmtLocal(Math.round(m2), 0)} m²`;
  return `${fmtLocal(m2 / 10000, m2 < 1e6 ? 3 : 1)} ha`;
}

/**
 * Número con punto decimal fijo, para coordenadas y archivos exportados (no depende del idioma).
 * Para números que lee una persona use fmtNum() de i18n.js.
 */
export function fmtNum(v, dec) {
  return v.toFixed(dec);
}
