// Ayuda, créditos, biografía y datos de «Acerca de» en inglés.
// Misma estructura que es.js: mismas claves, mismos <h4> (con sus id) y mismos enlaces.
// Los nombres de botones en <b> siguen las traducciones de las tablas de src/i18n.
import {AUTHOR} from '../author.js';
import {GOOGLE_TERMS, GOOGLE_PRIVACY} from '../basemap.js';

export default {
  credit: `<p class="credit">Created by <b>${AUTHOR}</b> · Universidad EARTH, Costa Rica</p>`,

  bio: `
<h4>About the author</h4>
<p><b>${AUTHOR}</b> is a student at Universidad EARTH (Costa Rica, class of 2023–2026) who works with
Geographic Information Systems (GIS) and GNSS RTK positioning for fieldwork, and who designed the
RTK topographic survey of the EARTH sports field: serpentine routes, coordinates in CRTM05 / CR-SIRGAS,
and processing with Python and GDAL. ${AUTHOR} teaches the introductory RTK class at EARTH and in 2027
begins a Master of Science (M.Sc.) in Bioresource Engineering at McGill University (Canada).</p>
<p class="muted small">Mapa de Campo grew out of that work: a tool that lets students load their own
maps and follow their survey lines in the field.</p>`,

  about: `<h4>Open-source components</h4>
    <ul class="small"><li>OpenLayers 10.11 (BSD 2-Clause) — openlayers.org</li><li>geotiff.js (MIT) — github.com/geotiffjs/geotiff.js</li><li>proj4js 2.22 (MIT) — github.com/proj4js/proj4js</li><li>fflate (MIT) — github.com/101arrowz/fflate</li></ul>
    <h4>Data</h4><ul class="small"><li>Coordinate system definitions: EPSG registry (IOGP), taken from PROJ/GDAL and epsg.io.</li><li>Optional basemap: © OpenStreetMap contributors (ODbL), internet only.</li><li>XYZ basemaps added by the user: the app includes none; each one is governed by its provider’s terms.</li><li>Optional basemap: Google Maps (Map Tiles API, with the user’s own key and internet only). The <a href="${GOOGLE_TERMS}">Google Maps Additional Terms of Service</a> and the <a href="${GOOGLE_PRIVACY}">Google Privacy Policy</a> apply.</li><li>Demo data: a 5 m serpentine route over the Universidad EARTH sports field (OpenStreetMap polygon, way 1029347440).</li><li>Included EARTH orthophotos: Ortofoto 1:5000 2014-2017 (whole university, 2015 photos, 0.5 m) and Ortofoto 1:1000 2015-2018 (campus core, ~0.12 m) © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, via SNIT. «Su uso tendrá carácter libre y gratuito, siempre que se mencione el origen y propiedad de los datos.» (Use is free of charge, provided the origin and ownership of the data are credited.)</li><li>Universidad EARTH boundary: © OpenStreetMap contributors (ODbL), way 321376631.</li></ul>`,

  privacy: `<h4>Privacy</h4>
<p><b>Mapa de Campo does not collect personal data.</b> The app has no servers, no accounts, no ads, no usage statistics and no automatic error reports.</p>
<ul>
<li><b>Location.</b> GPS is used only on the phone: to show your position, mark points, measure, record tracks and guide you. When you record a track with the screen off, Android shows a notification for as long as the recording lasts. The app does not send your position to anyone.</li>
<li><b>Your files.</b> The maps and data you import, and the points, tracks and layers you edit, are stored only in the app’s internal storage. They leave the phone only when you export or share them.</li>
<li><b>Online basemaps (optional).</b> If you turn on OpenStreetMap, Google or an XYZ map, the phone requests the images of the area you are viewing from that service; the service receives your IP address and the coordinates of those images, under its own privacy policy. The Google key you enter is stored only on the phone and sent only to Google. Without an online basemap, the app works without internet.</li>
<li><b>Permissions.</b> Location (GPS position), notifications (recording notice), internet (only for online basemaps) and vibration (navigation alerts).</li>
</ul>
<p>When you uninstall the app, Android deletes all its data. For questions, use the developer contact on the app’s Google Play page.</p>`,

  help: `
<h4 id="help-quick">Quick guide</h4>
<p>Mapa de Campo shows where you are on your own maps, even without internet.</p>
<ul>
<li><b>Layers</b>: show, hide and reorder your maps and data, open files and choose an online basemap.</li>
<li><b>Mark</b>: saves a point where you are, with the GPS accuracy. Your points are in Menu → <b>My points</b>.</li>
<li><b>Record</b>: records the path you walk. While recording, the button turns red and shows the distance.</li>
<li><b>Measure</b>: measures a distance or an area by tapping the map.</li>
<li><b>Edit</b>: draw, move or delete points, lines and areas in a layer.</li>
<li><b>My location</b> (the round button): the first tap centers the map on you and follows you (<b>Follow</b>); the second turns the map to the way you are facing (<b>Compass</b>). If you move the map with your finger, it stops following you. The <b>N</b> arrow puts north back at the top.</li>
<li><b>GPS</b> (top right): more bars, better signal. The number, for example ±4 m, tells you how far off your position may be. Tap it for details.</li>
<li><b>Coordinate bar</b> (bottom): your current coordinates. Tap it to change the format.</li>
<li><b>Touch and hold the map</b> to see the coordinates of that place, navigate there, save it as a point or copy its coordinates.</li>
<li><b>Tap a line or a point</b> of a layer to see its data and what you can do with it: follow it, visit it or edit it.</li>
<li><b>Menu</b> (top left): open files, plan, my points, GPS status, settings and this help.</li>
</ul>
<p>With no signal, everything works with your own maps and data. Only online basemaps need internet.</p>

<h4 id="help-geotiff">Load your own map (GeoTIFF)</h4>
<p>Any georeferenced <b>.tif/.tiff</b> image works: a drone orthophoto, a scanned and georeferenced map, or an elevation model.</p>
<p>Tap Menu → <b>Open a map or data</b> (or <b>Open file</b> on the start card) and choose the file. You can also open it from Files, Drive, email or a messaging app with “Open with” or “Share” → Mapa de Campo. The app keeps a copy on the phone: it works offline and is still there next time.</p>
<p>If the file doesn’t say which coordinate system it uses, the app asks you to choose one (see “Coordinate systems”). In <b>Layers</b>, tap the layer name to change its transparency or, if the map looks shifted, its coordinate system. An elevation model can be shown in gray or in terrain colors.</p>
<p class="muted small"><b>If a large map is slow</b>, convert it to COG (Cloud Optimized GeoTIFF): with internal tiles and overviews, the app reads only the part you are looking at. In QGIS: Export → Save As…, format COG. With GDAL:<code>gdal_translate input.tif output_cog.tif -of COG -co COMPRESS=JPEG -co QUALITY=85</code>For an elevation model, replace the JPEG options with <code>-co COMPRESS=DEFLATE -co PREDICTOR=2</code> In the EARTH project, the optional <i>preparar_cog.py</i> script does the same.</p>
<p class="note info">For Universidad EARTH (optional): if you chose “At Universidad EARTH” when you started, the app includes two official IGN orthophotos that work offline: the whole university (0.5 m, 2015 photos) and the campus core (~0.12 m). If you remove one, Settings offers it again.</p>

<h4 id="help-vector">Load lines and points (KML/KMZ, GeoJSON, GPX, CSV)</h4>
<p>Use the same button: Menu → <b>Open a map or data</b>. It accepts files from Google Earth (KML/KMZ), from QGIS and other mapping programs (GeoJSON), from handheld GPS units (GPX), and tables saved as CSV or TXT.</p>
<p><b>CSV tables:</b> one row per point, with columns separated by commas or semicolons. Excel CSV files with semicolons and decimal commas work too. The columns can be latitude and longitude, or easting and northing in meters, with or without a header; column names are recognized in English, Spanish, French and Portuguese. When commas separate the columns, use a point for decimals. Example:</p>
<code>name,lat,lon,note
P1,-1.29210,36.82190,well
P2,-1.29245,36.82230,fence</code>
<p>If the coordinates are in meters, the app asks for the coordinate system. Without a header, it also accepts the Name,N,E,Z,Code order used by RTK data collectors such as SingularPad.</p>

<h4 id="help-mark">Mark points, record a track and measure</h4>
<ul>
<li><b>Mark</b> saves your position with a name (Point 1, Point 2…). If the last position is more than 10 s old or the GPS reports worse than ±15 m, the app warns you and offers <b>Average</b>: it combines 60 s of readings for a more exact point.</li>
<li>To save another place, touch and hold the map and choose <b>Save to My points</b>.</li>
<li>Menu → <b>My points</b>: view, rename or delete your points, navigate to one or export them. With 3 or more points, you can use them as the corners of a plan.</li>
<li><b>Record</b> opens the track panel: tap <b>Start recording</b>. Recording continues with the screen off (Android shows a notification) until you tap <b>Stop</b>. If you continue a stopped recording, a new segment starts, with no straight line across the gap. When you finish, you can export the track as GPX or save it as a layer.</li>
<li><b>Measure</b>: choose <b>Distance</b> or <b>Area</b>, tap the map at each point, then tap <b>Done</b>. <b>Undo</b> removes the last point. The result stays in the bar (a distance comes with its bearing); <b>Measure again</b> starts over and <b>Close</b> exits.</li>
</ul>
<p class="muted small">Measurements are real meters on the ground: they are computed on the WGS 84 ellipsoid (local transverse Mercator plane, Vincenty inverse), not on the map projection.</p>

<h4 id="help-follow">Follow a line</h4>
<p>Tap a line on the map → <b>Follow this line</b> (or <b>Follow in the opposite direction</b>). To walk the edge of an area, tap the area → <b>Walk the boundary</b>. The card at the bottom guides you:</p>
<ul>
<li><b>Steer</b>: how far you are from the line and which way to move.</li>
<li><b>Turn in</b>: how far until the next turn. <b>To go</b> (on wide screens): what is left until the end.</li>
<li>A sentence tells you what to do, for example “Move 2 m to the right.”</li>
<li><b>Guidance bar</b>: the dot is you and the center stripe is the line. The green zone means you are doing fine; the thin marks are your off-the-line alert, and the hatched zone is beyond it. The dot carries ✓, ! or ✕, so you don’t need to tell colors apart. If you go off the line, the card turns red and the phone vibrates.</li>
</ul>
<p>Tap the route name to open <b>Details</b>: progress, GPS accuracy, <b>Find me on the route</b> and <b>Reverse direction</b>. With close parallel lines (for example, every 5 m), the app compares your position only with the current section and its neighbors, so GPS error doesn’t make it jump to another line. If you change lines on purpose, tap <b>Find me on the route</b>. If you walk the wrong way, the card warns you and offers to reverse the direction.</p>
<p>If the GPS signal is lost, its accuracy is very low or the location is only approximate, guidance pauses (the numbers show “—”) and the sentence tells you what to do. If the arrow turns gray and asks you to calibrate the compass, move the phone in a figure 8 in the air.</p>
<p><b>Stop</b> ends navigation and asks for confirmation if progress would be lost. If Android closes the app, it picks up where you were when you open it again. You can change the off-the-line alert distance in Settings → Navigation.</p>

<h4 id="help-points">Visit points (stake out)</h4>
<p>To go to a single place, tap a point, or touch and hold the map anywhere, and choose <b>Navigate here</b>. An arrow and the distance take you there.</p>
<p>To visit all the points of a layer in order (samples, stakes, a grid), tap the point where you want to start → <b>Visit the points from here</b>. Points are sorted by their <i>id</i> or by name.</p>
<ul>
<li>When you enter the <b>arrival radius</b>, the phone vibrates, the point turns green and the app moves on to the next one. Arrival is detected automatically only if the GPS is at ±8 m or better; otherwise, tap <b>I’m here</b>.</li>
<li>The ← and → arrows go to the previous or the next point.</li>
<li>At the last point, the app tells you which ones are missing. Visited points are remembered even if Android closes the app.</li>
</ul>
<p class="muted small">You can change the arrival radius and automatic moving to the next point in Settings → Navigation.</p>

<h4 id="help-plan">Plan lines or a grid</h4>
<p>Menu → <b>Plan</b> prepares lines or points for covering a piece of land on foot, like a drone flight plan. Follow the steps in the panel:</p>
<ol>
<li><b>Area.</b> Tap <b>Draw area</b>, tap each corner on the map, then tap <b>Finish area</b>; <b>Remove corner</b> deletes the last one. You can also tap an area that is already loaded (KML, KMZ or GeoJSON) → <b>Plan lines or a grid here</b>, or tap <b>Use my points</b> after walking the corners and marking them with <b>Mark</b>.</li>
<li><b>Plan type.</b> <b>Serpentine lines</b>: parallel lines walked back and forth. <b>Point grid</b>: evenly spaced points, numbered P001, P002… in walking order. <b>Crosshatch</b>: two passes crossed at 90°.</li>
<li><b>Measurements.</b> Enter the spacing between lines and between points, or tap a quick size. With <b>Square grid</b>, both values change together. The margin leaves a strip free along the edge.</li>
<li><b>Direction and start.</b> <b>Automatic</b> makes the lines parallel to the longest side; <b>Manual</b> uses the degrees you enter, from true north and clockwise. <b>Rotate 90°</b> turns the lines across. In <b>Where the plan starts</b>, choose the starting corner.</li>
</ol>
<p><b>More options</b> holds how points are placed, plus the walking speed and the seconds at each point used to estimate the time. At the bottom, the panel shows the summary (lines, meters, points and walking time) and the <b>Save</b> and <b>Save and follow</b> buttons. If the plan has lines with points, the app asks whether you want to follow the lines or go point to point.</p>
<p>Tricky shapes: holes (a building, a pond) are left out of the plan. An L- or U-shaped area is covered in parts, so you don’t cross outside it on every line. If the outline crosses itself, the app warns you; if you tap four corners out of order, it sorts them by itself.</p>
<p>A saved plan becomes layers you can follow, visit and edit: for example, move or delete a point that falls in a ditch, then use Edit → <b>More</b> → <b>Renumber points…</b>. <b>Export…</b> offers GeoJSON, KML, GPX, points CSV and CSV for the SingularPad RTK data collector (in Costa Rica, also in CRTM05).</p>
<p class="muted small"><b>What spacing should you use on foot?</b> As a reference, the FAO irrigation manual (Module 2, 2002) uses grids of 10–50 m for surface irrigation and 25–100 m for sprinkler irrigation, and considers a 20 × 20 m grid adequate for irrigation design; denser on slopes or uneven ground.</p>
<p class="muted small"><b>For drones:</b> the <b>Drone calculator</b> uses the camera, the height and the overlaps to work out the pixel size on the ground (GSD), the ground covered by each photo and the spacing between lines and between photos (Pix4D formula). The app does not control the drone: export <b>KML of the area only</b>, import it into DJI Pilot 2 or Pix4Dcapture and use the calculated spacing. Note: DJI GS Pro measures direction from east, counterclockwise.</p>

<h4 id="help-edit">Edit layers</h4>
<p>Tap <b>Edit</b> (or Menu → <b>Edit layers</b>) and choose a layer, or create a <b>New layer</b> of points, lines, areas or mixed. You can also tap a feature on the map → <b>Edit this feature</b>.</p>
<p>The edit bar always shows <b>Undo</b>, the layer name with its status (<b>Saved</b>), <b>More</b> and <b>Done</b>, which saves and exits. Below it, a sentence tells you what to tap next, and the buttons change with what you are doing. A button with a dashed border can’t be used yet: tap it and the app tells you why.</p>
<ul>
<li><b>Add a point:</b> tap <b>Point</b>, then the map. <b>At my location</b> places it where you are; <b>Precise GPS</b> averages the GPS for a few seconds and shows the progress and the ± (<b>Save now</b> or <b>Cancel</b>). In <b>More</b>: <b>Enter coordinates…</b> (degrees, degrees-minutes-seconds or UTM) and <b>Point at a distance and bearing…</b> from a point, your position or the map center.</li>
<li><b>Draw a line or an area:</b> tap <b>Line</b> or <b>Area</b>, then each point or corner. <b>GPS point</b> adds your current position. <b>Draw by walking</b> adds a point every few meters as you walk (for example, the edge of a field); meanwhile, taps on the map don’t add points, and <b>Pause</b> stops it. Finish with <b>Finish line</b> or <b>Finish area</b>; <b>Discard</b> throws the drawing away.</li>
<li><b>Change something:</b> tap <b>Select</b>, then the feature. With <b>Reshape</b>, drag the white dots; the gray dots in the middle of each side add a corner; to remove one, tap <b>Remove corner</b>, then the corner. <b>Move</b> drags the whole feature; <b>To my location</b> moves a point to your GPS position; <b>Delete</b> removes it.</li>
<li><b>Data:</b> name, code, notes and any fields you add (their names can use letters from any language). What you type is saved when you close the form. There you also find <b>Split the line…</b>, <b>Reverse direction</b>, <b>Duplicate</b> and <b>Add field</b>. The <b>Capture info</b> group shows what the app recorded: date, source and accuracy.</li>
<li><b>Several at once:</b> in <b>More</b>, turn on <b>Select several</b>: each tap adds or removes a feature. Then move them, give them the same value or delete them together.</li>
<li><b>Snap:</b> in <b>More</b> → <b>Options</b>. What you draw or drag sticks to nearby corners and edges of visible layers; its strength can be low, medium or high.</li>
</ul>
<p>With the GPS, the app never uses an out-of-date position. If accuracy is worse than your limit (10 m; change it in <b>More</b> → <b>Options</b>), it shows the ± and offers <b>Cancel</b>, <b>Average</b> or <b>Save anyway</b>.</p>
<p>Changes are saved automatically, and <b>Undo</b> goes back up to 40 steps and tells you what it undid. If saving fails (for example, because storage is full), editing stays open so nothing is lost. A KML, GPX or CSV layer is saved as an editable GeoJSON copy the first time you change it. Before removing a layer created or edited in the app, export it: <b>More</b> → <b>Export this layer…</b>.</p>

<h4 id="help-basemaps">Online basemaps</h4>
<p>In <b>Layers</b>, choose the online basemap: OpenStreetMap, Google (satellite, satellite with streets and names, streets or terrain) or your own XYZ maps. They all need internet. To work without signal, choose “No basemap” and use your own maps (GeoTIFF).</p>
<p><b>XYZ maps, as in QGIS.</b> In Layers, tap <b>Add an XYZ basemap</b> and paste the same URL you use in QGIS (Browser → XYZ Tiles → New Connection), with {x}, {y} and {z}; {-y}, {q}, {s} and the subdomains {a-c} or {0-3} also work. It also accepts the “source” of a QGIS XYZ layer (Properties → Information: <i>type=xyz&amp;url=…</i>) and the XML file QGIS creates with “Save Connections”: open it with Menu → <b>Open a map or data</b> and the app adds all its connections. https:// only (Android blocks http://). Beyond the maximum zoom, the app enlarges the last available image.</p>
<p>Apart from OpenStreetMap and Google, the app comes with no servers: you add the XYZ maps yourself and are responsible for respecting their terms. For example, Google only allows its imagery through the Map Tiles API, which is the “Google” option in the list.</p>
<p><b>Google</b> needs your own Google Maps Platform key with the <b>Map Tiles API</b> enabled and billing turned on (it includes a free monthly quota). Create it at console.cloud.google.com → APIs &amp; Services → Credentials, enable “Map Tiles API”, restrict the key to that API and enter it in Layers. The key is stored only on the phone. Google’s terms require showing its logo and attribution (the app does this) and <b>do not allow saving its images for offline use</b>, tracing (digitizing) roads, buildings or other objects from them, or showing Google together with another basemap. Free quota: 100,000 tiles per month (default limit: 15,000 per day per project); set a daily cap on the key. The Google map uses the app language.</p>

<h4 id="help-crs">Coordinate systems anywhere in the world</h4>
<p>GPS gives latitude and longitude (WGS 84). Many maps and tables use meters in a projected system instead: UTM or a country’s national grid. The app includes more than 280 systems: WGS 84, every UTM zone (with WGS 84, SIRGAS 2000, ETRS89, NAD83, GDA and other datums) and national systems from many countries.</p>
<p>If a file doesn’t say which system it uses, the app asks you to choose one and lists the most likely ones first: the one the file states, the ones that put the data near you (or near the map center) and the ones used where you are. Search by country, name, UTM zone (for example 33N) or EPSG code. When you choose one, the app shows where the first point would land and how far that is from you; then tap <b>Use this system</b>. If you don’t know which one it is, ask whoever gave you the file; numbers with 6 or 7 digits are usually UTM.</p>
<p>If a map looks shifted, tap its name in Layers and change its coordinate system.</p>
<p><b>Custom system:</b> if your system is not in the list, tap <b>Paste PROJ definition</b> and paste the definition from epsg.io (PROJ.4 format) or from QGIS (Layer Properties → Information). If you give it its EPSG code, the app will recognize future files with that code by itself. Definitions that need a grid file (+nadgrids) don’t work offline: look on epsg.io for the version with +towgs84.</p>
<p>The coordinate bar and Settings → <b>Coordinate format</b> offer decimal degrees, degrees-minutes-seconds and UTM.</p>
<p class="note info">Costa Rica only: CRTM05 is the official projection. Since 2018 the official datum is CR-SIRGAS (EPSG:8908); the older CR05 (EPSG:5367) differs by up to ~10 cm. Lambert North and Lambert South on the Ocotepeque 1935 datum (EPSG:5456/5457), from older maps, are also recognized. CRTM05 options appear only for data or positions inside Costa Rica.</p>

<h4 id="help-accuracy">Accuracy: phone or RTK</h4>
<p>The ± value and the blue circle around your position are the <b>68%</b> radius that Android reports: your real position is inside the circle about 2 times out of 3. Under open sky, a phone usually achieves 3–5 m; under trees or next to buildings, much worse. The first position can take from 30 s to a few minutes.</p>
<p>A phone <b>is not RTK</b>: it is good for finding your way, locating points and mapping with a few meters of error, not for property boundaries or centimeter-level stakeout. For that, measure with an RTK receiver and use this app to find your way.</p>
<p><b>External receiver (RTK or GNSS):</b> if the receiver, or an NTRIP or Bluetooth app, publishes its position as an Android <i>mock location</i> (Developer options → Select mock location app), Mapa de Campo uses it automatically and labels it as an external receiver in <b>GPS status</b>.</p>
<p>If Android only gives approximate location (about 2 km), turn on “Use precise location” in the app’s permissions.</p>

<h4 id="help-heights">Heights</h4>
<p>GPS height is <b>ellipsoidal</b> (h, above the WGS 84 ellipsoid), not the height above sea level (H) shown on maps. They are related by H = h − N, where N is the geoid undulation; N changes from place to place and can reach tens of meters.</p>
<p class="muted small">Example (Universidad EARTH, Costa Rica): N ≈ 11.5 m (EGM2008), so the GPS height comes out about 11.5 m higher than the surveyed elevation.</p>
<p>When Android provides it, <b>GPS status</b> also shows the height above mean sea level, and the My points CSV includes both (columns h_elip_m and H_nmm_m). Always check the vertical reference before comparing heights.</p>

<h4 id="help-export">Export and share</h4>
<ul>
<li><b>My points</b> (Menu): GPX, GeoJSON or CSV with latitude, longitude and UTM (in Costa Rica, also CRTM05).</li>
<li><b>Track</b> (Menu → <b>Record track</b>): GPX, or save it as a layer.</li>
<li><b>A layer</b>: Edit → <b>More</b> → <b>Export this layer…</b>: GeoJSON, KML (Google Earth), GPX, points CSV or CSV for SingularPad.</li>
<li><b>A plan</b>: <b>Export…</b> in the plan panel.</li>
</ul>
<p>Android asks you where to save the file. The contents use a decimal point and fixed column names, so any program can read them in any language. Your data leaves the phone only when you export it.</p>

<h4 id="help-settings">Settings</h4>
<p>In Menu → <b>Settings</b>:</p>
<ul>
<li><b>Language</b>: the phone’s language (automatic), Español, English, Français or Português. The app reopens in the chosen language.</li>
<li><b>Theme</b>: <b>Automatic</b>, <b>Light</b>, <b>Dark</b> or <b>Sunlight</b>, with maximum contrast for reading in bright sunlight.</li>
<li><b>Text size</b>: <b>Auto</b> follows the phone’s font size; A− to A+++ make it smaller or larger.</li>
<li><b>Large buttons (for use with gloves)</b>.</li>
<li><b>Units</b>: metric (m, km, ha) or imperial (ft, mi, ac). They only change how measurements are shown; what you type in the fields stays in meters.</li>
<li>Also: the coordinate format, point names on the map and keeping the screen on while navigating or recording.</li>
<li><b>Navigation</b>: arrival radius, off-the-line alert, moving to the next point automatically and vibration.</li>
<li><b>Record track</b>: minimum distance between points and positions discarded for poor accuracy.</li>
<li><b>Practice</b>: simulate a walk along the line you are following, to practice indoors (first tap a line → <b>Follow this line</b>). For EARTH (optional): example data and orthophotos.</li>
</ul>
<p class="muted small">Number fields accept a decimal comma or point.</p>

<h4 id="help-problems">If something doesn’t work</h4>
<ul>
<li><b>My position doesn’t appear:</b> tap <b>My location</b> and allow location. Check that the phone’s location is on and go out under open sky.</li>
<li><b>The map looks shifted</b> compared with your position or other layers: change the layer’s coordinate system (tap its name in Layers).</li>
<li><b>A GeoTIFF is slow or the app closes:</b> convert it to COG or clip it to your work area (see “Load your own map”).</li>
<li><b>The basemap stays empty:</b> there is no internet or, with Google, the key or billing is not working. Without signal, use your own maps.</li>
<li><b>The arrow points the wrong way:</b> calibrate the compass by moving the phone in a figure 8 in the air, away from metal objects.</li>
</ul>`,
};
