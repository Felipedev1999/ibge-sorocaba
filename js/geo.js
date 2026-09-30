/*
  js/geo.js — mapa-múndi: carregamento do GeoJSON e tradução de nomes.

  O GeoJSON vem da CDN (arquivo estático do pacote echarts@4, o mesmo mapa
  "world" que o ECharts distribuía). Nenhum dado do grupo é enviado: é só um
  download de biblioteca, como o próprio ECharts.

  Os nomes de país no mapa são em inglês abreviado ("Czech Rep.", "Dem. Rep.
  Korea"). O 12 Axes escreve em português, às vezes com região entre parênteses
  ("Minas Gerais (Brasil)") ou experiências históricas ("República de Weimar").
  `resolve(nome)` tenta, nesta ordem:
    1. o nome inteiro no dicionário;
    2. o que está entre parênteses, e depois o que está fora;
    3. palavras-chave históricas/regionais (ex.: "weimar" → Germany).
  O que não for resolvido volta como null e o painel lista para você acrescentar
  um apelido em ALIASES ou KEYWORDS abaixo.
*/
(function (global) {
  'use strict';

  var URL = 'https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json';
  var MAP_NAME = 'world';

  // nome no mapa → apelidos em PT (e EN, para prints em inglês)
  var ALIASES = {
    'Afghanistan': ['Afeganistão'], 'Aland': ['Åland', 'Ilhas Åland'], 'Albania': ['Albânia'], 'Algeria': ['Argélia'],
    'American Samoa': ['Samoa Americana'], 'Andorra': [], 'Angola': [], 'Antigua and Barb.': ['Antígua e Barbuda', 'Antigua and Barbuda'],
    'Argentina': [], 'Armenia': ['Armênia'], 'Australia': ['Austrália'], 'Austria': ['Áustria'], 'Azerbaijan': ['Azerbaijão'],
    'Bahamas': [], 'Bahrain': ['Bahrein', 'Barein'], 'Bangladesh': [], 'Barbados': [], 'Belarus': ['Bielorrússia', 'Belarus'],
    'Belgium': ['Bélgica'], 'Belize': [], 'Benin': [], 'Bermuda': ['Bermudas'], 'Bhutan': ['Butão'], 'Bolivia': ['Bolívia'],
    'Bosnia and Herz.': ['Bósnia e Herzegovina', 'Bósnia', 'Bosnia and Herzegovina'], 'Botswana': ['Botsuana'], 'Brazil': ['Brasil'],
    'Brunei': [], 'Bulgaria': ['Bulgária'], 'Burkina Faso': [], 'Burundi': [], 'Cambodia': ['Camboja'], 'Cameroon': ['Camarões'],
    'Canada': ['Canadá'], 'Cape Verde': ['Cabo Verde'], 'Cayman Is.': ['Ilhas Cayman'], 'Central African Rep.': ['República Centro-Africana', 'Central African Republic'],
    'Chad': ['Chade'], 'Chile': [], 'China': ['República Popular da China'], 'Colombia': ['Colômbia'], 'Comoros': ['Comores'],
    'Congo': ['República do Congo', 'Congo-Brazzaville'], 'Costa Rica': [], 'Croatia': ['Croácia'], 'Cuba': [], 'Curaçao': [],
    'Cyprus': ['Chipre'], 'Czech Rep.': ['República Tcheca', 'Tchéquia', 'Chéquia', 'República Checa', 'Czech Republic', 'Czechia'],
    "Côte d'Ivoire": ['Costa do Marfim', 'Ivory Coast'], 'Dem. Rep. Congo': ['República Democrática do Congo', 'RD Congo', 'Congo-Kinshasa', 'Democratic Republic of the Congo'],
    'Dem. Rep. Korea': ['Coreia do Norte', 'Coréia do Norte', 'North Korea'], 'Denmark': ['Dinamarca'], 'Djibouti': ['Djibuti'], 'Dominica': [],
    'Dominican Rep.': ['República Dominicana', 'Dominican Republic'], 'Ecuador': ['Equador'], 'Egypt': ['Egito'], 'El Salvador': [],
    'Eq. Guinea': ['Guiné Equatorial', 'Equatorial Guinea'], 'Eritrea': ['Eritreia'], 'Estonia': ['Estônia'], 'Ethiopia': ['Etiópia'],
    'Faeroe Is.': ['Ilhas Faroé', 'Ilhas Feroe', 'Faroe Islands'], 'Falkland Is.': ['Ilhas Malvinas', 'Ilhas Falkland', 'Falkland Islands'], 'Fiji': [],
    'Finland': ['Finlândia'], 'Fr. Polynesia': ['Polinésia Francesa', 'French Polynesia'], 'France': ['França'], 'Gabon': ['Gabão'], 'Gambia': ['Gâmbia'],
    'Georgia': ['Geórgia'], 'Germany': ['Alemanha'], 'Ghana': ['Gana'], 'Greece': ['Grécia'], 'Greenland': ['Groenlândia'], 'Grenada': ['Granada'],
    'Guam': [], 'Guatemala': [], 'Guinea': ['Guiné'], 'Guinea-Bissau': ['Guiné-Bissau'], 'Guyana': ['Guiana'], 'Haiti': [], 'Honduras': [],
    'Hungary': ['Hungria'], 'Iceland': ['Islândia'], 'India': ['Índia'], 'Indonesia': ['Indonésia'], 'Iran': ['Irã', 'Irão'], 'Iraq': ['Iraque'],
    'Ireland': ['Irlanda'], 'Isle of Man': ['Ilha de Man'], 'Israel': [], 'Italy': ['Itália'], 'Jamaica': [], 'Japan': ['Japão'], 'Jersey': [],
    'Jordan': ['Jordânia'], 'Kazakhstan': ['Cazaquistão'], 'Kenya': ['Quênia'], 'Kiribati': [], 'Korea': ['Coreia do Sul', 'Coréia do Sul', 'South Korea'],
    'Kuwait': ['Cuaite'], 'Kyrgyzstan': ['Quirguistão'], 'Lao PDR': ['Laos'], 'Latvia': ['Letônia'], 'Lebanon': ['Líbano'], 'Lesotho': [],
    'Liberia': ['Libéria'], 'Libya': ['Líbia'], 'Liechtenstein': [], 'Lithuania': ['Lituânia'], 'Luxembourg': ['Luxemburgo'],
    'Macedonia': ['Macedônia do Norte', 'Macedônia', 'North Macedonia'], 'Madagascar': [], 'Malawi': ['Malaui'], 'Malaysia': ['Malásia'], 'Mali': [], 'Malta': [],
    'Mauritania': ['Mauritânia'], 'Mauritius': ['Maurício', 'Ilhas Maurício'], 'Mexico': ['México'], 'Micronesia': ['Micronésia'],
    'Moldova': ['Moldávia'], 'Mongolia': ['Mongólia'], 'Montenegro': [], 'Montserrat': [], 'Morocco': ['Marrocos'], 'Mozambique': ['Moçambique'],
    'Myanmar': ['Mianmar', 'Birmânia', 'Burma'], 'N. Cyprus': ['Chipre do Norte'], 'Namibia': ['Namíbia'], 'Nepal': [], 'Netherlands': ['Países Baixos', 'Holanda'],
    'New Caledonia': ['Nova Caledônia'], 'New Zealand': ['Nova Zelândia'], 'Nicaragua': ['Nicarágua'], 'Niger': ['Níger'], 'Nigeria': ['Nigéria'],
    'Norway': ['Noruega'], 'Oman': ['Omã'], 'Pakistan': ['Paquistão'], 'Palau': [], 'Palestine': ['Palestina'], 'Panama': ['Panamá'],
    'Papua New Guinea': ['Papua-Nova Guiné', 'Papua Nova Guiné'], 'Paraguay': ['Paraguai'], 'Peru': [], 'Philippines': ['Filipinas'], 'Poland': ['Polônia'],
    'Portugal': [], 'Puerto Rico': ['Porto Rico'], 'Qatar': ['Catar'], 'Romania': ['Romênia'], 'Russia': ['Rússia', 'Federação Russa'], 'Rwanda': ['Ruanda'],
    'S. Sudan': ['Sudão do Sul', 'South Sudan'], 'Saudi Arabia': ['Arábia Saudita'], 'Senegal': [], 'Serbia': ['Sérvia'], 'Seychelles': ['Seicheles'],
    'Sierra Leone': ['Serra Leoa'], 'Singapore': ['Singapura', 'Cingapura'], 'Slovakia': ['Eslováquia'], 'Slovenia': ['Eslovênia'],
    'Solomon Is.': ['Ilhas Salomão', 'Solomon Islands'], 'Somalia': ['Somália'], 'South Africa': ['África do Sul'], 'Spain': ['Espanha'], 'Sri Lanka': [],
    'Sudan': ['Sudão'], 'Suriname': [], 'Swaziland': ['Essuatíni', 'Suazilândia', 'Eswatini'], 'Sweden': ['Suécia'], 'Switzerland': ['Suíça'], 'Syria': ['Síria'],
    'São Tomé and Principe': ['São Tomé e Príncipe'], 'Tajikistan': ['Tadjiquistão'], 'Tanzania': ['Tanzânia'], 'Thailand': ['Tailândia'],
    'Timor-Leste': ['Timor Leste', 'East Timor'], 'Togo': [], 'Tonga': [], 'Trinidad and Tobago': ['Trinidad e Tobago'], 'Tunisia': ['Tunísia'],
    'Turkey': ['Turquia', 'Türkiye'], 'Turkmenistan': ['Turcomenistão'], 'Uganda': [], 'Ukraine': ['Ucrânia'], 'United Arab Emirates': ['Emirados Árabes Unidos'],
    'United Kingdom': ['Reino Unido', 'Inglaterra', 'Grã-Bretanha', 'Escócia', 'País de Gales', 'Irlanda do Norte', 'England', 'Britain', 'Great Britain', 'UK'],
    'United States': ['Estados Unidos', 'EUA', 'Estados Unidos da América', 'USA', 'United States of America'], 'Uruguay': ['Uruguai'],
    'Uzbekistan': ['Uzbequistão'], 'Vanuatu': [], 'Venezuela': [], 'Vietnam': ['Vietnã', 'Vietname'], 'W. Sahara': ['Saara Ocidental', 'Western Sahara'],
    'Yemen': ['Iêmen', 'Iémen'], 'Zambia': ['Zâmbia'], 'Zimbabwe': ['Zimbábue']
  };

  // Palavras-chave (sem acento, minúsculas) para experiências históricas e regiões.
  // Ordem importa: a primeira que casar vence.
  var KEYWORDS = [
    [/rojava|curdist|kurdist/, 'Syria'],
    [/taiwan|formosa/, 'Taiwan'],
    [/weimar|prussi|bavar|baviera|nazi|reich|alemanha|german|rda\b|rfa\b|berlim|berlin/, 'Germany'],
    [/sovi|urss|ussr|russ|czar|tsar|bolchev|stalin|lenin|moscou|moscow/, 'Russia'],
    [/\broma\b|romano|romana|veneza|venice|florenc|floren|italia|ital|fascis|mussolini|toscan|genova|napoles|sicil/, 'Italy'],
    [/atenas|athens|esparta|sparta|greg|greek|grec|bizant|byzant/, 'Greece'],
    [/otoman|ottoman|ataturk|turc|turk|constantinopla/, 'Turkey'],
    [/vitorian|victorian|britan|british|elisabet|elizabet|ingl|england|thatcher|churchill|escoc|scot|gales|wales|londres|london/, 'United Kingdom'],
    [/iugosl|jugosl|yugosl|tito|serv|serb/, 'Serbia'],
    [/tcheco|checo|czech|tchec|praga|prague/, 'Czech Rep.'],
    [/austro|habsburg|habsburgo|austria|viena|vienna/, 'Austria'],
    [/meiji|japao|japan|japones|tokugawa|showa|edo\b/, 'Japan'],
    [/china|chines|ming\b|qing\b|mao|maois|han\b|tang\b|song\b|tibet|hong kong|macau/, 'China'],
    [/mogol|mughal|india|indian|gandhi|nehru/, 'India'],
    [/persa|persia|ira\b|iran|xiita|xa\b|shah|pahlavi/, 'Iran'],
    [/brasil|brazil|imperio do brasil|estado novo|vargas|republica velha|ditadura militar|lula|fhc|bolsonaro|minas|sao paulo|rio de janeiro|bahia|parana|santa catarina|gaucho|nordest/, 'Brazil'],
    [/chile|allende|pinochet/, 'Chile'],
    [/argentin|peron|buenos aires/, 'Argentina'],
    [/cuba|castro|havana/, 'Cuba'],
    [/espanh|spain|spanish|franquis|franco|catalun|catalon|basco|basque|castel|aragao|andaluz/, 'Spain'],
    [/portug|salazar|lisboa|lisbon|revolucao dos cravos|cravos/, 'Portugal'],
    [/franc|france|french|napole|vichy|comuna de paris|paris|gaullis|de gaulle|jacobin|girondin|bourbon/, 'France'],
    [/estados unidos|united states|eua\b|usa\b|americ|confederad|confederate|new deal|roosevelt|reagan|california|texas|nova york|new york|flórida|florida|alasca|alaska|havai|hawaii/, 'United States'],
    [/suec|swed|sueci|estocolmo|stockholm/, 'Sweden'],
    [/noru|norw|oslo/, 'Norway'],
    [/dinam|denm|danish|copenhag/, 'Denmark'],
    [/finl|helsin/, 'Finland'],
    [/island|iceland/, 'Iceland'],
    [/holand|paises baixos|netherland|dutch|amsterd|batav/, 'Netherlands'],
    [/belg|flandres|flanders|valon|wallon|bruxel|brussel/, 'Belgium'],
    [/suic|swiss|switz|zuriq|zurich|genebra|geneva/, 'Switzerland'],
    [/israel|kibut|kibbut|sion|zion|jerusal/, 'Israel'],
    [/egit|egyp|nasser|cairo|farao|pharao/, 'Egypt'],
    [/africa do sul|south africa|apartheid|mandela|zulu|boer/, 'South Africa'],
    [/rodes|rhodes|zimbab/, 'Zimbabwe'],
    [/zaire|congo belga|kinshasa/, 'Dem. Rep. Congo'],
    [/mongol|gengis|genghis|khan/, 'Mongolia'],
    [/inca|peru|lima\b/, 'Peru'],
    [/astec|aztec|mexic|maya|maia/, 'Mexico'],
    [/canad|quebec|ontario|toronto/, 'Canada'],
    [/austral|sydney|melbourne/, 'Australia'],
    [/nova zel|new zeal|zeland/, 'New Zealand'],
    [/singap|cingap|lee kuan/, 'Singapore'],
    [/coreia do norte|north korea|kim/, 'Dem. Rep. Korea'],
    [/coreia|korea|seul|seoul/, 'Korea'],
    [/vietn|hanoi|saigon/, 'Vietnam'],
    [/polon|poland|polish|solidar|varsov|warsaw/, 'Poland'],
    [/hungr|budapest|magiar|magyar/, 'Hungary'],
    [/roman|romen|romania|bucar|ceausescu/, 'Romania'],
    [/ucran|ukrain|kiev|kyiv/, 'Ukraine'],
    [/irland|ireland|irish|dublin/, 'Ireland'],
    [/arab|saudi|meca|mecca/, 'Saudi Arabia'],
    [/emirad|emirat|dubai/, 'United Arab Emirates'],
    [/uruguai|uruguay|montevid/, 'Uruguay'],
    [/paragu|asuncion|assuncao/, 'Paraguay'],
    [/boliv|la paz/, 'Bolivia'],
    [/colomb|bogot/, 'Colombia'],
    [/venezuel|caracas|chavez|chavis/, 'Venezuela'],
    [/equador|ecuador|quito/, 'Ecuador'],
    [/marroc|moroc|rabat/, 'Morocco'],
    [/argel|alger/, 'Algeria'],
    [/tunis/, 'Tunisia'],
    [/lib[ií]a|libya|kadafi|gaddafi/, 'Libya'],
    [/etiop|ethiop|abissin|abyssin/, 'Ethiopia'],
    [/nigeri|lagos/, 'Nigeria'],
    [/queni|kenya|nairob/, 'Kenya'],
    [/tanzan/, 'Tanzania'],
    [/paquist|pakist/, 'Pakistan'],
    [/afegan|afghan|cabul|kabul/, 'Afghanistan'],
    [/iraq|iraque|bagda|baghdad|babil|babyl|sumer|assir|assyr|mesopot/, 'Iraq'],
    [/siri|syri|damasc/, 'Syria'],
    [/liban|leban|beirut/, 'Lebanon'],
    [/jordan|aman\b|amman/, 'Jordan'],
    [/indones|jacarta|jakarta|\bjava\b|\bbali\b/, 'Indonesia'],
    [/tailand|thail|siao|siam|bangkok/, 'Thailand'],
    [/filipin|philipp|manila/, 'Philippines'],
    [/malas|malays|kuala/, 'Malaysia'],
    [/bangla/, 'Bangladesh'],
    [/sri lanka|ceilao|ceylon/, 'Sri Lanka'],
    [/nepal|katmandu/, 'Nepal'],
    [/cazaq|kazak/, 'Kazakhstan'],
    [/uzbeq|uzbek|samarc/, 'Uzbekistan'],
    [/georgi|tbilisi/, 'Georgia'],
    [/armen|erev/, 'Armenia'],
    [/azerb|baku/, 'Azerbaijan'],
    [/bielor|belarus|minsk/, 'Belarus'],
    [/litu|lithu|vilnius/, 'Lithuania'],
    [/leton|latvi|riga/, 'Latvia'],
    [/eston|tallinn/, 'Estonia'],
    [/eslovaq|slovak|bratisl/, 'Slovakia'],
    [/esloven|sloven|liubl|ljubl/, 'Slovenia'],
    [/croac|croat|zagreb/, 'Croatia'],
    [/bosni|sarajevo/, 'Bosnia and Herz.'],
    [/albani|tirana/, 'Albania'],
    [/bulgar|sofia/, 'Bulgaria'],
    [/macedon|skopje/, 'Macedonia'],
    [/montenegr|podgor/, 'Montenegro'],
    [/moldav|moldov|chisin/, 'Moldova'],
    [/chipre|cyprus|nicosia/, 'Cyprus'],
    [/malta|valeta|valletta/, 'Malta'],
    [/luxemb/, 'Luxembourg'],
    [/lichten|liechten/, 'Liechtenstein'],
    [/groenl|greenl/, 'Greenland'],
    [/haiti|porto principe|port-au-prince/, 'Haiti'],
    [/dominican|santo domingo/, 'Dominican Rep.'],
    [/jamaic|kingston/, 'Jamaica'],
    [/panam/, 'Panama'],
    [/costa rica|san jose/, 'Costa Rica'],
    [/nicarag|sandin|managua/, 'Nicaragua'],
    [/hondur|tegucig/, 'Honduras'],
    [/guatem/, 'Guatemala'],
    [/salvador/, 'El Salvador'],
    [/belize/, 'Belize'],
    [/guian|guyan/, 'Guyana'],
    [/surinam/, 'Suriname'],
    [/gana\b|ghana|acra|accra|nkrumah/, 'Ghana'],
    [/senegal|dacar|dakar/, 'Senegal'],
    [/costa do marfim|ivoire|ivory|abidjan/, "Côte d'Ivoire"],
    [/camaro|cameroon|yaound/, 'Cameroon'],
    [/angola|luanda/, 'Angola'],
    [/mocamb|mozamb|maputo/, 'Mozambique'],
    [/namib|windhoek/, 'Namibia'],
    [/botsu|botsw|gabor/, 'Botswana'],
    [/zambi|lusaka/, 'Zambia'],
    [/uganda|kampala|idi amin/, 'Uganda'],
    [/ruand|rwand|kigali/, 'Rwanda'],
    [/somali|mogad/, 'Somalia'],
    [/sudao do sul|south sudan|juba/, 'S. Sudan'],
    [/sudao|sudan|cartum|khartoum/, 'Sudan'],
    [/mali\b|timbuct|tombuct|bamako/, 'Mali'],
    [/niger\b|niamey/, 'Niger'],
    [/chade|chad\b|ndjamena/, 'Chad'],
    [/mauritan|nouak/, 'Mauritania'],
    [/madagas|antanan/, 'Madagascar'],
    [/mauric|mauriti/, 'Mauritius'],
    [/cabo verde|cape verde|praia/, 'Cape Verde'],
    [/sao tome/, 'São Tomé and Principe'],
    [/guine equat|equatorial guinea/, 'Eq. Guinea'],
    [/guine-bissau|guinea-bissau|bissau/, 'Guinea-Bissau'],
    [/guine|guinea|conacri|conakry/, 'Guinea'],
    [/serra leoa|sierra leone|freetown/, 'Sierra Leone'],
    [/liberi|monrov/, 'Liberia'],
    [/togo|lome/, 'Togo'],
    [/benin|daome|dahome|porto novo/, 'Benin'],
    [/burkin|ouagad|sankara/, 'Burkina Faso'],
    [/gambi|banjul/, 'Gambia'],
    [/gabao|gabon|librev/, 'Gabon'],
    [/centro-african|central african|bangui/, 'Central African Rep.'],
    [/congo/, 'Congo'],
    [/burundi|bujumb|gitega/, 'Burundi'],
    [/eritre|asmara/, 'Eritrea'],
    [/djibut|jibut/, 'Djibouti'],
    [/malaui|malawi|lilong/, 'Malawi'],
    [/lesot|maseru/, 'Lesotho'],
    [/essuat|suazil|swazil|eswatini|mbabane/, 'Swaziland'],
    [/comor|moroni/, 'Comoros'],
    [/seich|seych|victoria/, 'Seychelles'],
    [/kuwait|cuait/, 'Kuwait'],
    [/catar|qatar|doha/, 'Qatar'],
    [/bahrein|bahrain|barein|manama/, 'Bahrain'],
    [/oma\b|oman|mascate|muscat/, 'Oman'],
    [/iemen|iémen|yemen|sana/, 'Yemen'],
    [/palestin|gaza|cisjord|west bank|ramallah/, 'Palestine'],
    [/mianm|myanm|birman|burma|rangum|yangon/, 'Myanmar'],
    [/laos|vientiane/, 'Lao PDR'],
    [/camboj|cambod|khmer|phnom/, 'Cambodia'],
    [/butao|bhutan|timphu|thimphu/, 'Bhutan'],
    [/mongol/, 'Mongolia'],
    [/quirg|kyrg|bishkek/, 'Kyrgyzstan'],
    [/tadjiq|tajik|dushanbe/, 'Tajikistan'],
    [/turcom|turkmen|ashgabat/, 'Turkmenistan'],
    [/brunei/, 'Brunei'],
    [/timor/, 'Timor-Leste'],
    [/papua/, 'Papua New Guinea'],
    [/fiji|suva/, 'Fiji'],
    [/samoa/, 'Samoa'],
    [/tonga/, 'Tonga'],
    [/vanuatu/, 'Vanuatu'],
    [/salomao|solomon/, 'Solomon Is.'],
    [/kiribati/, 'Kiribati'],
    [/micrones/, 'Micronesia'],
    [/palau/, 'Palau'],
    [/nova caled|new caled/, 'New Caledonia'],
    [/polines|polynes|taiti|tahiti/, 'Fr. Polynesia'],
    [/malvin|falkl/, 'Falkland Is.'],
    [/bermud/, 'Bermuda'],
    [/porto rico|puerto rico/, 'Puerto Rico'],
    [/bahamas|nassau/, 'Bahamas'],
    [/barbados|bridgetown/, 'Barbados'],
    [/trinidad|tobago/, 'Trinidad and Tobago'],
    [/saara ocid|western sahara/, 'W. Sahara'],
    [/curacao|curaçao/, 'Curaçao'],
    [/cuba/, 'Cuba'],
    [/andorra/, 'Andorra'],
    [/faro[eé]|feroe|faeroe/, 'Faeroe Is.']
  ];

  var index = null;      // nome normalizado → nome do mapa
  var centroids = null;  // nome do mapa → [lng, lat]
  var loaded = false;
  var loading = null;
  var failed = null;

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9()\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildIndex() {
    index = {};
    Object.keys(ALIASES).forEach(function (mapName) {
      index[normalize(mapName)] = mapName;
      ALIASES[mapName].forEach(function (a) { index[normalize(a)] = mapName; });
    });
  }

  function lookup(norm) {
    if (!norm) return null;
    if (index[norm]) return index[norm];
    var stripped = norm.replace(/^(republica|reino|imperio|estado|federacao|ilhas?|principado|grao-ducado|ducado|comunidade) (da|de|do|das|dos|of|the)?\s*/, '').trim();
    if (stripped && index[stripped]) return index[stripped];
    return null;
  }

  // Devolve o nome no mapa ou null.
  function resolve(name) {
    if (!index) buildIndex();
    var raw = String(name || '').trim();
    if (!raw) return null;
    var norm = normalize(raw);
    var hit = lookup(norm);
    if (hit) return hit;
    var m = raw.match(/\(([^)]+)\)/);
    if (m) {
      hit = lookup(normalize(m[1]));
      if (hit) return hit;
      hit = lookup(normalize(raw.replace(/\([^)]*\)/g, '')));
      if (hit) return hit;
    }
    var noParen = normalize(raw.replace(/\([^)]*\)/g, ' '));
    for (var i = 0; i < KEYWORDS.length; i++) {
      if (KEYWORDS[i][0].test(noParen)) return KEYWORDS[i][1];
    }
    return null;
  }

  function ringArea(ring) {
    var a = 0;
    for (var i = 0, n = ring.length; i < n; i++) {
      var p = ring[i], q = ring[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }

  function bboxCenter(ring) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ring.forEach(function (p) {
      if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
    });
    return [(minX + maxX) / 2, (minY + maxY) / 2];
  }

  // Centro do maior polígono de cada país (evita cair no Alasca ou na Guiana Francesa).
  function computeCentroids(geojson) {
    centroids = {};
    (geojson.features || []).forEach(function (f) {
      var name = f.properties && f.properties.name;
      if (!name || !f.geometry) return;
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []);
      var best = null, bestArea = -1;
      polys.forEach(function (poly) {
        var ring = poly[0];
        if (!ring || !ring.length) return;
        var area = ringArea(ring);
        if (area > bestArea) { bestArea = area; best = ring; }
      });
      if (best) centroids[name] = bboxCenter(best);
    });
    // Ajustes manuais para países cujo bbox cai fora do território.
    centroids['United States'] = [-98.5, 39.5];
    centroids['Russia'] = [60, 60];
    centroids['Canada'] = [-96, 56];
    centroids['Norway'] = [9, 61];
    centroids['Chile'] = [-71, -35];
    centroids['France'] = [2.5, 46.5];
    centroids['Japan'] = [138, 36.5];
    centroids['Indonesia'] = [113, -1];
    centroids['Philippines'] = [122, 12.5];
    centroids['New Zealand'] = [172, -41];
    centroids['Italy'] = [12.5, 42.5];
    centroids['Croatia'] = [16.5, 45.3];
    centroids['Vietnam'] = [106, 16.5];
    centroids['Greece'] = [22, 39.5];
    centroids['United Kingdom'] = [-1.5, 53];
    centroids['Denmark'] = [9.5, 56];
    // Lugares que o mapa-múndi não tem como região própria: só um ponto.
    Object.keys(POINTS).forEach(function (k) { centroids[k] = POINTS[k]; });
  }

  // Nomes que viram só um ponto no mapa (sem região pintada).
  var POINTS = { 'Taiwan': [121, 23.7] };

  // Carrega o GeoJSON uma vez e registra o mapa no ECharts.
  function load(cb) {
    if (loaded) { cb(null); return; }
    if (failed) { cb(failed); return; }
    if (loading) { loading.push(cb); return; }
    loading = [cb];
    if (!window.fetch || !window.echarts) {
      failed = new Error('Sem suporte a fetch ou ECharts ausente.');
      loading.forEach(function (f) { f(failed); }); loading = null; return;
    }
    fetch(URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      window.echarts.registerMap(MAP_NAME, json);
      computeCentroids(json);
      loaded = true;
      var cbs = loading; loading = null;
      cbs.forEach(function (f) { f(null); });
    }).catch(function (err) {
      failed = err;
      var cbs = loading; loading = null;
      cbs.forEach(function (f) { f(err); });
    });
  }

  global.Geo = {
    MAP_NAME: MAP_NAME,
    URL: URL,
    resolve: resolve,
    load: load,
    isLoaded: function () { return loaded; },
    centroid: function (mapName) { return centroids ? centroids[mapName] || null : null; },
    addAlias: function (mapName, alias) { if (!index) buildIndex(); index[normalize(alias)] = mapName; }
  };
})(window);
