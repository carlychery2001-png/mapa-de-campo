// Ayuda, créditos, biografía y datos de «Acerca de» en español (texto fuente).
// en.js, fr.js y pt.js tienen exactamente la misma estructura: mismas claves, mismos <h4> y enlaces.
// Los nombres de botones van en <b> y deben coincidir con los de la interfaz (tablas de src/i18n).
// Los id de los <h4> de la ayuda (help-…) son iguales en todos los idiomas: sirven para enlazar
// una sección desde otra pantalla.
import {AUTHOR} from '../author.js';
import {GOOGLE_TERMS, GOOGLE_PRIVACY} from '../basemap.js';

export default {
  credit: `<p class="credit">Creado por <b>${AUTHOR}</b> · Universidad EARTH, Costa Rica</p>`,

  bio: `
<h4>Sobre la autoría</h4>
<p><b>${AUTHOR}</b> es estudiante de la Universidad EARTH (Costa Rica, promoción 2023–2026) y trabaja con
Sistemas de Información Geográfica (SIG) y posicionamiento GNSS RTK aplicados al trabajo de campo.
Diseñó el levantamiento topográfico RTK de la cancha de EARTH: rutas en serpentina, coordenadas en
CRTM05 / CR-SIRGAS y procesamiento con Python y GDAL. Imparte la clase introductoria de RTK en EARTH
y en 2027 comienza la Maestría en Ciencias (M.Sc.) en Ingeniería de Biorrecursos en la Universidad McGill (Canadá).</p>
<p class="muted small">Mapa de Campo nació de ese trabajo: una herramienta para que estudiantes carguen sus propios
mapas y sigan sus líneas de levantamiento en el terreno.</p>`,

  about: `<h4>Componentes de código abierto</h4>
    <ul class="small"><li>OpenLayers 10.11 (BSD 2-Clause) — openlayers.org</li><li>geotiff.js (MIT) — github.com/geotiffjs/geotiff.js</li><li>proj4js 2.22 (MIT) — github.com/proj4js/proj4js</li><li>fflate (MIT) — github.com/101arrowz/fflate</li></ul>
    <h4>Datos</h4><ul class="small"><li>Definiciones de los sistemas de coordenadas: registro EPSG (IOGP), tomadas de PROJ/GDAL y de epsg.io.</li><li>Mapa base opcional: © OpenStreetMap contributors (ODbL), solo con internet.</li><li>Mapas base XYZ agregados por el usuario: la app no incluye ninguno; cada uno se rige por las condiciones de su proveedor.</li><li>Mapa base opcional: Google Maps (Map Tiles API, con la clave del usuario y solo con internet). Se aplican las <a href="${GOOGLE_TERMS}">Condiciones adicionales de Google Maps</a> y la <a href="${GOOGLE_PRIVACY}">Política de privacidad de Google</a>.</li><li>Datos de demostración: ruta serpentina de 5 m sobre la cancha de la Universidad EARTH (polígono de OpenStreetMap, vía 1029347440).</li><li>Ortofotos de EARTH incluidas: Ortofoto 1:5000 2014-2017 (toda la universidad, fotos de 2015, 0,5 m) y Ortofoto 1:1000 2015-2018 (núcleo del campus, ~0,12 m) © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, vía SNIT. «Su uso tendrá carácter libre y gratuito, siempre que se mencione el origen y propiedad de los datos.»</li><li>Límite de la Universidad EARTH: © OpenStreetMap contributors (ODbL), vía 321376631.</li></ul>`,

  privacy: `<h4>Privacidad</h4>
<p><b>Mapa de Campo no recoge datos personales.</b> La app no tiene servidores, ni cuentas, ni publicidad, ni estadísticas de uso, ni informes de errores automáticos.</p>
<ul>
<li><b>Ubicación.</b> El GPS se usa solo dentro del teléfono: para mostrar su posición, marcar puntos, medir, grabar recorridos y guiarle. Al grabar un recorrido con la pantalla apagada, Android muestra una notificación mientras dura la grabación. La app no envía su posición a nadie.</li>
<li><b>Sus archivos.</b> Los mapas y datos que importa, los puntos, los recorridos y las capas que edita se guardan solo en la memoria interna de la app. Salen del teléfono únicamente cuando usted los exporta o comparte.</li>
<li><b>Mapas base en línea (opcionales).</b> Si activa OpenStreetMap, Google o un mapa XYZ, el teléfono pide a ese servicio las imágenes de la zona que mira; ese servicio recibe su dirección IP y las coordenadas de esas imágenes, según su propia política de privacidad. La clave de Google que escriba se guarda solo en el teléfono y se envía solo a Google. Sin mapa base en línea, la app funciona sin internet.</li>
<li><b>Permisos.</b> Ubicación (posición GPS), notificaciones (aviso de grabación), internet (solo para los mapas base en línea) y vibración (avisos de navegación).</li>
</ul>
<p>Al desinstalar la app, Android borra todos sus datos. Para consultas, use el contacto del desarrollador en la página de la app en Google Play.</p>`,

  help: `
<h4 id="help-quick">Guía rápida</h4>
<p>Mapa de Campo muestra dónde está usted sobre sus propios mapas, también sin internet.</p>
<ul>
<li><b>Capas</b>: vea, oculte y ordene sus mapas y datos, abra archivos y elija un mapa base en línea.</li>
<li><b>Marcar</b>: guarda un punto donde está usted, con la precisión del GPS. Sus puntos quedan en Menú → <b>Mis puntos</b>.</li>
<li><b>Grabar</b>: graba el camino que recorre. Mientras graba, el botón se pone rojo y muestra la distancia.</li>
<li><b>Medir</b>: mide una distancia o un área tocando el mapa.</li>
<li><b>Editar</b>: dibuje, mueva o borre puntos, líneas y áreas de una capa.</li>
<li><b>Mi ubicación</b> (el botón redondo): el primer toque centra el mapa en su posición y la sigue (<b>Seguir</b>); el segundo gira el mapa hacia donde usted mira (<b>Brújula</b>). Si mueve el mapa con el dedo, deja de seguirla. La flecha <b>N</b> vuelve el norte hacia arriba.</li>
<li><b>GPS</b> (arriba a la derecha): más barras, mejor señal. El número, por ejemplo ±4 m, dice cuánto puede errar su posición. Tóquelo para ver los detalles.</li>
<li><b>Barra de coordenadas</b> (abajo): sus coordenadas actuales. Tóquela para cambiar el formato.</li>
<li><b>Mantenga pulsado el mapa</b> para ver las coordenadas de ese lugar, navegar hasta allí, guardarlo como punto o copiar sus coordenadas.</li>
<li><b>Toque una línea o un punto</b> de una capa para ver sus datos y lo que puede hacer: seguirlo, recorrerlo o editarlo.</li>
<li><b>Menú</b> (arriba a la izquierda): abrir archivos, planificar, mis puntos, estado del GPS, ajustes y esta ayuda.</li>
</ul>
<p>Sin señal, todo funciona con sus propios mapas y datos. Solo los mapas base en línea necesitan internet.</p>

<h4 id="help-geotiff">Cargar su propio mapa (GeoTIFF)</h4>
<p>Sirve cualquier imagen georreferenciada <b>.tif/.tiff</b>: la ortofoto de un dron, un mapa escaneado y georreferenciado o un modelo de elevación.</p>
<p>Toque Menú → <b>Abrir un mapa o datos</b> (o <b>Abrir archivo</b> en el aviso de inicio) y elija el archivo. También puede abrirlo desde Archivos, Drive, el correo o una app de mensajería con «Abrir con» o «Compartir» → Mapa de Campo. La app guarda una copia en el teléfono: funciona sin internet y sigue ahí la próxima vez.</p>
<p>Si el archivo no dice en qué sistema de coordenadas está, la app le pide elegirlo (vea «Sistemas de coordenadas»). En <b>Capas</b>, toque el nombre de la capa para cambiar su transparencia o, si el mapa aparece corrido, su sistema de coordenadas. Un modelo de elevación se puede ver en gris o con colores de relieve.</p>
<p class="muted small"><b>Si un mapa grande va lento</b>, conviértalo a COG (GeoTIFF optimizado para la nube): con teselas internas y vistas reducidas, la app lee solo la parte que se ve. En QGIS: Exportar → Guardar como…, formato COG. Con GDAL:<code>gdal_translate entrada.tif salida_cog.tif -of COG -co COMPRESS=JPEG -co QUALITY=85</code>Para un modelo de elevación, cambie las opciones JPEG por <code>-co COMPRESS=DEFLATE -co PREDICTOR=2</code> En el proyecto EARTH, el script opcional <i>preparar_cog.py</i> hace lo mismo.</p>
<p class="note info">Para la Universidad EARTH (opcional): si al empezar eligió «En la Universidad EARTH», la app trae dos ortofotos oficiales del IGN que funcionan sin conexión: toda la universidad (0,5 m, fotos de 2015) y el núcleo del campus (~0,12 m). Si quita una, Ajustes la ofrece otra vez.</p>

<h4 id="help-vector">Cargar líneas y puntos (KML/KMZ, GeoJSON, GPX, CSV)</h4>
<p>Use el mismo botón: Menú → <b>Abrir un mapa o datos</b>. Sirven los archivos de Google Earth (KML/KMZ), de QGIS y otros programas de mapas (GeoJSON), de los GPS de mano (GPX) y las tablas guardadas como CSV o TXT.</p>
<p><b>Tablas CSV:</b> una fila por punto, con columnas separadas por comas o por punto y coma. El CSV de Excel con punto y coma y coma decimal también sirve. Las columnas pueden ser latitud y longitud, o este y norte en metros, con o sin encabezado; los nombres de columna se reconocen en español, inglés, francés y portugués. Con comas como separador, los decimales van con punto. Ejemplo:</p>
<code>nombre,lat,lon,nota
P1,-1.29210,36.82190,pozo
P2,-1.29245,36.82230,cerca</code>
<p>Si las coordenadas están en metros, la app le pregunta el sistema de coordenadas. Sin encabezado, también acepta el orden Nombre,N,E,Z,Código de las libretas RTK como SingularPad.</p>

<h4 id="help-mark">Marcar puntos, grabar un recorrido y medir</h4>
<ul>
<li><b>Marcar</b> guarda su posición con un nombre (Punto 1, Punto 2…). Si la última posición tiene más de 10 s o el GPS indica más de ±15 m, la app avisa y ofrece <b>Promediar</b>: junta las lecturas de 60 s para un punto más exacto.</li>
<li>Para guardar otro lugar, mantenga pulsado el mapa y elija <b>Guardar en Mis puntos</b>.</li>
<li>Menú → <b>Mis puntos</b>: vea, renombre o borre sus puntos, navegue hasta uno o expórtelos. Con 3 puntos o más, puede usarlos como esquinas de un plan.</li>
<li><b>Grabar</b> abre el panel del recorrido: toque <b>Empezar a grabar</b>. La grabación sigue con la pantalla apagada (Android muestra una notificación) hasta que toque <b>Detener</b>. Si continúa una grabación detenida, empieza un tramo nuevo, sin una línea recta sobre el hueco. Al terminar, puede exportar el recorrido como GPX o guardarlo como capa.</li>
<li><b>Medir</b>: elija <b>Distancia</b> o <b>Área</b>, toque el mapa en cada punto y luego <b>Listo</b>. <b>Deshacer</b> quita el último punto. El resultado queda en la barra (una distancia, con su rumbo); <b>Medir otra</b> empieza de nuevo y <b>Cerrar</b> sale.</li>
</ul>
<p class="muted small">Las medidas son metros reales sobre el terreno: se calculan sobre el elipsoide WGS 84 (plano transverso de Mercator local, inverso de Vincenty), no sobre la proyección del mapa.</p>

<h4 id="help-follow">Seguir una línea</h4>
<p>Toque una línea en el mapa → <b>Seguir esta línea</b> (o <b>Seguir en sentido contrario</b>). Para caminar el borde de un área, toque el área → <b>Recorrer el borde</b>. La tarjeta de abajo le guía:</p>
<ul>
<li><b>Corrija</b>: a qué distancia está de la línea y hacia qué lado moverse.</li>
<li><b>Giro en</b>: cuánto falta para el próximo giro. <b>Falta</b> (en pantallas anchas): lo que queda hasta el final.</li>
<li>Una frase dice qué hacer, por ejemplo «Muévase 2 m a la derecha».</li>
<li><b>Barra de guía</b>: el punto es usted y la raya del centro es la línea. La zona verde quiere decir que va bien; las marcas finas son su aviso de desvío y la zona rayada queda fuera de él. El punto lleva ✓, ! o ✕, así que no hace falta distinguir colores. Si se sale, la tarjeta se pone roja y el teléfono vibra.</li>
</ul>
<p>Toque el nombre de la ruta para abrir <b>Detalles</b>: avance, precisión del GPS, <b>Ubicarme en la ruta</b> e <b>Invertir sentido</b>. Con líneas paralelas cercanas (por ejemplo, cada 5 m), la app compara su posición solo con el tramo actual y los vecinos, para que el error del GPS no la haga saltar de línea. Si cambia de línea a propósito, toque <b>Ubicarme en la ruta</b>. Si camina al revés, la tarjeta lo avisa y ofrece invertir el sentido.</p>
<p>Si el GPS se pierde, es muy impreciso o solo da ubicación aproximada, la guía se pone en pausa (los números muestran «—») y la frase dice qué hacer. Si la flecha sale gris y pide calibrar la brújula, haga un 8 en el aire con el teléfono.</p>
<p><b>Detener</b> termina la navegación y pide confirmación si se perdería el avance. Si Android cierra la app, al abrirla otra vez sigue donde iba. La distancia del aviso de desvío se cambia en Ajustes → Navegación.</p>

<h4 id="help-points">Recorrer puntos (replanteo)</h4>
<p>Para ir a un solo lugar, toque un punto, o mantenga pulsado el mapa en cualquier sitio, y elija <b>Navegar hasta aquí</b>. Una flecha y la distancia le llevan hasta allí.</p>
<p>Para visitar en orden todos los puntos de una capa (muestras, estacas, una cuadrícula), toque el punto donde quiere empezar → <b>Recorrer los puntos desde aquí</b>. Los puntos se ordenan por su <i>id</i> o por su nombre.</p>
<ul>
<li>Al entrar en el <b>radio de llegada</b>, el teléfono vibra, el punto se marca en verde y la app pasa al siguiente. La llegada se marca sola solo si el GPS tiene ±8 m o mejor; si no, toque <b>Llegué</b>.</li>
<li>Las flechas ← y → pasan al punto anterior o al siguiente.</li>
<li>En el último punto, la app dice cuáles faltan. Los puntos visitados se recuerdan aunque Android cierre la app.</li>
</ul>
<p class="muted small">El radio de llegada y el paso automático al siguiente punto se cambian en Ajustes → Navegación.</p>

<h4 id="help-plan">Planificar líneas o una cuadrícula</h4>
<p>Menú → <b>Planificar</b> prepara líneas o puntos para recorrer un terreno a pie, como un plan de vuelo de dron. Siga los pasos del panel:</p>
<ol>
<li><b>Área.</b> Toque <b>Dibujar área</b>, toque cada esquina en el mapa y luego <b>Terminar área</b>; <b>Quitar esquina</b> borra la última. También puede tocar un área ya cargada (KML, KMZ o GeoJSON) → <b>Planificar líneas o cuadrícula aquí</b>, o tocar <b>Usar mis puntos</b> después de caminar las esquinas y marcarlas con <b>Marcar</b>.</li>
<li><b>Tipo de plan.</b> <b>Líneas en serpentina</b>: líneas paralelas que se recorren de ida y vuelta. <b>Cuadrícula de puntos</b>: puntos a distancias iguales, numerados P001, P002… en el orden en que se caminan. <b>Líneas cruzadas</b>: dos pasadas cruzadas a 90°.</li>
<li><b>Medidas.</b> Escriba la separación entre líneas y entre puntos, o toque una medida rápida. Con <b>Cuadrícula cuadrada</b>, los dos valores cambian juntos. El margen deja libre una franja junto al borde.</li>
<li><b>Dirección e inicio.</b> <b>Automática</b> pone las líneas paralelas al lado más largo; <b>Manual</b> usa los grados que usted escriba, desde el norte verdadero y en sentido horario. <b>Girar 90°</b> cruza las líneas. En <b>Dónde empieza el plan</b>, elija la esquina de inicio.</li>
</ol>
<p><b>Más opciones</b> guarda cómo se colocan los puntos, y la velocidad al caminar y los segundos en cada punto para calcular el tiempo. Abajo, el panel muestra el resumen (líneas, metros, puntos y tiempo a pie) y los botones <b>Guardar</b> y <b>Guardar y seguir</b>. Si el plan tiene líneas con puntos, la app pregunta si quiere seguir las líneas o ir de punto en punto.</p>
<p>Formas difíciles: los huecos (un edificio, un estanque) quedan fuera del plan. Un área en forma de L o de U se cubre por partes, para no cruzar por fuera en cada línea. Si el borde se cruza a sí mismo, la app lo avisa; si toca cuatro esquinas en desorden, las ordena sola.</p>
<p>El plan guardado queda como capas que puede seguir, recorrer y editar: por ejemplo, mueva o borre un punto que cae en un canal y luego use Editar → <b>Más</b> → <b>Renumerar puntos…</b>. <b>Exportar…</b> ofrece GeoJSON, KML, GPX, CSV de puntos y CSV para la libreta RTK SingularPad (en Costa Rica, también en CRTM05).</p>
<p class="muted small"><b>¿Qué separación usar a pie?</b> Como referencia, el Manual de riego de la FAO (Módulo 2, 2002) usa cuadrículas de 10–50 m para riego por superficie y de 25–100 m para aspersión, y considera adecuada una de 20 × 20 m para diseñar riego; más densa en pendientes o terreno irregular.</p>
<p class="muted small"><b>Para dron:</b> la <b>Calculadora para dron</b> usa la cámara, la altura y los traslapes para calcular el tamaño del píxel en el suelo (GSD), el terreno que cubre cada foto y la separación entre líneas y entre fotos (fórmula de Pix4D). La app no controla el dron: exporte <b>KML solo del área</b>, impórtelo en DJI Pilot 2 o Pix4Dcapture y use la separación calculada. Ojo: DJI GS Pro mide la dirección desde el este y en sentido antihorario.</p>

<h4 id="help-edit">Editar capas</h4>
<p>Toque <b>Editar</b> (o Menú → <b>Editar capas</b>) y elija una capa, o cree una <b>Nueva capa</b> de puntos, líneas, áreas o mixta. También puede tocar un elemento del mapa → <b>Editar este elemento</b>.</p>
<p>La barra de edición siempre muestra <b>Deshacer</b>, el nombre de la capa con su estado (<b>Guardado</b>), <b>Más</b> y <b>Listo</b>, que guarda y sale. Debajo, una frase dice qué tocar ahora y los botones cambian según lo que esté haciendo. Un botón con borde de rayas todavía no se puede usar: tóquelo y la app le dice por qué.</p>
<ul>
<li><b>Agregar un punto:</b> toque <b>Punto</b> y luego el mapa. <b>En mi posición</b> lo pone donde está usted; <b>GPS preciso</b> promedia el GPS unos segundos y muestra el avance y el ± (<b>Guardar ya</b> o <b>Cancelar</b>). En <b>Más</b>: <b>Escribir coordenadas…</b> (grados, grados-minutos-segundos o UTM) y <b>Punto a distancia y azimut…</b> desde un punto, su posición o el centro del mapa.</li>
<li><b>Dibujar una línea o un área:</b> toque <b>Línea</b> o <b>Área</b> y luego cada punto o esquina. <b>Punto GPS</b> agrega su posición actual. <b>Dibujar caminando</b> agrega un punto cada pocos metros mientras camina (por ejemplo, el borde de un lote); mientras tanto, los toques en el mapa no agregan puntos, y <b>Pausar</b> lo detiene. Termine con <b>Terminar línea</b> o <b>Terminar área</b>; <b>Descartar</b> tira el dibujo.</li>
<li><b>Cambiar algo:</b> toque <b>Seleccionar</b> y luego el elemento. Con <b>Editar forma</b>, arrastre los puntos blancos; los grises, en medio de cada lado, agregan una esquina; para quitar una, toque <b>Quitar esquina</b> y luego la esquina. <b>Mover</b> arrastra el elemento entero; <b>A mi posición</b> lleva un punto a su posición GPS; <b>Borrar</b> lo elimina.</li>
<li><b>Datos:</b> nombre, código, notas y los campos que agregue (sus nombres pueden usar letras de cualquier idioma). Lo que escriba se guarda al cerrar la ficha. Ahí también están <b>Cortar la línea…</b>, <b>Invertir dirección</b>, <b>Duplicar</b> y <b>Agregar campo</b>. El grupo <b>Datos de la toma</b> muestra lo que anotó la app: fecha, origen y precisión.</li>
<li><b>Varios a la vez:</b> en <b>Más</b>, active <b>Elegir varios</b>: cada toque suma o quita un elemento. Luego muévalos, deles el mismo valor o bórrelos juntos.</li>
<li><b>Imán:</b> en <b>Más</b> → <b>Opciones</b>. Lo que dibuja o arrastra se pega a las esquinas y bordes cercanos de las capas visibles; su fuerza puede ser baja, media o alta.</li>
</ul>
<p>Con el GPS, la app no usa una posición vieja. Si la precisión es peor que su límite (10 m; se cambia en <b>Más</b> → <b>Opciones</b>), muestra el ± y ofrece <b>Cancelar</b>, <b>Promediar</b> o <b>Guardar igual</b>.</p>
<p>Los cambios se guardan solos, y <b>Deshacer</b> recupera hasta 40 pasos y dice qué deshizo. Si no se puede guardar (por ejemplo, porque no queda espacio), la edición sigue abierta para no perder nada. Una capa KML, GPX o CSV se guarda como una copia GeoJSON editable la primera vez que la cambia. Antes de quitar una capa creada o editada en la app, expórtela: <b>Más</b> → <b>Exportar esta capa…</b>.</p>

<h4 id="help-basemaps">Mapas base en línea</h4>
<p>En <b>Capas</b>, elija el mapa base en línea: OpenStreetMap, Google (satélite, satélite con calles y nombres, calles o relieve) o sus propios mapas XYZ. Todos necesitan internet. Para trabajar sin señal, elija «Sin mapa de fondo» y use sus propios mapas (GeoTIFF).</p>
<p><b>Mapas XYZ, como en QGIS.</b> En Capas, toque <b>Agregar un mapa base XYZ</b> y pegue la misma URL que usa en QGIS (Navegador → XYZ Tiles → Nueva conexión), con {x}, {y} y {z}; también sirven {-y}, {q}, {s} y los subdominios {a-c} o {0-3}. Acepta además la «fuente» de una capa XYZ de QGIS (Propiedades → Información: <i>type=xyz&amp;url=…</i>) y el archivo XML que QGIS crea con «Guardar conexiones»: ábralo con Menú → <b>Abrir un mapa o datos</b> y la app agrega todas sus conexiones. Solo https:// (Android bloquea http://). Más allá del zoom máximo, la app amplía la última imagen disponible.</p>
<p>Aparte de OpenStreetMap y Google, la app no trae servidores: usted agrega los mapas XYZ y es responsable de respetar sus condiciones. Por ejemplo, Google solo permite usar sus imágenes mediante la Map Tiles API, que es la opción «Google» de la lista.</p>
<p><b>Google</b> necesita una clave propia de Google Maps Platform con la <b>Map Tiles API</b> habilitada y la facturación activa (incluye un cupo mensual gratuito). Créela en console.cloud.google.com → APIs y servicios → Credenciales, habilite «Map Tiles API», restrinja la clave a esa API y escríbala en Capas. La clave se guarda solo en el teléfono. Las condiciones de Google obligan a mostrar su logotipo y la atribución (la app lo hace) y <b>no permiten guardar sus imágenes para usarlas sin conexión</b>, ni calcar (digitalizar) caminos, edificios u otros objetos de ellas, ni mostrar Google junto con otro mapa base. Cupo gratuito: 100 000 teselas al mes (límite por defecto: 15 000 al día por proyecto); ponga un tope diario a la clave. El mapa de Google sale en el idioma de la app.</p>

<h4 id="help-crs">Sistemas de coordenadas en cualquier lugar del mundo</h4>
<p>El GPS da latitud y longitud (WGS 84). Muchos mapas y tablas usan en cambio metros en un sistema proyectado: UTM o el sistema nacional de un país. La app trae más de 280 sistemas: WGS 84, todas las zonas UTM (con WGS 84, SIRGAS 2000, ETRS89, NAD83, GDA y otros datums) y sistemas nacionales de muchos países.</p>
<p>Si un archivo no dice en qué sistema está, la app le pide elegirlo y pone arriba los más probables: el que indica el archivo, los que dejan los datos cerca de usted (o del centro del mapa) y los que se usan donde está. Busque por país, nombre, zona UTM (por ejemplo 33N) o código EPSG. Al elegir uno, la app muestra dónde caería el primer punto y a qué distancia de usted; luego toque <b>Usar este sistema</b>. Si no sabe cuál es, pregunte a quien le dio el archivo; números de 6 o 7 cifras suelen ser UTM.</p>
<p>Si un mapa aparece corrido, toque su nombre en Capas y cambie su sistema de coordenadas.</p>
<p><b>Sistema propio:</b> si su sistema no está en la lista, toque <b>Pegar definición PROJ</b> y pegue la definición de epsg.io (formato PROJ.4) o de QGIS (Propiedades de la capa → Información). Si le pone su código EPSG, la app reconocerá sola los próximos archivos con ese código. Las definiciones que necesitan un archivo de cuadrícula (+nadgrids) no funcionan sin conexión: busque en epsg.io la versión con +towgs84.</p>
<p>La barra de coordenadas y Ajustes → <b>Formato de coordenadas</b> ofrecen grados decimales, grados-minutos-segundos y UTM.</p>
<p class="note info">Solo para Costa Rica: CRTM05 es la proyección oficial. Desde 2018 el datum oficial es CR-SIRGAS (EPSG:8908); el antiguo CR05 (EPSG:5367) difiere hasta ~10 cm. También se reconocen Lambert Norte y Sur de Ocotepeque 1935 (EPSG:5456/5457), de los mapas antiguos. Las opciones CRTM05 solo aparecen con datos o posiciones dentro de Costa Rica.</p>

<h4 id="help-accuracy">Precisión: teléfono o RTK</h4>
<p>El valor ± y el círculo azul alrededor de su posición son el radio al <b>68 %</b> que informa Android: la posición real está dentro del círculo unas 2 de cada 3 veces. A cielo abierto, un teléfono suele lograr 3–5 m; bajo árboles o junto a edificios, bastante peor. La primera posición puede tardar de 30 s a unos minutos.</p>
<p>Un teléfono <b>no es RTK</b>: sirve para orientarse, encontrar puntos y mapear con algunos metros de error, no para linderos ni replanteos al centímetro. Para eso, mida con un receptor RTK y use esta app para orientarse.</p>
<p><b>Receptor externo (RTK o GNSS):</b> si el receptor, o una app de NTRIP o Bluetooth, publica su posición como <i>ubicación simulada</i> de Android (Opciones de desarrollador → app de ubicación simulada), Mapa de Campo la usa automáticamente y la marca como receptor externo en <b>Estado del GPS</b>.</p>
<p>Si Android solo da ubicación aproximada (unos 2 km), active «Ubicación precisa» en los permisos de la app.</p>

<h4 id="help-heights">Alturas</h4>
<p>La altura del GPS es <b>elipsoidal</b> (h, sobre el elipsoide WGS 84), no la altitud sobre el nivel del mar (H) de los mapas. Se relacionan así: H = h − N, donde N es la ondulación del geoide; N cambia según el lugar y puede ser de decenas de metros.</p>
<p class="muted small">Ejemplo (Universidad EARTH, Costa Rica): N ≈ 11,5 m (EGM2008), así que la altura del GPS sale unos 11,5 m mayor que la cota.</p>
<p>Cuando Android la entrega, <b>Estado del GPS</b> muestra también la altitud sobre el nivel medio del mar, y el CSV de Mis puntos trae las dos (columnas h_elip_m y H_nmm_m). Revise siempre la referencia vertical antes de comparar alturas.</p>

<h4 id="help-export">Exportar y compartir</h4>
<ul>
<li><b>Mis puntos</b> (Menú): GPX, GeoJSON o CSV con latitud, longitud y UTM (en Costa Rica, también CRTM05).</li>
<li><b>Recorrido</b> (Menú → <b>Grabar recorrido</b>): GPX, o guárdelo como capa.</li>
<li><b>Una capa</b>: Editar → <b>Más</b> → <b>Exportar esta capa…</b>: GeoJSON, KML (Google Earth), GPX, CSV de puntos o CSV para SingularPad.</li>
<li><b>Un plan</b>: <b>Exportar…</b> en el panel del plan.</li>
</ul>
<p>Android le pregunta dónde guardar el archivo. El contenido usa punto decimal y nombres de columna fijos, para que cualquier programa lo lea en cualquier idioma. Sus datos salen del teléfono solo cuando usted los exporta.</p>

<h4 id="help-settings">Ajustes</h4>
<p>En Menú → <b>Ajustes</b>:</p>
<ul>
<li><b>Idioma</b>: el del teléfono (automático), Español, English, Français o Português. La app se vuelve a abrir en el idioma elegido.</li>
<li><b>Tema</b>: <b>Automático</b>, <b>Claro</b>, <b>Oscuro</b> o <b>Sol</b>, con el máximo contraste para leer a pleno sol.</li>
<li><b>Tamaño del texto</b>: <b>Auto</b> sigue el tamaño de letra del teléfono; de A− a A+++, más pequeño o más grande.</li>
<li><b>Botones grandes (para usar con guantes)</b>.</li>
<li><b>Unidades</b>: métricas (m, km, ha) o imperiales (ft, mi, ac). Solo cambian cómo se muestran las medidas; lo que escribe en los campos sigue en metros.</li>
<li>También: el formato de coordenadas, los nombres de los puntos en el mapa y la pantalla encendida al navegar o grabar.</li>
<li><b>Navegación</b>: radio de llegada, aviso de desvío, paso automático al siguiente punto y vibración.</li>
<li><b>Grabar recorrido</b>: distancia mínima entre puntos y posiciones que se descartan por mala precisión.</li>
<li><b>Práctica</b>: simule un recorrido por la línea que está siguiendo, para practicar sin salir (antes, toque una línea → <b>Seguir esta línea</b>). Para EARTH (opcional): datos de ejemplo y ortofotos.</li>
</ul>
<p class="muted small">Los campos de números aceptan coma o punto decimal.</p>

<h4 id="help-problems">Si algo no funciona</h4>
<ul>
<li><b>No aparece mi posición:</b> toque <b>Mi ubicación</b> y permita la ubicación. Revise que la ubicación del teléfono esté encendida y salga a cielo abierto.</li>
<li><b>El mapa aparece corrido</b> respecto a su posición o a otras capas: cambie el sistema de coordenadas de la capa (toque su nombre en Capas).</li>
<li><b>Un GeoTIFF va lento o la app se cierra:</b> conviértalo a COG o recórtelo a su zona de trabajo (vea «Cargar su propio mapa»).</li>
<li><b>El mapa base sale vacío:</b> no hay internet o, con Google, falla la clave o la facturación. Sin señal, use sus propios mapas.</li>
<li><b>La flecha apunta mal:</b> calibre la brújula haciendo un 8 en el aire con el teléfono, lejos de objetos de metal.</li>
</ul>`,
};
