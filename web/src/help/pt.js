// Ayuda, créditos, biografía y datos de «Acerca de» en portugués de Brasil.
// Misma estructura que es.js: mismas claves, mismos <h4> (con sus id) y mismos enlaces.
// Los nombres de botones en <b> siguen las traducciones de las tablas de src/i18n.
import {AUTHOR} from '../author.js';
import {GOOGLE_TERMS, GOOGLE_PRIVACY} from '../basemap.js';

export default {
  credit: `<p class="credit">Criado por <b>${AUTHOR}</b> · Universidad EARTH, Costa Rica</p>`,

  bio: `
<h4>Sobre a autoria</h4>
<p><b>${AUTHOR}</b> é estudante da Universidad EARTH (Costa Rica, turma 2023–2026) e trabalha com
Sistemas de Informação Geográfica (SIG) e posicionamento GNSS RTK aplicados ao trabalho de campo.
Projetou o levantamento topográfico RTK do campo esportivo da EARTH: rotas em serpentina, coordenadas em
CRTM05 / CR-SIRGAS e processamento com Python e GDAL. Ministra a aula introdutória de RTK na EARTH
e em 2027 começa o Mestrado em Ciências (M.Sc.) em Engenharia de Biorrecursos na Universidade McGill (Canadá).</p>
<p class="muted small">O Mapa de Campo nasceu desse trabalho: uma ferramenta para que estudantes carreguem seus próprios
mapas e sigam suas linhas de levantamento no terreno.</p>`,

  about: `<h4>Componentes de código aberto</h4>
    <ul class="small"><li>OpenLayers 10.11 (BSD 2-Clause) — openlayers.org</li><li>geotiff.js (MIT) — github.com/geotiffjs/geotiff.js</li><li>proj4js 2.22 (MIT) — github.com/proj4js/proj4js</li><li>fflate (MIT) — github.com/101arrowz/fflate</li></ul>
    <h4>Dados</h4><ul class="small"><li>Definições dos sistemas de coordenadas: registro EPSG (IOGP), obtidas do PROJ/GDAL e do epsg.io.</li><li>Mapa base opcional: © OpenStreetMap contributors (ODbL), só com internet.</li><li>Mapas base XYZ adicionados pelo usuário: o app não inclui nenhum; cada um segue as condições do seu provedor.</li><li>Mapa base opcional: Google Maps (Map Tiles API, com a chave do usuário e só com internet). Aplicam-se os <a href="${GOOGLE_TERMS}">Termos de Serviço Adicionais do Google Maps</a> e a <a href="${GOOGLE_PRIVACY}">Política de Privacidade do Google</a>.</li><li>Dados de demonstração: rota em serpentina de 5 m sobre o campo esportivo da Universidad EARTH (polígono do OpenStreetMap, via 1029347440).</li><li>Ortofotos da EARTH incluídas: Ortofoto 1:5000 2014-2017 (toda a universidade, fotos de 2015, 0,5 m) e Ortofoto 1:1000 2015-2018 (núcleo do campus, ~0,12 m) © Registro Nacional – Instituto Geográfico Nacional (IGN), Costa Rica, via SNIT. «Su uso tendrá carácter libre y gratuito, siempre que se mencione el origen y propiedad de los datos.» (Uso livre e gratuito, desde que se mencionem a origem e a propriedade dos dados.)</li><li>Limite da Universidad EARTH: © OpenStreetMap contributors (ODbL), via 321376631.</li></ul>`,

  privacy: `<h4>Privacidade</h4>
<p><b>O Mapa de Campo não coleta dados pessoais.</b> O app não tem servidores, nem contas, nem publicidade, nem estatísticas de uso, nem relatórios de erro automáticos.</p>
<ul>
<li><b>Localização.</b> O GPS é usado só dentro do celular: para mostrar sua posição, marcar pontos, medir, gravar trilhas e guiar você. Ao gravar uma trilha com a tela desligada, o Android mostra uma notificação enquanto a gravação durar. O app não envia sua posição para ninguém.</li>
<li><b>Seus arquivos.</b> Os mapas e dados que você importa, os pontos, as trilhas e as camadas que você edita ficam salvos só na memória interna do app. Eles saem do celular apenas quando você os exporta ou compartilha.</li>
<li><b>Mapas base on-line (opcionais).</b> Se você ativar o OpenStreetMap, o Google ou um mapa XYZ, o celular pede a esse serviço as imagens da área que você está vendo; esse serviço recebe seu endereço IP e as coordenadas dessas imagens, conforme a própria política de privacidade. A chave do Google que você digitar fica salva só no celular e é enviada só ao Google. Sem mapa base on-line, o app funciona sem internet.</li>
<li><b>Permissões.</b> Localização (posição GPS), notificações (aviso de gravação), internet (só para os mapas base on-line) e vibração (avisos de navegação).</li>
</ul>
<p>Ao desinstalar o app, o Android apaga todos os seus dados. Para dúvidas, use o contato do desenvolvedor na página do app no Google Play.</p>`,

  help: `
<h4 id="help-quick">Guia rápido</h4>
<p>O Mapa de Campo mostra onde você está nos seus próprios mapas, mesmo sem internet.</p>
<ul>
<li><b>Camadas</b>: veja, oculte e ordene seus mapas e dados, abra arquivos e escolha um mapa base on-line.</li>
<li><b>Marcar</b>: salva um ponto onde você está, com a precisão do GPS. Seus pontos ficam em Menu → <b>Meus pontos</b>.</li>
<li><b>Gravar</b>: grava o caminho que você percorre. Durante a gravação, o botão fica vermelho e mostra a distância.</li>
<li><b>Medir</b>: mede uma distância ou uma área tocando no mapa.</li>
<li><b>Editar</b>: desenhe, mova ou exclua pontos, linhas e áreas de uma camada.</li>
<li><b>Minha localização</b> (o botão redondo): o primeiro toque centraliza o mapa em você e passa a seguir você (<b>Seguir</b>); o segundo gira o mapa para onde você está olhando (<b>Bússola</b>). Se você mover o mapa com o dedo, ele para de seguir você. A seta <b>N</b> volta o norte para cima.</li>
<li><b>GPS</b> (no alto, à direita): mais barras, sinal melhor. O número, por exemplo ±4 m, diz quanto sua posição pode errar. Toque nele para ver os detalhes.</li>
<li><b>Barra de coordenadas</b> (embaixo): suas coordenadas atuais. Toque nela para mudar o formato.</li>
<li><b>Toque e segure no mapa</b> para ver as coordenadas desse lugar, navegar até lá, salvá-lo como ponto ou copiar as coordenadas.</li>
<li><b>Toque em uma linha ou em um ponto</b> de uma camada para ver os dados e o que você pode fazer: seguir, percorrer ou editar.</li>
<li><b>Menu</b> (no alto, à esquerda): abrir arquivos, planejar, meus pontos, status do GPS, configurações e esta ajuda.</li>
</ul>
<p>Sem sinal, tudo funciona com seus próprios mapas e dados. Só os mapas base on-line precisam de internet.</p>

<h4 id="help-geotiff">Carregar seu próprio mapa (GeoTIFF)</h4>
<p>Serve qualquer imagem georreferenciada <b>.tif/.tiff</b>: a ortofoto de um drone, um mapa escaneado e georreferenciado ou um modelo de elevação.</p>
<p>Toque em Menu → <b>Abrir um mapa ou dados</b> (ou em <b>Abrir arquivo</b> no aviso inicial) e escolha o arquivo. Você também pode abri-lo pelo app Arquivos, pelo Drive, pelo e-mail ou por um app de mensagens com “Abrir com” ou “Compartilhar” → Mapa de Campo. O app guarda uma cópia no celular: funciona off-line e continua lá da próxima vez.</p>
<p>Se o arquivo não disser em que sistema de coordenadas está, o app pede que você o escolha (veja “Sistemas de coordenadas”). Em <b>Camadas</b>, toque no nome da camada para mudar a transparência ou, se o mapa aparecer deslocado, o sistema de coordenadas. Um modelo de elevação pode ser exibido em cinza ou com cores de relevo.</p>
<p class="muted small"><b>Se um mapa grande ficar lento</b>, converta-o para COG (GeoTIFF otimizado para a nuvem): com blocos internos e visões reduzidas, o app lê só a parte que aparece na tela. No QGIS: Exportar → Salvar como…, formato COG. Com o GDAL:<code>gdal_translate entrada.tif saida_cog.tif -of COG -co COMPRESS=JPEG -co QUALITY=85</code>Para um modelo de elevação, troque as opções JPEG por <code>-co COMPRESS=DEFLATE -co PREDICTOR=2</code> No projeto EARTH, o script opcional <i>preparar_cog.py</i> faz o mesmo.</p>
<p class="note info">Para a Universidad EARTH (opcional): se você escolheu “Na Universidad EARTH” ao começar, o app traz duas ortofotos oficiais do IGN que funcionam off-line: toda a universidade (0,5 m, fotos de 2015) e o núcleo do campus (~0,12 m). Se você remover uma delas, Configurações a oferece de novo.</p>

<h4 id="help-vector">Carregar linhas e pontos (KML/KMZ, GeoJSON, GPX, CSV)</h4>
<p>Use o mesmo botão: Menu → <b>Abrir um mapa ou dados</b>. Servem arquivos do Google Earth (KML/KMZ), do QGIS e de outros programas de mapas (GeoJSON), de GPS de mão (GPX) e tabelas salvas como CSV ou TXT.</p>
<p><b>Tabelas CSV:</b> uma linha por ponto, com colunas separadas por vírgula ou por ponto e vírgula. O CSV do Excel com ponto e vírgula e vírgula decimal também serve. As colunas podem ser latitude e longitude, ou leste e norte em metros, com ou sem cabeçalho; os nomes das colunas são reconhecidos em português, espanhol, inglês e francês. Quando as colunas são separadas por vírgula, use ponto nos decimais. Exemplo:</p>
<code>nome,lat,lon,nota
P1,-1.29210,36.82190,poço
P2,-1.29245,36.82230,cerca</code>
<p>Se as coordenadas estiverem em metros, o app pergunta o sistema de coordenadas. Sem cabeçalho, ele também aceita a ordem Nome,N,E,Z,Código das cadernetas RTK como o SingularPad.</p>

<h4 id="help-mark">Marcar pontos, gravar uma trilha e medir</h4>
<ul>
<li><b>Marcar</b> salva sua posição com um nome (Ponto 1, Ponto 2…). Se a última posição tiver mais de 10 s ou o GPS indicar mais de ±15 m, o app avisa e oferece <b>Calcular média</b>: junta 60 s de leituras para um ponto mais exato.</li>
<li>Para salvar outro lugar, toque e segure no mapa e escolha <b>Salvar em Meus pontos</b>.</li>
<li>Menu → <b>Meus pontos</b>: veja, renomeie ou exclua seus pontos, navegue até um deles ou exporte-os. Com 3 pontos ou mais, você pode usá-los como cantos de um plano.</li>
<li><b>Gravar</b> abre o painel da trilha: toque em <b>Começar a gravar</b>. A gravação continua com a tela desligada (o Android mostra uma notificação) até você tocar em <b>Parar</b>. Se você continuar uma gravação parada, começa um trecho novo, sem uma linha reta por cima da interrupção. Ao terminar, você pode exportar a trilha como GPX ou salvá-la como camada.</li>
<li><b>Medir</b>: escolha <b>Distância</b> ou <b>Área</b>, toque no mapa em cada ponto e depois em <b>Concluir</b>. <b>Desfazer</b> tira o último ponto. O resultado fica na barra (uma distância vem com o azimute); <b>Medir outra</b> começa de novo e <b>Fechar</b> sai.</li>
</ul>
<p class="muted small">As medidas são metros reais no terreno: são calculadas sobre o elipsoide WGS 84 (plano transverso de Mercator local, inverso de Vincenty), não sobre a projeção do mapa.</p>

<h4 id="help-follow">Seguir uma linha</h4>
<p>Toque em uma linha no mapa → <b>Seguir esta linha</b> (ou <b>Seguir no sentido contrário</b>). Para caminhar pela borda de uma área, toque na área → <b>Percorrer o contorno</b>. O cartão embaixo guia você:</p>
<ul>
<li><b>Corrija</b>: a que distância você está da linha e para que lado ir.</li>
<li><b>Virar em</b>: quanto falta para a próxima curva. <b>Falta</b> (em telas largas): o que resta até o fim.</li>
<li>Uma frase diz o que fazer, por exemplo “Vá 2 m para a direita”.</li>
<li><b>Barra de guia</b>: o ponto é você e o traço do centro é a linha. A zona verde quer dizer que você está bem; as marcas finas são seu alerta de desvio e a zona hachurada fica além dele. O ponto leva ✓, ! ou ✕, então não é preciso distinguir cores. Se você sair da linha, o cartão fica vermelho e o celular vibra.</li>
</ul>
<p>Toque no nome da rota para abrir <b>Detalhes</b>: avanço, precisão do GPS, <b>Me localizar na rota</b> e <b>Inverter o sentido</b>. Com linhas paralelas próximas (por exemplo, a cada 5 m), o app compara sua posição só com o trecho atual e os vizinhos, para que o erro do GPS não o faça pular de linha. Se você mudar de linha de propósito, toque em <b>Me localizar na rota</b>. Se você andar no sentido contrário, o cartão avisa e oferece inverter o sentido.</p>
<p>Se o sinal do GPS sumir, ficar muito impreciso ou for só aproximado, o guia entra em pausa (os números mostram “—”) e a frase diz o que fazer. Se a seta ficar cinza e pedir para calibrar a bússola, faça um 8 no ar com o celular.</p>
<p><b>Parar</b> encerra a navegação e pede confirmação se o avanço for se perder. Se o Android fechar o app, ao abrir de novo ele continua de onde você parou. A distância do alerta de desvio é alterada em Configurações → Navegação.</p>

<h4 id="help-points">Percorrer pontos (locação)</h4>
<p>Para ir a um só lugar, toque em um ponto, ou toque e segure em qualquer lugar do mapa, e escolha <b>Navegar até aqui</b>. Uma seta e a distância levam você até lá.</p>
<p>Para visitar em ordem todos os pontos de uma camada (amostras, estacas, uma grade), toque no ponto onde quer começar → <b>Percorrer os pontos a partir daqui</b>. Os pontos são ordenados pelo <i>id</i> ou pelo nome.</p>
<ul>
<li>Ao entrar no <b>raio de chegada</b>, o celular vibra, o ponto fica verde e o app passa ao próximo. A chegada só é marcada sozinha se o GPS tiver ±8 m ou melhor; senão, toque em <b>Cheguei</b>.</li>
<li>As setas ← e → vão para o ponto anterior ou para o próximo.</li>
<li>No último ponto, o app diz quais faltam. Os pontos visitados ficam guardados mesmo se o Android fechar o app.</li>
</ul>
<p class="muted small">O raio de chegada e a passagem automática para o próximo ponto são alterados em Configurações → Navegação.</p>

<h4 id="help-plan">Planejar linhas ou uma grade</h4>
<p>Menu → <b>Planejar</b> prepara linhas ou pontos para percorrer um terreno a pé, como um plano de voo de drone. Siga os passos do painel:</p>
<ol>
<li><b>Área.</b> Toque em <b>Desenhar área</b>, toque em cada canto no mapa e depois em <b>Concluir área</b>; <b>Remover canto</b> apaga o último. Você também pode tocar em uma área já carregada (KML, KMZ ou GeoJSON) → <b>Planejar linhas ou grade aqui</b>, ou tocar em <b>Usar meus pontos</b> depois de caminhar pelos cantos e marcá-los com <b>Marcar</b>.</li>
<li><b>Tipo de plano.</b> <b>Linhas em serpentina</b>: linhas paralelas percorridas em ida e volta. <b>Grade de pontos</b>: pontos a distâncias iguais, numerados P001, P002… na ordem em que são percorridos. <b>Linhas cruzadas</b>: duas passadas cruzadas a 90°.</li>
<li><b>Medidas.</b> Digite o espaçamento entre linhas e entre pontos, ou toque em uma medida rápida. Com <b>Grade quadrada</b>, os dois valores mudam juntos. A margem deixa uma faixa livre junto à borda.</li>
<li><b>Direção e início.</b> <b>Automática</b> deixa as linhas paralelas ao lado mais comprido; <b>Manual</b> usa os graus que você digitar, a partir do norte verdadeiro e no sentido horário. <b>Girar 90°</b> cruza as linhas. Em <b>Onde o plano começa</b>, escolha o canto de início.</li>
</ol>
<p><b>Mais opções</b> tem a forma de colocar os pontos e, para calcular o tempo, a velocidade de caminhada e os segundos em cada ponto. Embaixo, o painel mostra o resumo (linhas, metros, pontos e tempo a pé) e os botões <b>Salvar</b> e <b>Salvar e seguir</b>. Se o plano tiver linhas com pontos, o app pergunta se você quer seguir as linhas ou ir de ponto em ponto.</p>
<p>Formas difíceis: os buracos (um prédio, um açude) ficam fora do plano. Uma área em forma de L ou de U é coberta em partes, para não cruzar por fora a cada linha. Se a borda se cruzar, o app avisa; se você tocar em quatro cantos fora de ordem, ele os ordena sozinho.</p>
<p>O plano salvo vira camadas que você pode seguir, percorrer e editar: por exemplo, mova ou exclua um ponto que caiu em um canal e depois use Editar → <b>Mais</b> → <b>Renumerar pontos…</b>. <b>Exportar…</b> oferece GeoJSON, KML, GPX, CSV de pontos e CSV para a caderneta RTK SingularPad (na Costa Rica, também em CRTM05).</p>
<p class="muted small"><b>Que espaçamento usar a pé?</b> Como referência, o manual de irrigação da FAO (Módulo 2, 2002) usa grades de 10–50 m para irrigação por superfície e de 25–100 m para aspersão, e considera adequada uma de 20 × 20 m para projetar irrigação; mais densa em encostas ou terreno irregular.</p>
<p class="muted small"><b>Para drone:</b> a <b>Calculadora para drone</b> usa a câmera, a altura e as sobreposições para calcular o tamanho do pixel no solo (GSD), a área coberta por cada foto e o espaçamento entre linhas e entre fotos (fórmula da Pix4D). O app não controla o drone: exporte o <b>KML só da área</b>, importe-o no DJI Pilot 2 ou no Pix4Dcapture e use o espaçamento calculado. Atenção: o DJI GS Pro mede a direção a partir do leste e no sentido anti-horário.</p>

<h4 id="help-edit">Editar camadas</h4>
<p>Toque em <b>Editar</b> (ou Menu → <b>Editar camadas</b>) e escolha uma camada, ou crie uma <b>Nova camada</b> de pontos, linhas, áreas ou mista. Você também pode tocar em uma feição do mapa → <b>Editar esta feição</b>.</p>
<p>A barra de edição sempre mostra <b>Desfazer</b>, o nome da camada com o estado (<b>Salvo</b>), <b>Mais</b> e <b>Concluir</b>, que salva e sai. Embaixo, uma frase diz em que tocar agora, e os botões mudam conforme o que você está fazendo. Um botão com borda tracejada ainda não pode ser usado: toque nele e o app explica por quê.</p>
<ul>
<li><b>Adicionar um ponto:</b> toque em <b>Ponto</b> e depois no mapa. <b>Na minha posição</b> coloca o ponto onde você está; <b>GPS preciso</b> calcula a média do GPS por alguns segundos e mostra o avanço e o ± (<b>Salvar já</b> ou <b>Cancelar</b>). Em <b>Mais</b>: <b>Digitar coordenadas…</b> (graus, graus-minutos-segundos ou UTM) e <b>Ponto a uma distância e azimute…</b> a partir de um ponto, da sua posição ou do centro do mapa.</li>
<li><b>Desenhar uma linha ou uma área:</b> toque em <b>Linha</b> ou <b>Área</b> e depois em cada ponto ou canto. <b>Ponto GPS</b> adiciona sua posição atual. <b>Desenhar andando</b> adiciona um ponto a cada poucos metros enquanto você caminha (por exemplo, a borda de um talhão); enquanto isso, tocar no mapa não adiciona pontos, e <b>Pausar</b> interrompe. Termine com <b>Concluir linha</b> ou <b>Concluir área</b>; <b>Descartar</b> joga o desenho fora.</li>
<li><b>Mudar algo:</b> toque em <b>Selecionar</b> e depois na feição. Com <b>Editar forma</b>, arraste os pontos brancos; os cinza, no meio de cada lado, adicionam um canto; para tirar um, toque em <b>Remover canto</b> e depois no canto. <b>Mover</b> arrasta a feição inteira; <b>Ao meu local</b> leva um ponto para sua posição GPS; <b>Excluir</b> apaga.</li>
<li><b>Dados:</b> nome, código, notas e os campos que você adicionar (os nomes podem ter letras de qualquer idioma). O que você digitar é salvo ao fechar a ficha. Ali também estão <b>Cortar a linha…</b>, <b>Inverter direção</b>, <b>Duplicar</b> e <b>Adicionar campo</b>. O grupo <b>Dados da coleta</b> mostra o que o app anotou: data, origem e precisão.</li>
<li><b>Vários de uma vez:</b> em <b>Mais</b>, ative <b>Selecionar vários</b>: cada toque soma ou tira uma feição. Depois mova as feições, dê a todas o mesmo valor ou exclua todas juntas.</li>
<li><b>Ímã:</b> em <b>Mais</b> → <b>Opções</b>. O que você desenha ou arrasta gruda nos cantos e bordas próximos das camadas visíveis; a força pode ser baixa, média ou alta.</li>
</ul>
<p>Com o GPS, o app nunca usa uma posição antiga. Se a precisão for pior que o seu limite (10 m; mude em <b>Mais</b> → <b>Opções</b>), ele mostra o ± e oferece <b>Cancelar</b>, <b>Calcular média</b> ou <b>Salvar mesmo assim</b>.</p>
<p>As mudanças são salvas sozinhas, e <b>Desfazer</b> volta até 40 passos e diz o que desfez. Se não for possível salvar (por exemplo, por falta de espaço), a edição continua aberta para não perder nada. Uma camada KML, GPX ou CSV é salva como uma cópia GeoJSON editável na primeira vez que você a altera. Antes de remover uma camada criada ou editada no app, exporte-a: <b>Mais</b> → <b>Exportar esta camada…</b>.</p>

<h4 id="help-basemaps">Mapas base on-line</h4>
<p>Em <b>Camadas</b>, escolha o mapa base on-line: OpenStreetMap, Google (satélite, satélite com ruas e nomes, ruas ou relevo) ou seus próprios mapas XYZ. Todos precisam de internet. Para trabalhar sem sinal, escolha “Sem mapa base” e use seus próprios mapas (GeoTIFF).</p>
<p><b>Mapas XYZ, como no QGIS.</b> Em Camadas, toque em <b>Adicionar um mapa base XYZ</b> e cole a mesma URL que você usa no QGIS (Navegador → XYZ Tiles → Nova conexão), com {x}, {y} e {z}; também servem {-y}, {q}, {s} e os subdomínios {a-c} ou {0-3}. Ele aceita ainda a “fonte” de uma camada XYZ do QGIS (Propriedades → Informação: <i>type=xyz&amp;url=…</i>) e o arquivo XML que o QGIS cria com “Salvar conexões”: abra-o com Menu → <b>Abrir um mapa ou dados</b> e o app adiciona todas as conexões. Só https:// (o Android bloqueia http://). Além do zoom máximo, o app amplia a última imagem disponível.</p>
<p>Além do OpenStreetMap e do Google, o app não traz servidores: é você quem adiciona os mapas XYZ e quem responde por respeitar as condições deles. Por exemplo, o Google só permite usar as imagens dele pela Map Tiles API, que é a opção “Google” da lista.</p>
<p><b>Google</b> precisa de uma chave própria do Google Maps Platform com a <b>Map Tiles API</b> ativada e o faturamento ativo (inclui uma cota mensal gratuita). Crie a chave em console.cloud.google.com → APIs e serviços → Credenciais, ative a “Map Tiles API”, restrinja a chave a essa API e digite-a em Camadas. A chave fica salva só no celular. As condições do Google exigem mostrar o logotipo e a atribuição (o app faz isso) e <b>não permitem salvar as imagens para usar off-line</b>, nem decalcar (digitalizar) estradas, prédios ou outros objetos a partir delas, nem mostrar o Google junto com outro mapa base. Cota gratuita: 100.000 blocos por mês (limite padrão: 15.000 por dia por projeto); defina um limite diário para a chave. O mapa do Google aparece no idioma do app.</p>

<h4 id="help-crs">Sistemas de coordenadas em qualquer lugar do mundo</h4>
<p>O GPS dá latitude e longitude (WGS 84). Muitos mapas e tabelas usam metros em um sistema projetado: UTM ou o sistema nacional de um país. O app traz mais de 280 sistemas: WGS 84, todas as zonas UTM (com WGS 84, SIRGAS 2000, ETRS89, NAD83, GDA e outros datums) e sistemas nacionais de muitos países.</p>
<p>Se um arquivo não disser em que sistema está, o app pede que você o escolha e mostra primeiro os mais prováveis: o que o arquivo indica, os que deixam os dados perto de você (ou do centro do mapa) e os que são usados onde você está. Busque por país, nome, zona UTM (por exemplo 33N) ou código EPSG. Ao escolher um, o app mostra onde o primeiro ponto ficaria e a que distância de você; depois toque em <b>Usar este sistema</b>. Se não souber qual é, pergunte a quem lhe passou o arquivo; números de 6 ou 7 dígitos costumam ser UTM.</p>
<p>Se um mapa aparecer deslocado, toque no nome dele em Camadas e mude o sistema de coordenadas.</p>
<p><b>Sistema personalizado:</b> se o seu sistema não estiver na lista, toque em <b>Colar definição PROJ</b> e cole a definição do epsg.io (formato PROJ.4) ou do QGIS (Propriedades da camada → Informação). Se você informar o código EPSG, o app vai reconhecer sozinho os próximos arquivos com esse código. Definições que precisam de um arquivo de grade (+nadgrids) não funcionam off-line: procure no epsg.io a versão com +towgs84.</p>
<p>A barra de coordenadas e Configurações → <b>Formato de coordenadas</b> oferecem graus decimais, graus-minutos-segundos e UTM.</p>
<p class="note info">Só para a Costa Rica: CRTM05 é a projeção oficial. Desde 2018, o datum oficial é o CR-SIRGAS (EPSG:8908); o antigo CR05 (EPSG:5367) difere em até ~10 cm. Também são reconhecidas as projeções Lambert Norte e Lambert Sur sobre Ocotepeque 1935 (EPSG:5456/5457), dos mapas antigos. As opções CRTM05 só aparecem com dados ou posições dentro da Costa Rica.</p>

<h4 id="help-accuracy">Precisão: celular ou RTK</h4>
<p>O valor ± e o círculo azul em volta da sua posição são o raio de <b>68%</b> que o Android informa: a posição real está dentro do círculo cerca de 2 em cada 3 vezes. A céu aberto, um celular costuma chegar a 3–5 m; embaixo de árvores ou perto de prédios, bem pior. A primeira posição pode levar de 30 s a alguns minutos.</p>
<p>Um celular <b>não é RTK</b>: serve para se orientar, encontrar pontos e mapear com alguns metros de erro, não para divisas nem locação ao centímetro. Para isso, meça com um receptor RTK e use este app para se orientar.</p>
<p><b>Receptor externo (RTK ou GNSS):</b> se o receptor, ou um app de NTRIP ou Bluetooth, publicar a posição como <i>local fictício</i> do Android (Opções do desenvolvedor → Selecionar app de local fictício), o Mapa de Campo usa essa posição automaticamente e a identifica como receptor externo em <b>Status do GPS</b>.</p>
<p>Se o Android só der localização aproximada (cerca de 2 km), ative “Usar local exato” nas permissões do app.</p>

<h4 id="help-heights">Alturas</h4>
<p>A altura do GPS é <b>elipsoidal</b> (h, sobre o elipsoide WGS 84), não a altitude acima do nível do mar (H) dos mapas. Elas se relacionam assim: H = h − N, em que N é a ondulação do geoide; N muda de um lugar para outro e pode chegar a dezenas de metros.</p>
<p class="muted small">Exemplo (Universidad EARTH, Costa Rica): N ≈ 11,5 m (EGM2008), então a altura do GPS sai cerca de 11,5 m maior que a cota.</p>
<p>Quando o Android a fornece, <b>Status do GPS</b> também mostra a altitude acima do nível médio do mar, e o CSV de Meus pontos traz as duas (colunas h_elip_m e H_nmm_m). Sempre confira a referência vertical antes de comparar alturas.</p>

<h4 id="help-export">Exportar e compartilhar</h4>
<ul>
<li><b>Meus pontos</b> (Menu): GPX, GeoJSON ou CSV com latitude, longitude e UTM (na Costa Rica, também CRTM05).</li>
<li><b>Trilha</b> (Menu → <b>Gravar trilha</b>): GPX, ou salve-a como camada.</li>
<li><b>Uma camada</b>: Editar → <b>Mais</b> → <b>Exportar esta camada…</b>: GeoJSON, KML (Google Earth), GPX, CSV de pontos ou CSV para o SingularPad.</li>
<li><b>Um plano</b>: <b>Exportar…</b> no painel do plano.</li>
</ul>
<p>O Android pergunta onde salvar o arquivo. O conteúdo usa ponto decimal e nomes de coluna fixos, para que qualquer programa o leia em qualquer idioma. Seus dados só saem do celular quando você os exporta.</p>

<h4 id="help-settings">Configurações</h4>
<p>Em Menu → <b>Configurações</b>:</p>
<ul>
<li><b>Idioma</b>: o do celular (automático), Español, English, Français ou Português. O app abre de novo no idioma escolhido.</li>
<li><b>Tema</b>: <b>Automático</b>, <b>Claro</b>, <b>Escuro</b> ou <b>Sol</b>, com o máximo de contraste para ler sob sol forte.</li>
<li><b>Tamanho do texto</b>: <b>Auto</b> segue o tamanho da fonte do celular; de A− a A+++, menor ou maior.</li>
<li><b>Botões grandes (para usar com luvas)</b>.</li>
<li><b>Unidades</b>: métricas (m, km, ha) ou imperiais (ft, mi, ac). Só mudam como as medidas aparecem; o que você digita nos campos continua em metros.</li>
<li>Também: o formato de coordenadas, os nomes dos pontos no mapa e a tela ligada ao navegar ou gravar.</li>
<li><b>Navegação</b>: raio de chegada, alerta de desvio, passagem automática para o próximo ponto e vibração.</li>
<li><b>Gravar trilha</b>: distância mínima entre pontos e posições descartadas por precisão ruim.</li>
<li><b>Prática</b>: simule um percurso pela linha que você está seguindo, para praticar sem sair (antes, toque em uma linha → <b>Seguir esta linha</b>). Para a EARTH (opcional): dados de exemplo e ortofotos.</li>
</ul>
<p class="muted small">Os campos numéricos aceitam vírgula ou ponto decimal.</p>

<h4 id="help-problems">Se algo não funcionar</h4>
<ul>
<li><b>Minha posição não aparece:</b> toque em <b>Minha localização</b> e permita a localização. Confira se a localização do celular está ligada e vá para um lugar a céu aberto.</li>
<li><b>O mapa aparece deslocado</b> em relação à sua posição ou a outras camadas: mude o sistema de coordenadas da camada (toque no nome dela em Camadas).</li>
<li><b>Um GeoTIFF está lento ou o app fecha:</b> converta-o para COG ou recorte-o na sua área de trabalho (veja “Carregar seu próprio mapa”).</li>
<li><b>O mapa base fica vazio:</b> não há internet ou, com o Google, a chave ou o faturamento estão com problema. Sem sinal, use seus próprios mapas.</li>
<li><b>A seta aponta errado:</b> calibre a bússola fazendo um 8 no ar com o celular, longe de objetos de metal.</li>
</ul>`,
};
