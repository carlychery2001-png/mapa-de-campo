# Mapa de Campo — Design Specification v1.0

**Offline GeoTIFF field-navigation app for Android (Spanish UI)**
Date: 2026-11-05. Status: ready for implementation.
Package: `org.mapacampo.android`. This is the name already in the draft manifest. Do not change it after the first release (§5.1).

---

## 0. Scope, context and conventions

**Purpose.** EARTH University students load their own GeoTIFF basemaps on a phone, fully offline. These are drone orthomosaics or scanned, georeferenced maps. Students then overlay survey lines and points, see their live position, and follow the lines in the field, in the style of Avenza Maps [59].

**Reference dataset.** The output of `C:\McGill_Final\GIS_cancha_EARTH\ruta_serpentina.py`, stored in `C:\McGill_Final\GIS_cancha_EARTH\salidas\ruta_5m\`:

| Item | Value |
|---|---|
| Lines | 15 lines, 5 m apart, each 136.7 m long |
| Line bearing | 2.6° |
| Survey points | 420 points, one every 5 m |
| Route length | 2120.3 m (`resumen.json`) |
| Files | `ruta_serpentina.geojson/.kml/.gpx/.gpkg`, `puntos_levantamiento.geojson/.csv` |
| SingularXYZ controller files | `singularxyz/puntos_CRTM05.csv` and `puntos_UTM17N.csv`. These are headerless, with columns **Name,N,E,Z,Code**: northing comes before easting. |
| CRS used by the script | `CRTM05 = "EPSG:5367"` (line 39) |

**Architecture.**
- A native Java shell, built on framework APIs only, hosts a WebView.
- The WebView runs an offline map engine bundled with esbuild: OpenLayers `ol@10.11.0`, `proj4@2.22.0`, and `geotiff` (currently resolved to 3.1.0-beta.0 through OL's `^3.1.0-beta.0` range [§2.1, ref 12]).
- The native side supplies location, files, storage, vibration and the screen-keep-on flag.

**Conventions in this document.**
- [n] points to the numbered reference list (§9).
- "(derived)" marks an engineering inference that is not stated by the cited source.
- "MUST / SHOULD / MAY" follow RFC 2119 usage.
- **P0** = MVP, must be in the delivered APK. **P1** = should, in v1.x. **P2** = later.

---

## 1. Feature list and priorities

### 1.1 P0 – MVP (delivered APK)

| ID | Feature | Key rules |
|---|---|---|
| P0-01 | **Map library and projects** | Import with the system picker (SAF). Copy into app storage. Keep a JSON manifest as the source of truth. Data persists across restarts. Delete only with confirmation. Offline-first [80]. |
| P0-02 | **GeoTIFF basemap** | Tiled, overview-based reading by byte range. Validate georeferencing. Detect the CRS, or ask the user. Apply the PixelIsPoint and tiepoint (I,J) corrections. Reject GCP-only files. Opacity control. Per-layer info sheet. §2.4 |
| P0-03 | **Vector overlays** | GeoJSON, KML, GPX, CSV. The CSV wizard has column mapping and CRS selection, and imports the headerless SingularXYZ N,E format. Tap a feature to see its attributes [§2.5]. Bundled demo of the EARTH field route. |
| P0-04 | **Bundled CRS registry** | EPSG 4326, 3857, 32616, 32617, 8907, 8908, 8909, 8910, 5365, 5367 (with the EPSG:9752 correction). Lookup is local; nothing is fetched from the network [§2.1]. |
| P0-05 | **Live position** | Native `LocationManager.GPS_PROVIDER`. Accuracy circle at 68 %. Traffic-light badge. Satellite counts, L5, fix age, mock-location flag [§4.1–4.3]. |
| P0-06 | **Seguir línea** (follow line) | Progress-limited segment matching. Signed cross-track error in words. Distance and bearing to the next vertex. Done/remaining along the route. ◀ ▶ vertex stepper. Arrival and off-track rules. Vibration [§4.5–4.7]. |
| P0-07 | **Ir a puntos** (point sequence) | Step through the survey points in order (P001…P420). Show distance and bearing to the next point, and the "Línea k de 15" label from the `linea` attribute [§4.6]. |
| P0-08 | **Orientation** | "Norte arriba" (north up) by default and "Rumbo arriba" (heading up) as an option. North arrow always visible; tap it to reset. Course from GNSS when moving, compass when still [§3.4, §4.4]. |
| P0-09 | **Scale and coordinates** | Dynamic metric scale bar. Readout for the GPS position and the crosshair in DD, CRTM05 or UTM 17N, always labelled with the CRS and EPSG code [§2.7]. |
| P0-10 | **Layer panel = legend** | Visibility, opacity, order, symbol swatch, info sheet. |
| P0-11 | **"Ver ruta completa" overview** | One-tap zoom to the whole route [37, 41]. |
| P0-12 | **Permissions flow** | FINE and COARSE requested together, in context. Approximate-location banner. Recover the restored state after a process restart [§5.4]. |
| P0-13 | **Screen on during Seguir** | `FLAG_KEEP_SCREEN_ON` only while following, with a user toggle [71]. |
| P0-14 | **"Modo sol" theme (default)** | Opaque light panels with 7:1 text contrast [§3.2]. |
| P0-15 | **GNSS honesty** | Permanent accuracy label with its confidence level. Banner saying the phone is not RTK. Line-spacing warning [§4.3]. |
| P0-16 | **Strict offline** | All libraries bundled. Requests to any other host are blocked. No online basemap [80]. |
| P0-17 | **External RTK through mock location** | Accept mock fixes and badge them "EXTERNA/SIMULADA"; never reject them [§4.1]. |
| P0-18 | **Restore session** | Last view, layers and route-following progress. |

### 1.2 P1 – should (v1.1–1.x)

| ID | Feature |
|---|---|
| P1-01 | Track recording to GPX through a location foreground service, so it continues with the screen off and shows a notification [66, 70]. |
| P1-02 | Point capture ("Marcar punto") with averaging over a minimum number of fixes, storing quality metadata [53, 55]. |
| P1-03 | Export: GeoJSON (WGS 84 only), GPX, KML, and CSV with CRS-labelled E/N columns. Share through ACTION_SEND [§2.5]. |
| P1-04 | "Perfil de ubicación" (location profile): the datum of the position source is set separately from the display CRS [55, 57] [§2.3]. |
| P1-05 | Edge indicator (wedge or arrow) for an off-screen next vertex, labelled with distance. Optional overview inset [41]. |
| P1-06 | Proximity sound pings near a vertex [54]; all audio and haptics can be switched off. |
| P1-07 | Night or dark theme as a battery option, with the trade-off explained [44, 47]. |
| P1-08 | KMZ import. Single-band DEM or float GeoTIFF with a colour ramp. Several basemaps. |
| P1-09 | "Open with" and Share intents (already declared in the draft manifest). |
| P1-10 | Distance and area measuring tool, computed in the projected navigation CRS [§4.5]. |
| P1-11 | Configurable thresholds: accuracy colours, corridor width, arrival radius. |
| P1-12 | Height display: ellipsoidal h and MSL H (API 34+), each labelled [62]. |
| P1-13 | Rotation-gesture lock; long-press to confirm destructive actions [42]. |

### 1.3 P2 – nice to have

| ID | Feature |
|---|---|
| P2-01 | Direct external GNSS over Bluetooth or USB (NMEA GGA/RMC/GSA/GSV/GST/VTG/HDT) with an NTRIP client. Fix type in words ("RTK fijo / RTK flotante / DGPS / autónomo"), correction age, accuracy from GST, HDOP×4.7 fallback, antenna-height subtraction [53, 55, 58]. |
| P2-02 | QField-style "precise view" near a target [54]. |
| P2-03 | Spoken prompts [39]. |
| P2-04 | Apply EPSG:11044 (CR-SIRGAS epoch 2019.24 → 2014.59, about 9 cm) in the RTK profile [6]. |
| P2-05 | Auto-detect user-defined (32767) GeoTIFFs whose parameters match CRTM05. |
| P2-06 | Raw-GNSS or dual-frequency positioning research mode [27, 30, 32, 72]. |
| P2-07 | Project bundles (zip) and DMS coordinate format. |
| **Not supported** | GPKG, Shapefile, DXF (ask for GeoJSON or KML from QGIS), manual georeferencing of rasters (use GDAL), online basemaps. |

---

## 2. GIS correctness rules

### 2.1 CRS registry (bundle exactly these; register before creating any source)

| Code | Name | proj4 string to register | Registered axis order | Notes |
|---|---|---|---|---|
| EPSG:4326 | WGS 84 | built into OL and proj4 | lat,lon (EPSG); OL and GeoJSON use lon,lat | Never pass `enforceAxis` [§2.6]. |
| EPSG:3857 | WGS 84 / Pseudo-Mercator | built in | E,N | EPSG: "Not a recognised geodetic system". Never use it for measurement [6, 16]. |
| EPSG:32617 | WGS 84 / UTM 17N | `+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs` | E,N | proj4js 2.22.0 already includes all 326xx/327xx zones [12]. |
| EPSG:32616 | WGS 84 / UTM 16N | `+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs` | E,N | West of 84° W (derived by analogy). |
| **EPSG:8908** | CR-SIRGAS epoch 2014.59 / CRTM05 (official since April 2018) | `+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs` | E,N (CS 4400) | No towgs84, so a null shift, which is correct. EPSG has no CR-SIRGAS→WGS 84 transformation, and "accuracy will deteriorate due to tectonic deformation" [6]. **Default CRS for display and navigation inside Costa Rica.** |
| **EPSG:5367** | CR05 / CRTM05 (legacy; used by the survey script) | `+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-0.16959,0.35312,0.51846,0.03385,-0.16325,0.03446,0.03693 +units=m +no_defs` | **N,E** (CS 4500) | **Rotations are negated relative to epsg.io; see §2.2.** |
| EPSG:8910 | CR-SIRGAS / UTM 17N | `+proj=utm +zone=17 +ellps=GRS80 +units=m +no_defs` | E,N | [6] |
| EPSG:8909 | CR-SIRGAS / UTM 16N | `+proj=utm +zone=16 +ellps=GRS80 +units=m +no_defs` | E,N | Registered in EPSG [6]; string by analogy with 8910 (derived). |
| EPSG:8907 | CR-SIRGAS geographic 2D | `+proj=longlat +ellps=GRS80 +no_defs` | lat,lon | Null shift (derived from [6]). |
| EPSG:5365 | CR05 geographic 2D | `+proj=longlat +ellps=WGS84 +towgs84=-0.16959,0.35312,0.51846,0.03385,-0.16325,0.03446,0.03693 +no_defs` | lat,lon | Same correction as 5367 (derived). |
| EPSG:8912 | CRTM05 + DACR52 height | horizontal part = 8908 | – | Keep the vertical part as metadata only [6]. |

**Registration sequence (web).** Use the OL 10.11 API [10, 12]:
1. Call `proj4.defs(code, def)` for every row.
2. Call `register(proj4)`.
3. Call `setProjectionCodeLookup(code => LOCAL[code] ? Promise.resolve(LOCAL[code]) : Promise.reject(...))`. `fromEPSGCode` and `setEPSGLookup` are deprecated.

Reasons:
- OL's default lookup fetches `https://spatialreference.org/...` and needs a network connection.
- An unregistered code gives a bare `Projection` with no transforms, so the overlays will not line up [10].
- Always register **from proj strings, never WKT**. The 5367 WKT carries `AXIS["Northing",NORTH],AXIS["Easting",EAST]`, and wkt-parser then sets `axis='neu'` [§2.6].

**Library pinning.**
- Pin `proj4@2.22.0`. proj4js master switches `tmerc` to the exact algorithm by default.
- 2.22.0's `tmerc` uses the Evenden/Snyder series, which PROJ says "diverges beyond 3° from the central meridian". Costa Rica lies within about 2° of 84° W, so this is acceptable [8, 12].
- `utm` uses the exact etmerc [12].
- Pin `ol@10.11.0`, and pin the resolved geotiff version in `package-lock.json` [10, 11].

### 2.2 Datum rules (critical)

1. **The epsg.io +towgs84 for EPSG:5367 is wrong, so do not use it.**
   - epsg.io takes its parameters from EPSG:8914/8969, which use Position Vector (9606).
   - EPSG deprecated 8969 on 2021-06-11 with the reason "Incorrect method (wrong rotation convention)". The replacement is **EPSG:9752 "CR05 to WGS 84 (2)"**: the same seven values but method **Coordinate Frame (9607)**, accuracy 1.0 m. It derives from EPSG:9751 CR05→CR-SIRGAS (accuracy 0.5 m) [6].
   - proj4js `+towgs84` applies the Position Vector form (`lib/datumUtils.js`) [12]. To express a Coordinate Frame operation, negate the three rotations [8].
   - Effect at EARTH [standards researcher's Helmert script; IOGP formulas 7]:
     - wrong sign: dE −0.27 m, dN +1.05 m;
     - correct: dE +0.02 m, dN +0.10 m.
   - **Independent check (this spec, proj4js 2.22.0).** Survey point P001 is lat 10.21485840, lon −83.59297594.
     - The corrected string gives E 544592.110, N 1129535.023. This is **identical to the survey CSV** (`puntos_levantamiento.csv`).
     - The epsg.io string gives E 544592.400, N 1129534.070, about 1 m off.
   - I also read the EPSG JSON records for 8914, 8969 and 9752 in the standards researcher's scratchpad. They confirm the method and the deprecation.
2. **CR-SIRGAS ≈ WGS 84 by null shift.**
   - EPSG publishes no transformation between them [6].
   - For a phone with an error of about ±3–5 m, this is immaterial.
   - For RTK users it matters at decimetre level. Show it in the location profile (P1-04) [55, 57].
3. **Epoch.**
   - IGN NTRIP corrections are in CR-SIRGAS epoch 2019.24. EPSG change 2025.079 added datum 1428, CRSs 11041–11043, and transformation 11044 (2019.24 → 2014.59; Molodensky-Badekas PV; translations −5.3/+1.4/−7.1 cm; accuracy 0.04 m) [6].
   - **There is no projected "2019.24 / CRTM05" code.** Label such data EPSG:8908 and store `epoca: 2019.24` as metadata [6].
   - Applying 11044 is P2-04.
4. **Location profile (P1-04, derived design from [55, 57]).**
   - Options for the position-source datum: "WGS 84 (GPS del teléfono)" (default) or "CR-SIRGAS (receptor RTK con NTRIP del IGN)".
   - With today's registry both are null shifts to WGS 84. 9751 and 9752 have identical parameters [6], so the 5367 path gives the same numbers either way.
   - The profile therefore records metadata and drives the displayed text: "Transformación activa: CR05→WGS 84 EPSG:9752 (exactitud 1.0 m)" or "CR-SIRGAS≈WGS 84: desplazamiento nulo (sin transformación EPSG)".
   - Esri notes that a profile can chain at most two transformations [57]. Two are enough here.
5. **Decree.**
   - EPSG cites decree "40692-MJP of 2018-04-17" [6].
   - Costa Rican legal and academic sources reported by the standards researcher give **40962-MJP** (La Gaceta No. 66, 17 April 2018); no URL was supplied in the findings.
   - The help text should cite 40962-MJP, mention that EPSG's record differs, and the number should be verified before any formal citation. Background on CR05 and CR-SIRGAS parameters: [14, 15].

### 2.3 View projection and math CRS

- **View CRS.**
  - If a basemap is loaded, the view uses the basemap's native CRS (`source.getView()`, as in the OL COG projection example [10]). The raster is then never reprojected on the phone, and only vectors and GPS are transformed (derived).
  - Without a basemap, the view uses EPSG:8908 inside Costa Rica's area of use (lat 7.98–11.22, lon −85.97 to −82.53 [6]). Elsewhere it uses the UTM zone of the data.
- **A second raster in a different CRS:** warn "Reproyección en el teléfono: puede ser lenta" and recommend running `gdalwarp` beforehand. Whether OL 10.11 WebGL tiles reproject correctly needs a device test (open item §8).
- **Navigation and measuring math** is always planar in a local projected CRS:
  - **EPSG:8908** inside Costa Rica;
  - otherwise the WGS 84 UTM zone (derived);
  - **never** EPSG:3857 view units or sphere formulas [16, 19, 23].

  Errors of each choice at EARTH (computed by the GNSS researcher [17]):

  | Method | Error at EARTH |
  |---|---|
  | CRTM05 | k = 0.999925, −0.75 cm per 100 m; convergence +0.07° |
  | UTM 17N | k = 1.000596, +6.0 cm per 100 m; convergence −0.46° |
  | Sphere (R = 6 371 008.8 m) | +0.53 % north–south |
  | EPSG:3857 units | +1.61 % (+2.2 m over 137 m) |
  | Height reduction at 40 m | −6 ppm |

  No scale-factor correction is needed in CRTM05 (derived from those figures). For lat/lon distances over long ranges, use Karney [18]; Veness's sphere formulas err by up to 0.55 % [19].
- The scale bar MAY use OL `ScaleLine` (sphere-based, under 1 % error, acceptable for a graphic scale, derived). Every navigation number comes from §4.5.

### 2.4 GeoTIFF georeferencing rules

**Pre-inspection.** Before creating `ol/source/GeoTIFF`, open the file with geotiff.js through the same URL (§5.6) and read:
- IFD count (overviews);
- tiled or stripped, tile size, width × height;
- BitsPerSample, SamplesPerPixel, Photometric, Compression;
- BigTIFF flag;
- GeoKeyDirectory 34735, GeoDouble 34736, GeoAscii 34737;
- ModelPixelScale 33550, ModelTiepoint 33922, ModelTransformation 34264 [1].

**Validity (GeoTIFF 1.1, Req 1.2 [1]).**
- An IFD must have ModelTiepoint or ModelTransformation.
- ModelTransformation excludes ModelPixelScale.
- PixelScale requires a Tiepoint.
- If none of these is present, reject: "El archivo no está georreferenciado."

**CRS resolution order.**
1. ProjectedCRSGeoKey 3072 (formerly ProjectedCSTypeGeoKey).
2. GeodeticCRSGeoKey 2048 (formerly GeographicTypeGeoKey).

This is the order OL uses [1, 10].
- Value 32767 (user-defined) or a missing key: **ask the user** with a CRS picker (default 8908; offer 5367, 32617, 8910, 4326) and store the choice in the manifest.
- A code that is not in the registry: ask the same way, and never fetch.
- Pass the chosen CRS to OL. Use the source's `projection` option; confirm it exists in the 10.11 API [10] (open item §8).

**Origin corrections.** geotiff.js 3.x `getOrigin()` returns `tiePoints[3..5]` only when there is exactly one tiepoint. It assumes I = J = 0 and applies no half-pixel shift [11]. The app MUST compute the upper-left corner of pixel (0,0) as follows (derived from [1] Annex B.2.2 and [9] RFC 33):
- δ = 1 if GTRasterTypeGeoKey 1025 = 2 (PixelIsPoint); δ = 0 for PixelIsArea (the default).
- X₀ = X_tie − (I + δ/2)·Sx
- Y₀ = Y_tie + (J + δ/2)·Sy, where Sy is the positive ModelPixelScale y value.
- For ModelTransformation, corner = M·(−δ/2, −δ/2, 0, 1)ᵀ. OL supports rotated or sheared transforms [10].
- Implementation (derived): patch `GeoTIFFImage.prototype.getOrigin` in the single bundled geotiff copy before OL uses it, and unit-test it against `gdalinfo` corners.

**Multiple tiepoints (GCPs only).** Reject with: "El archivo usa puntos de control (GCP) sin transformación afín. Rectifíquelo con: `gdalwarp -t_srs EPSG:8908 -of COG entrada.tif salida.tif`". GeoTIFF 1.1 says rubber-sheeting "should not be used for interchange", and OL falls back to pixel bounds [1, 10]. The `gdalwarp -of COG` form is derived.

**Performance and COG checks** [2, 10, 11]:
- OL builds one tile-grid level per overview. Without overviews, a zoomed-out view decodes every full-resolution tile.
- If the file is not tiled, or has only one IFD and more than about 16 MP (derived threshold), warn: "Mapa sin teselas/vistas generales: será lento. Conviértalo a COG", and show `gdal_translate entrada.tif salida.tif -of COG -co COMPRESS=JPEG -co QUALITY=85` [9]. Defaults: BLOCKSIZE 512, OVERVIEWS AUTO. For DEM or float data, suggest `-co COMPRESS=DEFLATE` (derived).
- COG rules for reference: tiles only, square, 256/512/1024; overviews progressively reduced by a factor of 2–10 and carrying no georeferencing; georeferencing in the full-resolution IFD; BigTIFF above 4 GB [2].
- A GDAL COG with JPEG becomes YCbCr plus a mask. Set `convertToRGB: 'auto'` [9, 10].
- Supported compression codes: 1, 5, 6/7, 8/32946, 32773, 34887 (LERC), 50000 (ZSTD), 50001 (WebP). **Reject** CCITT, JPEG2000 and JXL with a clear message [11].
- BigTIFF support in geotiff.js is "limited": warn on files over 4 GB and test [11].
- WebGLTile `cacheSize` defaults to 512 textures, about 134 MB for 8-bit RGBA at 256². Set it to about 128 on devices with less than 4 GB RAM (derived from [10]).

**Info sheet per raster.** File name, size, import date, CRS name and EPSG code, pixel size (m), dimensions (px), extent (in its CRS and in WGS 84), compression, tiling, overview count, RasterType, and any warnings.

### 2.5 Vector formats

| Format | Read rules | Write rules |
|---|---|---|
| **GeoJSON** (RFC 7946 [3]) | Positions are [lon, lat(, alt)] in WGS 84 (CRS84). The legacy `crs` member is accepted: OL maps `urn:ogc:def:crs:EPSG::5367` → `EPSG:5367` [10]. When it is non-CRS84, show "GeoJSON no conforme a RFC 7946 (CRS heredado)". **No `crs` but coordinates outside ±180/±90:** the file is projected, so ask for the CRS and never guess. The demo files carry `crs` = CRS84, which is fine. | WGS 84 lon/lat only; never CRTM05 in .geojson [3]. 8 decimals (about 1 mm; RFC: 6 decimals ≈ 10 cm [3]; derived). MIME `application/geo+json`. |
| **KML 2.2** [4] | lon,lat,alt tuples; commas within a tuple and whitespace between tuples. Altitude is orthometric from the EGM96 geoid. altitudeMode is clampToGround, relativeToGround or absolute. KMZ (zip) is P1. | clampToGround unless MSL heights are known. |
| **GPX 1.1** [5] | WGS 84. lat −90..90; lon −180 ≤ lon < 180. Reads wpt, rte/rtept, trk/trkseg/trkpt. `<ele>` is "Elevation (in meters)" with no defined datum. `<geoidheight>` is the geoid height above the ellipsoid. | `<ele>` = MSL height when available (API 34+); then `geoidheight` = h − H (derived). Accuracy, satellite count and the mock flag go in `<extensions>`. `fix` only when known (none/2d/3d/dgps/pps). |
| **CSV** | **Import wizard, always confirmed.** Preview 5 rows. Detect the header. Map columns (`lat/latitud`, `lon/longitud`, `este/E/x`, `norte/N/y`, `este_crtm05`, `norte_utm17n`, `nombre`, `linea`, `z`). Choose the CRS. **Headerless SingularXYZ files are Name,N,E,Z,Code.** Hint (derived): in Costa Rica, N > 800 000 m and E < 800 000 m in both CRTM05 and UTM 17N, so swapped columns can be flagged. Eastings tell the CRSs apart at EARTH (UTM ≈ 215 916, CRTM05 ≈ 544 589) but not nationwide (Sixaola UTM E ≈ 322 k). **Never assign a CRS silently** [standards researcher]. | Column names include the CRS, e.g. `E_CRTM05_EPSG8908,N_CRTM05_EPSG8908,lat_WGS84,lon_WGS84,h_elip_m,H_nmm_m,precision68_m,fecha_utc` (derived). Decimal point; comma as the separator. |

### 2.6 Axis-order rules

- Internally, every coordinate is `[x = E or lon, y = N or lat]`, following the OL and GeoJSON convention [3, 10].
- EPSG:4326 is registered lat,lon and EPSG:5367 is registered N,E (CS 4500). OL's `createSafeCoordinateTransform` does not enforce axis order, so this is safe **as long as definitions come from proj strings** [6, 10, 12].
- **Never** call `proj4(...).forward(c, true)` [12].
- GeoTIFF tags are always (E,N) or (lon,lat), whatever the CRS definition says [1 §7.3].
- Displayed text follows ISO 6709: **latitude before longitude**, decimal point, and the CRS named [13].

### 2.7 Coordinate display (P0-09)

- **Formats.** Make each format selectable in Settings, and give each a one-tap cycle on the readout:
  - `WGS 84 (EPSG:4326)  10.2148584, −83.5929759`. 7 decimals, about 1 cm; derived.
  - `CRTM05 (EPSG:8908)  E 544592.12  N 1129535.12`. Use 2 decimals for the phone and 3 for an external RTK source (derived).
  - `UTM 17N (EPSG:32617)  E 215918.66  N 1130308.70`.
- Show both the GPS readout and the crosshair readout. Long-press copies the coordinates as text.
- ISO 6709:2022 adds identification of the CRS [13]. Always show the EPSG code.
- Scale: a dynamic metric scale bar computed at the screen centre. Graphic scales stay true when the map is zoomed [48]; the representative fraction is outdated for digital maps [49]. If a 1:N ratio is shown at all, label it "aprox.".

### 2.8 Heights

- Android `getAltitude()` is metres above the WGS 84 ellipsoid. `getMslAltitudeMeters()` (API 34+) is height above mean sea level [62].
- KML altitude is EGM96 orthometric [4]. GPX `<ele>` has no defined datum [5].
- Always label heights "h elipsoidal" or "H (nivel del mar)".
- Vertical accuracy is at 68 % [62].

---

## 3. UI/UX rules for outdoor field use

### 3.1 Layout (portrait primary; landscape supported without reload)

- **Top status strip, always visible.**
  - GNSS badge (colour plus icon plus text).
  - `Precisión ±3.2 m (68 %) · ±5.2 m (95 %)`.
  - Satellites `12/31`, `L1/L5`, fix age, and `SIMULADA/EXTERNA` when the fix is a mock.
- **North arrow** at top right: always visible and rotating; tap it to return to north [35, 36].
- **Map.** Basemap, overlays, position marker with its accuracy disc, and the crosshair when the readout is in crosshair mode.
- **Navigation panel** (Seguir mode), opaque, directly above the bottom bar:
  - **Desvío**, for example "1.8 m a la DERECHA → muévase a la IZQUIERDA". Say both where the user is and where to go (derived).
  - Distance and bearing to the next vertex or point.
  - Progress "Hecho 820 m · Falta 1300 m · Línea 7/15".
  - ◀ ▶ stepper.
- **Bottom thumb bar.** Primary buttons: Centrar, Seguir, Grabar (P1), Capas. More actions sit behind a menu.

### 3.2 Visual rules

- **Modo sol (default).**
  - Opaque light panels with near-black text at ≥ 7:1 (WCAG 1.4.6 [43]). Android's minimum is 4.5:1 for text under 18 sp [81].
  - Dark-on-light polarity reads better for younger and older users alike [44]. Daylight readability is a measurable display problem [45].
  - Panels over the imagery are never see-through (derived).
- **Sizes.** Key numbers ≥ 24 sp; labels ≥ 14 sp. Layouts must still work at 130 % font scale (derived).
- **Route symbology** (derived from WCAG 1.4.11 3:1 for non-text elements [43]):
  - Lines ≥ 4 dp wide with a white 2 dp casing.
  - The active segment is thicker (6 dp) and a distinct hue.
  - Completed segments are dimmed or dashed.
  - Points have numbered labels at high zoom.
- **State is never shown by colour alone.** The GNSS badge uses an icon and a word ("Buena", "Regular", "Mala"), as well as green, amber and red [43, 53].
- **Night theme** is P1. A dark theme saves about 3–9 % power at 30–50 % brightness and 39–47 % at 100 % [47] (figures from Purdue's summary). Explain that it trades away sunlight legibility [44].

### 3.3 Interaction rules

- **Touch targets.**
  - Primary field buttons are ≥ 60 dp (about 9.5 mm). Parhi et al. found 9.2 mm for single taps and 9.6 mm for tap sequences [42]; the dp conversion is derived.
  - All other controls are ≥ 48 dp [81]. WCAG's minimum is 24 CSS px [43].
  - Place controls along the bottom, within thumb reach.
  - Restyle OL's default controls to these sizes.
- **Destructive actions** (delete map, clear track) need a confirmation dialog or long-press [42].
- **Rotation-gesture lock** is optional (P1-13).
- **Keep the map visible during navigation.** The navigation display sits on top of the map and never replaces it with an arrow-only screen. GPS-phone users walk farther, stop more and learn the area worse than map users [37, 38]. A map plus accurate prompts performed best [39].
- **"Ver ruta completa"** is always one tap away [37, 41].
- **Off-screen next target.** An edge wedge or arrow with the distance (P1-05). Wedge is better for judging distance; Overview+Detail is better for locating [41].
- **Tap a feature** to open an attribute sheet. The layer panel doubles as the legend, with metadata available per layer [50, 51, 52].
- **Haptics and sound** (P0 vibration, P1 sound):
  - Different vibration patterns for off-track left and right (derived): **left = two short pulses (100-100-100 ms); right = one long pulse (400 ms)**. At most one alert every 5 s (derived).
  - Pings near a vertex speed up as the target gets closer [54].
  - Haptics should let users look up from the screen. Pielot et al. studied this in situ [40]; the "about ten times fewer glances" figure is unconfirmed, so do not quote it.
  - Everything can be switched off.

### 3.4 Orientation

- "Norte arriba" is the default: it supports building a mental map [35].
- "Rumbo arriba" is offered for following. It needs a mental rotation, which is error-prone [36].
- In track-up, rotate the view by the heading from §4.4, and the north arrow follows.
- Every bearing is labelled with its north reference: "verdadero", "cuadrícula" or "magnético".

### 3.5 Spanish string set (key messages)

Decimal point everywhere; see conflict C7.

| Key | Text |
|---|---|
| acc_label | `Precisión ±{r68} m (68 %) · ±{r95} m (95 %)` |
| not_rtk_banner | `Su teléfono no es un receptor RTK: su posición tiene un error típico de 2–5 m a cielo abierto. Las líneas fueron medidas con RTK (centímetros). Para replanteo preciso use el receptor RTK.` [23, 26] |
| spacing_warn | `La precisión del GPS del teléfono (±{r68} m) es mayor que la separación entre líneas ({s} m).` [24] |
| approx_banner | `Ubicación aproximada (~3 km²): el seguimiento de líneas está desactivado. Active «Ubicación precisa».` [66] |
| low_acc_block | `Precisión insuficiente para marcar llegada (±{r68} m).` |
| stale | `Sin posición nueva hace {s} s` |
| mock | `Posición EXTERNA/SIMULADA` |
| xte | `Está {d} m a la {DERECHA/IZQUIERDA} de la línea → muévase a la {IZQUIERDA/DERECHA}` |
| no_webgl | `Su visor web no admite WebGL. Actualice «Android System WebView» desde Play Store.` |
| cog_warn | `Mapa sin teselas o vistas generales: será lento en el teléfono. Conviértalo a COG (ver Ayuda).` |
| crs_ask | `No se pudo identificar el sistema de coordenadas. Elija uno:` |

---

## 4. GNSS and navigation behaviour

### 4.1 Position source

- **Use native `LocationManager.GPS_PROVIDER`** (API 1; no Play services; works offline) [63]. Do not use WebView `navigator.geolocation` [§5.5].
- Fallback: `FUSED_PROVIDER` (platform, API 31+, "if present") only if GPS has given no fix after 60 s (derived). `NETWORK_PROVIDER` is useless in the field [63].
- Play-services `PRIORITY_HIGH_ACCURACY` [69] is **not used**, because the build has no Gradle or Play libraries (conflict C3).
- **Update rate.**
  - 1 s (`minTime` 1000 ms, `minDistance` 0) only during Seguir or Grabar.
  - About 2 s while position is shown otherwise (derived).
  - Stopped when "Mi ubicación" is off.
  - High accuracy at a few seconds' interval is reserved for foreground mapping use [68].
- **Lifecycle.** `removeUpdates` in `onPause` unless TrackService is recording [68].
- **Ordering and age.** Order fixes by `getElapsedRealtimeNanos()`; `getTime()` can jump. A fix older than 3 s is stale: grey the marker and show its age (threshold derived) [62].
- **Mock fixes.** Flag with `isMock()` (API 31+) or `isFromMockProvider()` below 31. **Badge them, never reject.** External RTK apps feed Android through mock locations; their `getAccuracy()` value is whatever that app reports [62, Android researcher].
- **Satellite status.** `registerGnssStatusCallback` (API 24): counts used in fix and in view, mean C/N0. **L5** when `getCarrierFrequencyHz()` ≈ 1176.45 MHz (API 26) [64].

**Fix message, native → web (JSON):**

```json
{"type":"fix","t":1730800000000,"et":123456789,"lat":10.2148584,"lon":-83.5929759,
 "acc":3.2,"altEll":38.1,"altMsl":null,"vacc":5.0,"brg":2.6,"bacc":12.0,
 "spd":1.1,"sacc":0.3,"prov":"gps","mock":false,"sat":{"used":12,"view":31,"l5":true}}
```

Absent values are `null`. Each `has*()` method gates its field.

### 4.2 Accuracy semantics and conversions

- Android `getAccuracy()` is the **68th-percentile horizontal radius**. Vertical, bearing and speed accuracies are also at 68 % [62].
- W3C `coords.accuracy` is defined at 95 % [60]. Chromium's Android adapter copies the 68 % value unscaled and leaves `altitudeAccuracy` null [61]. This is another reason the WebView API is not used.
- Conversions for circular Gaussian errors, where the radius follows a Rayleigh distribution [20] (factors derived):
  - **r95 ≈ 1.62 × r68**
  - **CEP50 ≈ 0.78 × r68**
  - vertical 95 % ≈ 1.97 × vertical 68 % (1.96 × 1σ)
- **Use ×1.7308 only when the input is an RMS (DRMS) value**, for example from NMEA GST (σ_h = √(σ_lat² + σ_lon²)). This is Esri's horizontal factor [55, 56]; see conflict C2.
- "R95 = 2DRMS" is wrong [20].
- Always call the value an **estimate**. Phones' self-reported accuracy "correlated poorly with observed error" [24].

### 4.3 Accuracy display and quality badge

- **Accuracy disc.**
  - Uniform semi-transparent disc with a solid border and a centre dot.
  - Radius = r68 in ground metres, redrawn on every zoom.
  - No Gaussian fade.
  - A uniform circle with a border gave the best judgments and the fastest responses [33]. User-tested designs should match the task [34].
- **Optional 95 % ring** (setting): r95 = 1.62·r68.
- **Badge thresholds (defaults, configurable)** [53, GNSS researcher]:

  | Profile | Green | Amber | Red |
  |---|---|---|---|
  | Phone | r68 ≤ 3 m | 3–8 m | > 8 m |
  | External RTK (derived) | ≤ 0.05 m | ≤ 0.5 m | > 0.5 m |

- **Red blocks** arrival marking and point capture [53].
- **Honesty.**
  - Expected phone error: about 5 m under open sky [23]; static median 5.0–8.5 m [24]; 7–13 m with Avenza in an urban setting [25].
  - Open area 1.9–2.4 m RMSE, forest 4.5–11.5 m [26]; dual-frequency phones 1.7–4.5 m open, 5.4–12.6 m leaf-on forest [27]; 4.56 m DRMS under canopy [31].
  - Typically 3–5 m, and over 10 m with multipath [28]; Mi 8 single-point positioning about 4.6–5.4 m [29].
  - Show `not_rtk_banner` once per session when Seguir starts, plus a permanent info icon.
  - Show `spacing_warn` (amber) when r68 > s/2, and in red when r68 > s, where s is the line spacing (thresholds derived from [24]).
- **Store** r68, vertical accuracy, satellite counts, the mock flag and the provider with every recorded point [24, 55].

### 4.4 Heading

- **Moving:** use the GNSS course `getBearing()` (direction of travel, "unrelated to the device orientation") when `hasBearing()`, speed ≥ 0.8 m/s and `getBearingAccuracyDegrees()` ≤ 20° [62] (thresholds derived).
- **Stationary:** use the compass (`TYPE_ROTATION_VECTOR`, derived). True heading = magnetic + declination, from `GeomagneticField(lat, lon, alt, time).getDeclination()` (degrees, positive east) [65].
  - The model is WMM-2020, "valid until 2025", and the docs say it should give acceptable results for several years after. Label it "aprox." [65].
  - Show "Calibre la brújula" when the sensor reports low accuracy (derived).
- **North references** [17; values from the researchers]:
  - true bearing = grid bearing + γ, with γ ≈ arctan(tan(λ−λ₀)·sin φ);
  - magnetic bearing = true bearing − declination;
  - at EARTH, γ = +0.07° in CRTM05 and −0.46° in UTM 17N.
- In a CRTM05 or UTM view, the screen's up direction is grid north. The north arrow shows true north, rotated by γ (derived; negligible in CRTM05).
- Show bearing uncertainty when it is available (68 %) [62].

### 4.5 Route geometry and formulas (planar, in the navigation CRS of §2.3)

Take a leg A→B and position P, all as (E, N). Let d = B − A, L = |d| and u = d/L [GNSS researcher; 17].

| Quantity | Formula |
|---|---|
| Along-track distance | t = (P − A)·u |
| Nearest point on the leg | A + clamp(t, 0, L)·u |
| Cross-track error (+ = right of the direction of travel) | XTE = (d_N(P_E − A_E) − d_E(P_N − A_N)) / L |
| Remaining on the leg | L − t |
| Grid bearing to B | β = atan2(B_E − P_E, B_N − P_N), normalised to 0–360° |
| Route progress | done = S_k + clamp(t, 0, L), where S_k is the cumulative length to vertex k; remaining = S_total − done |

Unit check: A(0,0), B(0,10), P(1,5) gives XTE = +1 (right), t = 5, remaining 5.

### 4.6 Matching, arrival and off-track

**Never snap to the nearest line globally.** With 5 m spacing and 2–5 m phone error, a global snap jumps to the neighbouring pass [GNSS researcher]. Use **progress-limited matching** instead, a simplified form of [21, 22] (details derived):

1. **State.** Active segment k, cumulative progress, direction of travel (forward by default; "Invertir sentido" is available).
2. **Candidates.** Only segments k and k+1, and k−1 for display only. Never move more than one segment per fix.
3. **Advance** k → k+1 only through the arrival rule, or when k+1 has a smaller |distance| than k for **2 consecutive fixes** and the GNSS course is within 90° of segment k+1's direction (heading check only while moving per §4.4).
4. **Start.** Default is vertex 0. "Empezar en el punto más cercano" asks for confirmation; a tap on any vertex sets it.
5. **Manual override.** The ◀ ▶ stepper always works [54].
6. **Fix gating.** Fixes that are stale (> 3 s), have r68 > 50 m, or come from approximate-only permission are ignored for matching (derived).

**Arrival at the next vertex or point** [GNSS researcher; thresholds are an engineering suggestion]:
- Condition: distance ≤ r_arr, where r_arr = min(2.5 m, interval/2) and is configurable; **or** t ≥ L, meaning the user has crossed the perpendicular at B. The condition must hold on **2 consecutive fixes**.
- **Blocked** with `low_acc_block` when r68 > 8 m (the red threshold).
- The QField rule ((distance − accuracy) < threshold/10, precise view when accuracy < threshold/2 [54]) is P2-02 only; see conflict C5.
- On arrival: a short double vibration and a ping (P1). Then advance.

**Off-track (corridor).**
- Alert when |XTE| > w_eff, where w_eff = max(w, r68) and w defaults to 2.5 m (half the line spacing) [GNSS researcher; generalisation derived].
- Clear the alert when |XTE| < 0.8·w_eff (hysteresis, derived).
- Vibration patterns are left/right specific (§3.3).

**Ir a puntos mode** (P0-07). The leg runs from the previous point to the next point, ordered by `id`, or by `linea` then `id`. Same rules. Show "P037 · Línea 3/15 · 4.2 m · 184° (cuadrícula)".

### 4.7 Recording and capture (P1)

- **Track.**
  - Through TrackService, a location-type foreground service [70], at 1 s.
  - Each point stores time (UTC ISO 8601), lat/lon, h, H, r68, vertical accuracy, satellite counts and the mock flag.
  - Write GPX 1.1 per §2.5. Recording continues with the screen off.
- **Point capture.**
  - Average N fixes (default 10) and require a non-red badge [53].
  - Store the mean, the standard deviations, N, min/max r68 and metadata [55].

---

## 5. Android engineering decisions

### 5.1 Identity, SDK levels, versioning

- **Package `org.mapacampo.android`.** It is fixed forever: package name plus signing certificate is the app's identity [85, 87].
- **SDK levels.**
  - compileSdk and targetSdk **36**: required by Play for new apps and updates from 2026-08-31 [82]. Followed for sideloading too.
  - minSdk **26** (24 is acceptable). From 26:
    - the WebView renderer runs in its own process;
    - `onRenderProcessGone` is available;
    - adaptive icons in `mipmap-anydpi-v26` need no legacy PNGs;
    - v1 JAR signing is not needed [76, 85, 88].
- **Versioning.** versionCode is a positive integer that increases every release, starting at 1. versionName is `1.0.0` [85].
- **Behaviour when targeting 36** [83, 84]:
  - **Edge-to-edge is forced**: apply system-bar and cutout insets. Pass them to the page as CSS variables through the bridge (derived).
  - **Predictive back is on**: `onBackPressed` and `KEYCODE_BACK` are not delivered on Android 16+. Use `OnBackInvokedCallback` (API 33+) and `onBackPressed` below 33. Back first closes web panels, then exits.
  - On screens ≥ sw600dp, orientation locks are ignored.

### 5.2 Manifest

| Item | Rule |
|---|---|
| Permissions | `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION`, always requested together [66]. `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` for TrackService (API 34+) [70]. `VIBRATE`. `POST_NOTIFICATIONS`, requested only when recording starts (API 33+; derived, not in the findings). **No** `ACCESS_BACKGROUND_LOCATION` [66]. **No** storage permissions; SAF needs none [79]. |
| INTERNET | Declared in the draft. Keep it to avoid WebView network-stack edge cases. Offline behaviour is enforced by the interceptor and the CSP. Whether it is needed when every request is intercepted is unverified (§8). |
| `<application>` | `android:appCategory="maps"`; `hardwareAccelerated` left at the default true; `usesCleartextTraffic="false"`; `enableOnBackInvokedCallback="true"`; exclude the map library from backup (`allowBackup="false"` as in the draft, or `dataExtractionRules`); optional `android.webkit.WebView.MetricsOptOut=true` [78]. **Remove `largeHeap="true"`**: WebView memory is native, and the docs say most apps do not need it [76]. |
| Activity | `exported="true"` plus the launcher filter. `configChanges` includes orientation and screen size so rotation does not reload the map. Theme `@android:style/Theme.Material.NoActionBar` (framework). |
| Service | `.TrackService`, `exported="false"`, `foregroundServiceType="location"`. Start it only while the app is in the foreground [70]. |
| Icon | Adaptive icon with foreground, background and monochrome layers, each 108×108 dp. Keep the logo within the 66 dp safe zone [85]. |

### 5.3 No AndroidX: framework equivalents [Android researcher; 74, 92]

| Need | Framework API used |
|---|---|
| WebViewAssetLoader | Own `WebViewClient.shouldInterceptRequest` + `WebResourceResponse` (6-argument constructor, API 21) [73, 74] |
| addWebMessageListener | `WebView.createWebMessageChannel()` + `postWebMessage(msg, Uri.parse("https://appassets.androidplatform.net"))` (API 23); never target `*` [75] |
| Predictive back | `OnBackInvokedCallback` (API 33) [84] |
| Insets | `View.setOnApplyWindowInsetsListener` [84] |

Reason: `androidx.webkit:webkit:1.18.0` pulls in core, annotation, annotation-experimental and jspecify, and resolving those AARs by hand is fragile [92].

### 5.4 Permissions flow (P0-12)

1. **Ask in context**: on the first tap of "Mi ubicación" or "Seguir", call `requestPermissions({FINE, COARSE})` [66]. Asking for FINE alone is ignored on some Android 12 releases [66].
2. **Results.**
   - FINE granted: precise.
   - Only COARSE: `approx_banner`, navigation disabled, button "Solicitar ubicación precisa", which asks for both again. Approximate location is about 3 km² [66].
   - Denied: explain, with a button that opens the app's settings page.
3. **State persistence.** Downgrading from precise to approximate restarts the process [66]. Persist the state on every change and in `onPause`.
4. If location services are off, show a prompt that opens the system Location settings screen. The app never changes settings itself.

### 5.5 WebView configuration

**Origin.** Load `https://appassets.androidplatform.net/www/index.html`, served by the app's own interceptor [74]. Never load `file://`: it is an opaque origin with no `fetch()` [74].

**WebSettings** [73]:

| Setting | Value |
|---|---|
| `setJavaScriptEnabled` | `true` |
| `setDomStorageEnabled` | `true` |
| `setAllowFileAccess` | `false` |
| `setAllowContentAccess` | `false` |
| `setAllowFileAccessFromFileURLs` | `false` (deprecated, API 30) |
| `setAllowUniversalAccessFromFileURLs` | `false` (deprecated, API 30) |
| `setMixedContentMode` | `MIXED_CONTENT_NEVER_ALLOW` |
| `setGeolocationEnabled` | `false` (derived: location comes only through the native bridge) |

**Navigation lock.** `shouldOverrideUrlLoading` blocks every host other than `appassets.androidplatform.net` [75]. `shouldInterceptRequest` runs on a background thread [73]. For any other host, return an error response (for example 403 with a non-empty reason phrase), so nothing ever goes online.

**CSP header on the HTML:**

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'
```

- `worker-src blob:` is there for geotiff.js decoders.
- Add `'wasm-unsafe-eval'` only if WebAssembly decoders such as LERC or ZSTD are in use.
- Test on a device [Android researcher].

**MIME map**, explicit [Android researcher]:

| Extension | MIME |
|---|---|
| `.js`/`.mjs` | `text/javascript` |
| `.wasm` | `application/wasm` |
| `.css` | `text/css` |
| `.html` | `text/html` |
| `.geojson` | `application/geo+json` |
| `.tif` | `image/tiff` |
| `.json` | `application/json` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |

**WebGL.**
- Never set software layers or `hardwareAccelerated=false`: software drawing has no WebGL [77].
- At startup, test `getContext('webgl2') || getContext('webgl')`. If neither works, show `no_webgl` with the version from `WebView.getCurrentWebViewPackage()`.
- The esbuild target is `chrome80`, so require WebView ≥ 80 (derived from the current build config).

**Renderer crash.** In `onRenderProcessGone`, return true, remove and destroy the WebView, recreate it, and restore state [76].

**Debugging.** `setWebContentsDebuggingEnabled(true)` in debug builds only.

### 5.6 Files, storage and byte-range serving

**Import.**
- Native `ACTION_OPEN_DOCUMENT`, `CATEGORY_OPENABLE`, type `*/*` [79].
- Validate by extension **and** by magic bytes for TIFF: `II*\0`, `MM\0*`, and BigTIFF `II+\0`, `MM\0+`. Pickers mislabel .geojson and .gpx.
- Read the name and size through `OpenableColumns`.
- Check free space, then copy on a background thread to `getFilesDir()/library/<uuid>.<ext>` with a progress UI [79].
- For very large orthomosaics, optionally link the file instead of copying it (`takePersistableUriPermission`, P1).

**Manifest.** `getFilesDir()/library/manifest.json` is the source of truth [80]. Each entry holds: id, original name, kind, size, import date, CRS (detected or user-chosen), georeferencing summary, warnings, and display state.

**Serving.** `https://appassets.androidplatform.net/library/<uuid>.tif`. The interceptor MUST answer HTTP Range requests:
- status **206** with reason phrase "Partial Content";
- headers `Content-Range: bytes s-e/total`, `Content-Length`, `Accept-Ranges: bytes`, `Content-Type: image/tiff`;
- the body streams only that byte range;
- status must be in 100–299 or 400–599, and the reason phrase must be non-empty [73];
- handle single ranges; OL and geotiff.js default to single-range requests (derived; do not set `maxRanges`);
- precedent: Capacitor's `WebViewLocalServer` [94].

**Why Range matters.**
- geotiff.js reads by range, so memory stays bounded for tiled COGs [2, 11].
- OL merges strip reads only for URL sources [10].
- InternalStoragePathHandler's Range support is unverified, which is another reason to use the custom interceptor [Android researcher, standards researcher].

**Fallback, if 206 fails on some WebView.** An in-page `<input type=file>` through `onShowFileChooser`, which must return true and call `onReceiveValue` exactly once, with null on cancel [73]. Then use `sources:[{blob: file}]` (OL COG-blob example [10]). `fromBlob` uses `Blob.slice` random access [11]. The user has to re-pick the file each session.

### 5.7 Bridge protocol (WebMessagePort)

- **Setup.**
  1. On `onPageFinished`, native creates a channel and posts `{"type":"init"}` with `ports[1]` to the app origin.
  2. The page keeps `event.ports[0]` from the **first** init only.
  3. All further traffic is JSON strings on that port.
  4. `evaluateJavascript` is acceptable for native → web if needed.
  5. Avoid `addJavascriptInterface`: Android calls it "Legacy" and it has no origin checks [75].
- **Native → web messages:** `fix` (§4.1), `gnss`, `heading`, `perm`, `imported`, `importProgress`, `insets`, `lifecycle`, `back`, `trackState`.
- **Web → native commands:** `startLocation{mode}`, `stopLocation`, `requestPermission`, `pickFile{kinds}`, `deleteFile{id}`, `keepScreenOn{on}`, `vibrate{pattern}`, `startTrack`/`stopTrack`, `export{name,mime,data}`, `saveState{json}`, `openLocationSettings`, `exitApp`.

### 5.8 Screen, battery and background

- `FLAG_KEEP_SCREEN_ON` is set only in Seguir and cleared otherwise; there is a toggle. No wake-lock permission is needed, and the system ignores the flag in the background [71].
- On a measured phone, the display and the radio dominated power draw [46]. Render from overviews [§2.4].
- Screen-on following needs no background permission. Screen-off recording uses only TrackService [66, 70].

### 5.9 Build path on Windows with JDK 25, without Gradle (delivery)

**Machine state.**
- JDK: `C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot\`. The path contains spaces, so quote it.
- **No Android SDK** (`C:\Android` does not exist; checked 2026-11-05). No Gradle.
- Node v24.19.0 is present. The web bundle builds with `node build.mjs` into `android\assets\www`.

**1. SDK install to `C:\Android\Sdk`** (from `https://dl.google.com/android/repository/`, per `repository2-3.xml` [89]):

| Package | Archive | Bytes | SHA-1 |
|---|---|---|---|
| cmdline-tools;latest 23.0 | commandlinetools-win-16111833_latest.zip | 154957218 | 57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d |
| platforms;android-36 r2 | platform-36_r02.zip | 65878410 | 2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576 |
| build-tools;36.0.0 | build-tools_r36_windows.zip | 58699878 | f16ccffd34de8790dede813a6c7d8e2c11a27b50 |
| platform-tools 37.0.1 | platform-tools_r37.0.1-win.zip | 8044989 | e03e78b1d80b396f1c3358e31251cb31740e1110 |

- Unzip cmdline-tools into `<sdk>\cmdline-tools\latest\`.
- Then run `sdkmanager --sdk_root=C:\Android\Sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"` [86].
- **Needs user confirmation:** `sdkmanager --licenses` accepts the Android SDK License Agreement, and downloading the zips is covered by the same license. This is a terms acceptance; see §8.
- Alternative: build-tools 37.0.0. 36.0.0 is AGP 9.5's default, so it also serves a later Gradle build [89, 90].

**2. Build, in this order** [86, 87]. All tools come from `C:\Android\Sdk\build-tools\36.0.0`, with `AJ = C:\Android\Sdk\platforms\android-36\android.jar`.

1. **Compile resources:** `aapt2 compile --dir <res> -o build\res.zip`. Compiling to a zip is unverified; use a directory output if it fails.
2. **Link:** `aapt2 link -o build\base.apk -I %AJ% --manifest build\AndroidManifest.xml -A <assets> --java build\gen --min-sdk-version 26 --target-sdk-version 36 --version-code 1 --version-name 1.0.0 build\res.zip`. The manifest copy must carry `package=`.
3. **Compile Java:** `javac -source 8 -target 8 -bootclasspath %AJ% -Xlint:-options -encoding UTF-8 -d build\classes <sources + R.java>`. This builds strictly against Android's own Java APIs. `--release 11` would take `java.*` from the JDK. Both options were tested with JDK 25.
4. **Package classes:** `jar --create --file build\classes.jar -C build\classes .`
5. **Dex:** `d8 --release --lib %AJ% --min-api 26 --output build\dex build\classes.jar`. `--lib` is needed for lambda desugaring.
6. **Add dex:** `jar --update --no-manifest --file build\base.apk -C build\dex classes.dex`. Verified: `resources.arsc` stays STORED. This is required because Android 11+ rejects a compressed or unaligned arsc for targetSdk ≥ 30 [83].
7. **Align:** `zipalign -P 16 -f -v 4 build\base.apk build\aligned.apk`. This MUST come **before** signing [86].
8. **Key, once:** `keytool -genkeypair -v -keystore release.p12 -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000 -alias mapacampo`. Validity should be ≥ 25 years. **Back up the keystore off-machine.** Losing it means updates can never be installed over the old app. Never commit it [87].
9. **Sign:** `apksigner sign --ks release.p12 --ks-key-alias mapacampo --ks-pass file:<pwfile> --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out MapaCampo-1.0.0.apk build\aligned.apk`. v2 or higher is mandatory on Android 11+. v4 is off, so no `.idsig` file is produced. A password file keeps the password off the command line [86, 88].
10. **Verify:** `apksigner verify -v --print-certs`, `zipalign -c -P 16 -v 4`, and `aapt2 dump badging` (check the package, sdkVersion 26, targetSdkVersion 36 and the permissions).

**Layout.** Keep sources so that a Gradle project can be added later. A standard `app/src/main/...` layout is recommended; the current flat `android\` layout works for this script. The Gradle option:
- AGP 9.5.0 needs Gradle ≥ 9.6.0 and JDK ≥ 17.
- Gradle runs on Java 25 from 9.1.0.
- AGP 9 turns on built-in Kotlin; `android.builtInKotlin=false` turns it off.
- This route needs network access for its dependencies [90, 91].

**Distribution.**
- Sideloading requires allowing "install unknown apps".
- Android developer verification applies from 2026-09-30 in Brazil, Indonesia, Singapore and Thailand, and globally in 2027. "Limited distribution" covers up to 20 devices for students.
- Keep the package name and key stable so the app can be registered later [93].

---

## 6. Test checklist

### A. Build and package
- [ ] `node build.mjs` succeeds. `android\assets\www` contains `index.html`, `app.js`, the license file and the demo GeoJSONs.
- [ ] `apksigner verify -v --print-certs` passes, with v2 and v3 true and v1 false.
- [ ] `zipalign -c -P 16 -v 4` reports OK.
- [ ] `aapt2 dump badging` shows package `org.mapacampo.android`, versionCode 1, versionName 1.0.0, sdkVersion 26, targetSdkVersion 36, the expected permissions, and no `ACCESS_BACKGROUND_LOCATION`.
- [ ] `resources.arsc` is STORED and 4-byte aligned.
- [ ] Installs on Android 8 (API 26), 12, 14 and 16. Reinstalling with `adb install -r` over the same key works.

### B. CRS and math unit tests (extend `web/test/test_math.mjs`)
- [ ] **P001** (lat 10.21485840, lon −83.59297594):
  - → EPSG:5367 = **E 544592.110, N 1129535.023** (±1 mm; must equal `puntos_levantamiento.csv`);
  - → EPSG:8908 = E 544592.125, N 1129535.122;
  - → EPSG:32617 = E 215918.658, N 1130308.702 (CSV 215918.657);
  - **regression guard:** the epsg.io 5367 string gives E 544592.400, N 1129534.070, and that result must NOT be accepted.
- [ ] Helmert at EARTH: wrong-sign shift dE −0.27/dN +1.05; corrected shift dE +0.02/dN +0.10 [6, 7, 8].
- [ ] Convergence at EARTH: +0.07° (CRTM05), −0.46° (UTM 17N). Scale factors: k 0.999925 and 1.000596.
- [ ] Round trip 4326 → 8908 → 4326 is within 1 mm. The same holds for 5367, 32617 and 8910.
- [ ] Axis order: no swapped output for 5367 or 4326. Registration from proj strings only. A code-search check finds no `forward(…, true)` calls.
- [ ] XTE, along-track and remaining distance: A(0,0) B(0,10) P(1,5) gives +1 / 5 / 5. P(−2,12) gives t = 12 ≥ L, so passed.
- [ ] Bearing normalisation at 0°, 90°, 180°, 270° and 359.9°.
- [ ] Imported route length in 8908 ≈ 2120.3 m, each line ≈ 136.7 m, line bearing ≈ 2.6°, 420 points, 15 lines (`resumen.json`).
- [ ] A 137 m north–south leg shows 137.0 m in navigation, **not** about 139.2 m (EPSG:3857 view units) [16].
- [ ] Accuracy: r68 = 4.0 gives r95 6.5 and CEP 3.1. A DRMS of 4.0 gives R95 6.9.
- [ ] No network: the CRS lookup for an unknown code rejects locally, and no fetch is issued.

### C. GeoTIFF corpus (compare every corner with `gdalinfo`)
- [ ] COG JPEG/YCbCr RGB orthomosaic (EPSG:8908) renders with correct colours (`convertToRGB:'auto'`).
- [ ] COG in 5367, 32617 and 4326 aligns with the route to within 1 px.
- [ ] Stripped LZW file without overviews shows the warning and still renders.
- [ ] **PixelIsPoint** file: the half-pixel shift matches GDAL (RFC 33) [9].
- [ ] Tiepoint with I or J ≠ 0: the origin is corrected.
- [ ] Rotated ModelTransformation renders correctly.
- [ ] GCP-only file is rejected with the `gdalwarp` hint.
- [ ] No georeferencing: rejected.
- [ ] 32767 user-defined CRS: the CRS picker appears and the choice persists.
- [ ] Single-band 16-bit or float DEM displays (P1 ramp).
- [ ] JPEG2000, CCITT and JXL compression are rejected with a message.
- [ ] A file over 4 GB (BigTIFF) shows a warning; record the behaviour.
- [ ] A renamed non-TIFF is rejected by the magic-byte check.
- [ ] A 1–2 GB orthomosaic on a phone with 3–4 GB RAM: no renderer crash during 10 minutes of panning and zooming. Record memory use and the cacheSize effect.
- [ ] **Range serving:** logs show 206 responses with correct `Content-Range`, and the whole file is never read. Fallback: the blob picker works.

### D. Vector import
- [ ] The route GeoJSON with the legacy `crs` (CRS84) loads silently.
- [ ] A GeoJSON with `urn:ogc:def:crs:EPSG::5367` loads and shows the non-conformance note.
- [ ] A projected GeoJSON without `crs` triggers the CRS picker.
- [ ] KML and GPX versions of the route coincide with the GeoJSON to within 1 cm.
- [ ] `puntos_levantamiento.csv` (header; UTM and CRTM05 columns) maps correctly.
- [ ] **Headerless SingularXYZ `puntos_CRTM05.csv`** (Name,N,E,Z,Code): the wizard flags the N/E order and the points land exactly on the GeoJSON points.
- [ ] Swapped E/N is detected by the range hint.
- [ ] Malformed or empty files give a clear error and no crash.

### E. Export (P1)
- [ ] GeoJSON export is WGS 84 lon/lat with 8 decimals and validates against RFC 7946.
- [ ] GPX validates against `gpx.xsd`.
- [ ] CSV column names carry the CRS.
- [ ] KML coordinate order is lon,lat,alt.

### F. Permissions, GNSS, offline (device)
- [ ] Precise / Approximate / "Solo esta vez" / Deny all handled. Downgrading to approximate in Settings restarts the process and the state is restored.
- [ ] Location services off: prompt shown.
- [ ] A mock-location app feeds an external receiver: the badge shows "EXTERNA/SIMULADA" and following still works.
- [ ] Stale fix: grey marker and age shown after 3 s.
- [ ] L5 label appears on a dual-frequency phone. Satellite counts match a GNSS status app.
- [ ] **Airplane mode:** every P0 feature works, and logcat or DevTools show zero outbound requests.
- [ ] Location updates stop in `onPause` (`dumpsys location`), except while recording.
- [ ] No CSP violations in the console. GeoTIFF decoder workers run.

### G. Field tests (EARTH field, 5 m serpentine)
- [ ] Walk all 15 lines under open sky. Count false segment switches (target 0) and missed or double arrivals. Log XTE against RTK truth if an RTK receiver is available.
- [ ] Off-track vibration fires on the correct side. Hysteresis prevents chatter.
- [ ] North-up and track-up. The compass heading is stable when standing still; the course takes over above 0.8 m/s.
- [ ] Line-spacing and accuracy warnings appear when r68 > 2.5 m. Arrival is blocked when r68 > 8 m.
- [ ] Repeat near tree cover and record the accuracy against [26, 27].
- [ ] Battery: % used per hour in Seguir with the screen on at full brightness, against "Mi ubicación" only.
- [ ] Screen stays on only during Seguir.

### H. UI and accessibility
- [ ] Sunlight readability check outdoors at midday [45].
- [ ] Measured contrast: text ≥ 7:1, route lines and icons ≥ 3:1 against the orthophoto [43].
- [ ] Touch targets: primary ≥ 60 dp, others ≥ 48 dp [42, 81].
- [ ] 130 % font scale.
- [ ] TalkBack labels on all controls (derived).
- [ ] Rotation between portrait and landscape does not reload the map.
- [ ] Edge-to-edge: no controls under the status or navigation bars or the cutout (Android 15/16).
- [ ] Predictive back on Android 16: panels close first, then the app exits.

### I. Robustness
- [ ] Kill the renderer process: the WebView is recreated and the state restored.
- [ ] Process death while following resumes at the same segment.
- [ ] Storage fills during import: clean failure with a message and no partial manifest entry.
- [ ] Corrupt TIFF: error, no crash.
- [ ] WebView without WebGL, or an old WebView: `no_webgl` message.

---

## 7. Conflicting findings and resolutions

| # | Conflict | Resolution |
|---|---|---|
| C1 | **EPSG:5367 datum shift.** The GNSS researcher used the epsg.io `+towgs84` and reported "≈1.1 m CR05–WGS 84 offset". The standards researcher says that string has the wrong rotation sign. | **Standards is correct.** EPSG 8969 was deprecated 2021-06-11 for "wrong rotation convention" and replaced by 9752 (Coordinate Frame) [6]. I confirmed this from the EPSG JSON records. The corrected string reproduces the survey CSV to 1 mm; the epsg.io string misses by about 1 m. The real CR05→WGS 84 shift at EARTH is about **0.10 m**, not 1.1 m. |
| C2 | **95 % factor.** UX F3 calls Esri's ×1.7308 a "68 % → 95 %" conversion. UX F1 applies it to RMS input. GNSS says r95 ≈ 1.62 × r68. | ×1.62 applies to Android's 68th-percentile radius (Rayleigh). ×1.7308 applies only to a DRMS input such as GST (2.4477/√2). Esri's label treats DRMS as about "68 %" [20, 55, 56]. |
| C3 | **Location API.** UX F12 uses Play-services `PRIORITY_HIGH_ACCURACY`. GNSS and Android use `LocationManager.GPS_PROVIDER`. | GPS_PROVIDER at 1 s; platform FUSED_PROVIDER (API 31+) as a fallback; no Play services, since the build has no Gradle [63, 69]. |
| C4 | **WebView plumbing.** GNSS and standards recommend `WebViewAssetLoader` and `WebViewCompat.addWebMessageListener` (AndroidX). Android recommends framework-only APIs. | Framework equivalents (§5.3), the same `appassets.androidplatform.net` origin, and a custom interceptor with Range support [73, 74, 75]. |
| C5 | **Arrival rule.** QField: (distance − accuracy) < threshold/10 [54]. GNSS: distance ≤ 2.5 m or crossed the perpendicular, for 2 fixes, blocked above 8–10 m. | The QField rule overlaps the next point at 5 m spacing with phone accuracy (derived), so the GNSS rule is used. The QField precise view is P2. |
| C6 | **Snapping.** UX F5 "snap to the active segment" against GNSS "never snap to the nearest line". | Compatible: snap only to the progress-limited active segment (§4.6). |
| C7 | **Decimal separator.** UX F15 and ISO 6709 use a decimal point. GNSS strings use a comma ("±1,6X"). | Decimal point everywhere. Coordinates must stay copy-pasteable, and the comma is the CSV and coordinate separator [13]. |
| C8 | **Accuracy colours.** GNSS gives fixed 3/8 m. UX/QField use user thresholds. | GNSS values are the phone defaults; all thresholds are configurable [53]. |
| C9 | **Line-spacing warning.** UX: accuracy > spacing. GNSS: off-track at max(2.5 m, accuracy); arrival blocked above 8–10 m. | Amber when r68 > s/2, red when r68 > s, arrival blocked above 8 m (§4.3, §4.6). |
| C10 | **Decree number.** EPSG gives 40692-MJP; Costa Rican sources give 40962-MJP. | Cite 40962-MJP with a note. The Costa Rican source URL was not supplied, so verify before formal use. |
| C11 | **Tomaštík et al. 2017 authors.** UX lists 3 authors, GNSS lists 4 (Jr. and Sr.). | Use the 4-author form [26] and confirm against the DOI. |
| C12 | **Grid convergence.** UX gives "≈ −0.5° / ≈ 0°"; standards and GNSS give −0.46° / +0.07°. | Use the precise values. |
| C13 | **Theme.** A light sun mode for legibility against a dark theme for battery. | Light is the default; dark is an option with the trade-off explained [44, 47]. |
| C14 | **Screen-off recording.** UX wants a foreground service; GNSS says it is not needed with the screen on. | P0 is screen-on following. P1 is foreground-service track recording [66, 70]. |
| C15 | **Vertical 95 %.** Esri uses ×1.96 (from 1σ); GNSS uses ×1.97 (from the 68th percentile). | Negligible. Use 1.97 for Android vertical accuracy and 1.96 for σ inputs. |
| C16 | **EPSG:8908 string.** Standards: no towgs84. The current draft `crs.js` uses `+towgs84=0,0,0,0,0,0,0`. | Both are null shifts with under 1 mm difference. Either is acceptable. |
| C17 | **INTERNET permission and `largeHeap`.** The draft manifest declares both. | Keep INTERNET pending a device test. Remove `largeHeap` [76]. |

---

## 8. Open items and unverified points (resolve during implementation)

1. **SDK license.** `sdkmanager --licenses` and the SDK downloads accept the Android SDK License. The user's request ("you have all permission") may cover this, but it is a terms acceptance and should be confirmed by the user.
2. **WebView 206 responses** from `shouldInterceptRequest` for `fetch` Range requests (Capacitor precedent [94]): device test, with the blob fallback ready.
3. `aapt2 compile --dir … -o x.zip` output, and sdkmanager, d8 and apksigner running on JDK 25: not yet run, because the SDK is absent.
4. Whether INTERNET is needed when every request is intercepted.
5. geotiff.js decoder workers inside the esbuild IIFE bundle under the CSP. Whether `'wasm-unsafe-eval'` is needed for LERC or ZSTD.
6. The OL 10.11 GeoTIFF `projection` option for a user-chosen CRS. Patching `GeoTIFFImage.prototype.getOrigin`. WebGL tile reprojection of a second raster in another CRS.
7. COG JPEG internal mask handling in OL (transparency at the edges of orthomosaics).
8. GeomagneticField's WMM-2020 accuracy beyond 2025 [65].
9. Evidence gaps:
   - Pielot et al.'s ×10 glance reduction [40] is unconfirmed, and the Dash & Hu figures come from a press summary [47].
   - Kelley et al. [45] volume and pages were not retrieved.
   - Burigat & Chittaro [41] DOI was not retrieved.
   - Goodchild & Proctor [49] volume and issue were not checked.
10. The draft `crs.js` also defines CRTM98 and Ocotepeque/Lambert Norte/Sur with Clarke 1866 and `towgs84=213.11,9.37,-74.95`. **These were not covered by this research.** Verify them against EPSG before release, or hide them.
11. `POST_NOTIFICATIONS` behaviour for the foreground-service notification on API 33+ is not covered by the findings.

---

## 9. References

1. OGC (2019). *OGC GeoTIFF Standard 1.1*, OGC 19-008r4 (eds. Devys, Habermann, Heazel, Lott, Rouault). https://docs.ogc.org/is/19-008r4/19-008r4.html
2. Masó, J. (ed.) (2023). *OGC Cloud Optimized GeoTIFF Standard 1.0*, OGC 21-026. https://docs.ogc.org/is/21-026/21-026.html
3. Butler, H., Daly, M., Doyle, A., Gillies, S., Hagen, S., Schaub, T. (2016). *The GeoJSON Format*, RFC 7946, IETF. https://www.rfc-editor.org/rfc/rfc7946
4. Wilson, T. (ed.) (2008). *OGC KML 2.2.0*, OGC 07-147r2. https://docs.ogc.org/is/07-147r2/07-147r2.pdf
5. TopoGrafix. *GPX 1.1 Schema*. https://www.topografix.com/GPX/1/1/gpx.xsd
6. IOGP. EPSG Geodetic Parameter Registry: records 5365, 5367, 8907, 8908, 8909, 8910, 8912, 5376, 8913, 8914, 8969, 9751, 9752, 11041–11044, datum 1428, change 2025.079. https://apps.epsg.org/api/v1/Transformation/9752/ (and equivalents); https://epsg.io/5367, https://epsg.io/8908, https://epsg.io/32617
7. IOGP. *Publication 373-7-2, Geomatics Guidance Note 7 part 2: Coordinate conversions and transformations including formulas*. https://www.iogp.org/bookstore/product/coordinate-conversions-and-transformation-including-formulas/
8. PROJ. Helmert transform (sign conventions) https://proj.org/en/stable/operations/transformations/helmert.html ; Transverse Mercator https://proj.org/en/stable/operations/projections/tmerc.html
9. GDAL. COG driver https://gdal.org/en/stable/drivers/raster/cog.html ; RFC 33 PixelIsPoint https://gdal.org/en/stable/development/rfc/rfc33_gtiff_pixelispoint.html
10. OpenLayers v10.11.0. GeoTIFF source API https://openlayers.org/en/latest/apidoc/module-ol_source_GeoTIFF-GeoTIFFSource.html ; source https://github.com/openlayers/openlayers/blob/v10.11.0/src/ol/source/GeoTIFF.js and `src/ol/proj/proj4.js` ; COG projection example https://openlayers.org/en/latest/examples/cog-projection.html ; COG blob example https://openlayers.org/en/latest/examples/cog-blob.html ; `ol/sphere` https://openlayers.org/en/latest/apidoc/module-ol_sphere.html
11. geotiff.js v3.0.5 / v3.1.0. https://github.com/geotiffjs/geotiff.js (`src/geotiffimage.js`, `src/compression/index.js`, `src/source/filereader.js`)
12. proj4js v2.22.0. https://github.com/proj4js/proj4js (`lib/datumUtils.js`, `lib/datum_transform.js`, `lib/projections/tmerc.js`, `lib/global.js`)
13. ISO 6709:2022. *Standard representation of geographic point location by coordinates* (3rd ed.). https://www.iso.org/standard/75147.html
14. Moya Zamora, J., Bastos Gutiérrez, S., Álvarez Calderón, A. (2021). Parámetros de transformación entre los marcos geodésicos CR05 y CR-SIRGAS contemplando diferentes soluciones ITRF. *Ingeniería* 31(1), 21–50. https://doi.org/10.15517/ri.v31i1.43854
15. Moya-Zamora, J., Bastos Gutiérrez, S., Ovares Sánchez, K., Murillo Arroyo, P., Menjívar Pérez, E., Céspedes Argüello, Y., Ovares Sánchez, E. (2025). Consideraciones técnicas en los procesos de georreferenciación dentro del Marco Geodésico Nacional CR-SIRGAS. *Revista Geográfica de América Central* 74(1). https://doi.org/10.15359/rgac.74-1.2
16. Battersby, S.E., Finn, M.P., Usery, E.L., Yamamoto, K.H. (2014). Implications of Web Mercator and its use in online mapping. *Cartographica* 49(2), 85–101. https://doi.org/10.3138/carto.49.2.2313
17. Snyder, J.P. (1987). *Map Projections: A Working Manual*. USGS Professional Paper 1395. https://doi.org/10.3133/pp1395
18. Karney, C.F.F. (2013). Algorithms for geodesics. *Journal of Geodesy* 87(1), 43–55. https://doi.org/10.1007/s00190-012-0578-z
19. Veness, C. Movable Type Scripts: Calculate distance, bearing and more between latitude/longitude points. https://www.movable-type.co.uk/scripts/latlong.html
20. van Diggelen, F. (2007). Update: GNSS accuracy: lies, damn lies, and statistics. *GPS World*, January 2007. https://www.gpsworld.com/?p=8708
21. Quddus, M.A., Ochieng, W.Y., Noland, R.B. (2007). Current map-matching algorithms for transport applications: State-of-the art and future research directions. *Transportation Research Part C* 15(5), 312–328. https://doi.org/10.1016/j.trc.2007.05.002
22. Newson, P., Krumm, J. (2009). Hidden Markov map matching through noise and sparseness. *ACM SIGSPATIAL GIS 2009*, 336–343. https://doi.org/10.1145/1653771.1653818
23. GPS.gov. GPS Accuracy. https://archive.gps.gov/systems/gps/performance/accuracy/
24. Zandbergen, P.A., Barbeau, S.J. (2011). Positional accuracy of assisted GPS data from high-sensitivity GPS-enabled mobile phones. *Journal of Navigation* 64(3), 381–399. https://doi.org/10.1017/S0373463311000051
25. Merry, K., Bettinger, P. (2019). Smartphone GPS accuracy study in an urban environment. *PLOS ONE* 14(7), e0219890. https://doi.org/10.1371/journal.pone.0219890
26. Tomaštík, J. Jr., Tomaštík, J. Sr., Saloň, Š., Piroh, R. (2017). Horizontal accuracy and applicability of smartphone GNSS positioning in forests. *Forestry* 90(2), 187–198. https://doi.org/10.1093/forestry/cpw031
27. Tomaštík, J., Chudá, J., Tunák, D., Chudý, F., Kardoš, M. (2021). Advances in smartphone positioning in forests: dual-frequency receivers and raw GNSS data. *Forestry* 94(2), 292–310. https://doi.org/10.1093/forestry/cpaa032
28. Zangenehnejad, F., Gao, Y. (2021). GNSS smartphones positioning: advances, challenges, opportunities, and future perspectives. *Satellite Navigation* 2, 24. https://doi.org/10.1186/s43020-021-00054-y
29. Robustelli, U., Baiocchi, V., Pugliano, G. (2019). Assessment of dual frequency GNSS observations from a Xiaomi Mi 8 Android smartphone and positioning performance analysis. *Electronics* 8(1), 91. https://doi.org/10.3390/electronics8010091
30. Paziewski, J. (2020). Recent advances and perspectives for positioning and applications with smartphone GNSS observations. *Measurement Science and Technology* 31, 091001. https://doi.org/10.1088/1361-6501/ab8a7d
31. Purfürst, T. (2022). Evaluation of static autonomous GNSS positioning accuracy using single-, dual-, and tri-frequency smartphones in forest canopy environments. *Sensors* 22(3), 1289. https://doi.org/10.3390/s22031289
32. Dabove, P., Di Pietra, V. (2019). Single-baseline RTK positioning using dual-frequency GNSS receivers inside smartphones. *Sensors* 19(19), 4302. https://doi.org/10.3390/s19194302
33. McKenzie, G., Hegarty, M., Barrett, T., Goodchild, M. (2016). Assessing the effectiveness of different visualizations for judgments of positional uncertainty. *IJGIS* 30(2), 221–239. https://doi.org/10.1080/13658816.2015.1082566
34. Kinkeldey, C., MacEachren, A.M., Schiewe, J. (2014). How to assess visual communication of uncertainty? A systematic review of geospatial uncertainty visualisation user studies. *The Cartographic Journal* 51(4), 372–386. https://doi.org/10.1179/1743277414Y.0000000099
35. Aretz, A.J. (1991). The design of electronic map displays. *Human Factors* 33(1), 85–101. https://doi.org/10.1177/001872089103300107
36. Aretz, A.J., Wickens, C.D. (1992). The mental rotation of map displays. *Human Performance* 5(4), 303–328. https://doi.org/10.1207/s15327043hup0504_3
37. Ishikawa, T., Fujiwara, H., Imai, O., Okabe, A. (2008). Wayfinding with a GPS-based mobile navigation system: A comparison with maps and direct experience. *Journal of Environmental Psychology* 28(1), 74–82. https://doi.org/10.1016/j.jenvp.2007.09.002
38. Münzer, S., Zimmer, H.D., Schwalm, M., Baus, J., Aslan, I. (2006). Computer-assisted navigation and the acquisition of route and survey knowledge. *Journal of Environmental Psychology* 26(4), 300–308. https://doi.org/10.1016/j.jenvp.2006.08.001
39. Rehrl, K., Häusler, E., Leitinger, S., Bell, D. (2014). Pedestrian navigation with augmented reality, voice and digital map: final results from an in situ field study assessing performance and user experience. *Journal of Location Based Services* 8(2), 75–96. https://doi.org/10.1080/17489725.2014.946975
40. Pielot, M., Poppinga, B., Heuten, W., Boll, S. (2012). PocketNavigator: studying tactile navigation systems in-situ. *Proc. CHI 2012*, 3131–3140. https://doi.org/10.1145/2207676.2208728
41. Burigat, S., Chittaro, L. (2011). Visualizing references to off-screen content on mobile devices: A comparison of Arrows, Wedge, and Overview+Detail. *Interacting with Computers* 23(2), 156–167. https://air.uniud.it/handle/11390/723841
42. Parhi, P., Karlson, A.K., Bederson, B.B. (2006). Target size study for one-handed thumb use on small touchscreen devices. *Proc. MobileHCI '06*, 203–210. https://doi.org/10.1145/1152215.1152260
43. W3C (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (SC 1.4.6, 1.4.11, 2.5.8). https://www.w3.org/TR/WCAG22/
44. Piepenbrock, C., Mayr, S., Mund, I., Buchner, A. (2013). Positive display polarity is advantageous for both younger and older adults. *Ergonomics* 56(7), 1116–1124. https://doi.org/10.1080/00140139.2013.790485
45. Kelley, E.F., Lindfors, M., Penczek, J. (2005). Display daylight ambient contrast measurement methods and daylight readability. *Journal of the Society for Information Display*. https://www.nist.gov/node/756926
46. Carroll, A., Heiser, G. (2010). An analysis of power consumption in a smartphone. *USENIX ATC '10*, 271–284. https://www.usenix.org/legacy/event/usenix10/tech/full_papers/Carroll.pdf
47. Dash, P., Hu, Y.C. (2021). How much battery does dark mode save? An accurate OLED display power profiler for modern smartphones. *MobiSys '21*. Summary: https://www.purdue.edu/newsroom/releases/2021/Q3/dark-mode-may-not-save-your-phones-battery-life-as-much-as-you-think,-but-there-are-a-few-silver-linings.html
48. DiBiase, D. et al. *The Nature of Geographic Information*, ch. 2.5 "Graphic Map Scales", Penn State. https://courses.ems.psu.edu/natureofgeoinfo/web/node/1676
49. Goodchild, M.F., Proctor, J. (1997). Scale in a digital geographic world. *Geographical and Environmental Modelling* 1(1). (Volume and issue unverified.)
50. Brown, M., Sharples, S., Harding, J., et al. (2013). Usability of geographic information: current challenges and future directions. *Applied Ergonomics* 44(6), 855–865. https://doi.org/10.1016/j.apergo.2012.10.013
51. Roth, R.E. (2013). Interactive maps: What we know and what we need to know. *Journal of Spatial Information Science* 6, 59–115. https://doi.org/10.5311/JOSIS.2013.6.105
52. Ricker, B., Roth, R.E. (2018). Mobile maps and responsive design. *GIS&T Body of Knowledge* (2018 Q2). https://doi.org/10.22224/gistbok/2018.2.5
53. QField Documentation. GNSS positioning. https://docs.qfield.org/how-to/navigation-and-positioning/gnss/
54. QField Documentation. Navigation. https://docs.qfield.org/how-to/navigation-and-positioning/navigation/
55. Esri. Prepare for high-accuracy data collection, ArcGIS Field Maps. https://doc.arcgis.com/en/field-maps/latest/prepare-maps/high-accuracy-data-collection.htm
56. Esri. Geopoints, ArcGIS Survey123. https://doc.arcgis.com/en/survey123/desktop/create-surveys/geopoints.htm
57. Esri Support. Problem: apply datum transformations when collecting data. https://support.esri.com/en-us/knowledge-base/problem-apply-datum-transformations-when-collecting-dat-000031087
58. SW Maps, App Store listing. https://apps.apple.com/us/app/sw-maps/id6444248083
59. Avenza (2023-07-21). Avenza Maps 5.0 release notes. https://store.avenza.com/blogs/avenza-maps/avenza-maps-new-release-of-new-improved-features
60. W3C. *Geolocation API* (Candidate Recommendation Draft, 30 October 2026). https://www.w3.org/TR/geolocation/
61. Chromium source, Android geolocation: `LocationProviderAndroid.java`, `LocationProviderAdapter.java`, `LocationProviderFactory.java`, `location_api_adapter_android.cc`. https://chromium.googlesource.com/chromium/src/+/HEAD/services/device/geolocation/
62. Android Developers. `android.location.Location`. https://developer.android.com/reference/android/location/Location
63. Android Developers. `LocationManager`. https://developer.android.com/reference/android/location/LocationManager
64. Android Developers. `GnssStatus`. https://developer.android.com/reference/android/location/GnssStatus
65. Android Developers. `GeomagneticField`. https://developer.android.com/reference/android/hardware/GeomagneticField
66. Android Developers. Location permissions https://developer.android.com/develop/sensors-and-location/location/permissions ; Request location permissions at runtime https://developer.android.com/develop/sensors-and-location/location/permissions/runtime
67. Android Developers. Request location updates. https://developer.android.com/develop/sensors-and-location/location/request-updates
68. Android Developers. Optimize location for battery. https://developer.android.com/develop/sensors-and-location/location/battery
69. Google. Fused Location Provider https://developers.google.com/location-context/fused-location-provider ; `Priority` https://developers.google.com/android/reference/com/google/android/gms/location/Priority
70. Android Developers. Foreground service types. https://developer.android.com/develop/background-work/services/fgs/service-types
71. Android Developers. Keep the screen on. https://developer.android.com/develop/background-work/background-tasks/awake/screen-on
72. Android Developers. Raw GNSS measurements. https://developer.android.com/develop/sensors-and-location/sensors/gnss
73. Android Developers. `WebSettings` https://developer.android.com/reference/android/webkit/WebSettings ; `WebChromeClient` https://developer.android.com/reference/android/webkit/WebChromeClient ; `WebViewClient` https://developer.android.com/reference/android/webkit/WebViewClient ; `WebResourceResponse` https://developer.android.com/reference/android/webkit/WebResourceResponse ; `GeolocationPermissions.Callback` https://developer.android.com/reference/android/webkit/GeolocationPermissions.Callback
74. Android Developers. Load in-app content https://developer.android.com/develop/ui/views/layout/webapps/load-local-content ; `WebViewAssetLoader` https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader ; `InternalStoragePathHandler` https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader.InternalStoragePathHandler
75. Android Developers. Native API access (JavaScript bridge) https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge ; Insecure WebView native bridges https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
76. Android Developers. Managing WebView https://developer.android.com/develop/ui/views/layout/webapps/managing-webview ; Manage WebView memory https://developer.android.com/develop/ui/views/layout/webapps/manage-webview-memory
77. Chromium. Software draw deprecated https://chromium.googlesource.com/chromium/src/+/refs/tags/92.0.4515.74/android_webview/docs/software_draw_deprecated.md ; Android Developers, Hardware acceleration https://developer.android.com/topic/performance/hardware-accel
78. Android Developers. `<application>` element. https://developer.android.com/guide/topics/manifest/application-element
79. Android Developers. Access documents and other files from shared storage (SAF). https://developer.android.com/training/data-storage/shared/documents-files
80. Android Developers. Build an offline-first app. https://developer.android.com/topic/architecture/data-layer/offline-first
81. Android Developers. Make apps more accessible. https://developer.android.com/guide/topics/ui/accessibility/apps
82. Android Developers. Target API level requirements for Google Play. https://developer.android.com/google/play/requirements/target-sdk
83. Android Developers. Behavior changes: Android 11 https://developer.android.com/about/versions/11/behavior-changes-11 ; Android 16 https://developer.android.com/about/versions/16/behavior-changes-16
84. Android Developers. Edge-to-edge https://developer.android.com/develop/ui/views/layout/edge-to-edge ; Predictive back https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture
85. Android Developers. Adaptive icons https://developer.android.com/develop/ui/views/launch/icon_design_adaptive ; Version your app https://developer.android.com/studio/publish/versioning
86. Android Developers. Build tools: sdkmanager https://developer.android.com/tools/sdkmanager ; Android CLI https://developer.android.com/tools/agents/android-cli/commands/sdk ; aapt2 https://developer.android.com/tools/aapt2 ; d8 https://developer.android.com/tools/d8 ; zipalign https://developer.android.com/tools/zipalign ; apksigner https://developer.android.com/tools/apksigner
87. Android Developers. Build your app from the command line https://developer.android.com/build/building-cmdline ; Sign your app https://developer.android.com/studio/publish/app-signing
88. Android Open Source Project. APK signature schemes https://source.android.com/docs/security/features/apksigning ; apksig source https://android.googlesource.com/platform/tools/apksig/
89. Google. Android SDK repository manifest. https://dl.google.com/android/repository/repository2-3.xml
90. Android Developers. AGP release notes https://developer.android.com/build/releases/gradle-plugin ; AGP 9.0 https://developer.android.com/build/releases/agp-9-0-0-release-notes ; AGP versions https://dl.google.com/android/maven2/com/android/tools/build/gradle/maven-metadata.xml ; JDKs in Android builds https://developer.android.com/build/jdks
91. Gradle. Compatibility matrix https://docs.gradle.org/current/userguide/compatibility.html ; current version https://services.gradle.org/versions/current
92. Android Developers. androidx.webkit releases https://developer.android.com/jetpack/androidx/releases/webkit ; webkit 1.18.0 POM https://dl.google.com/android/maven2/androidx/webkit/webkit/1.18.0/webkit-1.18.0.pom
93. Android Developers. Android developer verification. https://developer.android.com/developer-verification
94. Ionic. Capacitor `WebViewLocalServer.java` (Range handling precedent; not official documentation). https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java

---

**Files consulted, read-only:**
- `C:\McGill_Final\GIS_cancha_EARTH\salidas\ruta_5m\resumen.json`
- `C:\McGill_Final\GIS_cancha_EARTH\salidas\ruta_5m\puntos_levantamiento.csv`
- `C:\McGill_Final\GIS_cancha_EARTH\salidas\ruta_5m\singularxyz\puntos_CRTM05.csv`
- `C:\McGill_Final\GIS_cancha_EARTH\ruta_serpentina.py`
- `C:\McGill_Final\GIS_cancha_EARTH\app_mapa_campo\android\AndroidManifest.xml`
- `C:\McGill_Final\GIS_cancha_EARTH\app_mapa_campo\web\package.json`, `build.mjs`, `src\crs.js`
- `C:\Users\carly\AppData\Local\Temp\claude\f774909b305776c5\c3c8da66-cded-4e28-b37f-478e0532db03\scratchpad\epsg\t8914.json`, `t8969.json`, `t9751.json`, `t9752.json`, `c5367.json`, `c8908.json`, `t11044.json`

**Check script:** `C:\Users\carly\AppData\Local\Temp\claude\f774909b305776c5\c3c8da66-cded-4e28-b37f-478e0532db03\scratchpad\specchk\chk.cjs` (P001 projections with proj4js 2.22.0).