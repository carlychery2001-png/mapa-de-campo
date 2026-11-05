# Mapa de Campo

**Offline field-mapping app for Android** · **App de mapas de campo sin conexión para Android**

Load your own GeoTIFF (drone orthophoto, scanned map) and your data (KML/KMZ, GeoJSON, GPX, CSV), see where you are with the GPS, mark points, record tracks, measure, edit layers, plan survey lines or point grids, and follow lines and points in the field — all without internet.
Interface in **Español, English, Français and Português (Brasil)**; coordinate systems from around the world; light, dark and high-contrast "sun" themes; large buttons for gloves.

Cargue su propio GeoTIFF y sus datos, vea dónde está con el GPS, marque puntos, grabe recorridos, mida, edite capas, planifique líneas o cuadrículas y siga líneas y puntos en el terreno, sin internet. Guía completa en español: [LEEME.md](LEEME.md).

## Download · Descarga

Get the APK from **[Releases](../../releases/latest)** (Android 7.0+). Open it on the phone and allow "Install unknown apps".
Descargue el APK en **[Releases](../../releases/latest)** (Android 7.0 o superior) y ábralo en el teléfono.

## Build · Compilar

```
cd web && npm install && node build.mjs        # web app → android/assets/www
python tools/build_apk.py                       # needs Android SDK (build-tools 36.1.0, platform 36) and JDK 17+
cd web && node test/test_i18n.mjs              # translation check (also: node test/test_*.mjs)
```

`build_apk.py` creates a new signing key the first time if none exists (kept in `android/keystore/`, not in this repository).
The EARTH orthophotos (`android/assets/bundled/*.tif`) are not in the repository; they are included in the released APK and can be rebuilt with the scripts in `tools/ortofoto_EARTH/`.

## License · Licencia

Code: **MIT** © 2026 Carly Chery — see [LICENSE](LICENSE). Third-party libraries (OpenLayers, geotiff.js, proj4js, fflate) keep their own licenses: [licencias/](licencias/).
Data: EARTH orthophotos © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, via SNIT ("uso libre y gratuito, siempre que se mencione el origen y propiedad de los datos"); boundary and example field polygon © OpenStreetMap contributors (ODbL).
Privacy: [docs/PRIVACIDAD_PRIVACY.md](docs/PRIVACIDAD_PRIVACY.md) — the app has no servers and collects no data.

Created by **Carly Chery** · Universidad EARTH, Costa Rica.
