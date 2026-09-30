# Painel 12 Eixos

Painel visual para explorar, ano a ano, o posicionamento político de um grupo de amigos nos 12 eixos do quiz [12 Axes](https://12axes.vercel.app). Em 2026 os resultados vêm do site; a partir de 2027, de uma pesquisa interna com os mesmos 12 eixos.

- HTML + CSS + JavaScript puros, sem build. Abre com duplo clique em `index.html`.
- Dependências externas só por CDN: Apache ECharts, o GeoJSON do mapa-múndi e as fontes Sora e Poppins. Nenhum dado sai do navegador.
- Interface em português do Brasil, responsiva, com tema claro e escuro.
- Visual inspirado na tela de resultado do 12 Axes (papel, cards arredondados, eyebrows, pills, anéis de %), com implementação e tokens próprios.

## Como abrir

Dê duplo clique em `index.html` (Chrome, Firefox, Safari ou celular). É preciso ter internet para o ECharts carregar da CDN; sem internet, o painel avisa e mostra só as views sem gráfico.

**Senha.** O painel pede uma senha antes de abrir. Com "Lembrar neste dispositivo" marcado ela não é pedida de novo; o cadeado no topo bloqueia outra vez. Para trocar a senha, gere o hash SHA-256 da nova e substitua `PASSWORD_SHA256` em `js/auth.js`:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('NOVA_SENHA','utf8').digest('hex'))"
```

A senha é uma porta de entrada, não criptografia: quem abrir `data/data.js` diretamente (no disco ou num repositório público) vê os dados.

**Celular.** O painel é responsivo. Os gráficos que precisam de tela larga (rede de afinidade, heatmap, matriz pessoa × pessoa e mapa-múndi) mostram no celular um aviso "Melhor no computador", com o botão "Mostrar assim mesmo" (abre com rolagem lateral); girar o celular também libera. Em tela de toque, o primeiro toque num ponto mostra os detalhes e o segundo abre a pessoa.

O estado do painel (view, ano, filtros, eixos escolhidos) fica no endereço depois do `#`. Copie o endereço para salvar ou compartilhar uma visão.

## Estrutura

```
index.html                 página única
css/style.css              estilos e tokens de tema
js/app.js                  estado, filtros, views, formulário
js/charts.js               uma função por gráfico (ECharts)
js/auth.js                 senha de entrada (só o hash SHA-256 fica no código)
js/avatars.js              avatares (foto ou iniciais)
js/geo.js                  mapa-múndi: GeoJSON da CDN e tradução de nomes de países
js/stats.js                média, desvio, distância, similaridade, PCA, agrupamento
js/filters.js              regras dos filtros de pessoas
data/data.js               OS DADOS (único arquivo a editar)
data/photos/               fotos das pessoas (p01.jpg, p02.jpg...), opcional
data/prints/2026/          prints originais, um por pessoa (p01.png, p02.png...)
data/extraction-2026.md    tabela de conferência da extração dos prints
```

## Formato dos dados (`data/data.js`)

O arquivo define `window.DATA`:

```js
window.DATA = {
  schemaVersion: 1,
  axes: [ { key, name, leftPole, rightPole }, ... ],   // 12 eixos, ordem fixa
  attributeDefs: [                                     // atributos das pessoas
    { key: "gender", label: "Gênero", type: "category", values: ["Homem", "Mulher", "Outro"] },
    { key: "city",   label: "Cidade", type: "category" }
  ],
  people: [
    { id: "p01", name: "Nome", alias: null, color: "#3B6FD4",
      photo: null,                                       // opcional, relativo a data/
      attrs: { gender: "Homem", city: "Curitiba",
               ageAt: { "2026": 26 } } }                 // ou birthYear: 2000
  ],
  results: [
    { personId: "p01", year: 2026, date: "2026-09-29",
      source: "12axes",          // "12axes" | "interna"
      variant: "desconhecido",   // "short" | "extended" | "extreme" | "desconhecido"
      inputMethod: "print",      // "print" | "url" | "manual"
      precision: 0,              // casas decimais dos valores (0 em prints, 1 em URL)
      url: null,
      axes: { estrutura: 41, representacao: 66, poder: 36, imigracao: 30, diplomacia: 28, intervencao: 55,
              economia: 72, controle: 66, comercio: 44, religiao: 81, moral: 84, tecnologia: 63 },
      derived: {
        category: "Esquerda",                          // a categoria do cartão (ESQUERDA, CENTRO...)
        ideology: "Social-Democracia Nórdica", ideologyMatch: null,   // % só na tela completa
        figure: "Barack Obama", figureMatch: 93, figureRole: "Estadista",
        figures: [ { name: "Joe Biden", match: 93 }, ... ],           // outras personalidades
        countries: [ { name: "Austrália", match: 94 }, ... ],         // os 3 países do cartão
        countryPresent: "Austrália", countryHistorical: null
      },
      notes: "" }
  ]
};
```

Regras:

- **Cada valor em `axes` é o % do polo esquerdo** (`leftPole`) do eixo, de 0 a 100. 50 é o centro. Nos prints do 12 Axes, use o número exibido para o polo esquerdo, mesmo que a soma dos dois polos dê 99 ou 101.
- `derived` é o que o site disse naquele ano. O painel só exibe e conta; nenhum cálculo usa esses campos. Campos ausentes podem ficar `null`. A `category` é uma das 8 do site (Esquerda Radical, Esquerda, Centro, Direita, Extrema Direita, Terceira Posição, Libertário, Anarquismo) e vira a tag e a cor das fichas e do mapa fixo; sem ela, o painel usa o lado econômico calculado.
- Idade: use `attrs.birthYear` quando souber o ano de nascimento, ou `attrs.ageAt` com a idade informada em um ano (`{ "2026": 26 }` vira 27 em 2027). O filtro "Idade" aparece sozinho.
- Um registro por pessoa por ano. Se houver dois, o painel usa o de `date` mais recente e avisa.
- Registros com valores faltando ou fora de 0–100 são ignorados e listados no aviso do topo. O painel nunca inventa valores.
- `color` é opcional; sem ela, o painel escolhe uma cor fixa pela posição da pessoa na lista.
- `photo` é opcional: caminho relativo à pasta `data/` (recomendado: JPG quadrado, 256 px, em `data/photos/<id>.jpg`). Sem foto, ou se o arquivo não existir, o avatar mostra as iniciais sobre a cor da pessoa. As fotos aparecem na lista de filtros, na galeria, nos cabeçalhos do heatmap e da afinidade, nos pontos do explorador (toggle "Fotos") e na visão individual. Ficam locais, como todo o resto.

### Os 12 eixos

| key | Eixo | Polo esquerdo (valor alto) | Polo direito (valor baixo) |
|---|---|---|---|
| estrutura | Estrutura | Federal | Unitário |
| representacao | Representação | Democracia | Autocracia |
| poder | Poder | Segurança | Liberdade |
| imigracao | Imigração | Assimilação | Multiculturalismo |
| diplomacia | Diplomacia | Militarista | Pacifista |
| intervencao | Intervenção | Não intervencionista | Nacionalista |
| economia | Economia | Público | Privado |
| controle | Controle | Planejamento | Livre mercado |
| comercio | Comércio | Protecionismo | Globalismo |
| religiao | Religião | Irreligioso | Religioso |
| moral | Moral | Progressista | Tradicionalista |
| tecnologia | Tecnologia | Tecnologia | Biologia |

Faixas de intensidade (|valor − 50|): < 7,5 Equilibrado · < 22,5 Inclinado · < 37,5 Forte · ≥ 37,5 Muito forte.

## Fluxo anual

1. **Coletar.** Peça o print da tela de resultado (PT ou EN) ou a URL. Salve os prints em `data/prints/<ano>/` com o id da pessoa no nome (`p01.png`, `p02.png`...). A partir de 2027, os resultados da pesquisa interna entram com `source: "interna"`.
2. **Extrair e conferir.** Para cada print, leia os 12 percentuais do polo esquerdo e os derivados. Registre tudo em `data/extraction-<ano>.md` (uma tabela por pessoa com polo esquerdo lido, polo direito lido, soma e alertas). Revise as leituras marcadas antes de seguir.
   - **Tela de resultado completa**: mostra os dois polos de cada eixo; use o número do polo esquerdo como exibido.
   - **Cartão de compartilhamento** (a imagem "Meu resultado", usada em 2026): mostra só o polo dominante de cada eixo. Se for o polo esquerdo, use o %; se for o direito, use 100 − %, com margem de ±1 por arredondamento. O cartão traz a categoria, a ideologia sem %, a personalidade mais compatível com %, outras 3 personalidades e 3 países com %. País atual e experiência histórica são o primeiro de cada tipo entre os 3 países.
   - Cartões em inglês: troque ideologia, categoria e países pelos nomes em português do site, para que se agrupem com os demais.
   - 2026 foi extraído da planilha `IBGE SOROCABA (1).xlsx`; o passo a passo e a conferência estão em `data/extraction-2026.md`.
3. **Gravar.** Copie os registros conferidos para `results` em `data/data.js`. Para não digitar à mão, use a aba **Adicionar resultado** do painel: ela valida os 12 valores, aceita a URL do site para preencher os campos e gera o JSON pronto para colar (inclusive o bloco de `people` quando a pessoa é nova).
4. **Recarregar** o `index.html`. O seletor de ano passa a listar o novo ano.

Adicionar uma pessoa é incluí-la em `people` (id único) e criar seus registros em `results`. Pessoa sem resultado em um ano simplesmente não tem registro naquele ano: ela aparece na lista de filtros como "sem resultado" e sai dos cálculos daquele ano.

Adicionar um atributo é incluí-lo em `attributeDefs` e preenchê-lo em `attrs` de cada pessoa. Ele aparece automaticamente nos filtros e nas opções "Cor por" / "Tamanho por" (e no "Comparar subgrupos", se for categoria). "Idade" é derivada de `birthYear` (ou de `ageAt`) e do ano do resultado; não precisa ser cadastrada.

## Views

- **O mapa (fixo, primeira coisa do painel).** Economia × Costumes: esquerda/direita na horizontal (média de Público e Planejamento), conservador/progressista na vertical (média de Tradicionalista, Religioso e Assimilação), cor pelo lado econômico, metades tingidas e quadrantes nomeados. O título ("Quatro quadrantes, um vazio") e as leituras ao lado são gerados a partir dos números: quadrantes vazios, quem é a exceção do seu lado, quem lidera ou divide cada canto e quem fica perto do centro. Respeita os filtros.
- **Explorador X × Y** (logo abaixo do mapa fixo). Um ponto por pessoa. Eixos X/Y: os 12 eixos, três **eixos compostos** (Economia = média de Público e Planejamento; Costumes = média de Tradicionalista, Religioso e Assimilação; Autoridade = média de Autocracia e Segurança), componentes 1 e 2 do PCA, magnitude (convicção), distância à média do grupo, similaridade com uma pessoa e atributos numéricos. Cor por pessoa, **lado econômico** (esquerda/centro/direita, com "radical" a partir de 37,5 pontos do centro), atributo ou ideologia derivada; tamanho fixo, por convicção ou por atributo numérico. Quadrantes nomeados ("Esquerda conservadora") e uma seção de **leituras automáticas** (quadrantes vazios, mais cheio, quem está perto do centro, extremos). Com mais de um ano, o rastro liga as posições da pessoa entre anos.
- **Visão do grupo.** Abre com os **Destaques do grupo**: maior convicção, mais ao centro, par mais parecido e mais distante, retrato do grupo (mais perto da média), mais fora da curva, posição mais extrema num eixo, eixo que mais divide e eixo de maior consenso. Tem também a **Rede de afinidade**: cada pessoa ligada às 1, 2 ou 3 mais parecidas (grafo de forças, arrastável), com as **turmas** listadas; cor por categoria ou por pessoa. Segue com fichas de cada pessoa (categoria do 12 Axes, ideologia, personalidade mais compatível e as outras, países, convicção, notas e as 12 barrinhas), "alma gêmea e oposto" de cada um (distância média por eixo), heatmap pessoa × eixo (divergente, centrado em 50, pessoas ordenadas por agrupamento hierárquico), faixas por eixo com a média marcada, ranking consenso vs divisão (desvio padrão), matriz pessoa × pessoa em similaridade (%) ou distância média por eixo (pontos), com números e o lado econômico ao lado de cada nome, e contagens dos derivados.
- **Comparar subgrupos.** Média por eixo de cada valor de um atributo categórico, em barras divergentes ou radar sobreposto, com o n de cada subgrupo e aviso para n < 3. No **radar**, cada pessoa é um contorno fino na cor do subgrupo e a média é o contorno grosso; dá para mostrar pessoas e médias, só pessoas ou só médias, e escolher quem aparece clicando nos nomes (ou no nome do subgrupo para ligar/desligar todos).
- **Visão individual.** Hero com foto, atributos, anéis de convicção e de similaridade com a média; linhas por eixo (caixas dos polos, trilho com o ponto da pessoa e a marca da média do filtro, tag de intensidade); os eixos em que a pessoa mais se afasta e mais se parece com o grupo; radar; termômetro de convicção; 3 pessoas mais próximas e 3 mais distantes; leitura do site e notas. Com mais de um ano, linhas por eixo no tempo e tabela de mudanças.
- **Visão do grupo** inclui o **mapa-múndi** dos países mais próximos: cada avatar fica sobre o país que o 12 Axes apontou para a pessoa, alternando entre país atual, experiência histórica (que cai no território atual correspondente) e os 3 países do cartão. O GeoJSON vem da CDN (arquivo estático do pacote echarts@4); os nomes em português são traduzidos por `js/geo.js`. Nomes que o painel não reconhecer aparecem listados sob o mapa: acrescente um apelido em `ALIASES` ou uma palavra-chave em `KEYWORDS` nesse arquivo.
- **Adicionar resultado.** Formulário que gera o JSON (não grava nada).
- **Sobre.** Como ler cada gráfico e a nota sobre os derivados.

## Filtros

A gaveta de filtros (botão "Filtros" no topo) vale para todas as views. A coluna da direita resume o filtro atual (pessoas, ano, eixo de maior consenso e de maior divisão, convicção média) e lista as seções da view. Modos: Todas · Apenas selecionadas (seleção manual E filtros por atributo) · Por atributo. Médias, desvios, PCA e afinidades são recalculados só com o subconjunto filtrado; a média do grupo inteiro pode ser exibida como referência.

## Cálculos (`js/stats.js`)

- Vetor centrado: v − 50. Magnitude/convicção: média de |v − 50|.
- Similaridade entre pessoas: 100 × (1 − distância euclidiana / distância máxima), com distância máxima = √12 × 100. Distância média por eixo = distância euclidiana / √12 (pontos de 0 a 100).
- Eixos compostos (média de eixos, cada um lido na direção indicada) e lado econômico pelo composto Economia: Centro se |v − 50| < 7,5; radical se ≥ 37,5.
- Média e desvio padrão (populacional) por eixo do subconjunto filtrado.
- Distância de cada pessoa à média do grupo filtrado.
- PCA 2D em JavaScript (covariância + autovetores por rotações de Jacobi), com os pesos de cada eixo em cada componente.
- Agrupamento hierárquico aglomerativo (ligação média) só para ordenar pessoas no heatmap e na afinidade.
- Com mais de um ano: mudança por pessoa entre anos consecutivos.

## Nota sobre o projeto original

O quiz 12 Axes é proprietário ("todos os direitos reservados"). Este painel usa apenas a estrutura pública do modelo (nomes dos eixos, polos, regra de intensidade e formato da URL de resultado) para interpretar os prints. Nenhuma pergunta, vetor, texto, imagem ou código do projeto original é reproduzido aqui.
