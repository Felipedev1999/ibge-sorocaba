/*
  js/app.js — estado global, filtros, views e ligação com os gráficos.

  Fluxo: DATA (data/data.js) → validação → estado (com espelho na URL, no hash)
  → contexto calculado (pessoas filtradas, médias, PCA) → view atual → Charts.
  Qualquer mudança de estado chama render(), que redesenha a view inteira.
*/
(function () {
  'use strict';

  var DATA = window.DATA;
  var Stats = window.Stats;
  var Filters = window.Filters;
  var Charts = window.Charts;
  var Avatars = window.Avatars;

  var VIEWS = [
    { id: 'explorer', label: 'Mapa e explorador' },
    { id: 'group', label: 'Visão do grupo' },
    { id: 'compare', label: 'Comparar subgrupos' },
    { id: 'person', label: 'Visão individual' },
    { id: 'add', label: 'Adicionar resultado' },
    { id: 'about', label: 'Sobre' }
  ];

  var PRESETS = [
    { label: 'Economia × Costumes', x: 'comp:economia', y: 'comp:costumes' },
    { label: 'Economia × Autoridade', x: 'comp:economia', y: 'comp:autoridade' },
    { label: 'Economia × Moral', x: 'axis:economia', y: 'axis:moral' },
    { label: 'Representação × Poder', x: 'axis:representacao', y: 'axis:poder' },
    { label: 'PCA 1 × PCA 2', x: 'pca:1', y: 'pca:2' },
    { label: 'Convicção × Distância', x: 'mag', y: 'dist' }
  ];

  // Derivados contados na visão do grupo. `get` devolve a lista de valores de um resultado.
  var DERIVED_DEFS = [
    { key: 'category', label: 'Categoria no espectro', get: function (d) { return [d.category]; } },
    { key: 'ideology', label: 'Ideologia principal', get: function (d) { return [d.ideology]; } },
    { key: 'figure', label: 'Figura mais próxima', get: function (d) { return [d.figure]; } },
    { key: 'figures', label: 'Personalidades no top 4', get: function (d) { return [d.figure].concat((d.figures || []).map(function (f) { return f.name; })); } },
    { key: 'countryPresent', label: 'País atual', get: function (d) { return [d.countryPresent]; } },
    { key: 'countryHistorical', label: 'Experiência histórica', get: function (d) { return [d.countryHistorical]; } },
    { key: 'countries', label: 'Países no top 3', get: function (d) { return (d.countries || []).map(function (c) { return c.name; }); } }
  ];

  // Categorias do 12 Axes (as 8 do site) com cor fixa. O lado econômico
  // calculado usa os mesmos rótulos e cores quando coincide.
  var CATEGORY_STYLES = [
    { key: 'esquerda radical', label: 'Esquerda Radical', color: '#b3261e' },
    { key: 'esquerda', label: 'Esquerda', color: '#e34948' },
    { key: 'centro', label: 'Centro', color: '#8a8a84' },
    { key: 'direita', label: 'Direita', color: '#2a78d6' },
    { key: 'direita radical', label: 'Direita Radical', color: '#1c3f8a' },
    { key: 'extrema direita', label: 'Extrema Direita', color: '#16306b' },
    { key: 'terceira posição', label: 'Terceira Posição', color: '#8d5b1a' },
    { key: 'libertário', label: 'Libertário', color: '#c98500' },
    { key: 'anarquismo', label: 'Anarquismo', color: '#5e3a8c' }
  ];
  function categoryStyle(label) {
    var k = String(label || '').toLowerCase().trim();
    return CATEGORY_STYLES.filter(function (c) { return c.key === k; })[0] || { key: k, label: label, color: '#8a8a84' };
  }
  var CATEGORY_ORDER = CATEGORY_STYLES.map(function (c) { return c.label; });

  var state = null;
  var problems = [];       // problemas encontrados nos dados
  var resultIndex = {};    // 'personId|year' -> result
  var years = [];          // anos com pelo menos um resultado válido
  var ui = { search: '', forceWide: {}, allFichas: false };

  // ---------------------------------------------------------------------------
  // Utilidades de DOM
  // ---------------------------------------------------------------------------
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    if (children === null || children === undefined) return;
    if (Array.isArray(children)) { children.forEach(function (c) { append(el, c); }); return; }
    if (typeof children === 'string' || typeof children === 'number') { el.appendChild(document.createTextNode(String(children))); return; }
    el.appendChild(children);
  }
  function esc(s) { return Charts.esc(s); }
  function isNum(v) { return v !== null && v !== undefined && v !== '' && isFinite(Number(v)); }
  function fmt(v, d) { return Charts.fmt(v, d); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  function select(options, value, onChange, attrs) {
    var sel = h('select', Object.assign({ onChange: function (e) { onChange(e.target.value); } }, attrs || {}));
    var groups = {};
    var order = [];
    options.forEach(function (o) {
      var g = o.group || '';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(o);
    });
    order.forEach(function (g) {
      var parent = sel;
      if (g) { parent = h('optgroup', { label: g }); sel.appendChild(parent); }
      groups[g].forEach(function (o) {
        parent.appendChild(h('option', { value: o.id, selected: o.id === value, disabled: !!o.disabled }, o.label));
      });
    });
    sel.value = value;
    return sel;
  }

  function toggle(label, checked, onChange, title) {
    return h('label', { class: 'toggle', title: title || null }, [
      h('input', { type: 'checkbox', checked: checked, onChange: function (e) { onChange(e.target.checked); } }),
      h('span', null, label)
    ]);
  }

  function segmented(options, value, onChange, ariaLabel) {
    return h('div', { class: 'segmented', role: 'group', 'aria-label': ariaLabel || null }, options.map(function (o) {
      return h('button', { class: o.id === value ? 'on' : '', type: 'button', onClick: function () { onChange(o.id); } }, o.label);
    }));
  }

  // Seção numerável (aparece na navegação da coluna direita).
  function section(id, eyebrow, title, children, tools) {
    return h('section', { class: 'section', id: 'sec-' + id, 'data-title': title }, [
      h('div', { class: 'section-head' }, [
        h('div', null, [eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null, h('h2', null, title)]),
        tools ? h('div', { class: 'section-tools' }, tools) : null
      ]),
      children
    ]);
  }

  function pageHead(eyebrow, titleHtml, lead) {
    return h('div', { class: 'page-head' }, [
      h('p', { class: 'eyebrow' }, eyebrow),
      h('h1', { html: titleHtml }),
      lead ? h('p', { class: 'lead' }, lead) : null
    ]);
  }

  function chartBox(id, height) {
    return h('div', { class: 'chart', id: id, style: height ? 'height:' + height + 'px' : null });
  }

  function empty(msg) { return h('div', { class: 'empty' }, msg); }

  function note(html, kind) { return h('p', { class: 'note' + (kind ? ' note-' + kind : ''), html: html }); }

  function pill(text, kind) { return h('span', { class: 'pill' + (kind ? ' ' + kind : '') }, text); }

  // Anel de percentual (SVG). text: valor grande; label: legenda pequena.
  function ring(pct, size, label, color, text) {
    var stroke = size >= 100 ? 9 : 7;
    var r = size / 2 - stroke / 2 - 1;
    var c = 2 * Math.PI * r;
    var v = Math.max(0, Math.min(100, pct || 0));
    var wrap = h('div', { class: 'ring' + (size < 80 ? ' ring-sm' : ''), style: 'width:' + size + 'px;height:' + size + 'px', role: 'img', 'aria-label': (label || '') + ' ' + fmt(pct, 0) + '%' });
    wrap.innerHTML = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (color || 'var(--accent)') + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + (c * v / 100).toFixed(1) + ' ' + c.toFixed(1) + '"/></svg>';
    wrap.appendChild(h('div', { class: 'ring-text' }, [h('strong', null, text || (fmt(pct, 0) + '%')), label ? h('small', null, label) : null]));
    return wrap;
  }

  function avatar(person, size) {
    return Avatars.el(person, size, { color: colorOf(person), label: nameOf(person) });
  }

  // ---------------------------------------------------------------------------
  // Validação dos dados
  // ---------------------------------------------------------------------------
  function validate() {
    problems = [];
    if (!DATA || !Array.isArray(DATA.axes) || DATA.axes.length !== 12) {
      problems.push('DATA.axes precisa ter exatamente 12 eixos.');
    }
    var keys = Stats.axisKeys(DATA);
    var peopleById = {};
    (DATA.people || []).forEach(function (p) {
      if (!p.id) { problems.push('Pessoa sem id: ' + JSON.stringify(p)); return; }
      if (peopleById[p.id]) problems.push('Id de pessoa repetido: ' + p.id);
      peopleById[p.id] = p;
    });
    resultIndex = {};
    var yearsSet = {};
    (DATA.results || []).forEach(function (r, i) {
      var who = (r.personId || '?') + '/' + (r.year || '?');
      if (!peopleById[r.personId]) { problems.push('Resultado #' + (i + 1) + ' (' + who + '): pessoa "' + r.personId + '" não existe em people.'); return; }
      if (!isFinite(Number(r.year))) { problems.push('Resultado ' + who + ': ano inválido.'); return; }
      var bad = [];
      keys.forEach(function (k) {
        var v = r.axes ? r.axes[k] : undefined;
        if (v === null || v === undefined || v === '' || !isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100) bad.push(k);
      });
      if (bad.length) { problems.push('Resultado ' + who + ': valores ausentes ou fora de 0–100 em: ' + bad.join(', ') + '. Registro ignorado.'); return; }
      var key = r.personId + '|' + r.year;
      var prev = resultIndex[key];
      if (prev) {
        problems.push('Resultado duplicado para ' + who + '; mantido o de data mais recente.');
        if (String(r.date || '') < String(prev.date || '')) return;
      }
      resultIndex[key] = r;
      yearsSet[Number(r.year)] = true;
    });
    years = Object.keys(yearsSet).map(Number).sort(function (a, b) { return a - b; });
  }

  function personById(id) {
    for (var i = 0; i < DATA.people.length; i++) if (DATA.people[i].id === id) return DATA.people[i];
    return null;
  }
  function colorOf(p) {
    if (p.color) return p.color;
    var idx = DATA.people.indexOf(p);
    return Charts.PALETTE[(idx < 0 ? 0 : idx) % Charts.PALETTE.length];
  }
  function nameOf(p) {
    return state.names === 'alias' && p.alias ? p.alias : p.name;
  }
  function otherNameOf(p) {
    return state.names === 'alias' ? p.name : (p.alias || '');
  }
  function resultOf(pid, year) {
    return resultIndex[pid + '|' + year] || null;
  }

  // ---------------------------------------------------------------------------
  // Estado e URL (hash)
  // ---------------------------------------------------------------------------
  function defaultState() {
    var cats = Filters.attributeDefs(DATA).filter(function (d) { return d.type === 'category'; });
    return {
      view: 'explorer',
      year: years.length ? years[years.length - 1] : null,
      names: 'name',
      photos: Avatars.hasAny(DATA.people),
      filters: Filters.defaultState(),
      showRef: true,
      explorer: { x: 'axis:economia', y: 'axis:moral', color: 'person', size: 'fixed', labels: true, trails: false, sim: null },
      group: { values: true, map: 'countryPresent', aff: 'sim', netK: 1, netColor: 'side', stripColor: 'person' },
      compare: { attr: cats.length ? cats[0].key : null, mode: 'bars', radarShow: 'both', radarSel: null },
      person: null
    };
  }

  function enc(v) {
    return encodeURIComponent(String(v)).replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%7C/gi, '|').replace(/%7E/gi, '~').replace(/%20/g, '+');
  }
  function dec(v) {
    try { return decodeURIComponent(String(v).replace(/\+/g, ' ')); } catch (e) { return v; }
  }

  function writeHash() {
    var p = {};
    var d = defaultState();
    if (state.view !== 'explorer') p.v = state.view;
    if (state.year !== d.year) p.y = state.year;
    if (state.names !== 'name') p.n = state.names;
    if (state.photos !== d.photos) p.ph = state.photos ? 1 : 0;
    if (!state.showRef) p.ref = 0;
    Object.assign(p, Filters.serialize(state.filters));
    var ex = state.explorer;
    if (ex.x !== d.explorer.x) p.x = ex.x;
    if (ex.y !== d.explorer.y) p.yx = ex.y;
    if (ex.color !== 'person') p.c = ex.color;
    if (ex.size !== 'fixed') p.s = ex.size;
    if (!ex.labels) p.lb = 0;
    if (ex.trails) p.tr = 1;
    if (ex.sim) p.sim = ex.sim;
    if (!state.group.values) p.gv = 0;
    if (state.group.map === 'countryHistorical') p.mk = 'h';
    if (state.group.map === 'countries') p.mk = 't';
    if (state.group.aff === 'dist') p.am = 'd';
    if (state.group.netK !== 1) p.nk = state.group.netK;
    if (state.group.netColor !== 'side') p.nc = state.group.netColor;
    if (state.group.stripColor !== 'person') p.sc = state.group.stripColor;
    if (state.compare.attr && state.compare.attr !== d.compare.attr) p.cmp = state.compare.attr;
    if (state.compare.mode !== 'bars') p.cm = state.compare.mode;
    if (state.compare.radarShow !== 'both') p.rs = state.compare.radarShow;
    if (state.compare.radarSel) p.rsel = state.compare.radarSel.length ? state.compare.radarSel.join('.') : 'none';
    if (state.person) p.p = state.person;
    var hash = Object.keys(p).map(function (k) { return k + '=' + enc(p[k]); }).join('&');
    var target = hash ? '#' + hash : '';
    if ((location.hash || '') === target) return;
    try {
      history.replaceState(null, '', location.pathname + location.search + target);
    } catch (e) {
      location.hash = hash;
    }
  }

  function readHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    var p = {};
    if (raw) raw.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      p[dec(kv.slice(0, i))] = dec(kv.slice(i + 1));
    });
    var s = defaultState();
    if (p.v && VIEWS.some(function (v) { return v.id === p.v; })) s.view = p.v;
    if (p.y && years.indexOf(Number(p.y)) >= 0) s.year = Number(p.y);
    if (p.n === 'alias') s.names = 'alias';
    if (p.ph === '0') s.photos = false;
    if (p.ph === '1') s.photos = true;
    if (p.ref === '0') s.showRef = false;
    s.filters = Filters.parse(p, DATA);
    if (p.x) s.explorer.x = p.x;
    if (p.yx) s.explorer.y = p.yx;
    if (p.c) s.explorer.color = p.c;
    if (p.s) s.explorer.size = p.s;
    if (p.lb === '0') s.explorer.labels = false;
    if (p.tr === '1') s.explorer.trails = true;
    if (p.sim) s.explorer.sim = p.sim;
    if (p.gv === '0') s.group.values = false;
    if (p.mk === 'h') s.group.map = 'countryHistorical';
    if (p.mk === 't') s.group.map = 'countries';
    if (p.am === 'd') s.group.aff = 'dist';
    if (p.nk === '2' || p.nk === '3') s.group.netK = Number(p.nk);
    if (p.nc === 'person') s.group.netColor = 'person';
    if (p.sc === 'side') s.group.stripColor = 'side';
    if (p.cmp) s.compare.attr = p.cmp;
    if (p.cm === 'radar') s.compare.mode = 'radar';
    if (p.rs === 'people' || p.rs === 'means') s.compare.radarShow = p.rs;
    if (p.rsel) s.compare.radarSel = p.rsel === 'none' ? [] : p.rsel.split('.').filter(Boolean);
    if (p.p) s.person = p.p;
    return s;
  }

  function set(fn) {
    fn(state);
    writeHash();
    render();
  }

  // ---------------------------------------------------------------------------
  // Contexto calculado
  // ---------------------------------------------------------------------------
  function buildCtx() {
    var keys = Stats.axisKeys(DATA);
    var year = state.year;
    var allPeople = DATA.people.filter(function (p) { return !!resultOf(p.id, year); });
    var people = Filters.apply(DATA, year, state.filters, allPeople);
    var vecCache = {};
    function vec(pid, y) {
      var k = pid + '|' + y;
      if (vecCache[k] !== undefined) return vecCache[k];
      var r = resultOf(pid, y);
      vecCache[k] = r ? Stats.toVector(r.axes, keys) : null;
      return vecCache[k];
    }
    var vectors = people.map(function (p) { return vec(p.id, year); });
    var mean = Stats.meanVector(vectors);
    var sd = Stats.sdVector(vectors, mean);
    var meanAll = Stats.meanVector(allPeople.map(function (p) { return vec(p.id, year); }));
    var pca = Stats.pca(vectors);
    var axisByKey = {};
    DATA.axes.forEach(function (a) { axisByKey[a.key] = a; });
    // Lado econômico calculado (média de Público e Planejamento).
    function calcSide(p, y) {
      var v = vec(p.id, y === undefined ? year : y);
      if (!v) return null;
      var s = categoryStyle(Stats.economicSide(v, keys).label);
      return { label: s.label, color: s.color, source: 'calc' };
    }
    // Categoria que o 12 Axes deu; sem ela, o lado econômico calculado.
    function sideOf(p, y) {
      var r = resultOf(p.id, y === undefined ? year : y);
      var cat = r && r.derived && r.derived.category;
      if (cat) { var s = categoryStyle(cat); return { label: s.label, color: s.color, source: 'site' }; }
      return calcSide(p, y);
    }
    return {
      sideOf: sideOf, calcSide: calcSide,
      data: DATA, axes: DATA.axes, keys: keys, year: year, years: years,
      people: people, allPeople: allPeople,
      filterActive: Filters.isActive(state.filters),
      vec: vec, result: resultOf, personById: personById,
      axisByKey: function (k) { return axisByKey[k]; },
      name: nameOf, color: colorOf,
      mean: mean, sd: sd, meanAll: meanAll, pca: pca,
      showRef: state.showRef, photos: state.photos
    };
  }

  // ---------------------------------------------------------------------------
  // Métricas do explorador
  // ---------------------------------------------------------------------------
  function metricOptions(ctx) {
    var list = [];
    ctx.axes.forEach(function (a) {
      list.push({ id: 'axis:' + a.key, label: a.name + '  (' + a.leftPole + ' ↔ ' + a.rightPole + ')', group: 'Os 12 eixos' });
    });
    Stats.COMPOSITES.forEach(function (c) {
      list.push({ id: 'comp:' + c.id, label: c.name + '  (' + c.leftPole + ' ↔ ' + c.rightPole + ')', group: 'Eixos compostos' });
    });
    list.push({ id: 'pca:1', label: 'Componente 1 do PCA', group: 'Estatísticas do grupo filtrado' });
    list.push({ id: 'pca:2', label: 'Componente 2 do PCA', group: 'Estatísticas do grupo filtrado' });
    list.push({ id: 'mag', label: 'Magnitude / convicção', group: 'Estatísticas do grupo filtrado' });
    list.push({ id: 'dist', label: 'Distância à média do grupo', group: 'Estatísticas do grupo filtrado' });
    list.push({ id: 'sim', label: 'Similaridade com uma pessoa', group: 'Estatísticas do grupo filtrado' });
    Filters.attributeDefs(DATA).filter(function (d) { return d.type === 'number'; }).forEach(function (d) {
      list.push({ id: 'attr:' + d.key, label: d.label, group: 'Atributos' });
    });
    return list;
  }

  function metric(ctx, id) {
    var parts = id.split(':');
    var kind = parts[0], arg = parts[1];
    if (kind === 'axis') {
      var axis = ctx.axisByKey(arg);
      if (!axis) return metric(ctx, 'axis:' + ctx.axes[0].key);
      var idx = ctx.keys.indexOf(arg);
      return { id: id, label: axis.name, isAxis: true, axis: axis, min: 0, max: 100, value: function (pid, y) { var v = ctx.vec(pid, y); return v ? v[idx] : null; } };
    }
    if (kind === 'comp') {
      var def0 = Stats.COMPOSITES.filter(function (c) { return c.id === arg; })[0];
      if (!def0) return metric(ctx, 'comp:economia');
      return {
        id: id, label: def0.name.replace(' (composto)', ''), isAxis: true, composite: def0, min: 0, max: 100,
        axis: { name: def0.name, leftPole: def0.leftPole, rightPole: def0.rightPole, quadLeft: def0.quadLeft, quadRight: def0.quadRight, tickLeft: def0.tickLeft, tickRight: def0.tickRight },
        value: function (pid, y) { var v = ctx.vec(pid, y); return v ? Stats.composite(v, ctx.keys, def0) : null; }
      };
    }
    if (kind === 'pca') {
      var k = arg === '2' ? 1 : 0;
      var ok = ctx.pca.ok && (k === 0 || ctx.pca.explained[1] > 0);
      return {
        id: id, isAxis: false, min: null, max: null,
        label: 'Componente ' + (k + 1) + (ok ? ' (' + fmt(ctx.pca.explained[k] * 100, 0) + '% da variância)' : ' (indisponível)'),
        value: function (pid, y) { if (!ok) return null; var v = ctx.vec(pid, y); return v ? Stats.pcaProject(ctx.pca, v)[k] : null; }
      };
    }
    if (kind === 'mag') {
      return { id: id, label: 'Convicção (média de |valor − 50|)', isAxis: false, min: 0, max: 50, value: function (pid, y) { var v = ctx.vec(pid, y); return v ? Stats.magnitude(v) : null; } };
    }
    if (kind === 'dist') {
      return { id: id, label: 'Distância à média do grupo filtrado', isAxis: false, min: 0, max: null, value: function (pid, y) { var v = ctx.vec(pid, y); return v && ctx.mean ? Stats.euclid(v, ctx.mean) : null; } };
    }
    if (kind === 'sim') {
      var refId = state.explorer.sim && personById(state.explorer.sim) ? state.explorer.sim : (ctx.people[0] ? ctx.people[0].id : null);
      var refPerson = refId ? personById(refId) : null;
      var refVec = refId ? ctx.vec(refId, ctx.year) : null;
      return {
        id: id, isAxis: false, min: 0, max: 100, refId: refId,
        label: 'Similaridade com ' + (refPerson ? nameOf(refPerson) : '—') + ' (%)',
        value: function (pid, y) { var v = ctx.vec(pid, y); return v && refVec ? Stats.similarity(v, refVec) : null; }
      };
    }
    if (kind === 'attr') {
      var def = Filters.defByKey(DATA, arg);
      if (!def || def.type !== 'number') return metric(ctx, 'mag');
      return { id: id, label: def.label, isAxis: false, min: null, max: null, value: function (pid, y) { return Filters.attrValue(personById(pid), def, y); } };
    }
    return metric(ctx, 'axis:' + ctx.axes[0].key);
  }

  // ---------------------------------------------------------------------------
  // Cabeçalho, navegação, chips, gaveta e coluna direita
  // ---------------------------------------------------------------------------
  function renderTop(ctx) {
    var top = $('#topbar');
    top.innerHTML = '';
    var yearOpts = years.map(function (y) { return { id: String(y), label: String(y) }; });
    var active = Filters.chips(DATA, state.filters).length;
    top.appendChild(h('div', { class: 'brand' }, [
      h('div', null, [
        h('div', { class: 'logo' }, [h('b', null, '12'), h('span', null, 'eixos')]),
        h('p', { class: 'sub' }, 'Painel de posicionamento político do grupo')
      ])
    ]));
    top.appendChild(h('div', { class: 'top-controls' }, [
      h('button', { class: 'btn' + (active ? ' btn-primary' : ''), type: 'button', 'aria-label': 'Abrir filtros', onClick: function () { openDrawer(true); } }, [
        '☰ Filtros', h('span', { class: 'badge' }, active ? String(active) : (ctx.people.length + '/' + ctx.allPeople.length))
      ]),
      h('label', { class: 'field field-inline' }, [h('span', { class: 'field-label' }, 'Ano'), years.length ? select(yearOpts, String(state.year), function (v) { set(function (s) { s.year = Number(v); }); }, { 'aria-label': 'Ano' }) : h('span', { class: 'muted' }, '—')]),
      DATA.people.some(function (p) { return !!p.alias; })
        ? segmented([{ id: 'name', label: 'Nome' }, { id: 'alias', label: 'Apelido' }], state.names, function (v) { set(function (s) { s.names = v; }); }, 'Exibir nomes como')
        : null,
      h('button', { class: 'icon-btn', type: 'button', title: 'Alternar tema claro/escuro', 'aria-label': 'Alternar tema', onClick: toggleTheme }, document.documentElement.getAttribute('data-theme') === 'dark' ? '☀' : '☾'),
      window.Auth ? h('button', { class: 'icon-btn', type: 'button', title: 'Bloquear o painel (pede a senha de novo)', 'aria-label': 'Bloquear o painel', onClick: function () { window.Auth.lock(); } }, '🔒') : null
    ]));
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* sem storage */ }
    render();
  }

  function renderTabs() {
    var nav = $('#tabs');
    nav.innerHTML = '';
    VIEWS.forEach(function (v) {
      nav.appendChild(h('button', {
        class: 'tab' + (state.view === v.id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': state.view === v.id ? 'true' : 'false',
        onClick: function () { set(function (s) { s.view = v.id; }); window.scrollTo({ top: 0 }); }
      }, v.label));
    });
    // No celular as abas rolam na horizontal: mantém a aba ativa à vista.
    var on = nav.querySelector('.tab.on');
    if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - 16);
  }

  function renderChips(ctx) {
    var box = $('#chips');
    box.innerHTML = '';
    var chips = Filters.chips(DATA, state.filters);
    box.appendChild(h('span', { class: 'count' }, 'Mostrando ' + ctx.people.length + ' de ' + ctx.allPeople.length + ' pessoa(s) com resultado em ' + ctx.year));
    chips.forEach(function (c) {
      box.appendChild(h('button', {
        class: 'chip', type: 'button', title: 'Remover este filtro',
        onClick: function () {
          set(function (s) {
            if (c.kind === 'mode') { s.filters.mode = Filters.isActive({ mode: 'attr', attrs: s.filters.attrs }) ? 'attr' : 'all'; }
            else { delete s.filters.attrs[c.key]; }
          });
        }
      }, [c.label, h('span', { class: 'x' }, '×')]));
    });
    if (chips.length) {
      box.appendChild(h('button', { class: 'link', type: 'button', onClick: function () { set(function (s) { s.filters = Filters.defaultState(); }); } }, 'Limpar filtros'));
    }
  }

  function openDrawer(open) {
    document.body.classList.toggle('drawer-open', open);
    if (open) { var inp = $('#sidebar input[type=search]'); if (inp && window.innerWidth > 800) inp.focus(); }
  }

  function renderSidebar(ctx) {
    var side = $('#sidebar');
    side.innerHTML = '';
    var f = state.filters;
    var defs = Filters.attributeDefs(DATA);

    side.appendChild(h('div', { class: 'side-head' }, [
      h('h2', null, 'Filtros de pessoas'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fechar filtros', onClick: function () { openDrawer(false); } }, '×')
    ]));
    side.appendChild(h('p', { class: 'side-count' }, 'Mostrando ' + ctx.people.length + ' de ' + ctx.allPeople.length + ' pessoa(s) em ' + ctx.year));

    var modes = [['all', 'Todas'], ['selected', 'Apenas selecionadas'], ['attr', 'Por atributo']];
    side.appendChild(h('fieldset', { class: 'mode' }, [h('legend', null, 'Modo')].concat(modes.map(function (m) {
      return h('label', null, [
        h('input', { type: 'radio', name: 'fmode', value: m[0], checked: f.mode === m[0], onChange: function () { set(function (s) { s.filters.mode = m[0]; }); } }),
        h('span', null, m[1])
      ]);
    }))));
    side.appendChild(h('p', { class: 'hint' }, f.mode === 'all' ? 'Nenhum filtro aplicado.' : f.mode === 'selected' ? 'Seleção manual E filtros por atributo.' : 'Só os filtros por atributo se aplicam.'));

    var q = ui.search.trim().toLowerCase();
    var list = h('ul', { class: 'people-list' });
    DATA.people.forEach(function (p) {
      var label = nameOf(p);
      var other = otherNameOf(p);
      if (q && (label + ' ' + other).toLowerCase().indexOf(q) < 0) return;
      var has = !!resultOf(p.id, state.year);
      var checked = f.selected.indexOf(p.id) >= 0;
      list.appendChild(h('li', { class: has ? '' : 'no-result' }, [
        h('label', null, [
          h('input', {
            type: 'checkbox', checked: checked, disabled: f.mode !== 'selected',
            onChange: function (e) {
              var on = e.target.checked;
              set(function (s) {
                var i = s.filters.selected.indexOf(p.id);
                if (on && i < 0) s.filters.selected.push(p.id);
                if (!on && i >= 0) s.filters.selected.splice(i, 1);
              });
            }
          }),
          avatar(p, 'sm'),
          h('span', { class: 'pname' }, label),
          other ? h('span', { class: 'palias' }, other) : null,
          has ? null : h('span', { class: 'nores' }, 'sem resultado em ' + state.year)
        ])
      ]));
    });
    side.appendChild(h('section', { class: 'people' }, [
      h('div', { class: 'people-tools' }, [
        h('input', {
          type: 'search', placeholder: 'Buscar pessoa…', value: ui.search, 'aria-label': 'Buscar pessoa',
          onInput: function (e) { ui.search = e.target.value; renderSidebar(buildCtx()); var inp = $('#sidebar input[type=search]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
        }),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'small', type: 'button', disabled: f.mode !== 'selected', onClick: function () { set(function (s) { s.filters.selected = DATA.people.filter(function (p) { return !!resultOf(p.id, s.year); }).map(function (p) { return p.id; }); }); } }, 'Marcar todas'),
          h('button', { class: 'small', type: 'button', disabled: f.mode !== 'selected', onClick: function () { set(function (s) { s.filters.selected = []; }); } }, 'Limpar')
        ])
      ]),
      list
    ]));

    var attrsBox = h('section', { class: 'attrs' }, [h('h3', null, 'Por atributo')]);
    if (!defs.length) attrsBox.appendChild(h('p', { class: 'hint' }, 'Nenhum atributo definido em attributeDefs.'));
    defs.forEach(function (def) {
      var disabled = f.mode === 'all';
      var box = h('div', { class: 'attr' + (disabled ? ' disabled' : '') }, [h('h4', null, def.label + (def.derived ? ' (derivada)' : ''))]);
      if (def.type === 'category') {
        var values = Filters.categoryValues(DATA, def);
        if (Filters.hasMissing(DATA, def, state.year)) values = values.concat([Filters.NONE]);
        var current = Array.isArray(f.attrs[def.key]) ? f.attrs[def.key] : [];
        values.forEach(function (v) {
          box.appendChild(h('label', { class: 'check' }, [
            h('input', {
              type: 'checkbox', checked: current.indexOf(v) >= 0, disabled: disabled,
              onChange: function (e) {
                var on = e.target.checked;
                set(function (s) {
                  var arr = Array.isArray(s.filters.attrs[def.key]) ? s.filters.attrs[def.key].slice() : [];
                  var i = arr.indexOf(v);
                  if (on && i < 0) arr.push(v);
                  if (!on && i >= 0) arr.splice(i, 1);
                  if (arr.length) s.filters.attrs[def.key] = arr; else delete s.filters.attrs[def.key];
                });
              }
            }),
            h('span', null, v === Filters.NONE ? Filters.NONE_LABEL : v)
          ]));
        });
      } else {
        var range = Filters.numericRange(DATA, def, state.year);
        var cur = f.attrs[def.key] || {};
        var numInput = function (which) {
          return h('input', {
            type: 'number', placeholder: range ? String(which === 'min' ? range.min : range.max) : '', value: cur[which] === undefined ? '' : cur[which], disabled: disabled,
            'aria-label': def.label + ' ' + (which === 'min' ? 'mínimo' : 'máximo'),
            onChange: function (e) {
              var val = e.target.value;
              set(function (s) {
                var obj = Object.assign({}, s.filters.attrs[def.key] || {});
                if (val === '' || !isFinite(Number(val))) delete obj[which]; else obj[which] = Number(val);
                if (obj.min === undefined && obj.max === undefined) delete s.filters.attrs[def.key]; else s.filters.attrs[def.key] = obj;
              });
            }
          });
        };
        box.appendChild(h('div', { class: 'range' }, [numInput('min'), h('span', null, 'a'), numInput('max')]));
        if (range) box.appendChild(h('p', { class: 'hint' }, 'Observado: ' + range.min + ' a ' + range.max));
      }
      attrsBox.appendChild(box);
    });
    side.appendChild(attrsBox);

    side.appendChild(h('section', { class: 'side-foot' }, [
      toggle('Mostrar a média do grupo inteiro como referência', state.showRef, function (on) { set(function (s) { s.showRef = on; }); }, 'Quando há filtro ativo, mostra também a média de todas as pessoas do ano.'),
      Avatars.hasAny(DATA.people) ? toggle('Mostrar fotos nos gráficos', state.photos, function (on) { set(function (s) { s.photos = on; }); }) : null
    ]));
  }

  function renderRail(ctx) {
    var rail = $('#rail');
    rail.innerHTML = '';
    var meta = h('div', { class: 'rail-card rail-meta' }, [h('h4', null, 'Resumo')]);
    meta.appendChild(h('div', null, [h('span', null, 'Pessoas no filtro'), h('b', null, ctx.people.length + ' de ' + ctx.allPeople.length)]));
    meta.appendChild(h('div', null, [h('span', null, 'Ano'), h('b', null, ctx.year ? String(ctx.year) : '—')]));
    meta.appendChild(h('div', null, [h('span', null, 'Eixos analisados'), h('b', null, String(ctx.axes.length))]));
    if (ctx.sd && ctx.people.length > 1) {
      var order = ctx.axes.map(function (a, i) { return { a: a, sd: ctx.sd[i] }; }).sort(function (x, y) { return x.sd - y.sd; });
      meta.appendChild(h('div', null, [h('span', null, 'Maior consenso'), h('b', null, order[0].a.name)]));
      meta.appendChild(h('div', null, [h('span', null, 'Maior divisão'), h('b', null, order[order.length - 1].a.name)]));
    }
    if (ctx.people.length) {
      var mags = ctx.people.map(function (p) { return Stats.magnitude(ctx.vec(p.id, ctx.year)); });
      meta.appendChild(h('div', null, [h('span', null, 'Convicção média'), h('b', null, fmt(Stats.mean(mags), 1))]));
    }
    rail.appendChild(meta);

    var secs = Array.prototype.slice.call(document.querySelectorAll('#view section.section[data-title]'));
    if (secs.length) {
      var nav = h('div', { class: 'rail-card rail-nav' }, [h('h4', null, 'Nesta página')]);
      nav.appendChild(h('ol', null, secs.map(function (s, i) {
        return h('li', null, h('a', { href: '#' + s.id, onClick: function (e) { e.preventDefault(); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, [
          h('span', null, (i + 1 < 10 ? '0' : '') + (i + 1)), s.getAttribute('data-title')
        ]));
      })));
      rail.appendChild(nav);
    }
  }

  // ---------------------------------------------------------------------------
  // Render principal
  // ---------------------------------------------------------------------------
  var ready = false; // vira true depois da senha e das fontes
  function render() {
    if (!ready) return;
    var ctx = buildCtx();
    renderTop(ctx);
    renderTabs();
    renderChips(ctx);
    renderSidebar(ctx);
    var view = $('#view');
    Charts.disposeAll();
    view.innerHTML = '';
    var banner = $('#problems');
    banner.innerHTML = '';
    if (problems.length) {
      banner.appendChild(h('details', { class: 'problems' }, [
        h('summary', null, problems.length + ' problema(s) nos dados. Registros com problema foram ignorados; nenhum valor foi inventado.'),
        h('ul', null, problems.map(function (p) { return h('li', null, p); }))
      ]));
    }
    if (!window.echarts && state.view !== 'add' && state.view !== 'about') {
      view.appendChild(h('div', { class: 'section' }, note('A biblioteca de gráficos (Apache ECharts) não carregou. Verifique a conexão com a internet e recarregue a página.', 'warn')));
      renderRail(ctx);
      return;
    }
    switch (state.view) {
      case 'explorer': renderExplorer(view, ctx); break;
      case 'group': renderGroup(view, ctx); break;
      case 'compare': renderCompare(view, ctx); break;
      case 'person': renderPerson(view, ctx); break;
      case 'add': renderAdd(view, ctx); break;
      case 'about': renderAbout(view, ctx); break;
    }
    renderRail(ctx);
    document.title = 'Painel 12 Eixos · ' + VIEWS.filter(function (v) { return v.id === state.view; })[0].label;
  }

  function openPerson(pid) {
    set(function (s) { s.person = pid; s.view = 'person'; });
    window.scrollTo({ top: 0 });
  }

  // Cliques vindos dos gráficos. Em tela de toque o primeiro toque só mostra o
  // tooltip; tocar de novo na mesma pessoa (em até 5 s) abre a visão individual.
  var lastTap = { id: null, t: 0 };
  function chartOpenPerson(pid) {
    if (!Charts.isTouch()) { openPerson(pid); return; }
    var now = Date.now();
    if (lastTap.id === pid && now - lastTap.t < 5000) { lastTap = { id: null, t: 0 }; openPerson(pid); }
    else lastTap = { id: pid, t: now };
  }

  // Gráficos que não cabem numa tela estreita: mostra um aviso no lugar, com a
  // opção de ver assim mesmo (com rolagem lateral). Devolve true se o gráfico
  // deve ser desenhado.
  function desktopOnly(box, key, what) {
    if (window.innerWidth >= 700) return true;
    if (ui.forceWide[key]) {
      var wrap = h('div', { class: 'wide-scroll' });
      box.parentNode.insertBefore(wrap, box);
      wrap.appendChild(box);
      box.style.minWidth = '760px';
      wrap.parentNode.insertBefore(h('p', { class: 'hint wide-hint' }, '↔ Arraste para os lados para ver o gráfico inteiro.'), wrap);
      return true;
    }
    box.replaceWith(h('div', { class: 'desktop-only' }, [
      h('div', { class: 'desktop-only-icon', 'aria-hidden': 'true' }, '🖥'),
      h('p', null, [h('b', null, 'Melhor no computador. '), what + ' precisa de uma tela mais larga para ficar legível. Abra no computador ou gire o celular.']),
      h('button', { type: 'button', class: 'btn btn-small', onClick: function () { ui.forceWide[key] = true; render(); } }, 'Mostrar assim mesmo')
    ]));
    return false;
  }

  function noPeople(view, ctx) {
    if (ctx.allPeople.length === 0) {
      view.appendChild(h('div', { class: 'section' }, empty(years.length ? 'Nenhuma pessoa tem resultado em ' + ctx.year + '.' : 'Nenhum resultado válido em data/data.js.')));
      return true;
    }
    if (ctx.people.length === 0) {
      view.appendChild(h('div', { class: 'section' }, empty('Nenhuma pessoa passa pelos filtros atuais. Ajuste os filtros.')));
      return true;
    }
    return false;
  }

  function attrSummary(person, ctx) {
    return Filters.attributeDefs(DATA).map(function (d) {
      var v = Filters.attrValue(person, d, ctx.year);
      return v === null ? null : (d.key === 'age' ? v + ' anos' : String(v));
    }).filter(Boolean).join(' · ');
  }

  // Card de pessoa (galeria, mais próximas).
  function personCard(person, ctx, opts) {
    opts = opts || {};
    var card = h('button', { class: 'person-card' + (opts.hero ? ' hero-card' : ''), type: 'button', onClick: function () { openPerson(person.id); } }, [
      avatar(person, opts.hero ? 'lg' : 'lg'),
      opts.tag ? pill(opts.tag, opts.tagKind || 'pill-soft') : null,
      h('span', { class: 'pname' }, nameOf(person)),
      opts.sub ? h('span', { class: 'psub' }, opts.sub) : null,
      opts.pct !== undefined && opts.pct !== null ? h('span', { class: 'pct' }, fmt(opts.pct, opts.pctDecimals || 0) + (opts.pctSuffix === undefined ? '%' : opts.pctSuffix)) : null
    ]);
    return card;
  }

  // Faixas por eixo em HTML: um avatar com as iniciais por pessoa em cada eixo,
  // empilhando quem cai no mesmo lugar. Cada linha tem a altura da sua maior
  // pilha. Devolve { el, layout }: chame layout() depois de inserir no DOM (e o
  // render inteiro já roda de novo quando a janela muda de tamanho).
  function stripsView(ctx, opts) {
    var root = h('div', { class: 'strips' });
    var tip = h('div', { class: 'strip-tip', role: 'tooltip', hidden: true });
    var rows = ctx.axes.map(function (a, i) {
      var track = h('div', { class: 'strip-track' }, [h('i', { class: 'strip-line' }), h('i', { class: 'strip-mid' })]);
      if (ctx.mean) track.appendChild(h('i', { class: 'strip-mean', style: 'left:' + (100 - ctx.mean[i]) + '%', title: 'Média do filtro: ' + a.leftPole + ' ' + fmt(ctx.mean[i], 1) }));
      if (opts.showRef && ctx.meanAll) track.appendChild(h('i', { class: 'strip-mean ref', style: 'left:' + (100 - ctx.meanAll[i]) + '%', title: 'Média do grupo inteiro: ' + a.leftPole + ' ' + fmt(ctx.meanAll[i], 1) }));
      var avs = ctx.people.map(function (p) {
        var v = ctx.vec(p.id, ctx.year)[i];
        var color = opts.byCat ? ctx.sideOf(p).color : colorOf(p);
        var av = Avatars.el(p, 'sm', { color: color, label: nameOf(p), title: false });
        av.classList.add('strip-av');
        av.setAttribute('data-pid', p.id);
        av.setAttribute('tabindex', '0');
        av.setAttribute('role', 'button');
        av.setAttribute('aria-label', nameOf(p) + ', ' + a.name + ': ' + a.leftPole + ' ' + fmt(v, 0) + '%, ' + a.rightPole + ' ' + fmt(100 - v, 0) + '%');
        av.style.left = (100 - v) + '%';
        var o = { el: av, p: p, v: v, axis: a };
        av.addEventListener('mouseenter', function () { focusOn(o); });
        av.addEventListener('focus', function () { focusOn(o); });
        av.addEventListener('mouseleave', clearFocus);
        av.addEventListener('blur', clearFocus);
        av.addEventListener('click', function (e) { e.stopPropagation(); focusOn(o); chartOpenPerson(p.id); });
        av.addEventListener('keydown', function (e) { if (e.key === 'Enter') openPerson(p.id); });
        track.appendChild(av);
        return o;
      });
      var row = h('div', { class: 'strip-row' }, [
        h('div', { class: 'strip-lab left' }, [h('b', null, a.name), h('span', null, a.leftPole)]),
        track,
        h('div', { class: 'strip-lab right' }, h('span', null, a.rightPole))
      ]);
      root.appendChild(row);
      return { track: track, avs: avs };
    });
    // Régua de baixo, alinhada ao trilho.
    root.appendChild(h('div', { class: 'strip-row strip-scale' }, [
      h('div', { class: 'strip-lab left' }),
      h('div', { class: 'strip-ticks' }, [[0, '100% esq.'], [25, '75% esq.'], [50, 'centro'], [75, '75% dir.'], [100, '100% dir.']].map(function (tk) {
        return h('span', { class: 'strip-tick', style: 'left:' + tk[0] + '%' }, tk[1]);
      })),
      h('div', { class: 'strip-lab right' })
    ]));
    if (opts.byCat) {
      var seen = {};
      ctx.people.forEach(function (p) { var sd = ctx.sideOf(p); seen[sd.label] = sd.color; });
      root.insertBefore(h('div', { class: 'strip-legend' }, CATEGORY_ORDER.filter(function (c) { return seen[c]; }).map(function (c) {
        return h('span', null, [h('i', { style: 'background:' + seen[c] }), c]);
      })), root.firstChild);
    }
    root.appendChild(tip);
    root.addEventListener('click', clearFocus);

    function focusOn(o) {
      root.classList.add('hl-on');
      Array.prototype.forEach.call(root.querySelectorAll('.strip-av'), function (el) {
        el.classList.toggle('hl', el.getAttribute('data-pid') === o.p.id);
      });
      var a = o.axis, it = Stats.intensity(o.v);
      var r = resultOf(o.p.id, ctx.year) || {};
      tip.innerHTML = '<b>' + esc(nameOf(o.p)) + '</b><span class="tt-muted"> · ' + esc(ctx.sideOf(o.p).label) + '</span>' +
        '<div><b>' + esc(a.name) + '</b>: ' + Charts.poleLabel(a, o.v, r.precision || 0) + '</div>' +
        '<div class="tt-muted">' + it.label + (it.level ? ' · ' + esc(Stats.dominantPole(a, o.v)) : '') + '</div>';
      tip.hidden = false;
      var rr = root.getBoundingClientRect(), ar = o.el.getBoundingClientRect();
      var x = ar.left - rr.left + ar.width / 2, y = ar.top - rr.top;
      var tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(rr.width - tw - 4, x - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 8) + 'px';
    }
    function clearFocus() {
      root.classList.remove('hl-on');
      Array.prototype.forEach.call(root.querySelectorAll('.strip-av.hl'), function (el) { el.classList.remove('hl'); });
      tip.hidden = true;
    }

    function layout() {
      var small = root.clientWidth < 600;
      // Avatares empilhados como moedas (sobreposição de ~20%) e vizinhos na
      // mesma altura podendo encostar um pouco: as iniciais continuam visíveis
      // e a seção fica bem mais baixa.
      var S = small ? 20 : 24, step = Math.round(S * 0.8), GAP = 0, PAD = 8;
      rows.forEach(function (rw) {
        var W = rw.track.clientWidth;
        if (!W) return;
        var minGap = (S * 0.85) / W * 100; // distância mínima, em % do trilho
        var placed = [], up = 0, down = 0;
        rw.avs.slice().sort(function (x, y) { return y.v - x.v || nameOf(x.p).localeCompare(nameOf(y.p), 'pt-BR'); }).forEach(function (o) {
          var x = 100 - o.v;
          for (var k = 0; k < 60; k++) {
            var lvl = k === 0 ? 0 : (k % 2 ? -(k + 1) / 2 : k / 2); // 0, acima, abaixo, acima...
            if (!placed.some(function (q) { return q.lvl === lvl && Math.abs(q.x - x) < minGap; })) {
              placed.push({ x: x, lvl: lvl }); o.lvl = lvl; break;
            }
          }
          if (-o.lvl > up) up = -o.lvl;
          if (o.lvl > down) down = o.lvl;
        });
        var lineY = PAD + up * step + S / 2;
        rw.track.style.height = (PAD * 2 + (up + down + 1) * step - GAP) + 'px';
        rw.track.style.setProperty('--line-y', lineY + 'px');
        rw.avs.forEach(function (o) {
          o.el.style.width = S + 'px';
          o.el.style.height = S + 'px';
          o.el.style.top = (lineY + o.lvl * step) + 'px';
        });
      });
    }
    return { el: root, layout: layout };
  }

  // Turmas: componentes conexos do grafo "cada pessoa → seus k mais parecidos".
  function knnGroups(ctx, k) {
    var ps = ctx.people, n = ps.length;
    var V = ps.map(function (p) { return ctx.vec(p.id, ctx.year); });
    var parent = ps.map(function (p, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    ps.forEach(function (p, i) {
      V.map(function (v, j) { return { j: j, d: Stats.rmsDistance(V[i], v) }; })
        .filter(function (x) { return x.j !== i; })
        .sort(function (a, b) { return a.d - b.d; })
        .slice(0, Math.min(k, n - 1))
        .forEach(function (x) { parent[find(x.j)] = find(i); });
    });
    var groups = {};
    ps.forEach(function (p, i) { var r = find(i); (groups[r] = groups[r] || []).push(p); });
    return Object.keys(groups).map(function (r) { return groups[r]; })
      .sort(function (a, b) { return b.length - a.length; });
  }

  // Superlativos do grupo filtrado. Tudo sai dos 12 números.
  function groupHighlights(ctx) {
    var ps = ctx.people, n = ps.length;
    if (n < 2) return [];
    var V = ps.map(function (p) { return ctx.vec(p.id, ctx.year); });
    var mags = V.map(Stats.magnitude);
    var argmax = function (arr) { var b = 0; arr.forEach(function (v, i) { if (v > arr[b]) b = i; }); return b; };
    var argmin = function (arr) { var b = 0; arr.forEach(function (v, i) { if (v < arr[b]) b = i; }); return b; };
    var items = [];

    var iMax = argmax(mags), iMin = argmin(mags);
    items.push({ label: 'Maior convicção', people: [ps[iMax]], value: fmt(mags[iMax], 1), unit: 'pontos do centro, em média', text: 'Quem mais se afasta do meio somando os 12 eixos.' });
    items.push({ label: 'Mais ao centro', people: [ps[iMin]], value: fmt(mags[iMin], 1), unit: 'pontos do centro, em média', text: 'Quem fica mais perto do meio somando os 12 eixos.' });

    var best = null, worst = null;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      var d = Stats.rmsDistance(V[i], V[j]);
      if (!best || d < best.d) best = { i: i, j: j, d: d };
      if (!worst || d > worst.d) worst = { i: i, j: j, d: d };
    }
    items.push({ label: 'Par mais parecido', people: [ps[best.i], ps[best.j]], value: fmt(best.d, 1), unit: 'pontos de diferença por eixo', text: 'Similaridade de ' + fmt(Stats.similarity(V[best.i], V[best.j]), 0) + '%. As duas pessoas mais próximas do grupo.' });
    if (n > 2) items.push({ label: 'Par mais distante', people: [ps[worst.i], ps[worst.j]], value: fmt(worst.d, 1), unit: 'pontos de diferença por eixo', text: 'Similaridade de ' + fmt(Stats.similarity(V[worst.i], V[worst.j]), 0) + '%. O par que mais diverge no grupo.' });

    if (n > 2) {
      var dm = V.map(function (v) { return Stats.rmsDistance(v, ctx.mean); });
      var iTyp = argmin(dm), iOut = argmax(dm);
      items.push({ label: 'Retrato do grupo', people: [ps[iTyp]], value: fmt(dm[iTyp], 1), unit: 'pontos da média, por eixo', text: 'Quem mais se parece com a média de todo mundo.' });
      items.push({ label: 'Mais fora da curva', people: [ps[iOut]], value: fmt(dm[iOut], 1), unit: 'pontos da média, por eixo', text: 'Quem mais se afasta da média do grupo.' });
    }

    // Posição mais extrema em um eixo (empates entram juntos, até 3).
    var top = -1, ext = [];
    V.forEach(function (v, pi) {
      v.forEach(function (x, ai) {
        var dev = Math.abs(x - 50);
        if (dev > top + 1e-9) { top = dev; ext = [{ pi: pi, ai: ai, x: x }]; }
        else if (Math.abs(dev - top) < 1e-9) ext.push({ pi: pi, ai: ai, x: x });
      });
    });
    ext = ext.slice(0, 3);
    items.push({
      label: 'Posição mais extrema', people: ext.map(function (e) { return ps[e.pi]; }),
      value: fmt(50 + top, 0) + '%', unit: ext.length === 1 ? ctx.axes[ext[0].ai].name + ' · ' + Stats.dominantPole(ctx.axes[ext[0].ai], ext[0].x) : 'em um eixo',
      text: ext.length === 1
        ? 'Ninguém mais no grupo chega tão longe num único eixo.'
        : 'Empate: ' + ext.map(function (e) { var a = ctx.axes[e.ai]; return nameOf(ps[e.pi]) + ' com ' + fmt(Stats.dominantPercent(e.x), 0) + '% ' + Stats.dominantPole(a, e.x) + ' (' + a.name + ')'; }).join(' · ') + '.'
    });

    if (n > 2) {
      var sd = ctx.sd;
      var aMax = argmax(sd), aMin = argmin(sd);
      var col = function (ai) { return V.map(function (v) { return v[ai]; }); };
      var cMax = col(aMax), axMax = ctx.axes[aMax];
      items.push({
        axis: true, label: 'Eixo que mais divide', value: axMax.name, unit: 'desvio padrão de ' + fmt(sd[aMax], 1),
        text: 'Vai de ' + axMax.leftPole + ' ' + fmt(Math.max.apply(null, cMax), 0) + '% a ' + axMax.rightPole + ' ' + fmt(100 - Math.min.apply(null, cMax), 0) + '%.'
      });
      var axMin = ctx.axes[aMin];
      items.push({
        axis: true, label: 'Eixo de maior consenso', value: axMin.name, unit: 'desvio padrão de ' + fmt(sd[aMin], 1),
        text: 'Média: ' + Stats.dominantPole(axMin, ctx.mean[aMin]) + ' ' + fmt(Stats.dominantPercent(ctx.mean[aMin]), 0) + '%.'
      });
    }
    return items;
  }

  function highlightCard(it) {
    var names = it.people ? h('div', { class: 'destaque-names' }, it.people.map(function (p, i) {
      return [i ? h('span', { class: 'muted' }, i === it.people.length - 1 ? ' e ' : ', ') : null,
        h('button', { type: 'button', class: 'linkish', onClick: function () { openPerson(p.id); } }, nameOf(p))];
    })) : null;
    return h('div', { class: 'destaque' + (it.axis ? ' destaque-axis' : '') }, [
      h('p', { class: 'destaque-label' }, it.label),
      it.people ? h('div', { class: 'member-row' }, it.people.map(function (p) { return avatar(p, 'md'); })) : null,
      it.axis ? h('div', { class: 'destaque-value' }, it.value) : names,
      h('div', { class: 'destaque-metric' }, it.axis ? [h('span', null, it.unit)] : [h('b', null, it.value), ' ', h('span', null, it.unit)]),
      h('p', { class: 'destaque-text' }, it.text)
    ]);
  }

  // Ficha de uma pessoa (galeria do grupo).
  function fichaCard(person, ctx) {
    var r = resultOf(person.id, ctx.year);
    var vec = ctx.vec(person.id, ctx.year);
    var d = r.precision || 0;
    var dv = r.derived || {};
    var sideInfo = ctx.sideOf(person);
    var color = colorOf(person);
    var bars = h('div', { class: 'mini-bars', style: '--pc:' + color, role: 'img', 'aria-label': 'Barras dos 12 eixos' }, ctx.axes.map(function (a, i) {
      var v = vec[i];
      var it = Stats.intensity(v);
      var hgt = Math.abs(v - 50) / 50 * 50; // % da altura total (metade = 50%)
      var style = v >= 50 ? 'bottom:50%;height:' + hgt + '%' : 'top:50%;height:' + hgt + '%';
      return h('div', { class: 'mb' + (it.level === 0 ? ' bal' : ''), title: a.name + ': ' + a.leftPole + ' ' + fmt(v, d) + ' · ' + a.rightPole + ' ' + fmt(100 - v, d) + ' (' + it.label + ')' }, h('i', { style: style }));
    }));
    var name = h('span', { class: 'pname', onClick: function () { openPerson(person.id); } }, nameOf(person));
    var figs = dv.figure
      ? [h('b', null, dv.figure + (isNum(dv.figureMatch) ? ' ' + fmt(dv.figureMatch, 0) + '%' : '')), (dv.figures || []).length ? ' · ' + dv.figures.map(function (f) { return f.name; }).join(', ') : '']
      : '—';
    var ctrs = (dv.countries || []).length
      ? [h('b', null, dv.countries[0].name + (isNum(dv.countries[0].match) ? ' ' + fmt(dv.countries[0].match, 0) + '%' : '')), dv.countries.length > 1 ? ' · ' + dv.countries.slice(1).map(function (c) { return c.name; }).join(', ') : '']
      : [dv.countryPresent || '—', dv.countryHistorical ? ' · ' + dv.countryHistorical : ''];
    var summary = attrSummary(person, ctx);
    return h('div', { class: 'ficha' }, [
      h('div', { class: 'ficha-head' }, [avatar(person, 'sm'), name, h('span', { class: 'pill pill-side', style: 'background:' + sideInfo.color, title: sideInfo.source === 'site' ? 'Categoria do 12 Axes' : 'Lado econômico calculado' }, sideInfo.label)]),
      h('div', { class: 'ficha-ideo' }, dv.ideology ? [h('b', null, dv.ideology), isNum(dv.ideologyMatch) ? h('span', { class: 'muted' }, fmt(dv.ideologyMatch, 0) + '%') : null] : h('span', { class: 'muted' }, 'Sem ideologia registrada')),
      h('dl', null, [
        h('dt', null, 'Personalidade'), h('dd', null, figs),
        h('dt', null, 'Países'), h('dd', null, ctrs),
        h('dt', null, 'Convicção'), h('dd', null, fmt(Stats.magnitude(vec), 1) + (summary ? ' · ' + summary : ''))
      ]),
      bars,
      r.notes ? h('p', { class: 'notes' }, r.notes) : null
    ]);
  }

  // ---------------------------------------------------------------------------
  // View 1a — Mapa fixo: Economia × Costumes
  // ---------------------------------------------------------------------------
  function joinNames(arr) {
    var n = arr.map(function (pt) { return nameOf(pt.p || pt); });
    if (n.length <= 1) return n.join('');
    return n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1];
  }

  // Título e leituras automáticas do mapa fixo. Tudo sai dos 12 números.
  function heroReading(ctx, xm, ym) {
    var pts = ctx.people.map(function (p) {
      return { p: p, x: xm.value(p.id, ctx.year), y: ym.value(p.id, ctx.year), r: resultOf(p.id, ctx.year) };
    }).filter(function (pt) { return pt.x !== null && pt.y !== null; });
    var n = pts.length;
    var Q = { LL: [], RL: [], LR: [], RR: [] }; // lado X (L = esquerda) + lado Y (L = conservador)
    pts.forEach(function (pt) {
      pt.xs = pt.x >= 50 ? 'L' : 'R';
      pt.ys = pt.y >= 50 ? 'L' : 'R';
      Q[pt.xs + pt.ys].push(pt);
    });
    var emptyKeys = Object.keys(Q).filter(function (k) { return Q[k].length === 0; });
    var ECO = { L: 'esquerda', R: 'direita' };
    var COS = { L: 'conservador', R: 'progressista' };
    function qName(xs, ys) { return Charts.quadrantName(xm, ym, xs, ys).toLowerCase(); }
    function where(xs, ys) { return (ys === 'L' ? 'de cima' : 'de baixo') + ' à ' + ECO[xs]; }
    function spot(xs, ys) { return (ys === 'L' ? 'no alto' : 'embaixo') + ' à ' + ECO[xs]; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // Título
    var NUM = ['', 'um', 'dois', 'três'];
    var titleHtml;
    if (n === 0) titleHtml = 'Mapa <em>vazio</em>';
    else if (n === 1) titleHtml = 'Um ponto no <em>mapa</em>';
    else if (emptyKeys.length === 0) titleHtml = 'Quatro quadrantes, <em>todos ocupados</em>';
    else if (emptyKeys.length === 3) titleHtml = 'Todo mundo no <em>mesmo quadrante</em>';
    else titleHtml = 'Quatro quadrantes, <em>' + NUM[emptyKeys.length] + (emptyKeys.length === 1 ? ' vazio' : ' vazios') + '</em>';

    var items = [];
    if (n === 1) {
      items.push({ title: nameOf(pts[0].p) + ' está na ' + qName(pts[0].xs, pts[0].ys), text: 'Com uma pessoa só no filtro, não há grupo para comparar.' });
      return { titleHtml: titleHtml, items: items };
    }

    // 1. Quadrantes vazios
    if (emptyKeys.length && emptyKeys.length < 3) {
      emptyKeys.forEach(function (k) {
        var xs = k[0], ys = k[1];
        var oppX = xs === 'L' ? 'R' : 'L', oppY = ys === 'L' ? 'R' : 'L';
        var onX = pts.filter(function (pt) { return pt.xs === xs; }).length;
        var onY = pts.filter(function (pt) { return pt.ys === ys; }).length;
        var text = 'O quadrante ' + where(xs, ys) + ' ficou vazio: ';
        if (onX > 0) text += 'todo mundo que é de ' + ECO[xs] + ' na economia também é ' + COS[oppY] + ' nos costumes.';
        else if (onY > 0) text += 'todo mundo que é ' + COS[ys] + ' nos costumes está na ' + ECO[oppX] + ' econômica.';
        else text += 'ninguém do grupo é de ' + ECO[xs] + ' na economia nem ' + COS[ys] + ' nos costumes.';
        items.push({ title: 'Ninguém na ' + qName(xs, ys), text: text });
      });
    }

    // 2. Exceções: minoria de costumes dentro de um lado econômico
    var exceptions = [];
    ['L', 'R'].forEach(function (xs) {
      var side = pts.filter(function (pt) { return pt.xs === xs; });
      if (side.length < 3) return;
      var cons = side.filter(function (pt) { return pt.ys === 'L'; });
      var prog = side.filter(function (pt) { return pt.ys === 'R'; });
      if (!cons.length || !prog.length || cons.length === prog.length) return;
      var minority = cons.length < prog.length ? cons : prog;
      minority.sort(function (a, b) { return Math.abs(b.y - 50) - Math.abs(a.y - 50); });
      exceptions.push(minority[0]);
    });
    exceptions.slice(0, 2).forEach(function (e) {
      var def = ym.composite;
      var d = e.r.precision || 0;
      var vec = ctx.vec(e.p.id, ctx.year);
      var parts = def.parts.map(function (part) {
        var axis = ctx.axisByKey(part.key);
        var v = vec[ctx.keys.indexOf(part.key)];
        var towardLeft = part.sign > 0 ? v : 100 - v;       // % rumo ao polo esquerdo do composto (conservador)
        var toward = e.ys === 'L' ? towardLeft : 100 - towardLeft;
        var pole = (part.sign > 0) === (e.ys === 'L') ? axis.leftPole : axis.rightPole;
        return { v: toward, pole: pole };
      }).sort(function (a, b) { return b.v - a.v; }).slice(0, 2);
      var mates = Q[e.xs + e.ys].filter(function (pt) { return pt !== e; });
      items.push({
        title: nameOf(e.p) + ' é a exceção da ' + ECO[e.xs],
        text: cap(ECO[e.xs]) + ' na economia, mas do lado ' + COS[e.ys] + ' nos costumes: ' +
          fmt(parts[0].v, d) + '% ' + parts[0].pole.toLowerCase() + ' e ' + fmt(parts[1].v, d) + '% ' + parts[1].pole.toLowerCase() + '.' +
          (mates.length ? ' Divide o quadrante ' + where(e.xs, e.ys) + ' com ' + joinNames(mates) + '.' : ' É a única pessoa nesse quadrante.')
      });
    });

    // 3. Cantos: quem mais puxa para cada lado dos costumes
    function corner(ys) {
      var sorted = pts.slice().sort(function (a, b) { return ys === 'L' ? b.y - a.y : a.y - b.y; });
      var a = sorted[0], b = sorted[1];
      if (!a || a.ys !== ys) return null;
      var word = ys === 'L' ? 'conservadoras' : 'progressistas';
      if (b && b.xs === a.xs && b.ys === a.ys && Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) < 10) {
        return { title: nameOf(a.p) + ' e ' + nameOf(b.p) + ' dividem o canto', text: 'As duas pessoas mais ' + word + ' do grupo, lado a lado ' + spot(a.xs, a.ys) + '.' };
      }
      var pct = ys === 'L' ? a.y : 100 - a.y;
      return { title: nameOf(a.p) + ' lidera o lado ' + COS[ys], text: 'É quem mais pende para o lado ' + COS[ys] + ' nos costumes (' + fmt(pct, 1) + '%), ' + spot(a.xs, a.ys) + '.' };
    }
    var cCons = corner('L'), cProg = corner('R');
    if (cCons) items.push(cCons);

    // 4. Perto do centro
    var center = pts.filter(function (pt) { return Math.abs(pt.x - 50) < 7.5 && Math.abs(pt.y - 50) < 7.5; });
    if (center.length) {
      items.push({ title: joinNames(center) + (center.length === 1 ? ' fica' : ' ficam') + ' perto do centro', text: 'Menos de 7,5 pontos do meio tanto na economia quanto nos costumes.' });
    }
    if (cProg) items.push(cProg);

    return { titleHtml: titleHtml, items: items.slice(0, 4) };
  }

  function renderHeroMap(view, ctx) {
    var xm = metric(ctx, 'comp:economia'), ym = metric(ctx, 'comp:costumes');
    var reading = heroReading(ctx, xm, ym);
    var allSite = ctx.people.every(function (p) { return ctx.sideOf(p).source === 'site'; });
    var anySite = ctx.people.some(function (p) { return ctx.sideOf(p).source === 'site'; });
    var colorNote = allSite ? 'A cor é a categoria que o 12 Axes deu a cada pessoa.'
      : anySite ? 'A cor é a categoria que o 12 Axes deu; para quem não tem, o lado econômico calculado.'
      : 'A cor é o lado econômico calculado (média de Público e Planejamento).';
    view.appendChild(pageHead('O mapa', reading.titleHtml, 'Na horizontal, a economia: média de Público↔Privado e Planejamento↔Livre mercado. Na vertical, os costumes: média de Tradicionalista, Religioso e Assimilação. ' + colorNote));
    var box = chartBox('heroMap', window.innerWidth < 700 ? Math.min(520, window.innerWidth + 40) : 600);
    var notes = reading.items.length
      ? reading.items.map(function (it) { return h('div', { class: 'reading' }, [h('h4', null, it.title), h('p', null, it.text)]); })
      : [h('p', { class: 'hint' }, 'Sem leituras para este filtro.')];
    view.appendChild(h('section', { class: 'section hero-map', id: 'sec-mapa-fixo', 'data-title': 'O mapa · economia × costumes' }, [
      h('div', { class: 'hero-map-chart' }, box),
      h('aside', { class: 'hero-map-notes', 'aria-label': 'Leituras do mapa' }, notes)
    ]));
    Charts.explorer(box, ctx, {
      xMetric: xm, yMetric: ym, labels: true, trails: false, photos: state.photos, halves: true,
      groupOf: function (p) { return ctx.sideOf(p).label; },
      groupColor: function (g) { return categoryStyle(g).color; },
      groupOrder: CATEGORY_ORDER
    }, { onPerson: chartOpenPerson });
  }

  // ---------------------------------------------------------------------------
  // View 1b — Explorador X × Y (editável)
  // ---------------------------------------------------------------------------
  function renderExplorer(view, ctx) {
    var ex = state.explorer;
    var opts = metricOptions(ctx);
    var cats = Filters.attributeDefs(DATA).filter(function (d) { return d.type === 'category'; });
    var nums = Filters.attributeDefs(DATA).filter(function (d) { return d.type === 'number'; });

    if (!ctx.people.length) {
      view.appendChild(pageHead('O mapa', 'Mapa do <em>grupo</em>'));
      noPeople(view, ctx);
      return;
    }
    renderHeroMap(view, ctx);

    view.appendChild(h('div', { class: 'page-head sub' }, [
      h('p', { class: 'eyebrow' }, 'Explorador'),
      h('h2', { html: 'Monte o seu <em class="h-em">mapa</em>' }),
      h('p', { class: 'lead' }, 'Escolha o que vai em cada eixo, a cor e o tamanho. Passe o mouse para ver os 12 eixos e clique para abrir a visão individual.')
    ]));

    var colorOpts = [{ id: 'person', label: 'Pessoa (cor fixa)' }, { id: 'side', label: 'Categoria do 12 Axes' }, { id: 'sidecalc', label: 'Lado econômico calculado' }]
      .concat(cats.map(function (d) { return { id: 'attr:' + d.key, label: d.label }; }))
      .concat([{ id: 'ideology', label: 'Ideologia (segundo o 12 Axes)' }]);
    var sizeOpts = [{ id: 'fixed', label: 'Fixo' }, { id: 'mag', label: 'Magnitude / convicção' }]
      .concat(nums.map(function (d) { return { id: 'attr:' + d.key, label: d.label }; }));

    var controls = h('div', { class: 'controls' }, [
      h('label', { class: 'field' }, ['Eixo X', select(opts, ex.x, function (v) { set(function (s) { s.explorer.x = v; }); })]),
      h('button', { class: 'icon-btn', type: 'button', title: 'Inverter X e Y', 'aria-label': 'Inverter X e Y', onClick: function () { set(function (s) { var t = s.explorer.x; s.explorer.x = s.explorer.y; s.explorer.y = t; }); } }, '⇄'),
      h('label', { class: 'field' }, ['Eixo Y', select(opts, ex.y, function (v) { set(function (s) { s.explorer.y = v; }); })]),
      h('label', { class: 'field' }, ['Cor por', select(colorOpts, ex.color, function (v) { set(function (s) { s.explorer.color = v; }); })]),
      h('label', { class: 'field' }, ['Tamanho por', select(sizeOpts, ex.size, function (v) { set(function (s) { s.explorer.size = v; }); })]),
      toggle('Rótulos', ex.labels, function (on) { set(function (s) { s.explorer.labels = on; }); }),
      Avatars.hasAny(DATA.people) ? toggle('Fotos', state.photos, function (on) { set(function (s) { s.photos = on; }); }) : null,
      years.length > 1 ? toggle('Rastro entre anos', ex.trails, function (on) { set(function (s) { s.explorer.trails = on; }); }) : null
    ]);
    if (ex.x === 'sim' || ex.y === 'sim') {
      var peopleOpts = ctx.allPeople.map(function (p) { return { id: p.id, label: nameOf(p) }; });
      var cur = ex.sim && personById(ex.sim) ? ex.sim : (ctx.people[0] ? ctx.people[0].id : '');
      controls.appendChild(h('label', { class: 'field' }, ['Similaridade com', select(peopleOpts, cur, function (v) { set(function (s) { s.explorer.sim = v; }); })]));
    }
    var presets = h('div', { class: 'presets' }, [h('span', { class: 'muted' }, 'Atalhos:')].concat(PRESETS.map(function (pr) {
      var on = ex.x === pr.x && ex.y === pr.y;
      return h('button', { class: 'pill' + (on ? ' on' : ''), type: 'button', onClick: function () { set(function (s) { s.explorer.x = pr.x; s.explorer.y = pr.y; }); } }, pr.label);
    })));
    view.appendChild(h('div', { class: 'card controls-card' }, [controls, presets]));

    var xm = metric(ctx, ex.x), ym = metric(ctx, ex.y);
    var box = chartBox('explorerChart', window.innerWidth < 700 ? Math.min(520, window.innerWidth + 60) : 620);
    var caption = [];
    if (xm.composite) caption.push('Horizontal: ' + xm.composite.description + '.');
    if (ym.composite) caption.push('Vertical: ' + ym.composite.description + '.');
    if (xm.isAxis || ym.isAxis) caption.push('Escala 0–100 com o centro em 50. Cada rótulo de tique diz o polo e o quanto: "' + (xm.isAxis ? xm.axis.leftPole : ym.axis.leftPole) + ' 75" significa 75% desse polo.');
    if (xm.isAxis && ym.isAxis) caption.push('Os quadrantes recebem o nome dos dois polos dominantes.');
    if (ex.color === 'side') caption.push('Cor pela categoria que o 12 Axes deu a cada pessoa; para quem não tem, o lado econômico calculado.');
    if (ex.color === 'sidecalc') caption.push('Cor pelo lado econômico calculado: Esquerda se a média de Público e Planejamento passa de 57,5; Direita se fica abaixo de 42,5; Centro no meio; "radical" a partir de 37,5 pontos do centro.');
    view.appendChild(section('dispersao', 'Dispersão', xm.label + ' × ' + ym.label, [box, h('p', { class: 'caption' }, caption.join(' '))]));

    if (xm.isAxis && ym.isAxis) {
      var ins = quadrantInsights(ctx, xm, ym);
      if (ins.length) view.appendChild(section('leituras', 'Leituras automáticas', 'O que o mapa mostra', h('div', { class: 'insights' }, ins.map(function (i) { return h('div', { class: 'insight' }, [h('h4', null, i.title), h('p', null, i.text)]); }))));
    }

    if (ex.x.indexOf('pca') === 0 || ex.y.indexOf('pca') === 0) {
      view.appendChild(section('pca', 'Estatística', 'Como ler os componentes do PCA', pcaNotes(ctx)));
    }

    var groupOf = null, groupColor = null;
    var groupOrder = null;
    if (ex.color === 'side' || ex.color === 'sidecalc') {
      var fn = ex.color === 'side' ? ctx.sideOf : ctx.calcSide;
      groupOf = function (p) { return fn(p).label; };
      groupColor = function (g) { return categoryStyle(g).color; };
      groupOrder = CATEGORY_ORDER;
    } else if (ex.color.indexOf('attr:') === 0) {
      var def = Filters.defByKey(DATA, ex.color.slice(5));
      if (def) {
        var values = Filters.categoryValues(DATA, def);
        groupOf = function (p) { var v = Filters.attrValue(p, def, ctx.year); return v === null ? null : String(v); };
        groupColor = function (g) { var i = values.indexOf(g); return i < 0 ? '#8a8a84' : Charts.PALETTE[i % Charts.PALETTE.length]; };
      }
    } else if (ex.color === 'ideology') {
      var ideologies = [];
      ctx.allPeople.forEach(function (p) { var r = resultOf(p.id, ctx.year); var v = r.derived && r.derived.ideology; if (v && ideologies.indexOf(v) < 0) ideologies.push(v); });
      ideologies.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
      groupOf = function (p) { var r = resultOf(p.id, ctx.year); return (r.derived && r.derived.ideology) || null; };
      groupColor = function (g) { var i = ideologies.indexOf(g); return i < 0 ? '#8a8a84' : Charts.PALETTE[i % Charts.PALETTE.length]; };
    }
    var sizeOf = null, sizeLabel = null;
    if (ex.size === 'mag') { sizeOf = function (p) { return Stats.magnitude(ctx.vec(p.id, ctx.year)); }; sizeLabel = 'Convicção'; }
    else if (ex.size.indexOf('attr:') === 0) {
      var sdef = Filters.defByKey(DATA, ex.size.slice(5));
      if (sdef) { sizeOf = function (p) { return Filters.attrValue(p, sdef, ctx.year); }; sizeLabel = sdef.label; }
    }

    var unavailable = [];
    if (!xm.isAxis && ctx.people.every(function (p) { return xm.value(p.id, ctx.year) === null; })) unavailable.push(xm.label);
    if (!ym.isAxis && ctx.people.every(function (p) { return ym.value(p.id, ctx.year) === null; })) unavailable.push(ym.label);
    if (unavailable.length) {
      box.replaceWith(empty('Sem valores para: ' + unavailable.join(' e ') + '. ' + (ctx.pca.ok ? '' : ctx.pca.reason)));
      return;
    }
    Charts.explorer(box, ctx, { xMetric: xm, yMetric: ym, groupOf: groupOf, groupColor: groupColor, groupOrder: groupOrder, sizeOf: sizeOf, sizeLabel: sizeLabel, labels: ex.labels, trails: ex.trails, photos: state.photos }, { onPerson: chartOpenPerson });
  }

  // Frases automáticas sobre os quadrantes de um par de eixos (ou compostos).
  function quadrantInsights(ctx, xm, ym) {
    var pts = ctx.people.map(function (p) { return { p: p, x: xm.value(p.id, ctx.year), y: ym.value(p.id, ctx.year) }; })
      .filter(function (pt) { return pt.x !== null && pt.y !== null; });
    if (!pts.length) return [];
    var names = function (arr) { return arr.map(function (pt) { return nameOf(pt.p); }).join(', '); };
    var quads = {};
    [['L', 'L'], ['R', 'L'], ['L', 'R'], ['R', 'R']].forEach(function (q) { quads[q.join('')] = []; });
    pts.forEach(function (pt) { quads[(pt.x >= 50 ? 'L' : 'R') + (pt.y >= 50 ? 'L' : 'R')].push(pt); });
    var out = [];
    var emptyQ = Object.keys(quads).filter(function (k) { return quads[k].length === 0; });
    if (emptyQ.length && emptyQ.length < 4) {
      out.push({ title: emptyQ.length === 1 ? 'Um quadrante vazio' : emptyQ.length + ' quadrantes vazios', text: 'Ninguém em ' + emptyQ.map(function (k) { return Charts.quadrantName(xm, ym, k[0], k[1]).toLowerCase(); }).join(', nem em ') + '.' });
    }
    var fullest = Object.keys(quads).sort(function (a, b) { return quads[b].length - quads[a].length; })[0];
    if (quads[fullest].length) {
      out.push({ title: 'Quadrante mais cheio', text: quads[fullest].length + ' de ' + pts.length + ' em ' + Charts.quadrantName(xm, ym, fullest[0], fullest[1]).toLowerCase() + ': ' + names(quads[fullest]) + '.' });
    }
    var center = pts.filter(function (pt) { return Math.abs(pt.x - 50) < 7.5 && Math.abs(pt.y - 50) < 7.5; });
    if (center.length) out.push({ title: 'Perto do centro', text: 'Equilibrado(a) nos dois eixos: ' + names(center) + '.' });
    var d = 1;
    function extremes(m, get) {
      var sorted = pts.slice().sort(function (a, b) { return get(b) - get(a); });
      var hi = sorted[0], lo = sorted[sorted.length - 1];
      if (hi === lo) return null;
      return { title: 'Extremos em ' + m.label, text: 'Quem mais puxa para ' + m.axis.leftPole + ': ' + nameOf(hi.p) + ' (' + fmt(get(hi), d) + '). Para ' + m.axis.rightPole + ': ' + nameOf(lo.p) + ' (' + fmt(100 - get(lo), d) + ').' };
    }
    var ex1 = extremes(xm, function (pt) { return pt.x; }), ex2 = extremes(ym, function (pt) { return pt.y; });
    if (ex1) out.push(ex1);
    if (ex2) out.push(ex2);
    return out;
  }

  function pcaNotes(ctx) {
    if (!ctx.pca.ok) return note(ctx.pca.reason, 'warn');
    var parts = [0, 1].map(function (k) {
      if (k === 1 && ctx.pca.explained[1] <= 0) return h('p', null, 'Componente 2: indisponível (com 2 pessoas só existe um componente).');
      var load = ctx.pca.loadings[k].map(function (w, i) { return { w: w, axis: ctx.axes[i] }; })
        .sort(function (a, b) { return Math.abs(b.w) - Math.abs(a.w); }).slice(0, 5);
      return h('p', null, [
        h('b', null, 'Componente ' + (k + 1) + ' (' + fmt(ctx.pca.explained[k] * 100, 0) + '% da variância): '),
        'aumenta com ' + load.map(function (l) { return (l.w >= 0 ? l.axis.leftPole : l.axis.rightPole) + ' (' + fmt(Math.abs(l.w), 2) + ')'; }).join(', ') + '.'
      ]);
    });
    parts.push(h('p', { class: 'hint' }, 'Os pesos vão de 0 a 1 e somam 1 ao quadrado. O sinal é arbitrário; aqui está orientado para que o eixo de maior peso fique positivo. O PCA é recalculado só com as pessoas do filtro.'));
    return h('div', null, parts);
  }

  // ---------------------------------------------------------------------------
  // View 2 — Visão do grupo
  // ---------------------------------------------------------------------------
  function renderGroup(view, ctx) {
    view.appendChild(pageHead('Visão do grupo', 'Retrato do <em>grupo</em> em ' + ctx.year, 'Quem está no filtro, como cada pessoa se posiciona em cada eixo, onde o grupo concorda e onde se divide, e quem se parece com quem.'));
    if (noPeople(view, ctx)) return;
    var g = state.group;

    // Destaques
    var hl = groupHighlights(ctx);
    if (hl.length) {
      view.appendChild(section('destaques', 'Superlativos', 'Destaques do grupo', [
        h('div', { class: 'destaques' }, hl.map(highlightCard)),
        h('p', { class: 'caption' }, 'Calculado só com os 12 números das pessoas no filtro. Convicção = média de |valor − 50|; distâncias = diferença média por eixo, em pontos. Clique num nome para abrir a pessoa.')
      ]));
    }

    // Fichas (no celular, só as 4 primeiras até pedir todas)
    var FICHAS_MOBILE = 4;
    var collapse = window.innerWidth < 700 && !ui.allFichas && ctx.people.length > FICHAS_MOBILE + 1;
    var fichaPeople = collapse ? ctx.people.slice(0, FICHAS_MOBILE) : ctx.people;
    var fichas = h('div', { class: 'fichas' }, fichaPeople.map(function (p) { return fichaCard(p, ctx); }));
    if (collapse) {
      fichas = h('div', null, [fichas, h('button', { type: 'button', class: 'btn more-btn', onClick: function () { ui.allFichas = true; render(); } }, 'Ver as ' + ctx.people.length + ' fichas')]);
    }
    view.appendChild(section('fichas', 'Pessoas', 'O resultado de cada um', [fichas, h('p', { class: 'caption' }, 'A tag é a categoria que o 12 Axes deu (sem ela, o lado econômico calculado). Personalidade: a mais compatível com o %, depois as outras três. Países: o mais próximo com o %, depois os outros dois. As barrinhas mostram os 12 eixos na ordem do quiz: para cima pende ao primeiro polo (Federal, Democracia, Segurança…), para baixo ao segundo. Passe o mouse para ver o número; clique no nome para abrir a pessoa.')]));

    // Alma gêmea e oposto
    if (ctx.people.length > 1) {
      var mates = h('div', { class: 'soulmates' }, ctx.people.map(function (p) {
        var v = ctx.vec(p.id, ctx.year);
        var ranked = ctx.people.filter(function (o) { return o.id !== p.id; })
          .map(function (o) { return { o: o, d: Stats.rmsDistance(v, ctx.vec(o.id, ctx.year)) }; })
          .sort(function (a, b) { return a.d - b.d; });
        var near = ranked[0], far = ranked[ranked.length - 1];
        var sideInfo = ctx.sideOf(p);
        return h('div', { class: 'soulmate' }, [
          h('div', { class: 'who' }, [h('span', { class: 'sdot', style: 'background:' + sideInfo.color, title: sideInfo.label }), h('button', { type: 'button', onClick: function () { openPerson(p.id); } }, nameOf(p))]),
          h('p', null, ['Mais perto: ', h('button', { type: 'button', onClick: function () { openPerson(near.o.id); } }, nameOf(near.o)), ' (' + fmt(near.d, 1) + ')']),
          ranked.length > 1 ? h('p', null, ['Mais longe: ', h('button', { type: 'button', onClick: function () { openPerson(far.o.id); } }, nameOf(far.o)), ' (' + fmt(far.d, 1) + ')']) : null
        ]);
      }));
      view.appendChild(section('almas', 'Pares', 'Alma gêmea e oposto de cada um', [mates, h('p', { class: 'caption' }, 'Distância média por eixo, em pontos (0 = perfis idênticos). O ponto colorido é a categoria, com as mesmas cores das fichas.')]));
    }

    // Rede de afinidade
    var netBox = null;
    if (ctx.people.length >= 3) {
      netBox = chartBox('networkChart');
      var turmas = knnGroups(ctx, g.netK);
      var turmasEl = turmas.length > 1
        ? h('div', { class: 'turmas' }, turmas.map(function (tm, i) {
          return h('div', { class: 'turma' }, [
            h('span', { class: 'turma-n' }, 'Turma ' + (i + 1) + ' · ' + tm.length),
            h('div', { class: 'member-row' }, tm.map(function (p) { var a = avatar(p, 'sm'); a.title = nameOf(p); a.addEventListener('click', function () { openPerson(p.id); }); return a; })),
            h('p', { class: 'turma-names' }, tm.map(nameOf).join(', '))
          ]);
        }))
        : note('Com ' + g.netK + ' vizinhos por pessoa, todo mundo fica ligado numa única rede. Use "1 vizinho" para ver as turmas mais fechadas.', 'info');
      view.appendChild(section('rede', 'Quem anda com quem', 'Rede de afinidade', [
        netBox,
        h('h4', { style: 'margin:16px 0 8px' }, turmas.length > 1 ? turmas.length + ' turmas com ' + g.netK + (g.netK === 1 ? ' vizinho' : ' vizinhos') + ' por pessoa' : 'Turmas'),
        turmasEl,
        h('p', { class: 'caption' }, (g.netK === 1 ? 'Cada pessoa se liga à mais parecida com ela' : 'Cada pessoa se liga às ' + g.netK + ' mais parecidas com ela') + ' (menor distância média por eixo). Linha cheia: a escolha é mútua; tracejada: de um lado só. Linhas mais grossas ligam pares mais parecidos, e o layout aproxima quem está ligado. O tamanho do nó é a convicção. Passe o mouse para destacar as ligações; arraste nós; role para aproximar; clique para abrir a pessoa. "Turmas" são os grupos que ficam ligados entre si.')
      ], [
        segmented([{ id: 1, label: '1 vizinho' }, { id: 2, label: '2' }, { id: 3, label: '3' }].map(function (o) { return { id: String(o.id), label: o.label }; }), String(g.netK), function (v) { set(function (s) { s.group.netK = Number(v); }); }, 'Vizinhos por pessoa'),
        segmented([{ id: 'side', label: 'Categoria' }, { id: 'person', label: 'Pessoa' }], g.netColor, function (v) { set(function (s) { s.group.netColor = v; }); }, 'Cor')
      ]));
    }

    var heat = chartBox('heatChart');
    view.appendChild(section('heatmap', 'Pessoa × eixo', 'Heatmap', [
      heat,
      h('p', { class: 'caption' }, 'Roxo = polo esquerdo (rótulo à esquerda), laranja = polo direito (rótulo à direita), cinza = centro. Pessoas ordenadas por agrupamento hierárquico: colunas vizinhas têm perfis parecidos. Clique em uma célula ou nome para abrir a pessoa.')
    ], [toggle('Mostrar números', g.values, function (on) { set(function (s) { s.group.values = on; }); })]));

    var stripsEl = stripsView(ctx, { byCat: g.stripColor === 'side', showRef: ctx.filterActive && state.showRef });
    view.appendChild(section('faixas', 'Distribuição', 'Faixas por eixo', [
      stripsEl.el,
      h('p', { class: 'caption' }, 'Um avatar por pessoa, com as iniciais; o polo esquerdo fica à esquerda e quem tem o mesmo valor fica empilhado. A barra escura é a média do filtro' + (ctx.filterActive && state.showRef ? '; a tracejada, a média do grupo inteiro' : '') + '. Passe o mouse (ou toque) num avatar para ver o nome e o valor: a pessoa acende em todos os eixos. ' + (Charts.isTouch() ? 'Toque de novo para abrir a pessoa.' : 'Clique para abrir a pessoa.'))
    ], [segmented([{ id: 'person', label: 'Cor por pessoa' }, { id: 'side', label: 'Por categoria' }], g.stripColor, function (v) { set(function (s) { s.group.stripColor = v; }); }, 'Cor dos avatares')]));
    stripsEl.layout();

    var cons = chartBox('consChart');
    view.appendChild(section('consenso', 'Desvio padrão', 'Consenso vs divisão', [
      cons,
      h('p', { class: 'caption' }, 'Eixos ordenados pelo desvio padrão: em cima, onde o grupo mais concorda; embaixo, onde mais se divide.')
    ]));

    var aff = chartBox('affChart');
    view.appendChild(section('afinidade', 'Pessoa × pessoa', g.aff === 'dist' ? 'Matriz de distância' : 'Matriz de afinidade', [
      ctx.people.length < 2 ? empty('Precisa de pelo menos 2 pessoas no filtro.') : aff,
      h('p', { class: 'caption' }, (g.aff === 'dist'
        ? 'Distância média por eixo, em pontos: raiz da média dos quadrados das diferenças nos 12 eixos (0 = idênticos, 100 = opostos em tudo).'
        : 'Similaridade = 100 × (1 − distância euclidiana / distância máxima).') + ' Mesma ordem do heatmap. O ponto ao lado do nome é a categoria, com as mesmas cores das fichas.')
    ], [
      segmented([{ id: 'sim', label: 'Similaridade' }, { id: 'dist', label: 'Distância' }], g.aff === 'dist' ? 'dist' : 'sim', function (v) { set(function (s) { s.group.aff = v; }); }, 'Medida'),
      toggle('Mostrar números', g.values, function (on) { set(function (s) { s.group.values = on; }); })
    ]));

    // Mapa-múndi
    var mapKey = g.map === 'countryHistorical' ? 'countryHistorical' : g.map === 'countries' ? 'countries' : 'countryPresent';
    var mapBox = chartBox('worldMap');
    var mapItems = {}, unmapped = {}, missing = 0;
    ctx.people.forEach(function (p) {
      var r = resultOf(p.id, ctx.year);
      var dv = r.derived || {};
      var names = mapKey === 'countries' ? (dv.countries || []).map(function (c) { return c.name; }) : (dv[mapKey] ? [dv[mapKey]] : []);
      if (!names.length) { missing++; return; }
      names.forEach(function (v) {
        var mapName = window.Geo.resolve(v);
        if (!mapName) { if (!unmapped[v]) unmapped[v] = []; unmapped[v].push(p); return; }
        if (!mapItems[mapName]) mapItems[mapName] = { mapName: mapName, label: v, people: [] };
        if (!mapItems[mapName].people.some(function (x) { return x.person === p; })) mapItems[mapName].people.push({ person: p, label: v });
      });
    });
    var mapList = Object.keys(mapItems).map(function (k) { return mapItems[k]; }).sort(function (a, b) { return b.people.length - a.people.length; });
    var legendChips = h('div', { class: 'member-row' }, mapList.map(function (it) {
      var labels = {}; it.people.forEach(function (pp) { labels[pp.label] = true; });
      return pill(Object.keys(labels).join(' / ') + ' × ' + it.people.length, 'pill-soft');
    }));
    var unmappedKeys = Object.keys(unmapped);
    var mapNotes = [];
    if (unmappedKeys.length) mapNotes.push(note('<b>Não localizado no mapa:</b> ' + unmappedKeys.map(function (k) { return esc(k) + ' (' + unmapped[k].map(nameOf).map(esc).join(', ') + ')'; }).join('; ') + '. Acrescente um apelido em js/geo.js para posicionar.', 'warn'));
    var mapMissingLabel = { countryPresent: 'país atual', countryHistorical: 'experiência histórica entre os países do cartão', countries: 'países' }[mapKey];
    if (missing) mapNotes.push(h('p', { class: 'hint' }, missing + ' pessoa(s) sem ' + mapMissingLabel + '.'));
    var mapTitle = { countryPresent: 'Países mais próximos das pessoas', countryHistorical: 'Experiências históricas mais próximas', countries: 'Os 3 países de cada pessoa' }[mapKey];
    var mapCaption = {
      countryPresent: 'Cada avatar fica sobre o país atual mais próximo daquela pessoa, segundo o 12 Axes.',
      countryHistorical: 'Cada avatar fica sobre a experiência histórica mais próxima, no território atual correspondente. Só aparece quem teve uma experiência histórica entre os 3 países do cartão.',
      countries: 'Cada pessoa aparece nos 3 países que o cartão do 12 Axes listou (atuais e históricos). Países mais escuros concentram mais gente.'
    }[mapKey];
    view.appendChild(section('mapa', 'No mundo', mapTitle, [
      mapList.length ? mapBox : empty('Nenhum país localizável entre as pessoas do filtro.'),
      legendChips,
      mapNotes,
      h('p', { class: 'caption' }, mapCaption + ' Arraste para mover, role para aproximar. Regiões entre parênteses são resolvidas pelo país.')
    ], [segmented([{ id: 'countryPresent', label: 'País atual' }, { id: 'countryHistorical', label: 'Experiência histórica' }, { id: 'countries', label: 'Top 3' }], mapKey, function (v) { set(function (s) { s.group.map = v; }); }, 'Tipo de país')]));

    // Evolução das médias (só com mais de um ano)
    var meansByYear = null, nByYear = {};
    if (years.length > 1) {
      meansByYear = {};
      years.forEach(function (y) {
        var base = DATA.people.filter(function (p) { return !!resultOf(p.id, y); });
        var ppl = Filters.apply(DATA, y, state.filters, base);
        nByYear[y] = ppl.length;
        meansByYear[y] = ppl.length ? Stats.meanVector(ppl.map(function (p) { return ctx.vec(p.id, y); })) : null;
      });
      var evo = chartBox('meanTimeline');
      view.appendChild(section('evolucao', 'No tempo', 'Evolução das médias do filtro', [
        evo,
        h('p', { class: 'caption' }, 'Média de cada eixo (% do polo esquerdo) por ano, com os filtros atuais aplicados a cada ano. Pessoas no filtro por ano: ' + years.map(function (y) { return y + ' = ' + nByYear[y]; }).join(' · ') + '. Anos sem ninguém ficam em branco.')
      ]));
    }

    var grid = h('div', { class: 'grid-2' });
    var derivedBoxes = [];
    DERIVED_DEFS.forEach(function (d) {
      var map = {}, missing = 0;
      ctx.people.forEach(function (p) {
        var r = resultOf(p.id, ctx.year);
        var vals = (r.derived ? d.get(r.derived) : []).filter(function (v) { return !!v; });
        if (!vals.length) { missing++; return; }
        vals.forEach(function (v) {
          if (!map[v]) map[v] = { name: v, count: 0, people: [] };
          map[v].count++;
          map[v].people.push(nameOf(p));
        });
      });
      var items = Object.keys(map).map(function (k) { return map[k]; });
      var box = chartBox('derived_' + d.key);
      grid.appendChild(h('div', { class: 'mini-card' }, [
        h('h4', null, [d.label, missing ? h('span', { class: 'muted' }, ' · ' + missing + ' sem valor') : null]),
        items.length ? box : empty('Sem dados de ' + d.label.toLowerCase() + ' neste filtro.')
      ]));
      if (items.length) derivedBoxes.push({ box: box, items: items });
    });
    view.appendChild(section('derivados', 'Derivados', 'O que o 12 Axes disse', [
      grid,
      h('p', { class: 'caption' }, 'Contagens dos derivados registrados em cada resultado. Nas listas "top", cada pessoa conta uma vez para cada nome da sua lista. São a leitura do site naquele ano; os cálculos do painel não usam esses campos.')
    ]));

    if (netBox && desktopOnly(netBox, 'net', 'A rede de afinidade')) {
      Charts.network(netBox, ctx, {
        k: g.netK, byCategory: g.netColor === 'side', categoryOrder: CATEGORY_ORDER,
        colorOf: g.netColor === 'side' ? function (p) { return ctx.sideOf(p); } : null
      }, { onPerson: chartOpenPerson });
    }
    if (desktopOnly(heat, 'heat', 'O heatmap com todas as pessoas')) Charts.heatmap(heat, ctx, { values: g.values, photos: state.photos }, { onPerson: chartOpenPerson });
    Charts.consensus(cons, ctx);
    if (ctx.people.length >= 2 && desktopOnly(aff, 'aff', 'A matriz pessoa × pessoa')) Charts.affinity(aff, ctx, { values: g.values, photos: state.photos, mode: g.aff }, { onPerson: chartOpenPerson });
    derivedBoxes.forEach(function (d) { Charts.counts(d.box, d.items); });
    if (meansByYear) {
      Charts.axisLines($('#meanTimeline'), ctx, years, meansByYear, { subtitle: function (y) { return 'n = ' + (nByYear[y] || 0); } });
    }
    if (mapList.length && desktopOnly(mapBox, 'map', 'O mapa-múndi')) {
      var placeholder = empty('Carregando o mapa…');
      if (!window.Geo.isLoaded()) mapBox.appendChild(placeholder);
      window.Geo.load(function (err) {
        if (!document.body.contains(mapBox)) return; // a view já foi redesenhada
        if (err) { mapBox.replaceWith(note('Não foi possível carregar o mapa-múndi (' + esc(err.message || err) + '). Verifique a conexão.', 'warn')); return; }
        mapBox.innerHTML = '';
        Charts.worldMap(mapBox, ctx, { items: mapList, photos: state.photos }, { onPerson: chartOpenPerson });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // View 3 — Comparar subgrupos
  // ---------------------------------------------------------------------------
  function renderCompare(view, ctx) {
    view.appendChild(pageHead('Subgrupos', 'Comparar <em>subgrupos</em>', 'Média de cada subgrupo por eixo, para um atributo categórico das pessoas.'));
    var cats = Filters.attributeDefs(DATA).filter(function (d) { return d.type === 'category'; });
    if (!cats.length) { view.appendChild(h('div', { class: 'section' }, empty('Nenhum atributo categórico em attributeDefs para comparar.'))); return; }
    var attrKey = state.compare.attr && cats.some(function (d) { return d.key === state.compare.attr; }) ? state.compare.attr : cats[0].key;
    var def = Filters.defByKey(DATA, attrKey);

    view.appendChild(h('div', { class: 'card controls-card' }, [h('div', { class: 'controls' }, [
      h('label', { class: 'field' }, ['Atributo', select(cats.map(function (d) { return { id: d.key, label: d.label }; }), attrKey, function (v) { set(function (s) { s.compare.attr = v; }); })]),
      segmented([{ id: 'bars', label: 'Barras divergentes' }, { id: 'radar', label: 'Radar sobreposto' }], state.compare.mode, function (v) { set(function (s) { s.compare.mode = v; }); }, 'Tipo de gráfico')
    ])]));

    if (noPeople(view, ctx)) return;

    var values = Filters.categoryValues(DATA, def);
    var groups = [];
    var byVal = {};
    ctx.people.forEach(function (p) {
      var v = Filters.attrValue(p, def, ctx.year);
      var k = v === null ? Filters.NONE : String(v);
      if (!byVal[k]) byVal[k] = [];
      byVal[k].push(p);
    });
    values.concat([Filters.NONE]).forEach(function (v) {
      if (!byVal[v]) return;
      var vecs = byVal[v].map(function (p) { return ctx.vec(p.id, ctx.year); });
      groups.push({
        key: v, label: v === Filters.NONE ? Filters.NONE_LABEL : v, n: vecs.length,
        mean: Stats.meanVector(vecs), sd: Stats.sdVector(vecs),
        color: v === Filters.NONE ? '#8a8a84' : Charts.PALETTE[values.indexOf(v) % Charts.PALETTE.length],
        people: byVal[v]
      });
    });

    var small = groups.filter(function (g) { return g.n < 3; });
    if (small.length) {
      view.appendChild(note('<b>Atenção:</b> subgrupo(s) com menos de 3 pessoas: ' + small.map(function (g) { return esc(g.label) + ' (n = ' + g.n + ')'; }).join(', ') + '. Médias pouco confiáveis.', 'warn'));
    }
    if (groups.length < 2) {
      view.appendChild(note('Só há um subgrupo (' + esc(groups[0].label) + ') entre as pessoas filtradas; não há o que comparar.', 'info'));
    }

    var box = chartBox('compareChart');
    var isRadar = state.compare.mode === 'radar';
    var rShow = state.compare.radarShow;
    var rSel = state.compare.radarSel; // null = todas
    var picker = null;
    if (isRadar) {
      var isOn = function (p) { return !rSel || rSel.indexOf(p.id) >= 0; };
      var toggleIds = function (ids, on) {
        set(function (s) {
          var cur = s.compare.radarSel ? s.compare.radarSel.slice() : ctx.people.map(function (p) { return p.id; });
          ids.forEach(function (id) { var i = cur.indexOf(id); if (on && i < 0) cur.push(id); if (!on && i >= 0) cur.splice(i, 1); });
          s.compare.radarSel = cur.length === ctx.people.length ? null : cur;
        });
      };
      picker = h('div', { class: 'radar-picker' }, [
        h('div', { class: 'radar-picker-top' }, [
          segmented([{ id: 'both', label: 'Pessoas e médias' }, { id: 'people', label: 'Só pessoas' }, { id: 'means', label: 'Só médias' }], rShow, function (v) { set(function (s) { s.compare.radarShow = v; }); }, 'O que mostrar'),
          rShow !== 'means' ? h('div', { class: 'btn-row' }, [
            h('button', { type: 'button', class: 'small', onClick: function () { set(function (s) { s.compare.radarSel = null; }); } }, 'Todas'),
            h('button', { type: 'button', class: 'small', onClick: function () { set(function (s) { s.compare.radarSel = []; }); } }, 'Nenhuma')
          ]) : null
        ]),
        rShow !== 'means' ? h('div', { class: 'radar-groups' }, groups.map(function (g) {
          var allOn = g.people.every(isOn);
          return h('div', { class: 'radar-group' }, [
            h('button', { type: 'button', class: 'radar-group-name', title: allOn ? 'Esconder este subgrupo' : 'Mostrar este subgrupo', onClick: function () { toggleIds(g.people.map(function (p) { return p.id; }), !allOn); } },
              [h('span', { class: 'dot', style: 'background:' + g.color }), g.label + ' (n = ' + g.n + ')']),
            h('div', { class: 'radar-chips' }, g.people.map(function (p) {
              var on = isOn(p);
              return h('button', { type: 'button', class: 'rchip' + (on ? ' on' : ''), style: '--gc:' + g.color, 'aria-pressed': on ? 'true' : 'false', onClick: function () { toggleIds([p.id], !on); } }, nameOf(p));
            }))
          ]);
        })) : null
      ]);
    }
    var cmpCaption = isRadar
      ? 'Cada raio é o % do polo indicado (o polo esquerdo do eixo); o anel do meio é o centro (50). Contornos finos são pessoas, na cor do subgrupo; contornos grossos são as médias. Passe o mouse para destacar um contorno; clique numa pessoa para abrir a visão individual. Use os nomes acima para escolher quem aparece; clique no nome do subgrupo para ligar ou desligar todos dele.'
      : 'Barras a partir do centro: para a esquerda, o subgrupo puxa para o polo esquerdo; para a direita, para o polo direito. O rótulo diz o % médio do polo daquele lado.';
    view.appendChild(section('comparacao', def.label, isRadar ? 'Pessoas e médias por subgrupo' : 'Média de cada subgrupo por eixo', [
      picker,
      box,
      h('p', { class: 'caption' }, cmpCaption)
    ]));

    var members = h('div', { class: 'grid-3' }, groups.map(function (g) {
      return h('div', { class: 'subcard' }, [
        h('h4', null, [h('span', { class: 'dot', style: 'background:' + g.color }), g.label + ' (n = ' + g.n + ')']),
        h('div', { class: 'member-row' }, g.people.map(function (p) { var a = avatar(p, 'sm'); a.addEventListener('click', function () { openPerson(p.id); }); return a; }))
      ]);
    }));
    view.appendChild(section('membros', 'Quem é quem', 'Pessoas de cada subgrupo', members));

    var table = h('table', { class: 'table' }, [
      h('thead', null, h('tr', null, [h('th', null, 'Eixo')].concat(groups.map(function (g) { return h('th', null, [h('span', { class: 'dot', style: 'background:' + g.color }), g.label + ' (n = ' + g.n + ')']); })))),
      h('tbody', null, ctx.axes.map(function (a, i) {
        return h('tr', null, [h('td', null, [h('b', null, a.name), h('span', { class: 'muted' }, ' ' + a.leftPole + ' ↔ ' + a.rightPole)])].concat(groups.map(function (g) {
          var m = g.mean[i];
          return h('td', { html: Stats.dominantPole(a, m) + ' <b>' + fmt(Stats.dominantPercent(m), 1) + '</b><span class="muted"> ± ' + fmt(g.sd[i], 1) + '</span>' });
        })));
      }))
    ]);
    view.appendChild(section('tabela', 'Números', 'Média (polo dominante) ± desvio padrão', h('div', { class: 'table-wrap' }, table)));

    if (isRadar) Charts.compareRadar(box, ctx, groups, { show: rShow, selected: rSel }, { onPerson: chartOpenPerson });
    else Charts.compareBars(box, ctx, groups);
  }

  // ---------------------------------------------------------------------------
  // View 4 — Visão individual
  // ---------------------------------------------------------------------------
  function axisRowEl(axis, value, d, color, meanValue) {
    var it = Stats.intensity(value);
    var right = 100 - value;
    var leftWins = it.level > 0 && value >= 50;
    var rightWins = it.level > 0 && value < 50;
    var pos = 100 - value; // posição no trilho: 0 = polo esquerdo, 100 = polo direito
    var fillLeft = Math.min(pos, 50);
    var fillW = it.level === 0 ? 0 : Math.abs(pos - 50);
    return h('div', { class: 'axis-row' + (it.level === 0 ? ' balanced' : ''), style: '--pc:' + color }, [
      h('div', { class: 'axis-row-head' }, [
        h('h4', null, axis.name),
        h('span', { class: 'itag lvl' + it.level }, it.label + (it.level ? ' · ' + Stats.dominantPole(axis, value) : ''))
      ]),
      h('div', { class: 'axis-meter' }, [
        h('div', { class: 'pole' + (leftWins ? ' win' : '') }, [h('b', { title: axis.leftPole }, [h('span', { class: 'pn-full' }, axis.leftPole), h('span', { class: 'pn-short' }, Charts.shortPole(axis.leftPole))]), h('em', null, fmt(value, d) + '%')]),
        h('div', { class: 'track', role: 'img', 'aria-label': axis.name + ': ' + axis.leftPole + ' ' + fmt(value, d) + '%, ' + axis.rightPole + ' ' + fmt(right, d) + '%' }, [
          h('i', { class: 'mid' }),
          h('i', { class: 'fill', style: 'left:' + fillLeft + '%;width:' + fillW + '%' }),
          meanValue === null || meanValue === undefined ? null : h('i', { class: 'mean', style: 'left:' + (100 - meanValue) + '%', title: 'Média do filtro: ' + axis.leftPole + ' ' + fmt(meanValue, 1) }),
          h('i', { class: 'dot', style: 'left:' + pos + '%' })
        ]),
        h('div', { class: 'pole right' + (rightWins ? ' win' : '') }, [h('b', { title: axis.rightPole }, [h('span', { class: 'pn-full' }, axis.rightPole), h('span', { class: 'pn-short' }, Charts.shortPole(axis.rightPole))]), h('em', null, fmt(right, d) + '%')])
      ])
    ]);
  }

  function miniTrack(axis, value, meanValue, color) {
    var pos = 100 - value;
    return h('div', { class: 'mini-track', style: '--pc:' + color }, [
      h('div', { class: 'track' }, [
        h('i', { class: 'mid' }),
        meanValue === null ? null : h('i', { class: 'mean', style: 'left:' + (100 - meanValue) + '%' }),
        h('i', { class: 'dot', style: 'left:' + pos + '%' })
      ]),
      h('div', { class: 'track-caption' }, [h('span', null, axis.leftPole), h('span', null, axis.rightPole)])
    ]);
  }

  function renderPerson(view, ctx) {
    if (!ctx.allPeople.length) { view.appendChild(pageHead('Visão individual', 'Perfil <em>individual</em>')); noPeople(view, ctx); return; }
    var candidates = ctx.people.length ? ctx.people : ctx.allPeople;
    var pid = state.person && personById(state.person) ? state.person : candidates[0].id;
    var person = personById(pid);
    var inYear = !!resultOf(pid, ctx.year);

    var peopleOpts = DATA.people.map(function (p) {
      var has = !!resultOf(p.id, ctx.year);
      return { id: p.id, label: nameOf(p) + (has ? '' : ' (sem resultado em ' + ctx.year + ')'), group: ctx.people.indexOf(p) >= 0 ? 'No filtro' : 'Fora do filtro' };
    });
    view.appendChild(pageHead('Visão individual', 'Perfil de <em>' + esc(nameOf(person)) + '</em>'));
    view.appendChild(h('div', { class: 'card controls-card' }, [h('div', { class: 'controls' }, [
      h('label', { class: 'field' }, ['Pessoa', select(peopleOpts, pid, function (v) { set(function (s) { s.person = v; }); })])
    ])]));

    if (!inYear) {
      view.appendChild(h('div', { class: 'section' }, empty(nameOf(person) + ' não tem resultado em ' + ctx.year + '. Escolha outro ano ou outra pessoa.')));
      return;
    }
    var r = resultOf(pid, ctx.year);
    var d = r.precision || 0;
    var vec = ctx.vec(pid, ctx.year);
    var color = colorOf(person);
    var inFilter = ctx.people.indexOf(person) >= 0;
    var others = ctx.people.filter(function (p) { return p.id !== pid; });
    var hasGroup = ctx.mean && ctx.people.length > 1;
    var mag = Stats.magnitude(vec);
    var simMean = hasGroup ? Stats.similarity(vec, ctx.mean) : null;

    // Hero
    var tags = Filters.attributeDefs(DATA).map(function (dd) {
      var v = Filters.attrValue(person, dd, ctx.year);
      return v === null ? null : pill(dd.key === 'age' ? v + ' anos' : String(v), 'pill-soft');
    }).filter(Boolean);
    tags.unshift(pill(String(r.year), 'pill-dark'));
    var hero = h('div', { class: 'hero' }, [
      avatar(person, 'xl'),
      h('div', { class: 'hero-body' }, [
        h('div', { class: 'hero-tags' }, tags),
        h('h2', null, nameOf(person)),
        h('p', { class: 'sub' }, [otherNameOf(person) ? otherNameOf(person) + ' · ' : '', (r.source || '—') + ' · ' + (r.variant || 'desconhecido') + ' · ' + (r.inputMethod || '—') + (r.date ? ' · ' + r.date : '')]),
        h('div', { class: 'hero-stats' }, [
          ring(mag / 50 * 100, 96, 'convicção', color, fmt(mag, 1)),
          hasGroup ? ring(simMean, 96, 'vs média', 'var(--accent)') : null,
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Distância à média'), h('span', { class: 'v' }, hasGroup ? fmt(Stats.euclid(vec, ctx.mean), 1) : '—')]),
          h('div', { class: 'stat' }, [h('span', { class: 'k' }, 'Pessoas no filtro'), h('span', { class: 'v' }, String(ctx.people.length))])
        ]),
        inFilter ? null : note('Esta pessoa está fora do filtro atual; as comparações usam o grupo filtrado (' + ctx.people.length + ' pessoa(s)).', 'info')
      ])
    ]);
    view.appendChild(h('section', { class: 'section' }, hero));

    // Eixos
    var rows = h('div', { class: 'axis-list' }, ctx.axes.map(function (a, i) {
      return axisRowEl(a, vec[i], d, color, hasGroup ? ctx.mean[i] : null);
    }));
    var legend = h('div', { class: 'track-legend', style: '--pc:' + color }, [
      h('span', null, [h('i', { class: 'lg-dot' }), nameOf(person)]),
      hasGroup ? h('span', null, [h('i', { class: 'lg-mean' }), 'Média do filtro (n = ' + ctx.people.length + ')']) : null,
      h('span', { class: 'muted' }, 'Faixas: Equilibrado < 7,5 · Inclinado < 22,5 · Forte < 37,5 · Muito forte ≥ 37,5 pontos do centro')
    ]);
    view.appendChild(section('eixos', 'Eixos políticos', 'Resultado percentual por eixo', [rows, legend]));

    // O que distingue
    if (hasGroup) {
      var diffs = ctx.axes.map(function (a, i) { return { axis: a, i: i, v: vec[i], m: ctx.mean[i], diff: vec[i] - ctx.mean[i] }; });
      var far = diffs.slice().sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); })[0];
      var near = diffs.slice().sort(function (a, b) { return Math.abs(a.diff) - Math.abs(b.diff); })[0];
      function describe(x) {
        var toward = x.diff >= 0 ? x.axis.leftPole : x.axis.rightPole;
        return nameOf(person) + ' puxa ' + fmt(Math.abs(x.diff), 1) + ' pontos mais para ' + toward + ' que a média do filtro (' + x.axis.leftPole + ' ' + fmt(x.v, d) + ' vs ' + fmt(x.m, 1) + ').';
      }
      view.appendChild(section('distingue', 'Em relação ao grupo', 'O que distingue ' + nameOf(person), h('div', { class: 'distinct-grid' }, [
        h('div', { class: 'distinct primary' }, [pill('Onde mais se afasta do grupo', 'pill-dark'), h('h3', null, far.axis.name), h('p', null, describe(far)), miniTrack(far.axis, far.v, far.m, color)]),
        h('div', { class: 'distinct' }, [pill('Onde mais se parece com o grupo', 'pill-soft'), h('h3', null, near.axis.name), h('p', null, Math.abs(near.diff) < 0.05 ? nameOf(person) + ' está exatamente na média do filtro em ' + near.axis.name + '.' : describe(near)), miniTrack(near.axis, near.v, near.m, color)])
      ])));
    }

    // Radar + convicção
    var radar = chartBox('personRadar');
    view.appendChild(section('radar', 'Forma do perfil', 'Radar · pessoa vs média do filtro', [radar, h('p', { class: 'caption' }, 'Cada raio é o % do polo indicado (o polo esquerdo do eixo).')]));

    var groupMags = ctx.people.map(function (p) { return Stats.magnitude(ctx.vec(p.id, ctx.year)); });
    var thermo = h('div', { class: 'thermo' }, [
      h('div', { class: 'thermo-row', style: '--pc:' + color }, [h('span', null, nameOf(person)), h('div', { class: 'bar' }, h('i', { style: 'width:' + (mag / 50 * 100) + '%' })), h('span', { class: 'val' }, fmt(mag, 1))]),
      hasGroup ? h('div', { class: 'thermo-row', style: '--pc:var(--faint)' }, [h('span', null, 'Média do filtro (n = ' + ctx.people.length + ')'), h('div', { class: 'bar' }, h('i', { style: 'width:' + (Stats.mean(groupMags) / 50 * 100) + '%' })), h('span', { class: 'val' }, fmt(Stats.mean(groupMags), 1))]) : null,
      hasGroup ? h('div', { class: 'thermo-row', style: '--pc:var(--surface-3)' }, [h('span', { class: 'muted' }, 'Faixa do filtro (mín. a máx.)'), h('div', { class: 'bar' }, h('i', { style: 'left:' + (Math.min.apply(null, groupMags) / 50 * 100) + '%;width:' + ((Math.max.apply(null, groupMags) - Math.min.apply(null, groupMags)) / 50 * 100) + '%;background:var(--axis-line)' })), h('span', { class: 'val muted' }, fmt(Math.min.apply(null, groupMags), 0) + '–' + fmt(Math.max.apply(null, groupMags), 0))]) : null,
      h('div', { class: 'thermo-scale' }, [h('span', null, '0 · tudo no centro'), h('span', null, '50 · tudo nos extremos')])
    ]);
    view.appendChild(section('conviccao', 'Intensidade', 'Termômetro de convicção', [thermo, h('p', { class: 'caption' }, 'Convicção = média de |valor − 50| nos 12 eixos.')]));

    // Próximas e distantes
    var ranked = others.map(function (p) { return { p: p, sim: Stats.similarity(vec, ctx.vec(p.id, ctx.year)) }; }).sort(function (a, b) { return b.sim - a.sim; });
    var closest = ranked.slice(0, 3);
    var farthest = ranked.length > 3 ? ranked.slice(3).slice(-3).reverse() : [];
    var closeGrid = closest.length ? h('div', { class: 'grid-3' }, closest.map(function (it, i) {
      return personCard(it.p, ctx, { hero: i === 0, tag: i === 0 ? 'mais próxima' : null, tagKind: 'pill-accent', sub: attrSummary(it.p, ctx), pct: it.sim, pctDecimals: 1 });
    })) : empty('Sem outras pessoas no filtro.');
    var farList = farthest.length ? h('div', { class: 'compact-list' }, farthest.map(function (it) {
      return h('button', { class: 'compact-item', type: 'button', onClick: function () { openPerson(it.p.id); } }, [avatar(it.p, 'sm'), h('span', { class: 'pname' }, nameOf(it.p)), h('span', { class: 'pct' }, fmt(it.sim, 1) + '%')]);
    })) : (ranked.length ? h('p', { class: 'hint' }, 'Com ' + ranked.length + ' outra(s) pessoa(s) no filtro, todas já aparecem acima.') : null);
    view.appendChild(section('proximas', 'Afinidade', 'Pessoas mais próximas de ' + nameOf(person), [
      closeGrid,
      h('h4', { style: 'margin:18px 0 8px' }, 'As mais distantes'),
      farList,
      h('p', { class: 'caption' }, 'Similaridade = 100 × (1 − distância euclidiana / distância máxima). Clique para abrir a pessoa.')
    ]));

    // Derivados (destaque)
    var dv = r.derived || {};
    var cat = dv.category ? categoryStyle(dv.category) : null;
    var pctList = function (list) { return (list || []).map(function (x) { return x.name + (isNum(x.match) ? ' ' + fmt(x.match, 0) + '%' : ''); }).join(' · '); };
    var derived = h('div', { class: 'highlight' }, [
      h('p', { class: 'eyebrow' }, 'O que o 12 Axes disse em ' + r.year),
      h('div', { class: 'derived-hero' }, [
        h('div', null, [
          cat ? h('span', { class: 'pill pill-side', style: 'background:' + cat.color }, cat.label) : pill('Ideologia principal', 'pill-dark'),
          h('h3', null, dv.ideology || '—')
        ]),
        isNum(dv.ideologyMatch) && dv.ideology ? ring(dv.ideologyMatch, 110, 'match', 'var(--accent)')
          : (dv.figure && isNum(dv.figureMatch) ? ring(dv.figureMatch, 110, 'figura', 'var(--accent)') : null)
      ]),
      h('dl', { class: 'derived-list' }, [
        h('div', null, [h('dt', null, 'Personalidade mais compatível'), h('dd', null, dv.figure ? dv.figure + (isNum(dv.figureMatch) ? ' · ' + fmt(dv.figureMatch, 0) + '%' : '') + (dv.figureRole ? ' · ' + dv.figureRole : '') : '—')]),
        (dv.figures || []).length ? h('div', null, [h('dt', null, 'Outras personalidades'), h('dd', null, pctList(dv.figures))]) : null,
        (dv.countries || []).length ? h('div', null, [h('dt', null, 'Países próximos'), h('dd', null, pctList(dv.countries))]) : null,
        h('div', null, [h('dt', null, 'País atual'), h('dd', null, dv.countryPresent || '—')]),
        h('div', null, [h('dt', null, 'Experiência histórica'), h('dd', null, dv.countryHistorical || '—')]),
        r.url ? h('div', null, [h('dt', null, 'URL'), h('dd', null, h('a', { href: r.url, target: '_blank', rel: 'noopener' }, 'abrir resultado'))]) : null
      ])
    ]);
    view.appendChild(section('derivados', 'Derivados', 'Leitura do site', [derived, r.notes ? h('p', { class: 'notes', style: 'margin-top:14px' }, r.notes) : h('p', { class: 'hint' }, 'Sem notas. Os cálculos do painel não usam esses campos.')]));

    // Evolução
    var personYears = years.filter(function (y) { return !!resultOf(pid, y); });
    if (personYears.length > 1) {
      var tl = chartBox('personTimeline');
      var byYear = {};
      personYears.forEach(function (y) { byYear[y] = ctx.vec(pid, y); });
      var changes = Stats.yearlyChanges(byYear);
      var changeTable = h('table', { class: 'table' }, [
        h('thead', null, h('tr', null, [h('th', null, 'Período'), h('th', null, 'Distância percorrida'), h('th', null, 'Maiores mudanças')])),
        h('tbody', null, changes.map(function (c) {
          var top = c.delta.map(function (dv2, i) { return { dv: dv2, axis: ctx.axes[i] }; }).sort(function (a, b) { return Math.abs(b.dv) - Math.abs(a.dv); }).slice(0, 3);
          return h('tr', null, [
            h('td', null, c.from + ' → ' + c.to),
            h('td', null, fmt(c.distance, 1)),
            h('td', null, top.map(function (tp) { return tp.axis.name + ': ' + (tp.dv > 0 ? '+' : '') + fmt(tp.dv, 1) + ' para ' + (tp.dv >= 0 ? tp.axis.leftPole : tp.axis.rightPole); }).join(' · '))
          ]);
        }))
      ]);
      view.appendChild(section('evolucao', 'No tempo', 'Evolução por eixo', [tl, h('div', { class: 'table-wrap' }, changeTable), h('p', { class: 'caption' }, 'Valores em % do polo esquerdo. Anos sem resultado ficam em branco; nada é interpolado.')]));
      Charts.timeline(tl, ctx, person, personYears);
    } else {
      view.appendChild(section('evolucao', 'No tempo', 'Evolução por eixo', note('Só há resultado de ' + r.year + ' para esta pessoa. Quando houver mais de um ano, aparecem aqui as linhas por eixo no tempo.', 'info')));
    }

    Charts.personRadar(radar, ctx, person);
  }

  // ---------------------------------------------------------------------------
  // View 5 — Adicionar resultado (gera JSON para colar em data.js)
  // ---------------------------------------------------------------------------
  function renderAdd(view, ctx) {
    view.appendChild(pageHead('Adicionar resultado', 'Novo <em>resultado</em>', 'Este formulário não grava nada: ele gera o objeto JSON pronto para colar em data/data.js. Depois de colar, recarregue a página.'));
    var form = h('form', { class: 'add-form', novalidate: true, onSubmit: function (e) { e.preventDefault(); generate(); } });
    var out = h('textarea', { class: 'json-out', rows: 18, readonly: true, 'aria-label': 'JSON gerado', placeholder: 'O JSON do resultado aparece aqui.' });
    var errors = h('div', { class: 'errors' });

    var urlInput = h('input', { type: 'url', placeholder: 'https://12axes.vercel.app/results?est=65&rep=32.5&…', 'aria-label': 'URL do resultado' });
    var urlBtn = h('button', { type: 'button', class: 'btn btn-small', onClick: function () { fillFromUrl(urlInput.value); } }, 'Preencher pela URL');

    var personOpts = [{ id: '', label: '— nova pessoa (preencher id abaixo) —' }].concat(DATA.people.map(function (p) { return { id: p.id, label: p.name + (p.alias ? ' (' + p.alias + ')' : '') }; }));
    var personSel = select(personOpts, '', function () { });
    var newId = h('input', { type: 'text', placeholder: 'ex.: p04' });
    var photoIn = h('input', { type: 'text', placeholder: 'ex.: photos/p04.jpg (opcional)' });
    var yearIn = h('input', { type: 'number', value: state.year || new Date().getFullYear(), min: 2000, max: 2200 });
    var dateIn = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    var sourceSel = select([{ id: '12axes', label: '12axes (site)' }, { id: 'interna', label: 'interna (pesquisa própria)' }], '12axes', function () { });
    var variantSel = select([{ id: 'desconhecido', label: 'desconhecido' }, { id: 'short', label: 'short (36)' }, { id: 'extended', label: 'extended (60)' }, { id: 'extreme', label: 'extreme (240)' }], 'desconhecido', function () { });
    var methodSel = select([{ id: 'print', label: 'print' }, { id: 'url', label: 'url' }, { id: 'manual', label: 'manual' }], 'print', function () { });
    var precisionSel = select([{ id: '0', label: '0 (inteiros)' }, { id: '1', label: '1 (uma casa decimal)' }], '0', function () { });

    var axisInputs = {};
    var axisUi = {};
    var axisRows = ctx.axes.map(function (a) {
      var inp = h('input', { type: 'number', min: 0, max: 100, step: 'any', required: true, 'aria-label': a.name + ', % de ' + a.leftPole, onInput: function () { updateRight(a.key); } });
      axisInputs[a.key] = inp;
      var rightEm = h('em', null, '—');
      var dot = h('i', { class: 'dot off' });
      var fill = h('i', { class: 'fill', style: 'left:50%;width:0' });
      axisUi[a.key] = { rightEm: rightEm, dot: dot, fill: fill };
      return h('div', { class: 'axis-input-row' }, [
        h('span', { class: 'axis-name' }, a.name),
        h('div', { class: 'axis-meter' }, [
          h('label', { class: 'pole' }, [h('b', null, a.leftPole + ' (%)'), inp]),
          h('div', { class: 'track', 'aria-hidden': 'true' }, [h('i', { class: 'mid' }), fill, dot]),
          h('div', { class: 'pole right' }, [h('b', null, a.rightPole), rightEm])
        ])
      ]);
    });
    function updateRight(key) {
      var a = ctx.axisByKey(key), raw = axisInputs[key].value, v = Number(raw);
      var ui2 = axisUi[key];
      var ok = raw !== '' && isFinite(v) && v >= 0 && v <= 100;
      ui2.rightEm.textContent = ok ? fmt(100 - v, Number(precisionSel.value)) + '%' : '—';
      ui2.dot.classList.toggle('off', !ok);
      if (ok) {
        var pos = 100 - v;
        ui2.dot.style.left = pos + '%';
        ui2.fill.style.left = Math.min(pos, 50) + '%';
        ui2.fill.style.width = Math.abs(pos - 50) + '%';
      } else {
        ui2.fill.style.width = '0';
      }
    }

    var derivedInputs = {
      category: select([{ id: '', label: '—' }].concat(CATEGORY_STYLES.filter(function (c) { return c.key !== 'direita radical'; }).map(function (c) { return { id: c.label, label: c.label }; })), '', function () { }),
      ideology: h('input', { type: 'text', placeholder: 'ex.: Social-Democracia' }),
      ideologyMatch: h('input', { type: 'number', min: 0, max: 100, step: 'any', placeholder: '% (tela completa)' }),
      figure: h('input', { type: 'text', placeholder: 'ex.: Barack Obama' }),
      figureMatch: h('input', { type: 'number', min: 0, max: 100, step: 'any', placeholder: '%' }),
      figureRole: h('input', { type: 'text', placeholder: 'ex.: Estadista' }),
      countryPresent: h('input', { type: 'text' }),
      countryHistorical: h('input', { type: 'text' })
    };
    var figuresIn = h('textarea', { rows: 3, placeholder: 'Uma por linha, com %:\nJoe Biden 93\nJonas Gahr Støre 93' });
    var countriesIn = h('textarea', { rows: 3, placeholder: 'Um por linha, com %:\nAustrália 94\nFinlândia 92' });
    var notesIn = h('textarea', { rows: 2, placeholder: 'Observações (opcional)' });

    // "Nome 93%" / "Nome 93" / "Nome; 93" → { name, match }
    function parseNamePct(text) {
      return String(text || '').split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
        var m = line.match(/^(.*?)[\s;,:–-]+(\d+(?:[.,]\d+)?)\s*%?$/);
        if (m) return { name: m[1].trim(), match: Number(m[2].replace(',', '.')) };
        return { name: line, match: null };
      });
    }

    function fillFromUrl(url) {
      errors.innerHTML = '';
      var m = String(url).match(/\?(.*)$/);
      if (!m) { errors.appendChild(note('URL sem parâmetros. Esperado algo como /results?est=65&rep=32.5&…', 'warn')); return; }
      var params = {};
      m[1].split('#')[0].split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
      var urlKeys = ['est', 'rep', 'pod', 'imi', 'dip', 'int', 'eco', 'con', 'com', 'rel', 'mor', 'tec'];
      var missing = [];
      urlKeys.forEach(function (k, i) {
        var v = params[k];
        if (v === undefined || v === '' || !isFinite(Number(v))) { missing.push(k); return; }
        axisInputs[ctx.axes[i].key].value = Number(v);
        updateRight(ctx.axes[i].key);
      });
      if (missing.length) errors.appendChild(note('Parâmetros ausentes na URL: ' + missing.join(', '), 'warn'));
      else {
        methodSel.value = 'url';
        precisionSel.value = ctx.axes.some(function (a) { return String(axisInputs[a.key].value).indexOf('.') >= 0; }) ? '1' : '0';
        ctx.axes.forEach(function (a) { updateRight(a.key); });
      }
    }

    function generate() {
      errors.innerHTML = '';
      var errs = [];
      var pid = personSel.value || newId.value.trim();
      if (!pid) errs.push('Escolha uma pessoa existente ou informe o id da nova pessoa.');
      if (!personSel.value && newId.value.trim() && personById(newId.value.trim())) errs.push('Já existe uma pessoa com o id "' + newId.value.trim() + '".');
      var year = Number(yearIn.value);
      if (!isFinite(year) || year < 2000) errs.push('Ano inválido.');
      var axes = {};
      ctx.axes.forEach(function (a) {
        var raw = axisInputs[a.key].value;
        var v = Number(raw);
        if (raw === '' || !isFinite(v) || v < 0 || v > 100) errs.push(a.name + ': informe um valor entre 0 e 100 (% de ' + a.leftPole + ').');
        else axes[a.key] = Number(v.toFixed(Number(precisionSel.value)));
      });
      if (errs.length) { errs.forEach(function (e) { errors.appendChild(note(e, 'warn')); }); out.value = ''; return; }
      var derived = {};
      Object.keys(derivedInputs).forEach(function (k) {
        var v = String(derivedInputs[k].value).trim();
        if (v === '') { derived[k] = null; return; }
        derived[k] = (k === 'ideologyMatch' || k === 'figureMatch') ? Number(v) : v;
      });
      derived.figures = parseNamePct(figuresIn.value);
      derived.countries = parseNamePct(countriesIn.value);
      var result = {
        personId: pid, year: year, date: dateIn.value || null,
        source: sourceSel.value, variant: variantSel.value, inputMethod: methodSel.value,
        precision: Number(precisionSel.value), url: urlInput.value.trim() || null,
        axes: axes, derived: derived, notes: notesIn.value.trim()
      };
      var text = JSON.stringify(result, null, 2);
      if (!personSel.value) {
        var personObj = { id: pid, name: 'Nome Real', alias: null, color: Charts.PALETTE[DATA.people.length % Charts.PALETTE.length], photo: photoIn.value.trim() || null, attrs: {} };
        Filters.attributeDefs(DATA).filter(function (dd) { return !dd.derived; }).forEach(function (dd) { personObj.attrs[dd.key] = dd.type === 'number' ? null : ''; });
        personObj.attrs.birthYear = null;
        text = '// 1) Adicione em DATA.people (preencha nome e atributos; para a idade use birthYear\n//    ou, se só souber a idade, troque por ageAt: { "' + year + '": idade }):\n' + JSON.stringify(personObj, null, 2) + ',\n\n// 2) Adicione em DATA.results:\n' + text + ',';
      } else {
        text += ',';
        if (photoIn.value.trim()) text = '// Foto: acrescente em DATA.people, na pessoa "' + pid + '":  photo: ' + JSON.stringify(photoIn.value.trim()) + '\n\n' + text;
      }
      out.value = text;
    }

    form.appendChild(h('fieldset', null, [
      h('legend', null, 'Se tiver a URL do resultado'),
      h('div', { class: 'row' }, [urlInput, urlBtn]),
      h('p', { class: 'hint' }, 'A URL do 12 Axes tem 12 parâmetros (est, rep, pod, imi, dip, int, eco, con, com, rel, mor, tec) com o % do polo esquerdo. Os campos abaixo são preenchidos e podem ser corrigidos.')
    ]));
    form.appendChild(h('fieldset', null, [
      h('legend', null, 'Pessoa e registro'),
      h('div', { class: 'form-grid' }, [
        h('label', null, ['Pessoa', personSel]),
        h('label', null, ['Id da nova pessoa', newId]),
        h('label', null, ['Foto (caminho relativo a data/)', photoIn]),
        h('label', null, ['Ano', yearIn]),
        h('label', null, ['Data', dateIn]),
        h('label', null, ['Fonte', sourceSel]),
        h('label', null, ['Variante', variantSel]),
        h('label', null, ['Método de entrada', methodSel]),
        h('label', null, ['Precisão', precisionSel])
      ])
    ]));
    form.appendChild(h('fieldset', null, [
      h('legend', null, 'Os 12 eixos (informe o % do polo esquerdo; o direito é calculado)'),
      h('div', { class: 'axis-grid' }, axisRows),
      h('p', { class: 'hint' }, 'Nos prints, use o número exibido para o polo esquerdo, mesmo que a soma dos dois polos dê 99 ou 101.')
    ]));
    form.appendChild(h('fieldset', null, [
      h('legend', null, 'Derivados (o que o site disse; opcional)'),
      h('div', { class: 'form-grid' }, [
        h('label', null, ['Categoria (ex.: ESQUERDA no cartão)', derivedInputs.category]),
        h('label', null, ['Ideologia principal', derivedInputs.ideology]),
        h('label', null, ['% de match da ideologia', derivedInputs.ideologyMatch]),
        h('label', null, ['Personalidade mais compatível', derivedInputs.figure]),
        h('label', null, ['% da personalidade', derivedInputs.figureMatch]),
        h('label', null, ['Papel da personalidade', derivedInputs.figureRole]),
        h('label', null, ['Outras personalidades', figuresIn]),
        h('label', null, ['Países próximos (os 3 do cartão)', countriesIn]),
        h('label', null, ['País atual', derivedInputs.countryPresent]),
        h('label', null, ['Experiência histórica', derivedInputs.countryHistorical]),
        h('label', { class: 'span-2' }, ['Notas', notesIn])
      ]),
      h('p', { class: 'hint' }, 'No cartão de compartilhamento, cada eixo mostra só o polo dominante: se for o polo direito, informe 100 − o % exibido. O cartão não mostra o % da ideologia; o % grande é o da personalidade.')
    ]));
    form.appendChild(h('div', { class: 'row' }, [
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Gerar JSON'),
      h('button', { type: 'button', class: 'btn', onClick: function () { if (!out.value) return; navigator.clipboard && navigator.clipboard.writeText(out.value).then(function () { errors.innerHTML = ''; errors.appendChild(note('Copiado. Cole em data/data.js dentro de results (e people, se for pessoa nova).', 'ok')); }, function () { out.select(); }); } }, 'Copiar')
    ]));
    form.appendChild(errors);
    form.appendChild(out);

    view.appendChild(section('formulario', 'Formulário', 'Dados do resultado', form));
  }

  // ---------------------------------------------------------------------------
  // View 6 — Sobre
  // ---------------------------------------------------------------------------
  function renderAbout(view, ctx) {
    view.appendChild(pageHead('Sobre', 'Como ler o <em>painel</em>', 'O que são os 12 eixos, como cada gráfico funciona e o que o painel calcula por conta própria.'));
    var axesList = h('table', { class: 'table' }, [
      h('thead', null, h('tr', null, [h('th', null, 'Eixo'), h('th', null, 'Polo esquerdo (valor alto)'), h('th', null, 'Polo direito (valor baixo)')])),
      h('tbody', null, ctx.axes.map(function (a) { return h('tr', null, [h('td', null, h('b', null, a.name)), h('td', null, a.leftPole), h('td', null, a.rightPole)]); }))
    ]);
    view.appendChild(section('eixos', 'Modelo', 'Os 12 eixos', [
      h('p', null, 'Cada eixo é um par de polos. O número registrado é sempre o percentual do polo esquerdo, de 0 a 100; 50 é o centro. Em todos os gráficos o polo esquerdo aparece à esquerda ou em cima, e os rótulos dizem qual polo é qual.'),
      h('div', { class: 'table-wrap' }, axesList),
      h('p', null, 'Intensidade pelo desvio em relação ao centro (|valor − 50|): menor que 7,5 é Equilibrado; menor que 22,5, Inclinado; menor que 37,5, Forte; 37,5 ou mais, Muito forte.')
    ]));
    view.appendChild(section('graficos', 'Leitura', 'Como ler cada gráfico', h('dl', { class: 'howto' }, [
      h('dt', null, 'O mapa (fixo)'), h('dd', null, 'Primeira coisa do painel. Economia na horizontal (média de Público e Planejamento) e costumes na vertical (média de Tradicionalista, Religioso e Assimilação), com a cor pelo lado econômico. O título e as leituras ao lado são gerados a partir dos números: quadrantes vazios, quem é exceção no seu lado, quem divide cada canto e quem fica perto do centro.'),
      h('dt', null, 'Explorador X × Y'), h('dd', null, 'Cada ponto é uma pessoa. Escolha dois eixos, ou estatísticas como PCA, convicção e distância à média. Quando os dois são eixos, os quadrantes ganham o nome dos polos dominantes. A cor pode seguir a pessoa, um atributo ou a ideologia dita pelo site; o tamanho, a convicção ou um atributo numérico.'),
      h('dt', null, 'Destaques do grupo'), h('dd', null, 'Superlativos calculados com os 12 números das pessoas no filtro: quem tem mais e menos convicção, o par mais parecido e o mais distante, quem está mais perto e mais longe da média, a posição mais extrema num eixo e os eixos que mais dividem e unem o grupo.'),
      h('dt', null, 'Rede de afinidade'), h('dd', null, 'Cada pessoa é um nó ligado às 1, 2 ou 3 pessoas mais parecidas com ela (menor distância média por eixo). Linha cheia quando a escolha é mútua, tracejada quando é de um lado só. As turmas são os grupos que ficam ligados entre si; com 1 vizinho aparecem as turmas mais fechadas, com 2 ou 3 aparecem as pontes entre elas.'),
      h('dt', null, 'Heatmap pessoa × eixo'), h('dd', null, 'Roxo puxa para o polo esquerdo, laranja para o direito, cinza é centro. As pessoas são ordenadas por agrupamento hierárquico (ligação média), então vizinhas se parecem.'),
      h('dt', null, 'Faixas por eixo'), h('dd', null, 'Um avatar com as iniciais por pessoa em cada eixo, com o polo esquerdo à esquerda; quem tem o mesmo valor fica empilhado. A barra escura é a média do filtro; com filtro ativo, a tracejada é a média do grupo inteiro. Passe o mouse num avatar para ver o nome e acender a pessoa em todos os eixos; a cor pode ser por pessoa ou por categoria.'),
      h('dt', null, 'Consenso vs divisão'), h('dd', null, 'Desvio padrão (populacional) de cada eixo: quanto menor, mais o grupo concorda.'),
      h('dt', null, 'Matriz de afinidade'), h('dd', null, 'Similaridade entre duas pessoas = 100 × (1 − distância euclidiana ÷ distância máxima possível). A distância máxima é √12 × 100 ≈ 346.'),
      h('dt', null, 'Comparar subgrupos'), h('dd', null, 'Média por eixo de cada valor de um atributo categórico, em barras ou radar. No radar, cada pessoa é um contorno fino na cor do subgrupo e a média é o contorno grosso; escolha quem aparece clicando nos nomes. Subgrupos com menos de 3 pessoas são sinalizados.'),
      h('dt', null, 'No celular'), h('dd', null, 'Gráficos que precisam de tela larga mostram um aviso "Melhor no computador", com a opção de ver assim mesmo (com rolagem lateral) ou girar o celular. Em tela de toque, o primeiro toque num ponto mostra os detalhes e o segundo abre a pessoa.'),
      h('dt', null, 'Visão individual'), h('dd', null, 'Linhas por eixo com a marca da média do filtro; o eixo em que a pessoa mais se afasta e mais se parece com o grupo; radar; convicção; as 3 pessoas mais próximas e mais distantes; e, com mais de um ano, a evolução por eixo.'),
      h('dt', null, 'PCA'), h('dd', null, 'Análise de componentes principais calculada em JavaScript a partir da matriz de covariância dos 12 eixos das pessoas filtradas. Os componentes são as direções de maior variação; o painel mostra quais eixos mais pesam em cada um.')
    ])));
    view.appendChild(section('filtros', 'Uso', 'Filtros, fotos e URL', [
      h('p', null, 'Os filtros (botão "Filtros" no topo) valem para todas as views. Médias, desvios, PCA e afinidades são recalculados só com as pessoas filtradas. O estado (ano, view, filtros, eixos escolhidos) fica no endereço da página depois do #, então basta copiar o endereço para salvar ou compartilhar uma visão.'),
      h('p', null, 'As fotos vêm de data/photos/ (campo photo em data/data.js). Sem foto, o avatar mostra as iniciais sobre a cor da pessoa.')
    ]));
    view.appendChild(section('derivados', 'Aviso', 'Nota sobre os derivados', [
      h('p', null, 'Ideologia, país atual, experiência histórica e figura mais próxima são a leitura do 12 Axes no ano do resultado, com os catálogos e a fórmula de compatibilidade que o site usava então. O painel apenas exibe e conta esses campos. Todos os cálculos daqui usam exclusivamente os 12 números de cada pessoa.'),
      h('p', { class: 'hint' }, 'Nenhum dado sai do navegador. As únicas requisições externas são as bibliotecas carregadas por CDN (ECharts e fontes).')
    ]));
  }

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------
  function init() {
    validate();
    state = readHash();
    writeHash(); // normaliza o hash (descarta valores inválidos)
    // O ECharts mede e guarda em cache a largura dos textos no primeiro desenho.
    // Espera as fontes da web (Sora/Poppins) carregarem antes de desenhar, com
    // limite de 1,5 s para funcionar também sem internet.
    var started = false;
    function start() { if (started) return; started = true; ready = true; render(); }
    function boot() {
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load('400 12px Poppins'), document.fonts.load('600 12px Poppins'),
          document.fonts.load('700 12px Sora'), document.fonts.load('800 12px Sora')
        ]).then(start, start);
        setTimeout(start, 1500);
      } else {
        start();
      }
    }
    // Senha de entrada (js/auth.js): nada é desenhado antes dela.
    if (window.Auth) window.Auth.whenUnlocked(boot); else boot();
    window.addEventListener('hashchange', function () { state = readHash(); render(); });
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { render(); }, 180);
    });
    $('#scrim').addEventListener('click', function () { openDrawer(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openDrawer(false); });
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        var stored = null;
        try { stored = localStorage.getItem('theme'); } catch (err) { /* sem storage */ }
        if (!stored) { document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light'); render(); }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
