# Mapa de Campo · app Android para seguir rutas sobre su propio GeoTIFF

Creado por **Carly Chery** · Universidad EARTH, Costa Rica.

Visor GIS de campo **sin conexión**, al estilo de Avenza Maps. Sirve para cargar en el teléfono
un **GeoTIFF propio** (ortofoto de dron, mapa escaneado y georreferenciado, MDE), superponer las
líneas y puntos del levantamiento (GeoJSON, KML/KMZ, GPX, CSV) y **seguirlos con el GPS** en el terreno.

- APK instalable: `dist/MapaDeCampo-1.5.0.apk` (Android 7.0 o superior, 66 MB por las dos ortofotos de EARTH incluidas). Se instala encima de las versiones anteriores (1.0 a 1.4) sin perder datos.
- Idiomas: **español, English, français y português (Brasil)**. Toma el idioma del teléfono (si no es uno de esos, inglés) y se cambia en Ajustes → Idioma.
- Funciona en **cualquier lugar del mundo**: sistemas de coordenadas de todos los continentes, mapa base de OpenStreetMap (con internet) y sus propios mapas sin conexión. El paquete de EARTH (ortofotos y datos de ejemplo) es opcional.

## Novedades de la versión 1.5

- **Diseño nuevo**: barra inferior con nombres (Capas · Marcar · Grabar · Medir · Editar), un solo botón flotante (Mi ubicación) y coordenadas que nunca se cortan. Temas **Automático, Claro, Oscuro y Sol** (alto contraste para pleno sol), texto que sigue el tamaño de letra del teléfono y **botones grandes para usar con guantes**.
- **Para cualquier persona y lugar**: una sola pantalla de bienvenida (idioma y «¿Dónde va a trabajar?»); quien no trabaja en EARTH empieza con el mapa del mundo y no descarga las ortofotos de EARTH. El permiso de ubicación se pide al usarlo, explicando antes para qué. Unidades métricas o imperiales. Números y fechas en el formato de cada idioma.
- **Sistemas de coordenadas del mundo** (ETRS89, NAD83, GDA2020, Lambert-93, British National Grid, RD, LV95, NZTM, SIRGAS, MAGNA-SIRGAS…), con buscador, sugerencias según dónde está y la opción de pegar una definición PROJ propia. Los de Costa Rica solo se proponen en Costa Rica.
- **CSV de Excel** en español, francés o portugués (punto y coma, coma decimal, encabezados en los cuatro idiomas).
- **Más seguro en el campo**: Marcar avisa si la posición GPS es vieja o imprecisa; la navegación se pausa y explica por qué cuando la señal es mala; el promedio GPS se puede cancelar.
- **Editor** con Deshacer, Más y Listo siempre visibles y herramientas con nombres claros (Seleccionar, Punto, Línea, Área, Editar forma, Imán…). **Planificador** por pasos. **Medir** termina con «Listo».
- Notificación de grabación y avisos de Android en el idioma de la app. Aviso de privacidad en «Acerca de» y política para Google Play en `docs/PRIVACIDAD_PRIVACY.md`.

## Instalación en el teléfono

1. Copie `MapaDeCampo-1.5.0.apk` al teléfono (cable USB, Google Drive o WhatsApp como documento; por correo no suele pasar, pesa 66 MB).
2. Ábralo desde *Archivos*. Android pedirá permitir **«Instalar apps desconocidas»** para esa app
   (Archivos, Chrome, etc.). Es normal en apps que no vienen de Google Play.
3. La primera vez elija el idioma y dónde va a trabajar. Cuando la app lo pida, conceda **Ubicación → Precisa / Mientras se usa la app**.
4. Si va a grabar recorridos con la pantalla apagada, permita también las notificaciones.

## Uso rápido

| Quiero… | Cómo |
|---|---|
| Cargar mi mapa (GeoTIFF) o mis datos | Menú → **Abrir un mapa o datos**, o Capas → **Abrir archivo**. La app copia el archivo y lo recuerda sin internet. Si el archivo no dice su sistema de coordenadas, la app sugiere el correcto según dónde está. |
| Ver dónde estoy | **Mi ubicación** (botón redondo): un toque sigue su posición, otro gira el mapa con la brújula. |
| Marcar un punto | **Marcar** (avisa si la precisión es baja y ofrece promediar 60 s). |
| Grabar el recorrido | **Grabar** → Empezar a grabar. El botón se pone rojo y muestra la distancia. Exportar a GPX o guardar como capa. |
| Medir | **Medir** → distancia o área; toque los puntos y **Listo**. |
| Seguir una línea | Tocar la línea → **Seguir esta línea**. La tarjeta dice cuánto y hacia dónde corregir. |
| Recorrer puntos | Tocar un punto → **Recorrer los puntos desde aquí**. Al llegar vibra y pasa al siguiente. |
| Ir a un lugar | Mantener pulsado el mapa → **Navegar hasta aquí**. |
| Editar capas | **Editar** → elija una capa o cree una nueva. Deshacer, Más y Listo siempre visibles. |
| Planificar líneas o cuadrícula | Menú → **Planificar**: dibuje el área (toque cada esquina y **Terminar área**), elija líneas en serpentina, cuadrícula de puntos o líneas cruzadas, y la separación. |
| Cambiar idioma, tema, texto o unidades | Menú → **Ajustes**. |
| Cambiar el formato de coordenadas | Tocar la barra de coordenadas (WGS 84 decimal, GMS, UTM; CRTM05 solo en Costa Rica). |
| Practicar sin salir | Ajustes → **Simular un recorrido por la línea activa**. |
| Plan para el RTK (Costa Rica) | Exportar → **CSV SingularPad** (Nombre,N,E,Z,Código) en CRTM05 CR-SIRGAS, CR05 o UTM. |
| Ortofotos de EARTH | Opcionales: se instalan al elegir «En la Universidad EARTH» o desde Ajustes. IGN 1:5000 (0,5 m) de toda la universidad y 1:1000 (~0,12 m) del núcleo del campus. © Registro Nacional – IGN Costa Rica, vía SNIT. |
| Mapas base en línea | Capas → Mapa base: OpenStreetMap, Google (con su propia clave de la Map Tiles API) o mapas XYZ como en QGIS. Necesitan internet. |

## Preparar el GeoTIFF (recomendado)

El teléfono funciona mejor con un **COG** (Cloud Optimized GeoTIFF: teselas internas + pirámides).
Con el entorno del proyecto:

```
..\.venv\Scripts\python.exe tools\preparar_cog.py ortofoto.tif
..\.venv\Scripts\python.exe tools\preparar_cog.py mde.tif --mde
..\.venv\Scripts\python.exe tools\preparar_cog.py mapa.tif --epsg 8908     (si el archivo no trae SRC)
```

o con GDAL: `gdal_translate entrada.tif salida_cog.tif -of COG -co COMPRESS=JPEG -co QUALITY=85`.

### Sistemas de referencia reconocidos

WGS 84 (EPSG:4326) · WGS 84 / UTM, todas las zonas (326xx/327xx) · SIRGAS 2000 / UTM (31965–31985) ·
**CR-SIRGAS / CRTM05 (EPSG:8908)**, oficial desde 2018 · CR05 / CRTM05 (EPSG:5367) ·
Ocotepeque 1935 / Costa Rica Norte y Sur (EPSG:5456/5457, mapas antiguos del IGN) · Web Mercator (EPSG:3857).
Las definiciones y los parámetros de cambio de datum salen de la base EPSG de PROJ/GDAL
(CR05 → WGS 84: EPSG:9752; Ocotepeque → WGS 84: EPSG:5470, exactitud ~8 m).

## Planificador (novedad de la versión 1.1.0)

- **Mismo criterio que `ruta_serpentina.py`**: líneas paralelas al lado largo (o en la dirección que indique), centradas
  en el ancho disponible, con margen interior, y puntos repartidos parejo con uno en cada extremo. Con los mismos datos
  (cancha, 5 m, 5 m, margen 1 m, inicio SO) la app genera las mismas 15 líneas y 420 puntos que el script, a ≤ 2.1 cm.
- **Metros reales**: el script medía en la cuadrícula UTM (escala 1.0006 en EARTH); la app mide sobre el terreno. Por eso
  la dirección sale 2.1° respecto al norte verdadero frente a 2.6° respecto al norte de la cuadrícula UTM.
- **Áreas cóncavas** (en L, con entrantes): se respetan el borde y el margen; una línea puede quedar partida en tramos.
- **Calculadora fotogramétrica**: GSD = ancho del sensor × altura / (focal × ancho de imagen) (fórmula de Pix4D).
  La app **no controla el dron**: sirve para decidir altura, traslapes y separación, y para exportar el área.

## Mapa base de Google

Google solo permite sus mapas a través de la **Map Tiles API** oficial, con una **clave propia**:
1. Entre a console.cloud.google.com, cree un proyecto y active la facturación (hay un cupo mensual gratuito).
2. APIs y servicios → Biblioteca → habilite **Map Tiles API**.
3. Credenciales → Crear credenciales → Clave de API. Restrínjala a la Map Tiles API.
4. En la app: Capas → Mapa base en línea → Google… y pegue la clave.

Condiciones de Google: se muestran su logotipo y la atribución (la app lo hace) y **no se pueden guardar sus imágenes para
usarlas sin conexión**. En el campo sin señal use su propio GeoTIFF (por ejemplo una ortofoto de dron).

## Lo que la app hace bien y lo que no

- **Precisión del GPS del teléfono:** la app muestra el radio al 68 % que informa Android. A cielo abierto suele
  ser de 3–5 m. **No es RTK.** Para centímetros use el receptor RTK (SingularPad) y esta app para orientarse.
- **Receptor RTK externo:** si una app de NTRIP/Bluetooth publica la posición del receptor como *ubicación simulada*
  de Android, Mapa de Campo la usa y la marca como «receptor externo».
- **Seguimiento de líneas paralelas:** la app compara la posición solo con el tramo actual y sus vecinos, para que
  un error de 5 m no la haga saltar a la línea de al lado en una serpentina. Si cambia de línea a propósito: **Re-sinc.**
- **Alturas:** las del GPS son elipsoidales (h). En EARTH, H ≈ h − 11,5 m (EGM2008).
- **Mapas en línea** (opcionales, con internet): OpenStreetMap, Google con su propia clave de la Map Tiles API y los
  XYZ que agregue el usuario; la app no incluye ningún servidor XYZ de terceros ni guarda sus imágenes.

## Cómo se comprobó

- **Pruebas numéricas** (`node web/test/test_math.mjs`, `test_geotiff.mjs`, `test_formats.mjs`):
  - Vincenty: 54 972.271 m en el ejemplo oficial de Geoscience Australia.
  - UTM 17N y CRTM05 reproducen el CSV de la ruta (GDAL/PROJ) con error máximo de 1.1 mm.
  - Seguimiento de la serpentina real con ruido de ±2.4 m y con un sesgo de 3 m hacia la pasada vecina:
    0 de 2 119 lecturas quedan a más de 10 m del avance real.
  - Esquina de GeoTIFF *PixelIsPoint*: coincide con GDAL; sin la corrección, geotiff.js se desplaza medio píxel.
  - CSV SingularPad (Nombre,N,E,Z,Código, sin encabezado): 420 puntos a ≤ 1.3 mm de las coordenadas de referencia.
- **Alineación ráster–vector:** la cuadrícula de 50 m de un GeoTIFF de prueba en CRTM05 cae exactamente sobre un
  punto calculado aparte con proj4, tanto en el navegador (WebGL) como en el teléfono (modo compatible).
- **Android 16 (emulador, WebView 133):** instalación, permisos, GPS, importación con el selector del sistema,
  lectura por rangos de bytes y dibujo del GeoTIFF.

## Detalles técnicos que conviene saber

- **Lectura por rangos.** El GeoTIFF se lee por trozos con `?start=&end=` en la URL local. No se usa la cabecera HTTP
  `Range` porque el WebView de Android la aplica por su cuenta a las respuestas interceptadas y corrompe los
  trozos que no empiezan en el byte 0 (comprobado en el dispositivo).
- **Sin WebGL.** Si el WebView no ofrece WebGL 1 (algunas GPU en lista negra, emuladores), los GeoTIFF se dibujan en
  *modo compatible* (canvas 2D): más lento, misma georreferencia. La app lo avisa.
- **Especificación de diseño:** `docs/ESPECIFICACION_DISENO_investigacion.md` (requisitos, fórmulas y 90+ referencias).

## Estructura del proyecto

```
app_mapa_campo/
├── dist/MapaDeCampo-1.5.0.apk     APK firmado (v2 + v3)
├── web/                           motor de mapas (OpenLayers 10.11 + geotiff.js + proj4js)
│   ├── src/crs.js                 SRC y plano local Transverso de Mercator
│   ├── src/geodesy.js             inverso de Vincenty, formatos de coordenadas
│   ├── src/nav.js                 seguimiento de líneas y puntos (desvío, avance, vértices)
│   ├── src/formats.js             lectura GeoJSON/KML/KMZ/GPX/CSV, escritura GPX/GeoJSON/CSV
│   ├── src/geotiff_patch.js       corrección de esquina (PixelIsPoint, punto de enlace I,J)
│   ├── src/raster_canvas.js       dibujo de GeoTIFF sin WebGL (modo compatible)
│   └── test/                      pruebas: test_math.mjs, test_geotiff.mjs, test_formats.mjs
├── android/                       app nativa (Java, sin Gradle): WebView + GPS + archivos + servicio de track
│   └── keystore/                  CLAVE DE FIRMA: guárdela en un lugar seguro
├── tools/build_apk.py             compila y firma el APK (aapt2, javac, d8, zipalign, apksigner)
├── tools/preparar_cog.py          convierte GeoTIFF a COG
├── docs/                          especificación de diseño con referencias
├── test_data/                     rásteres SINTÉTICOS de prueba (damero), no son mapas reales
└── licencias/                     licencias de las bibliotecas incluidas
```

## Volver a compilar

Requisitos: JDK 17+ (probado con 25), Node 18+, Android SDK con `build-tools;36.1.0` y `platforms;android-36`.

```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot
..\.venv\Scripts\python.exe tools\build_apk.py
```

`python tools/build_apk.py --debug` genera además un APK depurable (`-depuracion.apk`) para inspeccionar el WebView
desde Chrome; ese no se reparte.

Para publicar una versión nueva que se instale encima, suba `VERSION_CODE` en `tools/build_apk.py` y firme
**con la misma clave** (`android/keystore/`). Si la clave se pierde, habrá que desinstalar la app antes de instalar
una versión firmada con otra clave.
