/*
  Dados do Painel 12 Eixos.

  Este é o ÚNICO arquivo que precisa ser editado para adicionar pessoas, anos,
  fontes ou atributos. O painel lê `window.DATA` diretamente (sem fetch), por isso
  o arquivo é .js e não .json: assim o index.html abre com duplo clique (file://).

  Regras importantes
  - Cada valor em `results[].axes` é o % do POLO ESQUERDO (leftPole) do eixo,
    de 0 a 100. 50 = centro. Ex.: economia: 72 significa Público 72 / Privado 28.
  - `derived` é "o que o site 12 Axes disse" naquele ano. Serve só para exibição
    e contagens; nenhum cálculo do painel usa esses campos.
  - Para um novo atributo de pessoa, basta adicioná-lo em `attributeDefs` e em
    `people[].attrs`. Ele aparece sozinho nos filtros e nas opções de cor/tamanho.
  - Idade não é atributo: é derivada de `attrs.birthYear` (preferível) ou de
    `attrs.ageAt`, a idade informada em um ano ({ "2026": 26 } → 27 em 2027).
  - Uma pessoa pode não ter resultado em algum ano. Nunca preencha com valores
    inventados: apenas não crie o registro daquele ano.

  Origem dos dados de 2026: planilha "IBGE SOROCABA (1).xlsx", aba Screenshots.
  Nomes, idade, gênero e cidade vêm da planilha; os 12 eixos e os derivados foram
  lidos dos cartões de compartilhamento do 12 Axes. Conferência completa em
  data/extraction-2026.md. Atenção:
  - o cartão mostra só o polo dominante de cada eixo; quando é o polo direito,
    o valor aqui é 100 − o % exibido (pode diferir ±1 do site por arredondamento);
  - o cartão não mostra o % de match da ideologia (ideologyMatch: null); o % ao
    lado da figura é o da personalidade mais compatível (figureMatch);
  - país atual / experiência histórica: o primeiro de cada tipo entre os 3
    países do cartão, pela classificação do próprio site;
  - quatro cartões estavam em inglês (Rodrigo, Mariana Cometti, Catel, Felipe
    Oliveira); os nomes foram trocados pelos nomes em português do site;
  - Grão não tem cartão na planilha; Luigi, Lucas Fontan, Caue Reis, Tita e Grão
    não têm idade, gênero nem cidade na planilha. Gênero e cidade de Luigi, Lucas
    Fontan, Caue Reis e Tita foram informados pelo usuário em 2026-09-30.
*/
window.DATA = {
  schemaVersion: 1,

  // Ordem oficial dos eixos (a mesma do 12 Axes). Não reordene: a URL de
  // resultado do site e o formulário "Adicionar resultado" dependem desta ordem.
  axes: [
    { key: "estrutura",     name: "Estrutura",     leftPole: "Federal",              rightPole: "Unitário" },
    { key: "representacao", name: "Representação", leftPole: "Democracia",           rightPole: "Autocracia" },
    { key: "poder",         name: "Poder",         leftPole: "Segurança",            rightPole: "Liberdade" },
    { key: "imigracao",     name: "Imigração",     leftPole: "Assimilação",          rightPole: "Multiculturalismo" },
    { key: "diplomacia",    name: "Diplomacia",    leftPole: "Militarista",          rightPole: "Pacifista" },
    { key: "intervencao",   name: "Intervenção",   leftPole: "Não intervencionista", rightPole: "Nacionalista" },
    { key: "economia",      name: "Economia",      leftPole: "Público",              rightPole: "Privado" },
    { key: "controle",      name: "Controle",      leftPole: "Planejamento",         rightPole: "Livre mercado" },
    { key: "comercio",      name: "Comércio",      leftPole: "Protecionismo",        rightPole: "Globalismo" },
    { key: "religiao",      name: "Religião",      leftPole: "Irreligioso",          rightPole: "Religioso" },
    { key: "moral",         name: "Moral",         leftPole: "Progressista",         rightPole: "Tradicionalista" },
    { key: "tecnologia",    name: "Tecnologia",    leftPole: "Tecnologia",           rightPole: "Biologia" }
  ],

  // Atributos das pessoas. type: "category" (multi-seleção) ou "number" (intervalo).
  // `values` é opcional em categorias: define a ordem de exibição; valores não
  // listados que aparecerem em `attrs` também entram automaticamente.
  attributeDefs: [
    { key: "gender", label: "Gênero", type: "category", values: ["Homem", "Mulher", "Outro"] },
    { key: "city",   label: "Cidade", type: "category" }
  ],

  // Pessoas. `color` é fixa em todos os gráficos. `photo` é opcional (relativo a
  // data/, ex.: "photos/p01.jpg"); sem foto, o avatar mostra as iniciais.
  people: [
    { id: "p01", name: "Gu Caruso",        alias: null, color: "#2a78d6", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 26 } } },
    { id: "p02", name: "Head",             alias: null, color: "#eb6834", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 26 } } },
    { id: "p03", name: "Antonio",          alias: null, color: "#1baf7a", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 26 } } },
    { id: "p04", name: "Rodrigo",          alias: null, color: "#eda100", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 27 } } },
    { id: "p05", name: "Maria Fernanda",   alias: null, color: "#e87ba4", photo: null, attrs: { gender: "Mulher", city: "São Paulo", ageAt: { "2026": 25 } } },
    { id: "p06", name: "Mariana Cometti",  alias: null, color: "#008300", photo: null, attrs: { gender: "Mulher", city: "São Paulo", ageAt: { "2026": 25 } } },
    { id: "p07", name: "Catel",            alias: null, color: "#4a3aa7", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 29 } } },
    { id: "p08", name: "Maia",             alias: null, color: "#e34948", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 27 } } },
    { id: "p09", name: "Basbus",           alias: null, color: "#0d9aa8", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 27 } } },
    { id: "p10", name: "Guilherme",        alias: null, color: "#a0522d", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 26 } } },
    { id: "p11", name: "Thiago Cunha",     alias: null, color: "#6b8e23", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 26 } } },
    { id: "p12", name: "Felipe Oliveira",  alias: null, color: "#c2185b", photo: null, attrs: { gender: "Homem", city: "Curitiba", ageAt: { "2026": 26 } } },
    { id: "p13", name: "Pedro Lopes",      alias: null, color: "#1c5cab", photo: null, attrs: { gender: "Homem", city: "Curitiba", ageAt: { "2026": 26 } } },
    { id: "p14", name: "Bruno Leonel",     alias: null, color: "#b8860b", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 26 } } },
    { id: "p15", name: "Daniela Anselmo",  alias: null, color: "#9a3fbf", photo: null, attrs: { gender: "Mulher", city: "Sorocaba", ageAt: { "2026": 25 } } },
    { id: "p16", name: "Eduardo Mendes",   alias: null, color: "#2e8b57", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 26 } } },
    { id: "p17", name: "Henrique",         alias: null, color: "#ff7f0e", photo: null, attrs: { gender: "Homem", city: "São Paulo", ageAt: { "2026": 27 } } },
    { id: "p18", name: "Olavio",           alias: null, color: "#b5651d", photo: null, attrs: { gender: "Homem", city: "Sorocaba", ageAt: { "2026": 27 } } },
    { id: "p19", name: "Grão",             alias: null, color: "#5b7fd6", photo: null, attrs: {} },
    { id: "p20", name: "Luigi",            alias: null, color: "#c98500", photo: null, attrs: { gender: "Homem", city: "São Paulo" } },
    { id: "p21", name: "Lucas Fontan",     alias: null, color: "#0097a7", photo: null, attrs: { gender: "Homem", city: "Sorocaba" } },
    { id: "p22", name: "Caue Reis",        alias: null, color: "#8e24aa", photo: null, attrs: { gender: "Homem", city: "Sorocaba" } },
    { id: "p23", name: "Tita",             alias: null, color: "#7cb342", photo: null, attrs: { gender: "Homem", city: "Sorocaba" } }
  ],

  // Um registro por pessoa por ano.
  //   source:      "12axes" (site) | "interna" (pesquisa própria, a partir de 2027)
  //   variant:     "short" | "extended" | "extreme" | "desconhecido"
  //   inputMethod: "print" | "url" | "manual"
  //   precision:   casas decimais dos valores (0 para prints, 1 para URL do site)
  results: [
    // Gu Caruso
    {
      personId: "p01", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 76, representacao: 22, poder: 65, imigracao: 41, diplomacia: 75, intervencao: 31,
              economia: 58, controle: 71, comercio: 50, religiao: 91, moral: 50, tecnologia: 81 },
      derived: {
        category: "Esquerda Radical", ideology: "Socialismo Titoísta", ideologyMatch: null,
        figure: "Josip Broz Tito", figureMatch: 91, figureRole: "Estadista",
        figures: [{ name: "Friedrich Nietzsche", match: 89 }, { name: "Deng Xiaoping", match: 88 }, { name: "J. Robert Oppenheimer", match: 85 }],
        countries: [{ name: "Iugoslávia Socialista", match: 91 }, { name: "Império Persa (Aquemênida)", match: 82 }, { name: "Vietnã", match: 80 }],
        countryPresent: "Vietnã", countryHistorical: "Iugoslávia Socialista"
      },
      notes: ""
    },
    // Head
    {
      personId: "p02", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 37, representacao: 39, poder: 65, imigracao: 19, diplomacia: 50, intervencao: 35,
              economia: 94, controle: 92, comercio: 50, religiao: 75, moral: 91, tecnologia: 39 },
      derived: {
        category: "Esquerda Radical", ideology: "Comunismo Trotskista", ideologyMatch: null,
        figure: "Antonio Gramsci", figureMatch: 91, figureRole: "Teórico marxista",
        figures: [{ name: "Oskar Lange", match: 91 }, { name: "Thomas Sankara", match: 90 }, { name: "Karl Marx", match: 89 }],
        countries: [{ name: "Cuba", match: 88 }, { name: "Burkina Faso de Sankara", match: 88 }, { name: "Venezuela", match: 87 }],
        countryPresent: "Cuba", countryHistorical: "Burkina Faso de Sankara"
      },
      notes: ""
    },
    // Antonio
    {
      personId: "p03", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 36, representacao: 22, poder: 59, imigracao: 30, diplomacia: 68, intervencao: 64,
              economia: 98, controle: 98, comercio: 58, religiao: 69, moral: 83, tecnologia: 32 },
      derived: {
        category: "Esquerda", ideology: "Socialismo Anticolonial", ideologyMatch: null,
        figure: "Oskar Lange", figureMatch: 91, figureRole: "Economista",
        figures: [{ name: "Antonio Gramsci", match: 91 }, { name: "Domenico Losurdo", match: 89 }, { name: "Luís Carlos Prestes", match: 89 }],
        countries: [{ name: "Venezuela", match: 91 }, { name: "Cuba", match: 89 }, { name: "Burkina Faso de Sankara", match: 88 }],
        countryPresent: "Venezuela", countryHistorical: "Burkina Faso de Sankara"
      },
      notes: ""
    },
    // Rodrigo
    {
      personId: "p04", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 39, representacao: 81, poder: 44, imigracao: 25, diplomacia: 60, intervencao: 58,
              economia: 82, controle: 65, comercio: 54, religiao: 86, moral: 76, tecnologia: 38 },
      derived: {
        category: "Esquerda", ideology: "Socialismo de Mercado", ideologyMatch: null,
        figure: "B. R. Ambedkar", figureMatch: 95, figureRole: "Jurista e reformador",
        figures: [{ name: "Frantz Fanon", match: 94 }, { name: "Friedrich Engels", match: 93 }, { name: "Fernando Haddad", match: 92 }],
        countries: [{ name: "Uruguai", match: 91 }, { name: "Noruega", match: 90 }, { name: "Finlândia", match: 90 }],
        countryPresent: "Uruguai", countryHistorical: null
      },
      notes: ""
    },
    // Maria Fernanda
    {
      personId: "p05", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 59, representacao: 80, poder: 50, imigracao: 10, diplomacia: 17, intervencao: 50,
              economia: 81, controle: 68, comercio: 36, religiao: 82, moral: 91, tecnologia: 27 },
      derived: {
        category: "Esquerda", ideology: "Progressismo", ideologyMatch: null,
        figure: "Justin Trudeau", figureMatch: 95, figureRole: "Estadista",
        figures: [{ name: "Pedro Sánchez", match: 94 }, { name: "Zohran Mamdani", match: 94 }, { name: "Guilherme Boulos", match: 94 }],
        countries: [{ name: "Escócia (Reino Unido)", match: 92 }, { name: "Bélgica", match: 91 }, { name: "Califórnia (Estados Unidos)", match: 91 }],
        countryPresent: "Escócia (Reino Unido)", countryHistorical: null
      },
      notes: ""
    },
    // Mariana Cometti
    {
      personId: "p06", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 28, representacao: 84, poder: 49, imigracao: 37, diplomacia: 5, intervencao: 73,
              economia: 78, controle: 78, comercio: 63, religiao: 79, moral: 72, tecnologia: 17 },
      derived: {
        category: "Esquerda", ideology: "Ambientalismo", ideologyMatch: null,
        figure: "Bernie Sanders", figureMatch: 96, figureRole: "Político",
        figures: [{ name: "Slavoj Žižek", match: 95 }, { name: "Guilherme Boulos", match: 94 }, { name: "Karl Polanyi", match: 94 }],
        countries: [{ name: "Chile de Allende", match: 94 }, { name: "Uruguai", match: 90 }, { name: "Bolívia", match: 88 }],
        countryPresent: "Uruguai", countryHistorical: "Chile de Allende"
      },
      notes: ""
    },
    // Catel
    {
      personId: "p07", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 47, representacao: 75, poder: 46, imigracao: 32, diplomacia: 38, intervencao: 60,
              economia: 71, controle: 65, comercio: 50, religiao: 81, moral: 76, tecnologia: 39 },
      derived: {
        category: "Esquerda", ideology: "Social-Democracia", ideologyMatch: null,
        figure: "Pedro Sánchez", figureMatch: 98, figureRole: "Presidente do Governo da Espanha",
        figures: [{ name: "Justin Trudeau", match: 96 }, { name: "Yamandú Orsi", match: 96 }, { name: "John Rawls", match: 96 }],
        countries: [{ name: "Noruega", match: 96 }, { name: "Espanha", match: 96 }, { name: "Uruguai", match: 94 }],
        countryPresent: "Noruega", countryHistorical: null
      },
      notes: ""
    },
    // Maia
    {
      personId: "p08", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 50, poder: 50, imigracao: 35, diplomacia: 41, intervencao: 50,
              economia: 74, controle: 69, comercio: 50, religiao: 89, moral: 81, tecnologia: 50 },
      derived: {
        category: "Esquerda", ideology: "Liberalismo Keynesiano", ideologyMatch: null,
        figure: "Pedro Sánchez", figureMatch: 94, figureRole: "Presidente do Governo da Espanha",
        figures: [{ name: "B. R. Ambedkar", match: 93 }, { name: "Jonas Gahr Støre", match: 92 }, { name: "Sidney Webb", match: 92 }],
        countries: [{ name: "Noruega", match: 93 }, { name: "Espanha", match: 91 }, { name: "Suécia", match: 91 }],
        countryPresent: "Noruega", countryHistorical: null
      },
      notes: ""
    },
    // Basbus
    {
      personId: "p09", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 72, poder: 66, imigracao: 12, diplomacia: 19, intervencao: 75,
              economia: 89, controle: 79, comercio: 50, religiao: 95, moral: 84, tecnologia: 31 },
      derived: {
        category: "Esquerda", ideology: "Progressismo", ideologyMatch: null,
        figure: "Guilherme Boulos", figureMatch: 92, figureRole: "Ativista e ministro",
        figures: [{ name: "Salvador Allende", match: 92 }, { name: "Nick Srnicek", match: 92 }, { name: "Bernie Sanders", match: 92 }],
        countries: [{ name: "Chile de Allende", match: 90 }, { name: "Rojava (Norte e Leste da Síria)", match: 87 }, { name: "Uruguai", match: 87 }],
        countryPresent: "Rojava (Norte e Leste da Síria)", countryHistorical: "Chile de Allende"
      },
      notes: ""
    },
    // Guilherme
    {
      personId: "p10", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 28, representacao: 50, poder: 40, imigracao: 24, diplomacia: 59, intervencao: 35,
              economia: 73, controle: 85, comercio: 68, religiao: 71, moral: 80, tecnologia: 58 },
      derived: {
        category: "Esquerda", ideology: "Nacionalismo Progressista", ideologyMatch: null,
        figure: "Néstor Kirchner", figureMatch: 92, figureRole: "Presidente da Argentina",
        figures: [{ name: "B. R. Ambedkar", match: 92 }, { name: "José Dirceu", match: 91 }, { name: "Oskar Lange", match: 91 }],
        countries: [{ name: "Argentina", match: 90 }, { name: "Burkina Faso de Sankara", match: 89 }, { name: "França", match: 88 }],
        countryPresent: "Argentina", countryHistorical: "Burkina Faso de Sankara"
      },
      notes: ""
    },
    // Thiago Cunha
    {
      personId: "p11", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 41, representacao: 50, poder: 63, imigracao: 27, diplomacia: 50, intervencao: 41,
              economia: 66, controle: 66, comercio: 50, religiao: 87, moral: 80, tecnologia: 50 },
      derived: {
        category: "Esquerda", ideology: "Nacionalismo Progressista", ideologyMatch: null,
        figure: "Thomas Sankara", figureMatch: 93, figureRole: "Revolucionário",
        figures: [{ name: "Jonas Gahr Støre", match: 92 }, { name: "B. R. Ambedkar", match: 92 }, { name: "J. Robert Oppenheimer", match: 92 }],
        countries: [{ name: "França", match: 92 }, { name: "Argentina", match: 90 }, { name: "Noruega", match: 90 }],
        countryPresent: "França", countryHistorical: null
      },
      notes: ""
    },
    // Felipe Oliveira
    {
      personId: "p12", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 41, representacao: 66, poder: 53, imigracao: 24, diplomacia: 51, intervencao: 39,
              economia: 48, controle: 53, comercio: 44, religiao: 80, moral: 67, tecnologia: 50 },
      derived: {
        category: "Esquerda", ideology: "Social-Democracia Nórdica", ideologyMatch: null,
        figure: "Barack Obama", figureMatch: 93, figureRole: "Estadista",
        figures: [{ name: "Joe Biden", match: 93 }, { name: "Jonas Gahr Støre", match: 93 }, { name: "J. Robert Oppenheimer", match: 92 }],
        countries: [{ name: "Austrália", match: 94 }, { name: "Finlândia", match: 92 }, { name: "Taiwan", match: 92 }],
        countryPresent: "Austrália", countryHistorical: null
      },
      notes: ""
    },
    // Pedro Lopes
    {
      personId: "p13", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 62, poder: 38, imigracao: 50, diplomacia: 64, intervencao: 38,
              economia: 50, controle: 50, comercio: 25, religiao: 95, moral: 68, tecnologia: 63 },
      derived: {
        category: "Esquerda", ideology: "Social-Democracia Nórdica", ideologyMatch: null,
        figure: "Anders Fogh Rasmussen", figureMatch: 91, figureRole: "Estadista",
        figures: [{ name: "J. Robert Oppenheimer", match: 90 }, { name: "Jonas Gahr Støre", match: 90 }, { name: "Emmanuel Macron", match: 89 }],
        countries: [{ name: "Finlândia", match: 93 }, { name: "Tchéquia", match: 91 }, { name: "Austrália", match: 91 }],
        countryPresent: "Finlândia", countryHistorical: null
      },
      notes: ""
    },
    // Bruno Leonel
    {
      personId: "p14", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 63, poder: 50, imigracao: 32, diplomacia: 34, intervencao: 50,
              economia: 61, controle: 50, comercio: 40, religiao: 75, moral: 80, tecnologia: 33 },
      derived: {
        category: "Esquerda", ideology: "Social-Democracia Nórdica", ideologyMatch: null,
        figure: "Justin Trudeau", figureMatch: 95, figureRole: "Estadista",
        figures: [{ name: "Yamandú Orsi", match: 94 }, { name: "Al Gore", match: 94 }, { name: "Pedro Sánchez", match: 94 }],
        countries: [{ name: "Espanha", match: 95 }, { name: "Noruega", match: 95 }, { name: "Rio de Janeiro (Brasil)", match: 94 }],
        countryPresent: "Espanha", countryHistorical: null
      },
      notes: ""
    },
    // Daniela Anselmo
    {
      personId: "p15", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 37, representacao: 67, poder: 50, imigracao: 41, diplomacia: 42, intervencao: 50,
              economia: 50, controle: 62, comercio: 50, religiao: 75, moral: 63, tecnologia: 37 },
      derived: {
        category: "Centro", ideology: "Centrismo Ambientalista", ideologyMatch: null,
        figure: "Al Gore", figureMatch: 95, figureRole: "Político",
        figures: [{ name: "Barack Obama", match: 93 }, { name: "Jonas Gahr Støre", match: 93 }, { name: "Joe Biden", match: 92 }],
        countries: [{ name: "França", match: 94 }, { name: "Noruega", match: 94 }, { name: "Finlândia", match: 93 }],
        countryPresent: "França", countryHistorical: null
      },
      notes: ""
    },
    // Eduardo Mendes
    {
      personId: "p16", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 50, poder: 50, imigracao: 59, diplomacia: 50, intervencao: 50,
              economia: 78, controle: 50, comercio: 50, religiao: 50, moral: 50, tecnologia: 74 },
      derived: {
        category: "Centro", ideology: "Nacional-Desenvolvimentismo", ideologyMatch: null,
        figure: "Theodor Herzl", figureMatch: 93, figureRole: "Jornalista",
        figures: [{ name: "James Lovelock", match: 90 }, { name: "Abraham Lincoln", match: 89 }, { name: "Sun Yat-sen", match: 89 }],
        countries: [{ name: "República de Weimar", match: 90 }, { name: "França", match: 87 }, { name: "México de Cárdenas", match: 86 }],
        countryPresent: "França", countryHistorical: "República de Weimar"
      },
      notes: ""
    },
    // Henrique
    {
      personId: "p17", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 59, poder: 50, imigracao: 19, diplomacia: 30, intervencao: 65,
              economia: 36, controle: 50, comercio: 32, religiao: 89, moral: 76, tecnologia: 63 },
      derived: {
        category: "Centro", ideology: "Ordoliberalismo", ideologyMatch: null,
        figure: "Bill Gates", figureMatch: 96, figureRole: "Empresário e filantropo",
        figures: [{ name: "Eduardo Leite", match: 94 }, { name: "Jensen Huang", match: 94 }, { name: "Sam Altman", match: 94 }],
        countries: [{ name: "Suécia", match: 96 }, { name: "São Paulo (Brasil)", match: 94 }, { name: "Canadá", match: 93 }],
        countryPresent: "Suécia", countryHistorical: null
      },
      notes: ""
    },
    // Olavio
    {
      personId: "p18", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 66, representacao: 50, poder: 40, imigracao: 41, diplomacia: 42, intervencao: 50,
              economia: 50, controle: 28, comercio: 40, religiao: 58, moral: 50, tecnologia: 62 },
      derived: {
        category: "Centro", ideology: "Pragmatismo", ideologyMatch: null,
        figure: "James Madison", figureMatch: 93, figureRole: "Estadista",
        figures: [{ name: "Guilherme de Orange", match: 92 }, { name: "Jerome Powell", match: 92 }, { name: "Adam Smith", match: 92 }],
        countries: [{ name: "Austrália", match: 91 }, { name: "Rio Grande do Sul (Brasil)", match: 90 }, { name: "São Paulo (Brasil)", match: 90 }],
        countryPresent: "Austrália", countryHistorical: null
      },
      notes: ""
    },
    // Luigi
    {
      personId: "p20", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 70, representacao: 30, poder: 40, imigracao: 50, diplomacia: 50, intervencao: 50,
              economia: 35, controle: 25, comercio: 5, religiao: 100, moral: 40, tecnologia: 75 },
      derived: {
        category: "Direita", ideology: "Capitalismo", ideologyMatch: null,
        figure: "Adam Smith", figureMatch: 90, figureRole: "Economista",
        figures: [{ name: "Friedrich Nietzsche", match: 88 }, { name: "Paulo Guedes", match: 88 }, { name: "H. L. Mencken", match: 87 }],
        countries: [{ name: "Hong Kong (China)", match: 84 }, { name: "São Paulo (Brasil)", match: 84 }, { name: "República Holandesa (Províncias Unidas)", match: 83 }],
        countryPresent: "Hong Kong (China)", countryHistorical: "República Holandesa (Províncias Unidas)"
      },
      notes: ""
    },
    // Lucas Fontan
    {
      personId: "p21", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 61, poder: 64, imigracao: 58, diplomacia: 50, intervencao: 50,
              economia: 29, controle: 38, comercio: 39, religiao: 50, moral: 37, tecnologia: 67 },
      derived: {
        category: "Direita", ideology: "Pragmatismo de Direita", ideologyMatch: null,
        figure: "Sérgio Moro", figureMatch: 97, figureRole: "Ex-juiz federal e ex-ministro",
        figures: [{ name: "Dwight D. Eisenhower", match: 96 }, { name: "Michel Temer", match: 96 }, { name: "Carlos Lacerda", match: 95 }],
        countries: [{ name: "Paraná (Brasil)", match: 95 }, { name: "Peru", match: 94 }, { name: "Santa Catarina (Brasil)", match: 94 }],
        countryPresent: "Paraná (Brasil)", countryHistorical: null
      },
      notes: ""
    },
    // Caue Reis
    {
      personId: "p22", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 50, representacao: 35, poder: 60, imigracao: 75, diplomacia: 59, intervencao: 50,
              economia: 33, controle: 42, comercio: 50, religiao: 24, moral: 14, tecnologia: 50 },
      derived: {
        category: "Direita", ideology: "Conservadorismo", ideologyMatch: null,
        figure: "Tomás de Aquino", figureMatch: 94, figureRole: "Teólogo e filósofo",
        figures: [{ name: "Matteo Salvini", match: 94 }, { name: "Carlos Lacerda", match: 93 }, { name: "Roger Scruton", match: 93 }],
        countries: [{ name: "Síria", match: 94 }, { name: "Florença Renascentista", match: 93 }, { name: "Paraná (Brasil)", match: 92 }],
        countryPresent: "Síria", countryHistorical: "Florença Renascentista"
      },
      notes: ""
    },
    // Tita
    {
      personId: "p23", year: 2026, date: null,
      source: "12axes", variant: "desconhecido", inputMethod: "print", precision: 0, url: null,
      axes: { estrutura: 41, representacao: 30, poder: 36, imigracao: 72, diplomacia: 50, intervencao: 35,
              economia: 19, controle: 50, comercio: 31, religiao: 24, moral: 14, tecnologia: 37 },
      derived: {
        category: "Direita", ideology: "Conservadorismo", ideologyMatch: null,
        figure: "Olavo de Carvalho", figureMatch: 92, figureRole: "Escritor e polemista",
        figures: [{ name: "Cícero", match: 90 }, { name: "Dom Pedro I", match: 89 }, { name: "Santiago Peña", match: 89 }],
        countries: [{ name: "Síria", match: 91 }, { name: "Florença Renascentista", match: 88 }, { name: "Geórgia", match: 88 }],
        countryPresent: "Síria", countryHistorical: "Florença Renascentista"
      },
      notes: ""
    }
  ]
};
