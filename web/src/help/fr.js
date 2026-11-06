// Ayuda, créditos, biografía y datos de «Acerca de» en francés.
// Misma estructura que es.js: mismas claves, mismos <h4> (con sus id) y mismos enlaces.
// Los nombres de botones en <b> siguen las traducciones de las tablas de src/i18n.
// Tipografía: espacio fina insecable antes de los dos puntos, el punto y coma, «?» y «!», y espacio
// insecable dentro de las comillas francesas.
import {AUTHOR} from '../author.js';
import {GOOGLE_TERMS, GOOGLE_PRIVACY} from '../basemap.js';

export default {
  credit: `<p class="credit">Créé par <b>${AUTHOR}</b> · Universidad EARTH, Costa Rica</p>`,

  bio: `
<h4>Qui a créé l’app</h4>
<p><b>${AUTHOR}</b> fait ses études à l’Universidad EARTH (Costa Rica, promotion 2023–2026), travaille avec
les systèmes d’information géographique (SIG) et le positionnement GNSS RTK appliqués au travail de terrain,
et a conçu le levé topographique RTK du terrain de sport d’EARTH : itinéraires en serpentin, coordonnées en
CRTM05 / CR-SIRGAS et traitement avec Python et GDAL. ${AUTHOR} donne le cours d’introduction au RTK à EARTH
et commence en 2027 une maîtrise ès sciences (M.Sc.) en génie des bioressources à l’Université McGill (Canada).</p>
<p class="muted small">Mapa de Campo est né de ce travail : un outil pour que les étudiants chargent leurs propres
cartes et suivent leurs lignes de levé sur le terrain.</p>`,

  about: `<h4>Composants open source</h4>
    <ul class="small"><li>OpenLayers 10.11 (BSD 2-Clause) — openlayers.org</li><li>geotiff.js (MIT) — github.com/geotiffjs/geotiff.js</li><li>proj4js 2.22 (MIT) — github.com/proj4js/proj4js</li><li>fflate (MIT) — github.com/101arrowz/fflate</li></ul>
    <h4>Données</h4><ul class="small"><li>Définitions des systèmes de coordonnées : registre EPSG (IOGP), issues de PROJ/GDAL et d’epsg.io.</li><li>Fond de carte facultatif : © OpenStreetMap contributors (ODbL), avec internet uniquement.</li><li>Fonds de carte XYZ ajoutés par l’utilisateur : l’app n’en inclut aucun ; chacun est soumis aux conditions de son fournisseur.</li><li>Fond de carte facultatif : Google Maps (Map Tiles API, avec la clé de l’utilisateur et avec internet uniquement). Les <a href="${GOOGLE_TERMS}">Conditions d’utilisation supplémentaires de Google Maps</a> et les <a href="${GOOGLE_PRIVACY}">Règles de confidentialité de Google</a> s’appliquent.</li><li>Données de démonstration : itinéraire en serpentin de 5 m sur le terrain de sport de l’Universidad EARTH (polygone OpenStreetMap, chemin 1029347440).</li><li>Orthophotos d’EARTH incluses : Ortofoto 1:5000 2014-2017 (toute l’université, photos de 2015, 0,5 m) et Ortofoto 1:1000 2015-2018 (cœur du campus, ~0,12 m) © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, via SNIT. «Su uso tendrá carácter libre y gratuito, siempre que se mencione el origen y propiedad de los datos.» (Utilisation libre et gratuite, à condition de mentionner l’origine et la propriété des données.)</li><li>Limite de l’Universidad EARTH : © OpenStreetMap contributors (ODbL), chemin 321376631.</li></ul>`,

  privacy: `<h4>Confidentialité</h4>
<p><b>Mapa de Campo ne collecte aucune donnée personnelle.</b> L’app n’a ni serveurs, ni comptes, ni publicité, ni statistiques d’utilisation, ni rapports d’erreur automatiques.</p>
<ul>
<li><b>Position.</b> Le GPS n’est utilisé que dans le téléphone : pour afficher votre position, marquer des points, mesurer, enregistrer des traces et vous guider. Quand vous enregistrez une trace écran éteint, Android affiche une notification pendant toute la durée de l’enregistrement. L’app n’envoie votre position à personne.</li>
<li><b>Vos fichiers.</b> Les cartes et les données que vous importez, les points, les traces et les couches que vous modifiez sont enregistrés uniquement dans la mémoire interne de l’app. Ils ne quittent le téléphone que lorsque vous les exportez ou les partagez.</li>
<li><b>Fonds de carte en ligne (facultatifs).</b> Si vous activez OpenStreetMap, Google ou une carte XYZ, le téléphone demande à ce service les images de la zone que vous regardez ; ce service reçoit votre adresse IP et les coordonnées de ces images, selon sa propre politique de confidentialité. La clé Google que vous saisissez est enregistrée uniquement sur le téléphone et envoyée uniquement à Google. Sans fond de carte en ligne, l’app fonctionne sans internet.</li>
<li><b>Autorisations.</b> Localisation (position GPS), notifications (avis d’enregistrement), internet (uniquement pour les fonds de carte en ligne) et vibration (alertes de navigation).</li>
</ul>
<p>Quand vous désinstallez l’app, Android supprime toutes ses données. Pour toute question, utilisez le contact du développeur sur la page de l’app dans Google Play.</p>`,

  help: `
<h4 id="help-quick">Guide rapide</h4>
<p>Mapa de Campo montre où vous êtes sur vos propres cartes, même sans internet.</p>
<ul>
<li><b>Couches</b> : affichez, masquez et ordonnez vos cartes et vos données, ouvrez des fichiers et choisissez un fond de carte en ligne.</li>
<li><b>Marquer</b> : enregistre un point là où vous êtes, avec la précision du GPS. Vos points sont dans Menu → <b>Mes points</b>.</li>
<li><b>Trace</b> : enregistre le chemin que vous parcourez. Pendant l’enregistrement, le bouton devient rouge et affiche la distance.</li>
<li><b>Mesurer</b> : mesure une distance ou une surface en touchant la carte.</li>
<li><b>Modifier</b> : dessinez, déplacez ou supprimez des points, des lignes et des surfaces dans une couche.</li>
<li><b>Ma position</b> (le bouton rond) : le premier toucher centre la carte sur vous et vous suit (<b>Suivre</b>) ; le deuxième tourne la carte dans la direction où vous regardez (<b>Boussole</b>). Si vous déplacez la carte avec le doigt, elle cesse de vous suivre. La flèche <b>N</b> remet le nord en haut.</li>
<li><b>GPS</b> (en haut à droite) : plus il y a de barres, meilleur est le signal. Le nombre, par exemple ±4 m, indique la marge d’erreur possible de votre position. Touchez-le pour voir les détails.</li>
<li><b>Barre de coordonnées</b> (en bas) : vos coordonnées actuelles. Touchez-la pour changer de format.</li>
<li><b>Appuyez longuement sur la carte</b> pour voir les coordonnées de ce lieu, y naviguer, l’enregistrer comme point ou copier ses coordonnées.</li>
<li><b>Touchez une ligne ou un point</b> d’une couche pour voir ses données et ce que vous pouvez faire : le suivre, le parcourir ou le modifier.</li>
<li><b>Menu</b> (en haut à gauche) : ouvrir des fichiers, planifier, mes points, état du GPS, paramètres et cette aide.</li>
</ul>
<p>Sans réseau, tout fonctionne avec vos propres cartes et données. Seuls les fonds de carte en ligne ont besoin d’internet.</p>

<h4 id="help-geotiff">Charger votre propre carte (GeoTIFF)</h4>
<p>Toute image géoréférencée <b>.tif/.tiff</b> convient : l’orthophoto d’un drone, une carte scannée et géoréférencée ou un modèle d’élévation.</p>
<p>Touchez Menu → <b>Ouvrir une carte ou des données</b> (ou <b>Ouvrir un fichier</b> dans l’encadré « Chargez votre carte ») et choisissez le fichier. Vous pouvez aussi l’ouvrir depuis Fichiers, Drive, l’e-mail ou une messagerie avec « Ouvrir avec » ou « Partager » → Mapa de Campo. L’app en garde une copie sur le téléphone : elle fonctionne hors ligne et la retrouve la fois suivante.</p>
<p>Si le fichier n’indique pas son système de coordonnées, l’app vous demande de le choisir (voir « Systèmes de coordonnées »). Dans <b>Couches</b>, touchez le nom de la couche pour changer sa transparence ou, si la carte paraît décalée, son système de coordonnées. Un modèle d’élévation peut s’afficher en gris ou avec des couleurs de relief.</p>
<p class="muted small"><b>Si une grande carte est lente</b>, convertissez-la en COG (GeoTIFF optimisé pour le cloud) : avec des tuiles internes et des vues réduites, l’app ne lit que la partie affichée. Dans QGIS : Exporter → Enregistrer sous…, format COG. Avec GDAL :<code>gdal_translate entree.tif sortie_cog.tif -of COG -co COMPRESS=JPEG -co QUALITY=85</code>Pour un modèle d’élévation, remplacez les options JPEG par <code>-co COMPRESS=DEFLATE -co PREDICTOR=2</code> Dans le projet EARTH, le script facultatif <i>preparar_cog.py</i> fait la même chose.</p>
<p class="note info">Pour l’Universidad EARTH (facultatif) : si vous avez choisi « À la Universidad EARTH » au démarrage, l’app contient deux orthophotos officielles de l’IGN, utilisables hors ligne : toute l’université (0,5 m, photos de 2015) et le cœur du campus (~0,12 m). Si vous en retirez une, Paramètres la propose de nouveau.</p>

<h4 id="help-vector">Charger des lignes et des points (KML/KMZ, GeoJSON, GPX, CSV)</h4>
<p>Utilisez le même bouton : Menu → <b>Ouvrir une carte ou des données</b>. L’app accepte les fichiers de Google Earth (KML/KMZ), de QGIS et d’autres logiciels de cartographie (GeoJSON), des GPS de poche (GPX) et les tableaux enregistrés en CSV ou TXT.</p>
<p><b>Tableaux CSV :</b> une ligne par point, avec des colonnes séparées par des virgules ou des points-virgules. Les CSV d’Excel avec point-virgule et virgule décimale fonctionnent aussi. Les colonnes peuvent être la latitude et la longitude, ou l’est et le nord en mètres, avec ou sans en-tête ; les noms de colonnes sont reconnus en français, anglais, espagnol et portugais. Si des virgules séparent les colonnes, utilisez le point pour les décimales. Exemple :</p>
<code>nom,lat,lon,note
P1,-1.29210,36.82190,puits
P2,-1.29245,36.82230,clôture</code>
<p>Si les coordonnées sont en mètres, l’app vous demande le système de coordonnées. Sans en-tête, elle accepte aussi l’ordre Nom,N,E,Z,Code des carnets RTK comme SingularPad.</p>

<h4 id="help-mark">Marquer des points, enregistrer une trace et mesurer</h4>
<ul>
<li><b>Marquer</b> enregistre votre position avec un nom (Point 1, Point 2…). Si la dernière position date de plus de 10 s ou si le GPS indique plus de ±15 m, l’app vous prévient et propose <b>Moyenner</b> : elle combine 60 s de lectures pour un point plus exact.</li>
<li>Pour enregistrer un autre lieu, appuyez longuement sur la carte et choisissez <b>Enregistrer dans Mes points</b>.</li>
<li>Menu → <b>Mes points</b> : affichez, renommez ou supprimez vos points, naviguez vers l’un d’eux ou exportez-les. À partir de 3 points, vous pouvez les utiliser comme coins d’un plan.</li>
<li><b>Trace</b> ouvre le panneau de la trace : touchez <b>Commencer l’enregistrement</b>. L’enregistrement continue écran éteint (Android affiche une notification) jusqu’à ce que vous touchiez <b>Arrêter</b>. Si vous reprenez un enregistrement arrêté, un nouveau segment commence, sans ligne droite par-dessus l’interruption. À la fin, vous pouvez exporter la trace en GPX ou l’enregistrer comme couche.</li>
<li><b>Mesurer</b> : choisissez <b>Distance</b> ou <b>Surface</b>, touchez la carte à chaque point, puis <b>Terminé</b>. <b>Défaire</b> retire le dernier point. Le résultat reste dans la barre (une distance s’affiche avec son azimut) ; <b>Nouvelle mesure</b> recommence et <b>Fermer</b> quitte.</li>
</ul>
<p class="muted small">Les mesures sont des mètres réels sur le terrain : elles sont calculées sur l’ellipsoïde WGS 84 (plan de Mercator transverse local, formule inverse de Vincenty), et non sur la projection de la carte.</p>

<h4 id="help-follow">Suivre une ligne</h4>
<p>Touchez une ligne sur la carte → <b>Suivre cette ligne</b> (ou <b>Suivre dans le sens inverse</b>). Pour longer le bord d’une surface, touchez la surface → <b>Suivre le contour</b>. Le panneau en bas de l’écran vous guide :</p>
<ul>
<li><b>Corrigez</b> : à quelle distance vous êtes de la ligne et de quel côté aller.</li>
<li><b>Virage dans</b> : la distance jusqu’au prochain virage. <b>Reste</b> (sur les écrans larges) : ce qui reste jusqu’à la fin.</li>
<li>Une phrase vous dit quoi faire, par exemple « Allez 2 m vers la droite ».</li>
<li><b>Barre de guidage</b> : le point, c’est vous ; le trait central est la ligne. La zone verte signifie que tout va bien ; les repères fins marquent votre alerte d’écart et la zone hachurée est au-delà. Le point porte ✓, ! ou ✕ : inutile de distinguer les couleurs. Si vous sortez de la ligne, le panneau devient rouge et le téléphone vibre.</li>
</ul>
<p>Touchez le nom de l’itinéraire pour ouvrir <b>Détails</b> : progression, précision du GPS, <b>Me situer sur l’itinéraire</b> et <b>Inverser le sens</b>. Avec des lignes parallèles proches (par exemple tous les 5 m), l’app compare votre position seulement avec le tronçon actuel et ses voisins, pour que l’erreur du GPS ne la fasse pas sauter de ligne. Si vous changez de ligne exprès, touchez <b>Me situer sur l’itinéraire</b>. Si vous marchez dans le mauvais sens, le panneau vous prévient et propose d’inverser le sens.</p>
<p>Si le signal GPS est perdu, très imprécis ou seulement approximatif, le guidage se met en pause (les nombres affichent « — ») et la phrase indique quoi faire. Si la flèche devient grise et demande d’étalonner la boussole, faites un 8 en l’air avec le téléphone.</p>
<p><b>Arrêter</b> termine la navigation et demande une confirmation si la progression risque d’être perdue. Si Android ferme l’app, elle reprend là où vous en étiez quand vous la rouvrez. La distance de l’alerte d’écart se règle dans Paramètres → Navigation.</p>

<h4 id="help-points">Parcourir des points (implantation)</h4>
<p>Pour aller à un seul endroit, touchez un point, ou appuyez longuement n’importe où sur la carte, et choisissez <b>Naviguer jusqu’ici</b>. Une flèche et la distance vous y conduisent.</p>
<p>Pour visiter dans l’ordre tous les points d’une couche (échantillons, piquets, une grille), touchez le point de départ → <b>Parcourir les points à partir d’ici</b>. Les points sont triés par leur <i>id</i> ou par leur nom.</p>
<ul>
<li>Quand vous entrez dans le <b>rayon d’arrivée</b>, le téléphone vibre, le point passe au vert et l’app passe au suivant. L’arrivée n’est détectée seule que si le GPS est à ±8 m ou mieux ; sinon, touchez <b>J’y suis</b>.</li>
<li>Les flèches ← et → passent au point précédent ou suivant.</li>
<li>Au dernier point, l’app indique ceux qui manquent. Les points visités sont gardés en mémoire même si Android ferme l’app.</li>
</ul>
<p class="muted small">Le rayon d’arrivée et le passage automatique au point suivant se règlent dans Paramètres → Navigation.</p>

<h4 id="help-plan">Planifier des lignes ou une grille</h4>
<p>Menu → <b>Planifier</b> prépare des lignes ou des points pour couvrir un terrain à pied, comme un plan de vol de drone. Suivez les étapes du panneau :</p>
<ol>
<li><b>Zone du plan.</b> Touchez <b>Dessiner la zone</b>, touchez chaque coin sur la carte, puis <b>Finir la surface</b> ; <b>Retirer un coin</b> supprime le dernier. Vous pouvez aussi toucher une surface déjà chargée (KML, KMZ ou GeoJSON) → <b>Planifier des lignes ou une grille ici</b>, ou toucher <b>Utiliser mes points</b> après avoir parcouru les coins et les avoir marqués avec <b>Marquer</b>.</li>
<li><b>Type de plan.</b> <b>Lignes en serpentin</b> : des lignes parallèles parcourues en aller-retour. <b>Grille de points</b> : des points régulièrement espacés, numérotés P001, P002… dans l’ordre de marche. <b>Lignes croisées</b> : deux passages croisés à 90°.</li>
<li><b>Mesures.</b> Saisissez l’espacement entre les lignes et entre les points, ou touchez une valeur rapide. Avec <b>Grille carrée</b>, les deux valeurs changent ensemble. La marge laisse une bande libre le long du bord.</li>
<li><b>Direction et départ.</b> <b>Automatique</b> place les lignes parallèlement au côté le plus long ; <b>Manuelle</b> utilise les degrés que vous saisissez, depuis le nord géographique et dans le sens horaire. <b>Pivoter de 90°</b> croise les lignes. Dans <b>Où commence le plan</b>, choisissez le coin de départ.</li>
</ol>
<p><b>Plus d’options</b> contient le placement des points, ainsi que la vitesse de marche et les secondes à chaque point pour estimer le temps. En bas, le panneau affiche le résumé (lignes, mètres, points et temps à pied) et les boutons <b>Enregistrer</b> et <b>Enregistrer et suivre</b>. Si le plan comporte des lignes avec des points, l’app vous demande si vous voulez suivre les lignes ou aller de point en point.</p>
<p>Formes difficiles : les trous (un bâtiment, un étang) sont exclus du plan. Une surface en L ou en U est couverte en plusieurs parties, pour ne pas sortir de la zone à chaque ligne. Si le contour se croise lui-même, l’app vous prévient ; si vous touchez quatre coins dans le désordre, elle les remet dans l’ordre.</p>
<p>Un plan enregistré devient des couches que vous pouvez suivre, parcourir et modifier : par exemple, déplacez ou supprimez un point qui tombe dans un canal, puis utilisez Modifier → <b>Plus</b> → <b>Renuméroter les points…</b>. <b>Exporter…</b> propose GeoJSON, KML, GPX, CSV des points et CSV pour le carnet RTK SingularPad (au Costa Rica, aussi en CRTM05).</p>
<p class="muted small"><b>Quel espacement utiliser à pied ?</b> À titre de référence, le manuel d’irrigation de la FAO (Module 2, 2002) utilise des grilles de 10–50 m pour l’irrigation de surface et de 25–100 m pour l’aspersion, et juge adaptée une grille de 20 × 20 m pour concevoir une irrigation ; plus dense sur les pentes ou les terrains irréguliers.</p>
<p class="muted small"><b>Pour les drones :</b> le <b>Calculateur pour drone</b> utilise la caméra, la hauteur et les recouvrements pour calculer la taille du pixel au sol (GSD), la surface couverte par chaque photo et l’espacement entre les lignes et entre les photos (formule de Pix4D). L’app ne pilote pas le drone : exportez le <b>KML de la zone seule</b>, importez-le dans DJI Pilot 2 ou Pix4Dcapture et utilisez l’espacement calculé. Attention : DJI GS Pro mesure la direction depuis l’est, dans le sens antihoraire.</p>

<h4 id="help-edit">Modifier les couches</h4>
<p>Touchez <b>Modifier</b> (ou Menu → <b>Modifier les couches</b>) et choisissez une couche, ou créez une <b>Nouvelle couche</b> de points, de lignes, de surfaces ou mixte. Vous pouvez aussi toucher une entité sur la carte → <b>Modifier cette entité</b>.</p>
<p>La barre de modification affiche toujours <b>Défaire</b>, le nom de la couche avec son état (<b>Enregistré</b>), <b>Plus</b> et <b>Terminé</b>, qui enregistre et quitte. En dessous, une phrase indique quoi toucher, et les boutons changent selon ce que vous faites. Un bouton à bordure en pointillés n’est pas encore utilisable : touchez-le et l’app vous explique pourquoi.</p>
<ul>
<li><b>Ajouter un point :</b> touchez <b>Point</b>, puis la carte. <b>Sur ma position</b> le place là où vous êtes ; <b>GPS précis</b> fait la moyenne du GPS pendant quelques secondes et affiche la progression et le ± (<b>Valider</b> ou <b>Annuler</b>). Dans <b>Plus</b> : <b>Saisir des coordonnées…</b> (degrés, degrés-minutes-secondes ou UTM) et <b>Point à une distance et un azimut…</b> depuis un point, votre position ou le centre de la carte.</li>
<li><b>Dessiner une ligne ou une surface :</b> touchez <b>Ligne</b> ou <b>Surface</b>, puis chaque point ou coin. <b>Point GPS</b> ajoute votre position actuelle. <b>Tracer en marchant</b> ajoute un point à intervalles de quelques mètres pendant que vous marchez (par exemple, le bord d’une parcelle) ; pendant ce temps, toucher la carte n’ajoute pas de point, et <b>Pause</b> l’arrête. Terminez avec <b>Finir la ligne</b> ou <b>Finir la surface</b> ; <b>Abandonner</b> supprime le dessin.</li>
<li><b>Changer quelque chose :</b> touchez <b>Choisir</b>, puis l’entité. Avec <b>Remodeler</b>, faites glisser les points blancs ; les points gris, au milieu de chaque côté, ajoutent un coin ; pour en retirer un, touchez <b>Retirer un coin</b>, puis le coin. <b>Déplacer</b> fait glisser l’entité entière ; <b>À ma position</b> amène un point sur votre position GPS ; <b>Supprimer</b> l’efface.</li>
<li><b>Données :</b> nom, code, notes et les champs que vous ajoutez (leurs noms peuvent utiliser les lettres de n’importe quelle langue). Ce que vous saisissez est enregistré à la fermeture de la fiche. Vous y trouvez aussi <b>Couper la ligne…</b>, <b>Inverser le sens</b>, <b>Dupliquer</b> et <b>Ajouter un champ</b>. Le groupe <b>Infos du relevé</b> montre ce que l’app a noté : date, origine et précision.</li>
<li><b>Plusieurs à la fois :</b> dans <b>Plus</b>, activez <b>Choisir plusieurs</b> : chaque toucher ajoute ou retire une entité. Ensuite, déplacez-les, donnez-leur la même valeur ou supprimez-les ensemble.</li>
<li><b>Aimant :</b> dans <b>Plus</b> → <b>Options</b>. Ce que vous dessinez ou faites glisser s’accroche aux coins et aux bords proches des couches visibles ; sa force peut être faible, moyenne ou forte.</li>
</ul>
<p>Avec le GPS, l’app n’utilise jamais une position trop ancienne. Si la précision est moins bonne que votre limite (10 m ; réglable dans <b>Plus</b> → <b>Options</b>), elle affiche le ± et propose <b>Annuler</b>, <b>Moyenner</b> ou <b>Enregistrer quand même</b>.</p>
<p>Les modifications s’enregistrent seules, et <b>Défaire</b> revient jusqu’à 40 étapes en arrière en indiquant ce qui a été annulé. Si l’enregistrement échoue (par exemple, faute d’espace), la modification reste ouverte pour ne rien perdre. Une couche KML, GPX ou CSV est enregistrée en copie GeoJSON modifiable la première fois que vous la changez. Avant de retirer une couche créée ou modifiée dans l’app, exportez-la : <b>Plus</b> → <b>Exporter cette couche…</b>.</p>

<h4 id="help-basemaps">Fonds de carte en ligne</h4>
<p>Dans <b>Couches</b>, choisissez le fond de carte en ligne : OpenStreetMap, Google (satellite, satellite avec rues et noms, rues ou relief) ou vos propres cartes XYZ. Ils ont tous besoin d’internet. Pour travailler sans réseau, choisissez « Sans fond de carte » et utilisez vos propres cartes (GeoTIFF).</p>
<p><b>Cartes XYZ, comme dans QGIS.</b> Dans Couches, touchez <b>Ajouter un fond de carte XYZ</b> et collez la même URL que dans QGIS (Explorateur → XYZ Tiles → Nouvelle connexion), avec {x}, {y} et {z} ; {-y}, {q}, {s} et les sous-domaines {a-c} ou {0-3} fonctionnent aussi. L’app accepte également la « source » d’une couche XYZ de QGIS (Propriétés → Information : <i>type=xyz&amp;url=…</i>) et le fichier XML que QGIS crée avec « Enregistrer les connexions » : ouvrez-le avec Menu → <b>Ouvrir une carte ou des données</b> et l’app ajoute toutes ses connexions. https:// uniquement (Android bloque http://). Au-delà du zoom maximal, l’app agrandit la dernière image disponible.</p>
<p>À part OpenStreetMap et Google, l’app ne fournit aucun serveur : c’est vous qui ajoutez les cartes XYZ et qui devez respecter leurs conditions. Par exemple, Google n’autorise ses images que par la Map Tiles API, qui correspond à l’option « Google » de la liste.</p>
<p><b>Google</b> exige votre propre clé Google Maps Platform, avec la <b>Map Tiles API</b> activée et la facturation active (un quota mensuel gratuit est inclus). Créez-la sur console.cloud.google.com → API et services → Identifiants, activez « Map Tiles API », limitez la clé à cette API et saisissez-la dans Couches. La clé est enregistrée uniquement sur le téléphone. Les conditions de Google imposent d’afficher son logo et l’attribution (l’app le fait) et <b>n’autorisent pas à enregistrer ses images pour les utiliser hors ligne</b>, ni à décalquer (numériser) des routes, des bâtiments ou d’autres objets à partir de ces images, ni à afficher Google avec un autre fond de carte. Quota gratuit : 100 000 tuiles par mois (limite par défaut : 15 000 par jour et par projet) ; fixez un plafond quotidien pour la clé. La carte Google s’affiche dans la langue de l’app.</p>

<h4 id="help-crs">Systèmes de coordonnées partout dans le monde</h4>
<p>Le GPS donne la latitude et la longitude (WGS 84). Beaucoup de cartes et de tableaux utilisent plutôt des mètres dans un système projeté : UTM ou le système national d’un pays. L’app contient plus de 280 systèmes : WGS 84, toutes les zones UTM (avec WGS 84, SIRGAS 2000, ETRS89, NAD83, GDA et d’autres datums) et des systèmes nationaux de nombreux pays.</p>
<p>Si un fichier n’indique pas son système, l’app vous demande de le choisir et place en tête les plus probables : celui qu’indique le fichier, ceux qui placent les données près de vous (ou du centre de la carte) et ceux qu’on utilise là où vous êtes. Cherchez par pays, nom, zone UTM (par exemple 33N) ou code EPSG. Quand vous en choisissez un, l’app montre où tomberait le premier point et à quelle distance de vous ; touchez ensuite <b>Utiliser ce système</b>. Si vous ne savez pas lequel choisir, demandez à la personne qui vous a donné le fichier ; des nombres de 6 ou 7 chiffres sont généralement en UTM.</p>
<p>Si une carte paraît décalée, touchez son nom dans Couches et changez son système de coordonnées.</p>
<p><b>Système personnalisé :</b> si votre système n’est pas dans la liste, touchez <b>Coller une définition PROJ</b> et collez la définition d’epsg.io (format PROJ.4) ou de QGIS (Propriétés de la couche → Information). Si vous lui donnez son code EPSG, l’app reconnaîtra seule les prochains fichiers qui utilisent ce code. Les définitions qui ont besoin d’un fichier de grille (+nadgrids) ne fonctionnent pas hors ligne : cherchez sur epsg.io la version avec +towgs84.</p>
<p>La barre de coordonnées et Paramètres → <b>Format des coordonnées</b> proposent les degrés décimaux, les degrés-minutes-secondes et l’UTM.</p>
<p class="note info">Costa Rica uniquement : CRTM05 est la projection officielle. Depuis 2018, le datum officiel est CR-SIRGAS (EPSG:8908) ; l’ancien CR05 (EPSG:5367) en diffère jusqu’à ~10 cm. Les projections Lambert Nord et Lambert Sud des anciennes cartes (datum Ocotepeque 1935, EPSG:5456/5457) sont aussi reconnues. Les options CRTM05 n’apparaissent que pour des données ou des positions situées au Costa Rica.</p>

<h4 id="help-accuracy">Précision : téléphone ou RTK</h4>
<p>La valeur ± et le cercle bleu autour de votre position correspondent au rayon à <b>68 %</b> que fournit Android : votre position réelle se trouve dans le cercle environ 2 fois sur 3. À ciel ouvert, un téléphone atteint en général 3–5 m ; sous les arbres ou près des bâtiments, bien moins. La première position peut prendre de 30 s à quelques minutes.</p>
<p>Un téléphone <b>n’est pas un RTK</b> : il sert à s’orienter, à retrouver des points et à cartographier à quelques mètres près, pas à poser des limites de propriété ni à implanter au centimètre. Pour cela, mesurez avec un récepteur RTK et servez-vous de cette app pour vous orienter.</p>
<p><b>Récepteur externe (RTK ou GNSS) :</b> si le récepteur, ou une app NTRIP ou Bluetooth, publie sa position comme <i>position fictive</i> d’Android (Options pour les développeurs → Sélectionner l’application de position fictive), Mapa de Campo l’utilise automatiquement et l’indique comme récepteur externe dans <b>État du GPS</b>.</p>
<p>Si Android ne donne qu’une position approximative (environ 2 km), activez « Utiliser la position exacte » dans les autorisations de l’app.</p>

<h4 id="help-heights">Hauteurs</h4>
<p>La hauteur du GPS est <b>ellipsoïdale</b> (h, au-dessus de l’ellipsoïde WGS 84) : ce n’est pas l’altitude au-dessus du niveau de la mer (H) des cartes. Les deux sont liées par H = h − N, où N est l’ondulation du géoïde ; N change d’un lieu à l’autre et peut atteindre plusieurs dizaines de mètres.</p>
<p class="muted small">Exemple (Universidad EARTH, Costa Rica) : N ≈ 11,5 m (EGM2008), donc la hauteur du GPS dépasse d’environ 11,5 m l’altitude des cartes.</p>
<p>Quand Android la fournit, <b>État du GPS</b> affiche aussi l’altitude au-dessus du niveau moyen de la mer, et le CSV de Mes points contient les deux (colonnes h_elip_m et H_nmm_m). Vérifiez toujours la référence verticale avant de comparer des hauteurs.</p>

<h4 id="help-export">Exporter et partager</h4>
<ul>
<li><b>Mes points</b> (Menu) : GPX, GeoJSON ou CSV avec latitude, longitude et UTM (au Costa Rica, aussi CRTM05).</li>
<li><b>Trace</b> (Menu → <b>Enregistrer une trace</b>) : GPX, ou enregistrez-la comme couche.</li>
<li><b>Une couche</b> : Modifier → <b>Plus</b> → <b>Exporter cette couche…</b> : GeoJSON, KML (Google Earth), GPX, CSV des points ou CSV pour SingularPad.</li>
<li><b>Un plan</b> : <b>Exporter…</b> dans le panneau du plan.</li>
</ul>
<p>Android vous demande où enregistrer le fichier. Le contenu utilise le point décimal et des noms de colonnes fixes, pour que n’importe quel logiciel puisse le lire dans n’importe quelle langue. Vos données ne quittent le téléphone que lorsque vous les exportez.</p>

<h4 id="help-settings">Paramètres</h4>
<p>Dans Menu → <b>Paramètres</b> :</p>
<ul>
<li><b>Langue</b> : celle du téléphone (automatique), Español, English, Français ou Português. L’app se rouvre dans la langue choisie.</li>
<li><b>Thème</b> : <b>Automatique</b>, <b>Clair</b>, <b>Sombre</b> ou <b>Soleil</b>, avec un contraste maximal pour lire en plein soleil.</li>
<li><b>Taille du texte</b> : <b>Auto</b> suit la taille de police du téléphone ; de A− à A+++, plus petit ou plus grand.</li>
<li><b>Grands boutons (pour travailler avec des gants)</b>.</li>
<li><b>Unités</b> : métriques (m, km, ha) ou impériales (ft, mi, ac). Elles ne changent que l’affichage des mesures ; ce que vous saisissez dans les champs reste en mètres.</li>
<li>Aussi : le format des coordonnées, les noms des points sur la carte et l’écran allumé pendant la navigation ou l’enregistrement.</li>
<li><b>Navigation</b> : rayon d’arrivée, alerte d’écart, passage automatique au point suivant et vibration.</li>
<li><b>Enregistrer une trace</b> : distance minimale entre les points et positions écartées pour mauvaise précision.</li>
<li><b>Entraînement</b> : simulez un parcours le long de la ligne que vous suivez, pour vous entraîner sans sortir (touchez d’abord une ligne → <b>Suivre cette ligne</b>). Pour EARTH (facultatif) : données d’exemple et orthophotos.</li>
</ul>
<p class="muted small">Les champs numériques acceptent la virgule ou le point décimal.</p>

<h4 id="help-problems">Si quelque chose ne fonctionne pas</h4>
<ul>
<li><b>Ma position n’apparaît pas :</b> touchez <b>Ma position</b> et autorisez la localisation. Vérifiez que la localisation du téléphone est activée et allez à ciel ouvert.</li>
<li><b>La carte paraît décalée</b> par rapport à votre position ou à d’autres couches : changez le système de coordonnées de la couche (touchez son nom dans Couches).</li>
<li><b>Un GeoTIFF est lent ou l’app se ferme :</b> convertissez-le en COG ou découpez-le sur votre zone de travail (voir « Charger votre propre carte »).</li>
<li><b>Le fond de carte reste vide :</b> il n’y a pas d’internet ou, avec Google, la clé ou la facturation ne fonctionne pas. Sans réseau, utilisez vos propres cartes.</li>
<li><b>La flèche indique une mauvaise direction :</b> étalonnez la boussole en faisant un 8 en l’air avec le téléphone, loin des objets métalliques.</li>
</ul>`,
};
