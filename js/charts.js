/*
  js/charts.js — funções de cada gráfico (Apache ECharts).

  Cada função recebe o elemento-alvo, o contexto calculado pelo app (ctx) e
  opções, monta a `option` do ECharts e a aplica. Nada aqui altera o estado do
  painel; os cliques são devolvidos por callbacks (handlers).

  Convenções visuais
  - O polo ESQUERDO de um eixo fica sempre à esquerda (ou em cima) do gráfico.
    Para isso, eixos X que representam um dos 12 eixos usam `inverse: true`,
    já que o valor bruto é o % do polo esquerdo (100 = totalmente à esquerda).
  - Rótulos de tique dizem sempre "qual polo" e "quanto": "Público 75", "centro",
    "Privado 75". Nunca um número solto que possa ser lido dos dois lados.
  - Cor de pessoa é fixa em todos os gráficos (DATA.people[].color ou PALETTE).
  - Divergente (heatmap): laranja = polo direito, roxo = polo esquerdo, cinza no
    centro. Sequencial (afinidade): azul claro → escuro.
*/
(function (global) {
  'use strict';

  var Stats = global.Stats;

  // Paleta categórica para pessoas sem cor definida (ordem fixa, nunca reciclada
  // dentro de um grupo; a 21ª pessoa recomeça, por isso prefira definir `color`).
  var PALETTE = [
    '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948',
    '#0d9aa8', '#a0522d', '#6b8e23', '#c2185b', '#1c5cab', '#b8860b', '#9a3fbf', '#2e8b57',
    '#ff7f0e', '#b5651d', '#5b7fd6', '#c98500', '#0097a7', '#8e24aa', '#7cb342'
  ];

  // Divergente centrado em 50: índice 0 = polo direito (0), último = polo esquerdo (100).
  var DIVERGING = {
    light: ['#c2521a', '#e8a37a', '#f0efec', '#a79fd6', '#4a3aa7'],
    dark: ['#eb6834', '#8a4a2e', '#383835', '#4f4a86', '#9085e9']
  };
  var POLE_LEFT_COLOR = { light: '#4a3aa7', dark: '#9085e9' };
  var POLE_RIGHT_COLOR = { light: '#c2521a', dark: '#eb6834' };

  // Sequencial (um matiz). No modo escuro o extremo claro passa a ser o "alto".
  var SEQUENTIAL = {
    light: ['#cde2fb', '#86b6ef', '#3987e5', '#256abf', '#184f95', '#0d366b'],
    dark: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb']
  };

  var registry = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function theme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      dark: dark,
      mode: dark ? 'dark' : 'light',
      text: cssVar('--text') || (dark ? '#f2f2ef' : '#111'),
      muted: cssVar('--muted') || '#7a7a74',
      faint: cssVar('--faint') || '#a8a8a2',
      grid: cssVar('--grid') || (dark ? '#2c2c2a' : '#e5e4de'),
      axis: cssVar('--axis-line') || (dark ? '#4a4a46' : '#c3c2b7'),
      surface: cssVar('--surface') || (dark ? '#1c1c1b' : '#ffffff'),
      band: cssVar('--band') || (dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)'),
      accent: cssVar('--accent') || '#2a78d6',
      font: cssVar('--font-ui') || 'system-ui, sans-serif'
    };
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    d = d || 0;
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  // "Público 72 · Privado 28"
  function poleLabel(axis, value, d) {
    return esc(axis.leftPole) + ' <b>' + fmt(value, d) + '</b> · ' + esc(axis.rightPole) + ' <b>' + fmt(100 - value, d) + '</b>';
  }

  // Formatador de tiques para um eixo dos 12 (valor = % do polo esquerdo).
  function poleTick(axis, compact) {
    var L = axis.tickLeft || axis.leftPole, R = axis.tickRight || axis.rightPole;
    return function (v) {
      v = Math.round(v * 10) / 10;
      if (v === 50) return compact ? '50' : 'centro';
      if (v > 50) return (compact && v !== 100) ? fmt(v) : L + ' ' + fmt(v);
      return (compact && v !== 0) ? fmt(100 - v) : R + ' ' + fmt(100 - v);
    };
  }

  // Tiques do eixo "distância ao centro" usado em barras divergentes (x = 50 − valor).
  function centeredTick(v) {
    if (v === 0) return 'centro';
    if (v < 0) return fmt(50 - v) + '% esq.';
    return fmt(50 + v) + '% dir.';
  }

  function personTooltip(ctx, person, result, extraHtml) {
    var d = result.precision || 0;
    var rows = ctx.axes.map(function (a) {
      var v = result.axes[a.key];
      var it = Stats.intensity(v);
      return '<tr><td class="tt-axis">' + esc(a.name) + '</td>' +
        '<td class="tt-l">' + esc(a.leftPole) + ' <b>' + fmt(v, d) + '</b></td>' +
        '<td class="tt-r"><b>' + fmt(100 - v, d) + '</b> ' + esc(a.rightPole) + '</td>' +
        '<td class="tt-i tt-i' + it.level + '">' + it.label + '</td></tr>';
    });
    return '<div class="tt"><div class="tt-head"><span class="tt-dot" style="background:' + ctx.color(person) + '"></span>' +
      '<b>' + esc(ctx.name(person)) + '</b><span class="tt-year">' + esc(result.year) + '</span></div>' +
      (extraHtml ? '<div class="tt-extra">' + extraHtml + '</div>' : '') +
      '<table class="tt-table">' + rows.join('') + '</table></div>';
  }

  function baseOption(t) {
    return {
      textStyle: { fontFamily: t.font, color: t.text },
      animationDuration: 320,
      animationDurationUpdate: 240,
      tooltip: {
        backgroundColor: t.surface, borderColor: t.grid, borderWidth: 1, confine: true,
        textStyle: { color: t.text, fontSize: 12, fontFamily: t.font },
        extraCssText: 'box-shadow:0 8px 28px rgba(0,0,0,.14);border-radius:10px;padding:10px 12px;max-width:min(420px,92vw);'
      }
    };
  }

  function valueAxis(t, extra) {
    return Object.assign({
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid } },
      axisLabel: { color: t.muted, fontSize: 11, hideOverlap: true },
      nameTextStyle: { color: t.text, fontWeight: 600, fontSize: 12 }
    }, extra || {});
  }

  function categoryAxis(t, extra) {
    return Object.assign({
      type: 'category',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: t.text, fontSize: 12 }
    }, extra || {});
  }

  function legend(t, extra) {
    return Object.assign({
      top: 0, type: 'scroll', icon: 'circle', itemWidth: 10, itemHeight: 10, itemGap: 16,
      textStyle: { color: t.text, fontSize: 12 }, pageTextStyle: { color: t.muted }, pageIconColor: t.text, pageIconInactiveColor: t.faint
    }, extra || {});
  }

  function mount(el, option, handlers) {
    var rec = null;
    for (var i = 0; i < registry.length; i++) if (registry[i].el === el) { rec = registry[i]; break; }
    if (!rec) {
      rec = { el: el, chart: echarts.init(el, null, { renderer: 'canvas' }) };
      registry.push(rec);
    } else {
      rec.chart.clear();
    }
    rec.chart.setOption(option, true);
    rec.chart.off('click');
    if (handlers && handlers.click) rec.chart.on('click', handlers.click);
    return rec.chart;
  }

  function disposeAll() {
    registry.forEach(function (r) { try { r.chart.dispose(); } catch (e) { /* já removido */ } });
    registry = [];
  }

  // Camada HTML de avatares sobre o canvas do gráfico.
  // items: [{ person, x, y, size }] em pixels relativos ao container.
  function overlayAvatars(el, ctx, items) {
    var layer = el.querySelector(':scope > .avatar-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'avatar-layer';
      el.appendChild(layer);
    }
    layer.innerHTML = '';
    items.forEach(function (it) {
      if (!isFinite(it.x) || !isFinite(it.y)) return;
      var av = global.Avatars.el(it.person, 'md', { color: ctx.color(it.person), label: ctx.name(it.person), title: false });
      av.style.width = it.size + 'px';
      av.style.height = it.size + 'px';
      av.style.left = it.x + 'px';
      av.style.top = it.y + 'px';
      av.style.fontSize = Math.max(8, it.size * 0.36) + 'px';
      layer.appendChild(av);
    });
  }

  // Posiciona rótulos de pontos sem sobreposição: mede cada nome, tenta oito
  // posições em volta do ponto e fica com a primeira livre de outros rótulos e
  // marcadores. Sem posição livre, o rótulo fica oculto (o tooltip continua).
  // pts: [{ value: [x, y], name, r }]. Devolve os itens de dados da série 'labels'.
  var measureCtx = null;
  function placeLabels(chart, pts, font) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = '11px ' + font;
    var H = 14, GAP = 3;
    var W = chart.getWidth(), HC = chart.getHeight();
    var pix = pts.map(function (lp) {
      var p = chart.convertToPixel({ seriesId: 'labels' }, lp.value) || [NaN, NaN];
      return { lp: lp, x: p[0], y: p[1], w: measureCtx.measureText(lp.name).width + 2, r: lp.r || 7 };
    });
    var marks = pix.map(function (p) { return { x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r, owner: p }; });
    function overlaps(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
    pix.forEach(function (p) {
      p.crowd = pix.filter(function (q) { return q !== p && Math.abs(q.x - p.x) < 90 && Math.abs(q.y - p.y) < 34; }).length;
    });
    var placed = [];
    pix.slice().sort(function (a, b) { return b.crowd - a.crowd; }).forEach(function (p) {
      if (!isFinite(p.x) || !isFinite(p.y)) return;
      var d = p.r + GAP, w = p.w, x = p.x, y = p.y;
      var cands = [
        { pos: 'top', off: [0, 0], rect: { x0: x - w / 2, y0: y - d - H, x1: x + w / 2, y1: y - d } },
        { pos: 'bottom', off: [0, 0], rect: { x0: x - w / 2, y0: y + d, x1: x + w / 2, y1: y + d + H } },
        { pos: 'right', off: [0, 0], rect: { x0: x + d, y0: y - H / 2, x1: x + d + w, y1: y + H / 2 } },
        { pos: 'left', off: [0, 0], rect: { x0: x - d - w, y0: y - H / 2, x1: x - d, y1: y + H / 2 } },
        { pos: 'top', off: [w / 2 + 2, 0], rect: { x0: x + 2, y0: y - d - H, x1: x + w + 2, y1: y - d } },
        { pos: 'top', off: [-(w / 2 + 2), 0], rect: { x0: x - w - 2, y0: y - d - H, x1: x - 2, y1: y - d } },
        { pos: 'bottom', off: [w / 2 + 2, 0], rect: { x0: x + 2, y0: y + d, x1: x + w + 2, y1: y + d + H } },
        { pos: 'bottom', off: [-(w / 2 + 2), 0], rect: { x0: x - w - 2, y0: y + d, x1: x - 2, y1: y + d + H } },
        { pos: 'top', off: [0, -H], rect: { x0: x - w / 2, y0: y - d - 2 * H, x1: x + w / 2, y1: y - d - H } },
        { pos: 'bottom', off: [0, H], rect: { x0: x - w / 2, y0: y + d + H, x1: x + w / 2, y1: y + d + 2 * H } }
      ];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i], rc = c.rect;
        if (rc.x0 < 0 || rc.y0 < 0 || rc.x1 > W || rc.y1 > HC) continue;
        var hit = placed.some(function (o) { return overlaps(rc, o); }) ||
          marks.some(function (m) { return m.owner !== p && overlaps(rc, m); });
        if (!hit) { p.choice = c; placed.push(rc); return; }
      }
      p.choice = null;
    });
    return pix.map(function (p) {
      var c = p.choice;
      return {
        value: p.lp.value, name: p.lp.name,
        label: c ? { show: true, position: c.pos, distance: p.r + GAP - 1, offset: c.off } : { show: false }
      };
    });
  }

  function gridRect(chart) {
    try {
      return chart.getModel().getComponent('grid').coordinateSystem.getRect();
    } catch (e) {
      return null;
    }
  }

  function resizeAll() {
    registry.forEach(function (r) {
      if (document.body.contains(r.el)) r.chart.resize();
    });
  }

  // Distribuição "beeswarm" 1D: devolve deslocamentos para evitar sobreposição.
  function swarm(values, minGap, step, maxOffset) {
    var order = values.map(function (v, i) { return i; }).sort(function (a, b) { return values[a] - values[b]; });
    var placed = [];
    var offsets = new Array(values.length).fill(0);
    var candidates = [0];
    for (var k = 1; k * step <= maxOffset + 1e-9; k++) candidates.push(k * step, -k * step);
    order.forEach(function (i) {
      var v = values[i];
      for (var c = 0; c < candidates.length; c++) {
        var off = candidates[c], ok = true;
        for (var j = 0; j < placed.length; j++) {
          if (Math.abs(placed[j].v - v) < minGap && Math.abs(placed[j].off - off) < step * 0.99) { ok = false; break; }
        }
        if (ok) { offsets[i] = off; placed.push({ v: v, off: off }); return; }
      }
      offsets[i] = candidates[candidates.length - 1];
      placed.push({ v: v, off: offsets[i] });
    });
    return offsets;
  }

  function richPoles(t) {
    return {
      n: { color: t.text, fontWeight: 600, fontSize: 12, lineHeight: 16 },
      p: { color: t.muted, fontSize: 11, lineHeight: 14 },
      l: { color: POLE_LEFT_COLOR[t.mode], fontSize: 11, fontWeight: 600, lineHeight: 14 },
      r: { color: POLE_RIGHT_COLOR[t.mode], fontSize: 11, fontWeight: 600, lineHeight: 14 },
      s: { color: t.faint, fontSize: 11, lineHeight: 14 }
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Explorador X × Y
  // cfg: { xMetric, yMetric, sizeOf(person) | null, groupOf(person) | null,
  //        groupColor(value), labels, trails, sizeLabel }
  // Metric: { id, label, isAxis, axis, min, max, value(personId, year) }
  // ---------------------------------------------------------------------------
  function metricAxisOption(t, m, orientation, compact) {
    var isX = orientation === 'x';
    var opt = valueAxis(t, {
      name: m.label,
      nameLocation: isX ? 'middle' : 'end',
      nameGap: isX ? 34 : 16,
      scale: true,
      position: isX ? 'bottom' : 'left',
      axisLine: { show: false, onZero: false }
    });
    if (!isX) opt.nameTextStyle = Object.assign({}, opt.nameTextStyle, { align: 'left', padding: [0, 0, 0, 0] });
    if (m.min !== undefined && m.min !== null) opt.min = m.min;
    if (m.max !== undefined && m.max !== null) opt.max = m.max;
    if (m.isAxis) {
      opt.min = 0; opt.max = 100; opt.interval = 25;
      opt.inverse = isX;
      opt.axisLabel = Object.assign({}, opt.axisLabel, { formatter: poleTick(m.axis, compact) });
      // Rótulos das pontas alinhados para dentro, para não serem cortados.
      if (isX) { opt.axisLabel.alignMinLabel = 'right'; opt.axisLabel.alignMaxLabel = 'left'; }
      else { opt.axisLabel.verticalAlignMinLabel = 'bottom'; opt.axisLabel.verticalAlignMaxLabel = 'top'; }
    }
    return opt;
  }

  // Nome do quadrante: "Público + Progressista" para eixos simples; para
  // compostos com quadLeft/quadRight, "Esquerda conservadora".
  function quadrantName(xm, ym, xs, ys, compact) {
    var xa = xm.axis, ya = ym.axis;
    var xq = xs === 'L' ? (xa.quadLeft || xa.leftPole) : (xa.quadRight || xa.rightPole);
    var yq = ys === 'L' ? (ya.quadLeft || ya.leftPole) : (ya.quadRight || ya.rightPole);
    if (xa.quadLeft && ya.quadLeft) {
      var s = xq + (compact ? '\n' : ' ') + yq;
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    return xq + (compact ? '\n+ ' : ' + ') + yq;
  }

  // halves: pinta a metade do polo esquerdo do eixo X de vermelho claro e a do
  // polo direito de azul claro (usado no mapa fixo esquerda × direita).
  function quadrantAreas(t, xm, ym, compact, halves) {
    var combos = [
      { xs: 'L', ys: 'L', pos: 'insideTopLeft' }, { xs: 'R', ys: 'L', pos: 'insideTopRight' },
      { xs: 'L', ys: 'R', pos: 'insideBottomLeft' }, { xs: 'R', ys: 'R', pos: 'insideBottomRight' }
    ];
    var a = t.dark ? 0.12 : 0.06;
    var tint = { L: 'rgba(227,73,72,' + a + ')', R: 'rgba(42,120,214,' + a + ')' };
    return {
      silent: true,
      itemStyle: { color: 'transparent' },
      label: { show: true, color: t.faint, fontSize: compact ? 9 : 11, fontWeight: 600, padding: compact ? [4, 4] : [8, 10], lineHeight: compact ? 11 : 13 },
      data: combos.map(function (c) {
        var xr = c.xs === 'L' ? [50, 100] : [0, 50];
        var yr = c.ys === 'L' ? [50, 100] : [0, 50];
        var name = quadrantName(xm, ym, c.xs, c.ys, compact);
        var first = { name: halves && !compact ? name.toUpperCase() : name, xAxis: xr[0], yAxis: yr[0], label: { position: c.pos } };
        if (halves) first.itemStyle = { color: tint[c.xs] };
        return [first, { xAxis: xr[1], yAxis: yr[1] }];
      })
    };
  }

  function explorer(el, ctx, cfg, handlers) {
    var t = theme();
    var xm = cfg.xMetric, ym = cfg.yMetric;
    var compact = el.clientWidth < 640;
    var pts = [];
    ctx.people.forEach(function (p) {
      var x = xm.value(p.id, ctx.year), y = ym.value(p.id, ctx.year);
      if (x === null || y === null || !isFinite(x) || !isFinite(y)) return;
      pts.push({ person: p, x: x, y: y, size: cfg.sizeOf ? cfg.sizeOf(p) : null, group: cfg.groupOf ? cfg.groupOf(p) : null });
    });

    var sizes = pts.map(function (p) { return p.size; }).filter(function (s) { return s !== null && isFinite(s); });
    var sMin = sizes.length ? Math.min.apply(null, sizes) : 0, sMax = sizes.length ? Math.max.apply(null, sizes) : 0;
    var photos = !!cfg.photos;
    var RING = 6; // em modo foto, o círculo do gráfico vira o anel colorido em volta do avatar
    function symbolSize(val) {
      var s = val[2];
      var base = (s === null || s === undefined || !isFinite(s) || sMax === sMin) ? 14 : 9 + 21 * (s - sMin) / (sMax - sMin);
      if (!photos) return base;
      return 26 + (base - 9) * (16 / 21) + RING;
    }

    function item(pt, color) {
      return {
        value: [pt.x, pt.y, pt.size], name: ctx.name(pt.person), personId: pt.person.id, year: ctx.year,
        itemStyle: { color: color, borderColor: t.surface, borderWidth: 2, opacity: 0.95 }
      };
    }

    var seriesList = [];
    var useLegend = false;
    var labelPts = null;
    if (cfg.groupOf) {
      var groups = {};
      var orderKeys = [];
      pts.forEach(function (pt) {
        var g = pt.group === null || pt.group === undefined ? '(sem valor)' : String(pt.group);
        if (!groups[g]) { groups[g] = []; orderKeys.push(g); }
        groups[g].push(pt);
      });
      if (cfg.groupOrder) {
        orderKeys.sort(function (a, b) {
          var ia = cfg.groupOrder.indexOf(a), ib = cfg.groupOrder.indexOf(b);
          return ((ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)) || a.localeCompare(b, 'pt-BR');
        });
      } else {
        orderKeys.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
      }
      orderKeys.forEach(function (g) {
        var color = cfg.groupColor(g);
        seriesList.push({
          type: 'scatter', name: g, data: groups[g].map(function (pt) { return item(pt, color); }),
          color: color, itemStyle: { color: color }, symbolSize: symbolSize, z: 3,
          label: { show: !!cfg.labels, position: 'top', color: t.text, fontSize: 11, formatter: function (p) { return p.data.name; } },
          labelLayout: { moveOverlap: 'shiftY', hideOverlap: true },
          labelLine: { show: true, length2: 4, lineStyle: { color: t.axis, width: 1 } },
          emphasis: { scale: 1.3, focus: 'self' }
        });
      });
      useLegend = orderKeys.length > 1;
    } else {
      seriesList.push({
        type: 'scatter', name: 'Pessoas', data: pts.map(function (pt) { return item(pt, ctx.color(pt.person)); }),
        symbolSize: symbolSize, z: 3,
        label: { show: !!cfg.labels, position: 'top', color: t.text, fontSize: 11, formatter: function (p) { return p.data.name; } },
        labelLayout: { moveOverlap: 'shiftY', hideOverlap: true },
        labelLine: { show: true, length2: 4, lineStyle: { color: t.axis, width: 1 } },
        emphasis: { scale: 1.3, focus: 'self' }
      });
    }

    // Rótulos: uma série única e invisível, posicionada por placeLabels() depois
    // do primeiro desenho (o desvio automático do ECharts não cruza séries).
    if (cfg.labels) {
      seriesList.forEach(function (s) { s.label = { show: false }; s.labelLine = { show: false }; delete s.labelLayout; });
      labelPts = pts.map(function (pt) {
        var g = pt.group === null || pt.group === undefined ? '(sem valor)' : String(pt.group);
        return { value: [pt.x, pt.y], name: ctx.name(pt.person), group: g, r: symbolSize([pt.x, pt.y, pt.size]) / 2 };
      });
      seriesList.push({
        id: 'labels', name: '__labels', type: 'scatter', data: [], symbolSize: 2, z: 4,
        itemStyle: { color: 'transparent' }, silent: true, tooltip: { show: false }, legendHoverLink: false,
        label: { show: true, color: t.text, fontSize: 11, formatter: function (p) { return p.data.name; } }
      });
    }

    // Linhas de centro e quadrantes
    var first = seriesList[0];
    if (first) {
      var markData = [];
      if (xm.isAxis) markData.push({ xAxis: 50 });
      if (ym.isAxis) markData.push({ yAxis: 50 });
      if (markData.length) {
        first.markLine = { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'dashed', width: 1 }, data: markData };
      }
      if (xm.isAxis && ym.isAxis) first.markArea = quadrantAreas(t, xm, ym, compact, !!cfg.halves);
    }

    // Rastro entre anos
    if (cfg.trails && ctx.years.length > 1) {
      ctx.people.forEach(function (p) {
        var path = [];
        ctx.years.forEach(function (y) {
          var x = xm.value(p.id, y), yv = ym.value(p.id, y);
          if (x === null || yv === null || !isFinite(x) || !isFinite(yv)) return;
          path.push({ value: [x, yv], year: y, personId: p.id, name: ctx.name(p) });
        });
        if (path.length < 2) return;
        var trailColor = cfg.groupOf ? cfg.groupColor(cfg.groupOf(p) === null || cfg.groupOf(p) === undefined ? '(sem valor)' : String(cfg.groupOf(p))) : ctx.color(p);
        seriesList.push({
          type: 'line', name: ctx.name(p), data: path, z: 2, legendHoverLink: false,
          lineStyle: { color: trailColor, width: 1.5, type: 'dashed', opacity: 0.7 },
          itemStyle: { color: trailColor, opacity: 0.55, borderColor: t.surface, borderWidth: 1 },
          symbol: 'circle', symbolSize: 7, showSymbol: true,
          label: { show: !!cfg.labels, position: 'right', color: t.muted, fontSize: 10, formatter: function (pr) { return pr.data.year === ctx.year ? '' : pr.data.year; } },
          tooltip: { formatter: function (pr) { return '<b>' + esc(pr.data.name) + '</b> · ' + pr.data.year + '<br>' + esc(xm.label) + ': <b>' + fmt(pr.data.value[0], 1) + '</b><br>' + esc(ym.label) + ': <b>' + fmt(pr.data.value[1], 1) + '</b>'; } }
        });
      });
    }

    var option = Object.assign(baseOption(t), {
      grid: { left: 18, right: compact ? 44 : 36, top: useLegend ? 64 : 40, bottom: 44, containLabel: true },
      legend: useLegend ? legend(t, { selectedMode: 'multiple', data: seriesList.filter(function (s) { return s.type === 'scatter' && s.id !== 'labels'; }).map(function (s) { return s.name; }) }) : undefined,
      xAxis: metricAxisOption(t, xm, 'x', compact),
      yAxis: metricAxisOption(t, ym, 'y', compact),
      series: seriesList
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (params) {
      if (params.seriesType !== 'scatter' || !params.data.personId) return '';
      var p = ctx.personById(params.data.personId);
      var r = ctx.result(p.id, ctx.year);
      var extra = esc(xm.label) + ': <b>' + fmt(params.data.value[0], xm.isAxis && !xm.composite ? (r.precision || 0) : 1) + '</b> · ' +
        esc(ym.label) + ': <b>' + fmt(params.data.value[1], ym.isAxis && !ym.composite ? (r.precision || 0) : 1) + '</b>' +
        (cfg.sizeLabel && params.data.value[2] !== null && params.data.value[2] !== undefined ? ' · ' + esc(cfg.sizeLabel) + ': <b>' + fmt(params.data.value[2], 1) + '</b>' : '') +
        (cfg.groupOf ? ' · ' + esc(params.seriesName) : '');
      return personTooltip(ctx, p, r, extra) + '<div class="tt-foot">Clique para abrir a visão individual</div>';
    };
    var chart = mount(el, option, {
      click: function (params) {
        if (params.seriesType === 'scatter' && params.data.personId && handlers && handlers.onPerson) handlers.onPerson(params.data.personId);
      }
    });
    if (labelPts) {
      var relabel = function (selected) {
        var vis = labelPts.filter(function (lp) { return !selected || selected[lp.group] !== false; });
        chart.setOption({ series: [{ id: 'labels', data: placeLabels(chart, vis, t.font) }] });
      };
      relabel(null);
      chart.on('legendselectchanged', function (e) { relabel(e.selected); });
    }
    if (photos) {
      var buildOverlay = function () {
        var opt = chart.getOption();
        var selected = (opt.legend && opt.legend[0] && opt.legend[0].selected) || {};
        var items = [];
        seriesList.forEach(function (s, si) {
          if (s.type !== 'scatter' || s.id === 'labels' || selected[s.name] === false) return;
          s.data.forEach(function (d) {
            var px = chart.convertToPixel({ seriesIndex: si }, [d.value[0], d.value[1]]);
            if (!px) return;
            items.push({ person: ctx.personById(d.personId), x: px[0], y: px[1], size: symbolSize(d.value) - RING });
          });
        });
        overlayAvatars(el, ctx, items);
      };
      buildOverlay();
      chart.on('legendselectchanged', buildOverlay);
    }
    return chart;
  }

  // ---------------------------------------------------------------------------
  // 2a. Heatmap pessoa × eixo
  // ---------------------------------------------------------------------------
  function heatmap(el, ctx, cfg, handlers) {
    var t = theme();
    var people = ctx.people;
    var vectors = people.map(function (p) { return ctx.vec(p.id, ctx.year); });
    var order = Stats.clusterOrder(vectors);
    // Pessoas nas colunas (ordenadas por agrupamento), eixos nas linhas com o
    // polo esquerdo rotulado à esquerda e o direito à direita.
    var cols = order.map(function (i) { return people[i]; });
    var colVecs = order.map(function (i) { return vectors[i]; });
    var n = ctx.axes.length;
    var photos = !!cfg.photos;
    var AV = 34;
    el.style.height = (n * 36 + 170 + (photos ? AV + 10 : 0)) + 'px';
    var compact = el.clientWidth < 700;

    var data = [];
    cols.forEach(function (p, c) {
      ctx.axes.forEach(function (a, r) {
        var v = colVecs[c][r];
        var far = Math.abs(v - 50) > 28;
        data.push({ value: [c, r, v], personId: p.id, label: { color: far ? '#ffffff' : t.text } });
      });
    });

    function yAxisPoles(side) {
      return categoryAxis(t, {
        inverse: true, position: side, data: ctx.axes.map(function (a) { return a.key; }),
        axisLabel: {
          interval: 0, rich: richPoles(t), margin: 12,
          formatter: function (key) {
            var a = ctx.axisByKey(key);
            if (side === 'left') return compact ? '{l|' + a.leftPole + '}' : '{n|' + a.name + '}\n{l|' + a.leftPole + '}';
            return '{r|' + a.rightPole + '}';
          }
        }
      });
    }

    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 12, top: photos ? AV + 22 : 12, bottom: 64, containLabel: true },
      xAxis: categoryAxis(t, {
        position: 'top', triggerEvent: true,
        data: cols.map(function (p) { return ctx.name(p); }),
        axisLabel: { interval: 0, rotate: cols.length > 6 ? 45 : 0, color: t.text, fontSize: 12 }
      }),
      yAxis: [yAxisPoles('left'), yAxisPoles('right')],
      visualMap: {
        type: 'continuous', min: 0, max: 100, calculable: false, orient: 'horizontal', left: 'center', bottom: 6,
        itemWidth: 12, itemHeight: 220, precision: 0,
        text: ['100% polo esquerdo', '100% polo direito'], textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: DIVERGING[t.mode] }
      },
      series: [{
        type: 'heatmap', data: data,
        label: { show: !!cfg.values, fontSize: 11, formatter: function (p) { return fmt(p.data.value[2], 0); } },
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 2 } }
      }]
    });
    option.tooltip.formatter = function (params) {
      var a = ctx.axes[params.data.value[1]];
      var p = ctx.personById(params.data.personId);
      var r = ctx.result(p.id, ctx.year);
      var v = params.data.value[2];
      var it = Stats.intensity(v);
      return '<div class="tt-head"><span class="tt-dot" style="background:' + ctx.color(p) + '"></span><b>' + esc(ctx.name(p)) + '</b></div>' +
        '<div><b>' + esc(a.name) + '</b>: ' + poleLabel(a, v, r.precision || 0) + '</div>' +
        '<div class="tt-muted">' + it.label + (it.level ? ' · ' + esc(Stats.dominantPole(a, v)) : '') + '</div>';
    };
    var chart = mount(el, option, {
      click: function (params) {
        if (params.componentType === 'series' && handlers && handlers.onPerson) handlers.onPerson(params.data.personId);
        if (params.componentType === 'xAxis' && handlers && handlers.onPerson) {
          var p = cols[params.dataIndex]; if (p) handlers.onPerson(p.id);
        }
      }
    });
    if (photos) {
      overlayAvatars(el, ctx, cols.map(function (p, i) {
        var x = chart.convertToPixel({ xAxisIndex: 0 }, i);
        return { person: p, x: x, y: AV / 2 + 4, size: AV };
      }));
    }
    return chart;
  }

  // ---------------------------------------------------------------------------
  // 2b. Faixas por eixo (strip / beeswarm)
  // ---------------------------------------------------------------------------
  function strips(el, ctx, cfg, handlers) {
    var t = theme();
    var n = ctx.axes.length;
    var rowH = 46;
    el.style.height = (n * rowH + 96) + 'px';
    var compact = el.clientWidth < 700;
    var plotWidth = Math.max(200, el.clientWidth - (compact ? 190 : 300));
    var symbol = 10;
    var minGap = 100 / plotWidth * (symbol + 1);

    var pointData = [];
    ctx.axes.forEach(function (axis, i) {
      var vals = ctx.people.map(function (p) { return { p: p, v: ctx.vec(p.id, ctx.year)[i] }; });
      var offs = swarm(vals.map(function (x) { return x.v; }), minGap, 0.13, 0.39);
      vals.forEach(function (x, k) {
        pointData.push({
          value: [x.v, i + offs[k]], personId: x.p.id, axisIndex: i, name: ctx.name(x.p),
          itemStyle: { color: ctx.color(x.p), borderColor: t.surface, borderWidth: 1.5 }
        });
      });
    });

    var meanData = ctx.mean ? ctx.axes.map(function (a, i) { return { value: [ctx.mean[i], i], axisIndex: i }; }) : [];
    var refData = (cfg.showRef && ctx.meanAll && ctx.filterActive) ? ctx.axes.map(function (a, i) { return { value: [ctx.meanAll[i], i], axisIndex: i }; }) : [];

    var bands = [];
    for (var b = 0; b < n; b += 2) bands.push([{ yAxis: b - 0.5 }, { yAxis: b + 0.5 }]);

    // Dois eixos de categoria só para os rótulos (polo esquerdo à esquerda, polo
    // direito à direita) e um eixo de valor oculto, alinhado a eles, para os
    // pontos: a categoria i fica centrada na mesma posição que o valor i.
    function labelAxis(side) {
      return categoryAxis(t, {
        inverse: true, position: side, data: ctx.axes.map(function (a) { return a.key; }),
        axisLabel: {
          interval: 0, rich: richPoles(t), margin: 12,
          formatter: function (key) {
            var a = ctx.axisByKey(key);
            if (side === 'left') return compact ? '{l|' + a.leftPole + '}' : '{n|' + a.name + '}\n{l|' + a.leftPole + '}';
            return '{r|' + a.rightPole + '}';
          }
        }
      });
    }
    var valueAxisHidden = valueAxis(t, {
      min: -0.5, max: n - 0.5, inverse: true, show: false, splitLine: { show: false }
    });
    var yAxes = [labelAxis('left'), labelAxis('right'), valueAxisHidden];

    var series = [{
      type: 'scatter', name: 'Pessoas', data: pointData, symbolSize: symbol, z: 3, yAxisIndex: 2,
      emphasis: { scale: 1.4 },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'dashed', width: 1 }, data: [{ xAxis: 50 }] },
      markArea: { silent: true, itemStyle: { color: t.band }, data: bands }
    }, {
      type: 'scatter', name: 'Média do filtro', data: meanData, symbol: 'diamond', symbolSize: 15, z: 4, yAxisIndex: 2,
      itemStyle: { color: t.text, borderColor: t.surface, borderWidth: 1.5 }
    }];
    if (refData.length) {
      series.push({
        type: 'scatter', name: 'Média do grupo inteiro', data: refData, symbol: 'diamond', symbolSize: 15, z: 4, yAxisIndex: 2,
        itemStyle: { color: t.surface, borderColor: t.text, borderWidth: 1.5 }
      });
    }

    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 12, top: 40, bottom: 12, containLabel: true },
      legend: legend(t, { top: 0, left: 'center', data: series.map(function (s) { return s.name; }) }),
      xAxis: valueAxis(t, {
        min: 0, max: 100, interval: 25, inverse: true,
        axisLabel: {
          color: t.muted, fontSize: 11,
          formatter: function (v) {
            if (v === 50) return 'centro';
            if (v > 50) return fmt(v) + '% esq.';
            return fmt(100 - v) + '% dir.';
          }
        }
      }),
      yAxis: yAxes,
      series: series
    });
    option.tooltip.formatter = function (params) {
      var a = ctx.axes[params.data.axisIndex];
      var v = params.data.value[0];
      if (params.seriesName === 'Pessoas') {
        var p = ctx.personById(params.data.personId);
        var r = ctx.result(p.id, ctx.year);
        var it = Stats.intensity(v);
        return '<div class="tt-head"><span class="tt-dot" style="background:' + ctx.color(p) + '"></span><b>' + esc(ctx.name(p)) + '</b></div>' +
          '<div><b>' + esc(a.name) + '</b>: ' + poleLabel(a, v, r.precision || 0) + '</div>' +
          '<div class="tt-muted">' + it.label + (it.level ? ' · ' + esc(Stats.dominantPole(a, v)) : '') + '</div>';
      }
      var nLabel = params.seriesName === 'Pessoas' ? '' : (params.seriesName === 'Média do filtro' ? ' (n = ' + ctx.people.length + ')' : ' (n = ' + ctx.allPeople.length + ')');
      return '<b>' + esc(params.seriesName) + nLabel + '</b><br>' + esc(a.name) + ': ' + poleLabel(a, v, 1);
    };
    return mount(el, option, {
      click: function (params) {
        if (params.seriesName === 'Pessoas' && handlers && handlers.onPerson) handlers.onPerson(params.data.personId);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 2c. Consenso vs divisão (desvio padrão por eixo)
  // ---------------------------------------------------------------------------
  function consensus(el, ctx) {
    var t = theme();
    var mm = Stats.minMaxVector(ctx.people.map(function (p) { return ctx.vec(p.id, ctx.year); }));
    var items = ctx.axes.map(function (a, i) {
      return { axis: a, sd: ctx.sd[i], mean: ctx.mean[i], min: mm.min[i], max: mm.max[i] };
    }).sort(function (a, b) { return a.sd - b.sd; });
    el.style.height = (items.length * 36 + 90) + 'px';
    var compact = el.clientWidth < 640;

    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: compact ? 24 : 250, top: 30, bottom: 12, containLabel: true },
      xAxis: valueAxis(t, { min: 0, name: 'Desvio padrão (pontos percentuais)', nameLocation: 'middle', nameGap: 30 }),
      yAxis: categoryAxis(t, { inverse: true, data: items.map(function (it) { return it.axis.name; }) }),
      series: [{
        type: 'bar', data: items.map(function (it) {
          return { value: Stats.round(it.sd, 2), item: it };
        }),
        barMaxWidth: 18, itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] },
        label: {
          show: !compact, position: 'right', color: t.muted, fontSize: 11,
          formatter: function (p) {
            var it = p.data.item;
            return 'DP ' + fmt(it.sd, 1) + '  ·  média: ' + Stats.dominantPole(it.axis, it.mean) + ' ' + fmt(Stats.dominantPercent(it.mean), 1);
          }
        }
      }]
    });
    option.tooltip.formatter = function (p) {
      var it = p.data.item;
      return '<b>' + esc(it.axis.name) + '</b><div class="tt-muted">' + esc(it.axis.leftPole) + ' ↔ ' + esc(it.axis.rightPole) + '</div>' +
        'Desvio padrão: <b>' + fmt(it.sd, 1) + '</b><br>Média: ' + poleLabel(it.axis, it.mean, 1) + '<br>' +
        'Faixa (% ' + esc(it.axis.leftPole) + '): <b>' + fmt(it.min, 0) + '</b> a <b>' + fmt(it.max, 0) + '</b> · n = ' + ctx.people.length;
    };
    return mount(el, option);
  }

  // ---------------------------------------------------------------------------
  // 2d. Matriz de afinidade pessoa × pessoa
  // ---------------------------------------------------------------------------
  function affinity(el, ctx, cfg, handlers) {
    var t = theme();
    var people = ctx.people;
    var vectors = people.map(function (p) { return ctx.vec(p.id, ctx.year); });
    var order = Stats.clusterOrder(vectors);
    var rows = order.map(function (i) { return people[i]; });
    var vecs = order.map(function (i) { return vectors[i]; });
    var n = rows.length;
    var photos = !!cfg.photos;
    var AV = 30;
    var side = Math.max(260, Math.min(n * 34 + 170 + (photos ? AV + 10 : 0), 960));
    el.style.height = side + 'px';
    var distMode = cfg.mode === 'dist';
    var data = [], minSim = 100, maxDist = 0;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (r === c) continue;
        var s = Stats.similarity(vecs[r], vecs[c]);
        var dd = Stats.rmsDistance(vecs[r], vecs[c]);
        if (s < minSim) minSim = s;
        if (dd > maxDist) maxDist = dd;
        data.push({ value: [c, r, distMode ? dd : s], sim: s, dist: dd });
      }
    }
    var vmin = Math.max(0, Math.floor((minSim - 2) / 5) * 5);
    // Ponto colorido pelo lado econômico antes de cada nome.
    var rich = {};
    rows.forEach(function (p, i) {
      var sideColor = ctx.sideOf ? ctx.sideOf(p).color : Stats.economicSide(vecs[i], ctx.keys).color;
      rich['s' + i] = { color: sideColor, fontSize: 18, lineHeight: 14, padding: [0, 6, 0, 0], verticalAlign: 'middle' };
    });
    rich.n = { color: t.text, fontSize: 12, verticalAlign: 'middle' };
    function labelFmt(value, i) { return '{s' + i + '|●}{n|' + value + '}'; }
    var option = Object.assign(baseOption(t), {
      grid: { left: photos ? AV + 16 : 12, right: 12, top: photos ? AV + 16 : 12, bottom: 64, containLabel: true },
      xAxis: categoryAxis(t, { position: 'top', data: rows.map(function (p) { return ctx.name(p); }), axisLabel: { interval: 0, rotate: n > 7 ? 45 : 0, rich: rich, formatter: labelFmt } }),
      yAxis: categoryAxis(t, { inverse: true, data: rows.map(function (p) { return ctx.name(p); }), axisLabel: { interval: 0, rich: rich, formatter: labelFmt } }),
      visualMap: {
        type: 'continuous', min: distMode ? 0 : vmin, max: distMode ? Math.ceil(maxDist / 5) * 5 : 100, calculable: false, orient: 'horizontal', left: 'center', bottom: 6,
        itemWidth: 12, itemHeight: 220, precision: 0,
        text: distMode ? ['mais longe', 'mais perto'] : ['mais parecidos', 'menos parecidos'], textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: distMode ? SEQUENTIAL[t.mode].slice().reverse() : SEQUENTIAL[t.mode] }
      },
      series: [{
        type: 'heatmap', data: data,
        label: { show: !!cfg.values, fontSize: 11, color: t.text, formatter: function (p) { return fmt(p.data.value[2], 0); } },
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.text } }
      }]
    });
    option.tooltip.formatter = function (p) {
      var a = rows[p.data.value[1]], b = rows[p.data.value[0]];
      return '<b>' + esc(ctx.name(a)) + '</b> ↔ <b>' + esc(ctx.name(b)) + '</b><br>Similaridade: <b>' + fmt(p.data.sim, 1) + '%</b><br>Distância média por eixo: <b>' + fmt(p.data.dist, 1) + '</b> pontos<br><span class="tt-muted">Distância euclidiana: ' + fmt(p.data.dist * Math.sqrt(ctx.keys.length), 1) + '</span>';
    };
    var chart = mount(el, option, {
      click: function (params) {
        if (params.componentType === 'series' && handlers && handlers.onPerson) handlers.onPerson(rows[params.data.value[1]].id);
      }
    });
    if (photos) {
      var items = [];
      rows.forEach(function (p, i) {
        items.push({ person: p, x: chart.convertToPixel({ xAxisIndex: 0 }, i), y: AV / 2 + 4, size: AV });
        items.push({ person: p, x: AV / 2 + 4, y: chart.convertToPixel({ yAxisIndex: 0 }, i), size: AV });
      });
      overlayAvatars(el, ctx, items);
    }
    return chart;
  }

  // ---------------------------------------------------------------------------
  // 2e. Contagens de derivados (barras horizontais)
  // items: [{ name, count, people: [nomes] }]
  // ---------------------------------------------------------------------------
  function counts(el, items) {
    var t = theme();
    items = items.slice().sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'); });
    el.style.height = Math.max(120, items.length * 30 + 60) + 'px';
    var option = Object.assign(baseOption(t), {
      grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
      xAxis: valueAxis(t, { min: 0, minInterval: 1, axisLabel: { show: false }, splitLine: { show: false } }),
      yAxis: categoryAxis(t, { inverse: true, data: items.map(function (i) { return i.name; }), axisLabel: { color: t.text, fontSize: 12, width: Math.min(260, Math.max(120, el.clientWidth * 0.45)), overflow: 'truncate' } }),
      series: [{
        type: 'bar', data: items.map(function (i) { return { value: i.count, people: i.people }; }),
        barMaxWidth: 16, itemStyle: { color: t.accent, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: t.muted, fontSize: 11 }
      }]
    });
    option.tooltip.formatter = function (p) {
      return '<b>' + esc(p.name) + '</b> · ' + p.value + ' pessoa(s)<br><span class="tt-muted">' + p.data.people.map(esc).join(', ') + '</span>';
    };
    return mount(el, option);
  }

  // ---------------------------------------------------------------------------
  // 3. Comparar subgrupos — barras divergentes e radar
  // groups: [{ key, label, n, mean: [12], color }]
  // ---------------------------------------------------------------------------
  function poleYAxes(t, ctx, compact) {
    function make(side) {
      return categoryAxis(t, {
        inverse: true, position: side, data: ctx.axes.map(function (a) { return a.key; }),
        axisLabel: {
          interval: 0, rich: richPoles(t), margin: 12,
          formatter: function (key) {
            var a = ctx.axisByKey(key);
            if (side === 'left') return compact ? '{l|' + a.leftPole + '}' : '{n|' + a.name + '}\n{l|' + a.leftPole + '}';
            return '{r|' + a.rightPole + '}';
          }
        }
      });
    }
    return [make('left'), make('right')];
  }

  function centeredXAxis(t) {
    return valueAxis(t, { min: -50, max: 50, interval: 25, axisLabel: { color: t.muted, fontSize: 11, formatter: centeredTick } });
  }

  function compareBars(el, ctx, groups) {
    var t = theme();
    var compact = el.clientWidth < 700;
    el.style.height = (ctx.axes.length * (14 * groups.length + 22) + 120) + 'px';
    var series = groups.map(function (g) {
      return {
        type: 'bar', name: g.label + ' (n = ' + g.n + ')', group: g,
        data: g.mean.map(function (m, i) { return { value: Stats.round(50 - m, 2), mean: m, axisIndex: i }; }),
        itemStyle: { color: g.color, borderRadius: 3 }, barGap: '15%', barCategoryGap: '30%', barMaxWidth: 14
      };
    });
    if (series.length) {
      series[0].markLine = { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, width: 1 }, data: [{ xAxis: 0 }] };
    }
    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 12, top: 56, bottom: 12, containLabel: true },
      legend: legend(t, { icon: 'roundRect', data: series.map(function (s) { return s.name; }) }),
      xAxis: centeredXAxis(t),
      yAxis: poleYAxes(t, ctx, compact),
      series: series
    });
    option.tooltip.formatter = function (p) {
      var a = ctx.axes[p.data.axisIndex];
      return '<b>' + esc(p.seriesName) + '</b><br>' + esc(a.name) + ': ' + poleLabel(a, p.data.mean, 1);
    };
    return mount(el, option);
  }

  function radarIndicators(ctx, t) {
    return ctx.axes.map(function (a) { return { name: a.leftPole + '\n' + a.name, max: 100, min: 0 }; });
  }

  function radarBase(t, ctx, el) {
    var compact = el.clientWidth < 560;
    return {
      indicator: radarIndicators(ctx, t),
      splitNumber: 4, radius: compact ? '52%' : '62%', center: ['50%', '55%'],
      axisName: { color: t.muted, fontSize: compact ? 10 : 11, lineHeight: 13 },
      splitLine: { lineStyle: { color: t.grid } },
      splitArea: { show: false },
      axisLine: { lineStyle: { color: t.grid } }
    };
  }

  function compareRadar(el, ctx, groups) {
    var t = theme();
    el.style.height = (el.clientWidth < 560 ? 420 : 520) + 'px';
    var option = Object.assign(baseOption(t), {
      legend: legend(t, { data: groups.map(function (g) { return g.label + ' (n = ' + g.n + ')'; }) }),
      radar: radarBase(t, ctx, el),
      series: [{
        type: 'radar', symbol: 'circle', symbolSize: 6,
        data: groups.map(function (g) {
          return {
            value: g.mean.map(function (m) { return Stats.round(m, 1); }), name: g.label + ' (n = ' + g.n + ')',
            lineStyle: { color: g.color, width: 2 }, itemStyle: { color: g.color, borderColor: t.surface, borderWidth: 1 },
            areaStyle: { color: g.color, opacity: 0.08 }
          };
        })
      }]
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (p) {
      var rows = ctx.axes.map(function (a, i) { return '<tr><td class="tt-axis">' + esc(a.name) + '</td><td>' + poleLabel(a, p.data.value[i], 1) + '</td></tr>'; });
      return '<b>' + esc(p.name) + '</b><table class="tt-table">' + rows.join('') + '</table>';
    };
    return mount(el, option);
  }

  // ---------------------------------------------------------------------------
  // Rede de afinidade: cada pessoa é um nó ligado aos seus k vizinhos mais
  // parecidos (distância média por eixo). Layout de forças: ligações mais
  // fortes puxam mais perto. Posição inicial vem do PCA, para o desenho ser
  // estável entre recargas. cfg: { k, colorOf(p) → {label,color}|null, byCategory }
  // ---------------------------------------------------------------------------
  function network(el, ctx, cfg, handlers) {
    var t = theme();
    var people = ctx.people;
    var n = people.length;
    el.style.height = (el.clientWidth < 640 ? 480 : 620) + 'px';
    var vecs = people.map(function (p) { return ctx.vec(p.id, ctx.year); });
    var k = Math.max(1, Math.min(cfg.k || 2, n - 1));
    var D = vecs.map(function (a) { return vecs.map(function (b) { return Stats.rmsDistance(a, b); }); });
    var edges = {};
    for (var i = 0; i < n; i++) {
      var order = vecs.map(function (v, j) { return j; }).filter(function (j) { return j !== i; })
        .sort(function (a, b) { return D[i][a] - D[i][b]; });
      order.slice(0, k).forEach(function (j) {
        var key = Math.min(i, j) + '-' + Math.max(i, j);
        if (!edges[key]) edges[key] = { a: Math.min(i, j), b: Math.max(i, j), d: D[i][j], mutual: 0 };
        edges[key].mutual++;
      });
    }
    var list = Object.keys(edges).map(function (key) { return edges[key]; });
    var dMin = Math.min.apply(null, list.map(function (e) { return e.d; }).concat([Infinity]));
    var dMax = Math.max.apply(null, list.map(function (e) { return e.d; }).concat([-Infinity]));
    var norm = function (d) { return dMax > dMin ? (dMax - d) / (dMax - dMin) : 1; }; // 1 = mais parecido

    // Sementes do PCA (mesma ordem de ctx.people), escaladas para ±250 px.
    var seeds = people.map(function (p, i) {
      if (ctx.pca && ctx.pca.ok) return ctx.pca.scores[i];
      var ang = 2 * Math.PI * i / Math.max(1, n);
      return [Math.cos(ang), Math.sin(ang)];
    });
    var sMax = Math.max.apply(null, seeds.map(function (s) { return Math.max(Math.abs(s[0]), Math.abs(s[1])); }).concat([1e-9]));

    var cats = [], catIndex = {};
    var nodes = people.map(function (p, i) {
      var info = cfg.colorOf ? cfg.colorOf(p) : null;
      var color = info ? info.color : ctx.color(p);
      var node = {
        id: p.id, name: ctx.name(p), personId: p.id,
        x: seeds[i][0] / sMax * 250, y: -seeds[i][1] / sMax * 250,
        symbolSize: 16 + 16 * Math.min(1, Stats.magnitude(vecs[i]) / 30),
        itemStyle: { color: color, borderColor: t.surface, borderWidth: 2 },
        mag: Stats.magnitude(vecs[i]), sideLabel: info ? info.label : null
      };
      if (cfg.byCategory && info) {
        if (catIndex[info.label] === undefined) { catIndex[info.label] = cats.length; cats.push({ name: info.label, itemStyle: { color: info.color } }); }
        node.category = catIndex[info.label];
      }
      return node;
    });
    if (cfg.byCategory && cfg.categoryOrder) {
      // Reordena as categorias na ordem canônica, preservando os índices dos nós.
      var sorted = cats.slice().sort(function (a, b) {
        var ia = cfg.categoryOrder.indexOf(a.name), ib = cfg.categoryOrder.indexOf(b.name);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      var remap = {};
      sorted.forEach(function (c, i2) { remap[catIndex[c.name]] = i2; });
      nodes.forEach(function (nd) { if (nd.category !== undefined) nd.category = remap[nd.category]; });
      cats = sorted;
    }
    var links = list.map(function (e) {
      var s = norm(e.d);
      return {
        source: people[e.a].id, target: people[e.b].id, value: Stats.round(100 - e.d, 2),
        dist: e.d, mutual: e.mutual === 2,
        lineStyle: { width: 1 + 4 * s, opacity: 0.3 + 0.5 * s, color: t.axis, type: e.mutual === 2 ? 'solid' : 'dashed' }
      };
    });

    var option = Object.assign(baseOption(t), {
      legend: cfg.byCategory && cats.length > 1 ? legend(t, { data: cats.map(function (c) { return c.name; }) }) : undefined,
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        data: nodes, links: links, categories: cfg.byCategory ? cats : undefined,
        top: cfg.byCategory && cats.length > 1 ? 50 : 20, bottom: 20, left: 30, right: 90,
        // Repulsão proporcional ao tamanho do grupo e gravidade alta, para as
        // turmas soltas (1 vizinho) não fugirem do quadro.
        force: { repulsion: Math.max(80, Math.min(220, 2600 / Math.max(1, n))), gravity: 0.3, edgeLength: [30, 110], friction: 0.15, layoutAnimation: true },
        label: { show: true, position: 'right', color: t.text, fontSize: 11, formatter: function (p) { return p.data.name; } },
        labelLayout: { hideOverlap: true },
        emphasis: { focus: 'adjacency', lineStyle: { width: 5, opacity: 0.9 }, label: { fontWeight: 700 } },
        blur: { itemStyle: { opacity: 0.2 }, lineStyle: { opacity: 0.05 }, label: { opacity: 0.3 } }
      }]
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (p) {
      if (p.dataType === 'edge') {
        var a = ctx.personById(p.data.source), b = ctx.personById(p.data.target);
        return '<b>' + esc(ctx.name(a)) + '</b> ↔ <b>' + esc(ctx.name(b)) + '</b><br>Distância média por eixo: <b>' + fmt(p.data.dist, 1) + '</b> pontos' +
          '<div class="tt-muted">' + (p.data.mutual ? 'Um está entre os mais próximos do outro (linha cheia)' : 'Ligação de um lado só (linha tracejada)') + '</div>';
      }
      var person = ctx.personById(p.data.personId);
      var i = people.indexOf(person);
      var near = D[i].map(function (d, j) { return { j: j, d: d }; }).filter(function (x) { return x.j !== i; })
        .sort(function (x, y) { return x.d - y.d; }).slice(0, 3);
      return '<div class="tt-head"><span class="tt-dot" style="background:' + p.color + '"></span><b>' + esc(p.data.name) + '</b>' +
        (p.data.sideLabel ? '<span class="tt-year">' + esc(p.data.sideLabel) + '</span>' : '') + '</div>' +
        '<div class="tt-muted">Convicção ' + fmt(p.data.mag, 1) + ' · mais próximos:</div>' +
        near.map(function (x) { return '<div>' + esc(ctx.name(people[x.j])) + ' <span class="tt-muted">' + fmt(x.d, 1) + '</span></div>'; }).join('') +
        '<div class="tt-foot">Clique para abrir a visão individual · arraste para mover</div>';
    };
    return mount(el, option, {
      click: function (params) {
        if (params.dataType === 'node' && handlers && handlers.onPerson) handlers.onPerson(params.data.personId);
      }
    });
  }

  // Pessoas individualmente: um ponto por pessoa em cada eixo, na cor do
  // subgrupo, com a média do subgrupo como losango. Passar o mouse numa pessoa
  // acende os 12 pontos dela; clicar abre a visão individual.
  function compareStrips(el, ctx, groups, handlers) {
    var t = theme();
    var n = ctx.axes.length;
    var total = groups.reduce(function (s, g) { return s + g.n; }, 0);
    var rowH = total > 16 ? 58 : 48;
    el.style.height = (n * rowH + 110) + 'px';
    var compact = el.clientWidth < 700;
    var plotWidth = Math.max(200, el.clientWidth - (compact ? 190 : 300));
    var symbol = 11;
    var minGap = 100 / plotWidth * (symbol + 1);

    // Deslocamento vertical (beeswarm) calculado com todas as pessoas juntas,
    // para pontos de subgrupos diferentes também não se sobreporem.
    var offsets = {}; // personId|axis -> offset
    ctx.axes.forEach(function (a, i) {
      var entries = [];
      groups.forEach(function (g) { g.people.forEach(function (p) { entries.push({ p: p, v: ctx.vec(p.id, ctx.year)[i] }); }); });
      var offs = swarm(entries.map(function (e) { return e.v; }), minGap, 0.12, 0.4);
      entries.forEach(function (e, k) { offsets[e.p.id + '|' + i] = offs[k]; });
    });

    var labelOf = function (g) { return g.label + ' (n = ' + g.n + ')'; };
    var series = [];
    groups.forEach(function (g) {
      var data = [];
      g.people.forEach(function (p) {
        var v = ctx.vec(p.id, ctx.year);
        ctx.axes.forEach(function (a, i) {
          data.push({ value: [v[i], i + offsets[p.id + '|' + i]], personId: p.id, axisIndex: i });
        });
      });
      series.push({
        type: 'scatter', name: labelOf(g), data: data, symbolSize: symbol, z: 3, yAxisIndex: 2,
        itemStyle: { color: g.color, borderColor: t.surface, borderWidth: 1.5, opacity: 0.9 },
        emphasis: { scale: 1.6, itemStyle: { borderColor: t.text, borderWidth: 2, opacity: 1 } }
      });
      series.push({
        type: 'scatter', name: labelOf(g), isMean: true, symbol: 'diamond', symbolSize: 17, z: 5, yAxisIndex: 2,
        data: g.mean.map(function (m, i) { return { value: [m, i], axisIndex: i, group: g }; }),
        itemStyle: { color: g.color, borderColor: t.text, borderWidth: 1.5 }
      });
    });
    var bands = [];
    for (var b = 0; b < n; b += 2) bands.push([{ yAxis: b - 0.5 }, { yAxis: b + 0.5 }]);
    if (series.length) {
      series[0].markLine = { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'dashed', width: 1 }, data: [{ xAxis: 50 }] };
      series[0].markArea = { silent: true, itemStyle: { color: t.band }, data: bands };
    }

    function labelAxis(side) {
      return categoryAxis(t, {
        inverse: true, position: side, data: ctx.axes.map(function (a) { return a.key; }),
        axisLabel: {
          interval: 0, rich: richPoles(t), margin: 12,
          formatter: function (key) {
            var a = ctx.axisByKey(key);
            if (side === 'left') return compact ? '{l|' + a.leftPole + '}' : '{n|' + a.name + '}\n{l|' + a.leftPole + '}';
            return '{r|' + a.rightPole + '}';
          }
        }
      });
    }
    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 12, top: 56, bottom: 12, containLabel: true },
      legend: legend(t, { data: groups.map(labelOf) }),
      xAxis: valueAxis(t, {
        min: 0, max: 100, interval: 25, inverse: true,
        axisLabel: {
          color: t.muted, fontSize: 11,
          formatter: function (v) { return v === 50 ? 'centro' : v > 50 ? fmt(v) + '% esq.' : fmt(100 - v) + '% dir.'; }
        }
      }),
      yAxis: [labelAxis('left'), labelAxis('right'), valueAxis(t, { min: -0.5, max: n - 0.5, inverse: true, show: false, splitLine: { show: false } })],
      series: series
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (params) {
      var a = ctx.axes[params.data.axisIndex];
      var v = params.data.value[0];
      if (params.data.personId) {
        var p = ctx.personById(params.data.personId);
        var r = ctx.result(p.id, ctx.year);
        var it = Stats.intensity(v);
        return '<div class="tt-head"><span class="tt-dot" style="background:' + params.color + '"></span><b>' + esc(ctx.name(p)) + '</b></div>' +
          '<div class="tt-muted">' + esc(params.seriesName) + '</div>' +
          '<div><b>' + esc(a.name) + '</b>: ' + poleLabel(a, v, r.precision || 0) + '</div>' +
          '<div class="tt-muted">' + it.label + (it.level ? ' · ' + esc(Stats.dominantPole(a, v)) : '') + '</div>' +
          '<div class="tt-foot">Clique para abrir a visão individual</div>';
      }
      return '<b>Média · ' + esc(params.seriesName) + '</b><br>' + esc(a.name) + ': ' + poleLabel(a, v, 1);
    };
    var chart = mount(el, option, {
      click: function (params) {
        if (params.data && params.data.personId && handlers && handlers.onPerson) handlers.onPerson(params.data.personId);
      }
    });
    // Acende os 12 pontos da pessoa sob o mouse.
    var lit = null;
    function indicesOf(seriesIndex, pid) {
      var out = [];
      series[seriesIndex].data.forEach(function (d, k) { if (d.personId === pid) out.push(k); });
      return out;
    }
    chart.on('mouseover', function (params) {
      if (!params.data || !params.data.personId) return;
      if (lit) chart.dispatchAction({ type: 'downplay', seriesIndex: lit.s, dataIndex: lit.idx });
      lit = { s: params.seriesIndex, idx: indicesOf(params.seriesIndex, params.data.personId) };
      chart.dispatchAction({ type: 'highlight', seriesIndex: lit.s, dataIndex: lit.idx });
    });
    chart.on('mouseout', function (params) {
      if (!lit || !params.data || !params.data.personId) return;
      chart.dispatchAction({ type: 'downplay', seriesIndex: lit.s, dataIndex: lit.idx });
      lit = null;
    });
    return chart;
  }

  // ---------------------------------------------------------------------------
  // 4. Visão individual
  // ---------------------------------------------------------------------------
  function personRadar(el, ctx, person) {
    var t = theme();
    el.style.height = (el.clientWidth < 560 ? 400 : 480) + 'px';
    var vec = ctx.vec(person.id, ctx.year);
    var r = ctx.result(person.id, ctx.year);
    var data = [{
      value: vec, name: ctx.name(person),
      lineStyle: { color: ctx.color(person), width: 2 }, itemStyle: { color: ctx.color(person), borderColor: t.surface, borderWidth: 1 },
      areaStyle: { color: ctx.color(person), opacity: 0.12 }
    }];
    if (ctx.mean && ctx.people.length > 1) {
      data.push({
        value: ctx.mean.map(function (m) { return Stats.round(m, 1); }), name: 'Média do filtro (n = ' + ctx.people.length + ')',
        lineStyle: { color: t.muted, width: 2, type: 'dashed' }, itemStyle: { color: t.muted }, areaStyle: { opacity: 0 }
      });
    }
    if (ctx.showRef && ctx.filterActive && ctx.meanAll && ctx.allPeople.length > ctx.people.length) {
      data.push({
        value: ctx.meanAll.map(function (m) { return Stats.round(m, 1); }), name: 'Média do grupo inteiro (n = ' + ctx.allPeople.length + ')',
        lineStyle: { color: t.faint, width: 1.5, type: 'dotted' }, itemStyle: { color: t.faint }, areaStyle: { opacity: 0 }
      });
    }
    var option = Object.assign(baseOption(t), {
      legend: legend(t, { data: data.map(function (d) { return d.name; }) }),
      radar: radarBase(t, ctx, el),
      series: [{ type: 'radar', symbol: 'circle', symbolSize: 6, data: data }]
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (p) {
      var d = p.dataIndex === 0 ? (r.precision || 0) : 1;
      var rows = ctx.axes.map(function (a, i) { return '<tr><td class="tt-axis">' + esc(a.name) + '</td><td>' + poleLabel(a, p.data.value[i], d) + '</td></tr>'; });
      return '<b>' + esc(p.name) + '</b><table class="tt-table">' + rows.join('') + '</table>';
    };
    return mount(el, option);
  }

  function personBars(el, ctx, person) {
    var t = theme();
    var compact = el.clientWidth < 700;
    el.style.height = (ctx.axes.length * 40 + 90) + 'px';
    var vec = ctx.vec(person.id, ctx.year);
    var r = ctx.result(person.id, ctx.year);
    var d = r.precision || 0;
    var color = ctx.color(person);
    var series = [{
      type: 'bar', name: ctx.name(person), barMaxWidth: 16,
      data: vec.map(function (v, i) {
        var it = Stats.intensity(v);
        // O rótulo fica do lado vazio (junto ao centro), nunca sobre os polos.
        return {
          value: Stats.round(50 - v, 2), raw: v, axisIndex: i,
          itemStyle: { color: color, opacity: it.level === 0 ? 0.55 : 1, borderRadius: 3 },
          label: { position: v >= 50 ? 'right' : 'left', distance: 8 }
        };
      }),
      label: {
        show: true, color: t.muted, fontSize: 11,
        formatter: function (p) {
          var a = ctx.axes[p.data.axisIndex];
          var it = Stats.intensity(p.data.raw);
          var pct = fmt(Stats.dominantPercent(p.data.raw), d);
          if (compact) return it.label + ' · ' + pct;
          return it.label + (it.level ? ' · ' + Stats.dominantPole(a, p.data.raw) + ' ' + pct : ' · ' + pct);
        }
      },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, width: 1 }, data: [{ xAxis: 0 }] }
    }];
    if (ctx.mean && ctx.people.length > 1) {
      series.push({
        type: 'scatter', name: 'Média do filtro (n = ' + ctx.people.length + ')', symbol: 'rect', symbolSize: [3, 22], z: 5,
        data: ctx.mean.map(function (m, i) { return { value: [Stats.round(50 - m, 2), i], mean: m, axisIndex: i }; }),
        itemStyle: { color: t.text }
      });
    }
    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 12, top: 52, bottom: 12, containLabel: true },
      legend: legend(t, { data: series.map(function (s) { return s.name; }), icon: 'roundRect' }),
      xAxis: centeredXAxis(t),
      yAxis: poleYAxes(t, ctx, compact),
      series: series
    });
    option.tooltip.formatter = function (p) {
      var a = ctx.axes[p.data.axisIndex];
      if (p.seriesType === 'bar') {
        var it = Stats.intensity(p.data.raw);
        return '<b>' + esc(a.name) + '</b><br>' + poleLabel(a, p.data.raw, d) + '<br><span class="tt-muted">' + it.label + (it.level ? ' · ' + esc(Stats.dominantPole(a, p.data.raw)) : '') + '</span>';
      }
      return '<b>' + esc(p.seriesName) + '</b><br>' + esc(a.name) + ': ' + poleLabel(a, p.data.mean, 1);
    };
    return mount(el, option);
  }

  // Termômetro de convicção: pessoa vs média do filtro (0 = tudo no centro, 50 = tudo nos extremos).
  function conviction(el, ctx, person, groupValues) {
    var t = theme();
    el.style.height = '150px';
    var mine = Stats.magnitude(ctx.vec(person.id, ctx.year));
    var groupMean = groupValues.length ? Stats.mean(groupValues) : null;
    var cats = [ctx.name(person)];
    var vals = [{ value: Stats.round(mine, 2), itemStyle: { color: ctx.color(person), borderRadius: [0, 4, 4, 0] } }];
    if (groupMean !== null && ctx.people.length > 1) {
      cats.push('Média do filtro (n = ' + ctx.people.length + ')');
      vals.push({ value: Stats.round(groupMean, 2), itemStyle: { color: t.muted, borderRadius: [0, 4, 4, 0] } });
    }
    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 60, top: 10, bottom: 8, containLabel: true },
      xAxis: valueAxis(t, { min: 0, max: 50, interval: 10, axisLabel: { color: t.muted, fontSize: 11, formatter: function (v) { return v === 0 ? '0 · centro' : v === 50 ? '50 · extremos' : fmt(v); } } }),
      yAxis: categoryAxis(t, { inverse: true, data: cats }),
      series: [{
        type: 'bar', data: vals, barMaxWidth: 20,
        label: { show: true, position: 'right', color: t.text, fontSize: 12, fontWeight: 600, formatter: function (p) { return fmt(p.value, 1); } },
        markLine: groupValues.length > 1 ? {
          silent: true, symbol: 'none', lineStyle: { color: t.axis, type: 'dashed' },
          label: { show: true, position: 'insideEndTop', color: t.muted, fontSize: 10, formatter: function (p) { return p.name; } },
          data: [{ xAxis: Stats.round(Math.min.apply(null, groupValues), 2), name: 'mín.' }, { xAxis: Stats.round(Math.max.apply(null, groupValues), 2), name: 'máx.' }]
        } : undefined
      }]
    });
    option.tooltip.formatter = function (p) { return '<b>' + esc(p.name) + '</b><br>Convicção média: <b>' + fmt(p.value, 1) + '</b><br><span class="tt-muted">média de |valor − 50| nos 12 eixos</span>'; };
    return mount(el, option);
  }

  // Linhas por eixo no tempo (só com mais de um ano).
  // vectorsByYear: { ano: vetor de 12 } — pessoa ou média do grupo.
  function axisLines(el, ctx, years, vectorsByYear, opts) {
    var t = theme();
    opts = opts || {};
    el.style.height = (el.clientWidth < 560 ? 380 : 440) + 'px';
    var series = ctx.axes.map(function (a, i) {
      return {
        type: 'line', name: a.name, symbol: 'circle', symbolSize: 8, lineStyle: { width: 2 }, itemStyle: { borderColor: t.surface, borderWidth: 1 }, color: PALETTE[i % PALETTE.length],
        data: years.map(function (y) { var v = vectorsByYear[y]; return v ? Stats.round(v[i], 1) : null; }),
        connectNulls: false
      };
    });
    var option = Object.assign(baseOption(t), {
      grid: { left: 12, right: 24, top: 70, bottom: 12, containLabel: true },
      legend: legend(t, { data: ctx.axes.map(function (a) { return a.name; }) }),
      xAxis: categoryAxis(t, { data: years.map(String), boundaryGap: true, axisLabel: { color: t.text } }),
      yAxis: valueAxis(t, { min: 0, max: 100, interval: 25, name: '% do polo esquerdo', nameLocation: 'end', nameTextStyle: { align: 'left', color: t.text, fontWeight: 600, fontSize: 12 }, axisLabel: { color: t.muted, fontSize: 11, formatter: function (v) { return v === 50 ? 'centro' : fmt(v); } } }),
      series: series
    });
    option.tooltip.trigger = 'axis';
    option.tooltip.formatter = function (params) {
      var rows = params.map(function (p) {
        var a = ctx.axes[p.seriesIndex];
        if (p.value === null || p.value === undefined) return '';
        return '<tr><td><span class="tt-dot" style="background:' + p.color + '"></span>' + esc(a.name) + '</td><td>' + poleLabel(a, p.value, 1) + '</td></tr>';
      });
      var extra = opts.subtitle ? opts.subtitle(params[0].axisValue) : '';
      return '<b>' + esc(params[0].axisValue) + '</b>' + (extra ? '<div class="tt-muted">' + extra + '</div>' : '') + '<table class="tt-table">' + rows.join('') + '</table>';
    };
    return mount(el, option);
  }

  function timeline(el, ctx, person, years) {
    var byYear = {};
    years.forEach(function (y) { byYear[y] = ctx.vec(person.id, y); });
    return axisLines(el, ctx, years, byYear);
  }

  // ---------------------------------------------------------------------------
  // 2f. Mapa-múndi dos países mais próximos
  // items: [{ mapName, label (nome como no dado), people: [person] }]
  // unmapped tratado pelo app. Requer Geo.load() concluído.
  // ---------------------------------------------------------------------------
  function worldMap(el, ctx, cfg, handlers) {
    var t = theme();
    var Geo = global.Geo;
    var photos = !!cfg.photos;
    var AV = 28;
    el.style.height = (el.clientWidth < 640 ? 360 : 560) + 'px';
    var byName = {};
    cfg.items.forEach(function (it) { byName[it.mapName] = it; });
    var max = 1;
    cfg.items.forEach(function (it) { if (it.people.length > max) max = it.people.length; });
    var data = cfg.items.map(function (it) {
      return { name: it.mapName, value: it.people.length, label: it.label, people: it.people };
    });
    var option = Object.assign(baseOption(t), {
      geo: {
        map: Geo.MAP_NAME, roam: true, zoom: 1.15, center: [10, 15],
        scaleLimit: { min: 0.9, max: 6 },
        itemStyle: { areaColor: t.dark ? '#2a2925' : '#e9e6db', borderColor: t.surface, borderWidth: 0.8 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: t.dark ? '#3a3934' : '#d9d5c8' } },
        select: { disabled: true },
        label: { show: false }
      },
      visualMap: {
        type: 'continuous', min: 0, max: max, show: max > 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 6,
        itemWidth: 12, itemHeight: 180, precision: 0, text: [max + ' pessoa(s)', '1'],
        textStyle: { color: t.muted, fontSize: 11 },
        inRange: { color: SEQUENTIAL[t.mode].slice(1) }, seriesIndex: 0
      },
      series: [{
        type: 'map', map: Geo.MAP_NAME, geoIndex: 0, data: data,
        itemStyle: { borderColor: t.surface }, emphasis: { label: { show: false } }
      }]
    });
    option.tooltip.trigger = 'item';
    option.tooltip.formatter = function (p) {
      var it = p.data && byName[p.name];
      if (!it) return esc(p.name) + '<div class="tt-muted">Ninguém no filtro</div>';
      var labels = {};
      it.people.forEach(function (pp) { labels[pp.label] = true; });
      return '<b>' + Object.keys(labels).map(esc).join(' · ') + '</b><div class="tt-muted">' + esc(p.name) + '</div>' +
        '<div style="margin-top:6px">' + it.people.map(function (pp) {
          return '<div><span class="tt-dot" style="background:' + ctx.color(pp.person) + '"></span> ' + esc(ctx.name(pp.person)) + '</div>';
        }).join('') + '</div>';
    };
    var chart = mount(el, option, {
      click: function (params) {
        var it = params.data && byName[params.name];
        if (it && it.people.length === 1 && handlers && handlers.onPerson) handlers.onPerson(it.people[0].person.id);
      }
    });
    var build = function () {
      var items = [];
      cfg.items.forEach(function (it) {
        var c = Geo.centroid(it.mapName);
        if (!c) return;
        var px = chart.convertToPixel({ geoIndex: 0 }, c);
        if (!px) return;
        // Até 4 avatares por linha, centrados no país.
        var k = it.people.length;
        var step = photos ? AV * 0.72 : 16;
        var cols = Math.min(k, 4);
        var rows = Math.ceil(k / cols);
        it.people.forEach(function (pp, i) {
          var row = Math.floor(i / cols);
          var inRow = row === rows - 1 ? k - row * cols : cols;
          var col = i % cols;
          items.push({
            person: pp.person,
            x: px[0] + (col - (inRow - 1) / 2) * step,
            y: px[1] + (row - (rows - 1) / 2) * step * 0.95,
            size: photos ? AV : 18
          });
        });
      });
      overlayAvatars(el, ctx, items);
    };
    build();
    chart.on('georoam', build);
    return chart;
  }

  global.Charts = {
    worldMap: worldMap,
    PALETTE: PALETTE,
    DIVERGING: DIVERGING,
    SEQUENTIAL: SEQUENTIAL,
    theme: theme,
    fmt: fmt,
    esc: esc,
    poleLabel: poleLabel,
    mount: mount,
    disposeAll: disposeAll,
    resizeAll: resizeAll,
    overlayAvatars: overlayAvatars,
    quadrantName: quadrantName,
    explorer: explorer,
    heatmap: heatmap,
    strips: strips,
    consensus: consensus,
    affinity: affinity,
    counts: counts,
    compareBars: compareBars,
    compareRadar: compareRadar,
    compareStrips: compareStrips,
    network: network,
    personRadar: personRadar,
    personBars: personBars,
    conviction: conviction,
    timeline: timeline,
    axisLines: axisLines
  };
})(window);
