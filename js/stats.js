/*
  js/stats.js — cálculos do painel.

  Tudo aqui trabalha com vetores de 12 números (o % do polo esquerdo de cada
  eixo, na ordem de DATA.axes). Nenhuma função depende de DOM ou de ECharts.

  Convenções
  - Vetor centrado: v − 50.
  - Magnitude / convicção: média de |v − 50| (0 = tudo no centro, 50 = tudo nos extremos).
  - Distância entre pessoas: euclidiana. Distância máxima possível: sqrt(12) × 100.
  - Similaridade: 100 × (1 − distância / distância máxima).
  - Desvio padrão: populacional (divide por n), pois descreve o grupo observado.
  - PCA: matriz de covariância (divide por n − 1) + autovetores por rotações de
    Jacobi. Os dois primeiros componentes são devolvidos com os pesos de cada eixo.
  - Agrupamento hierárquico: aglomerativo, ligação média (average linkage), usado
    só para ordenar pessoas no heatmap e na matriz de afinidade.
*/
(function (global) {
  'use strict';

  var CENTER = 50;

  function axisKeys(data) {
    return data.axes.map(function (a) { return a.key; });
  }

  function toVector(axesObj, keys) {
    return keys.map(function (k) { return Number(axesObj[k]); });
  }

  function centered(vec) {
    return vec.map(function (v) { return v - CENTER; });
  }

  function magnitude(vec) {
    if (!vec || !vec.length) return 0;
    var s = 0;
    for (var i = 0; i < vec.length; i++) s += Math.abs(vec[i] - CENTER);
    return s / vec.length;
  }

  function euclid(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) {
      var d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  function maxDistance(dim) {
    return Math.sqrt(dim) * 100;
  }

  function similarity(a, b) {
    if (!a || !b || !a.length) return null;
    return 100 * (1 - euclid(a, b) / maxDistance(a.length));
  }

  function meanVector(vectors) {
    if (!vectors.length) return null;
    var dim = vectors[0].length;
    var out = new Array(dim).fill(0);
    vectors.forEach(function (v) {
      for (var j = 0; j < dim; j++) out[j] += v[j];
    });
    return out.map(function (s) { return s / vectors.length; });
  }

  function sdVector(vectors, mean) {
    if (!vectors.length) return null;
    var dim = vectors[0].length;
    var m = mean || meanVector(vectors);
    var out = new Array(dim).fill(0);
    vectors.forEach(function (v) {
      for (var j = 0; j < dim; j++) {
        var d = v[j] - m[j];
        out[j] += d * d;
      }
    });
    return out.map(function (s) { return Math.sqrt(s / vectors.length); });
  }

  function minMaxVector(vectors) {
    if (!vectors.length) return null;
    var dim = vectors[0].length;
    var mn = new Array(dim).fill(Infinity), mx = new Array(dim).fill(-Infinity);
    vectors.forEach(function (v) {
      for (var j = 0; j < dim; j++) {
        if (v[j] < mn[j]) mn[j] = v[j];
        if (v[j] > mx[j]) mx[j] = v[j];
      }
    });
    return { min: mn, max: mx };
  }

  function mean(values) {
    if (!values.length) return null;
    var s = 0;
    for (var i = 0; i < values.length; i++) s += values[i];
    return s / values.length;
  }

  // Faixas de intensidade do 12 Axes, pelo desvio em relação ao centro.
  function intensity(value) {
    var d = Math.abs(value - CENTER);
    if (d < 7.5) return { label: 'Equilibrado', level: 0 };
    if (d < 22.5) return { label: 'Inclinado', level: 1 };
    if (d < 37.5) return { label: 'Forte', level: 2 };
    return { label: 'Muito forte', level: 3 };
  }

  // Polo dominante: esquerdo quando esquerdo >= direito (mesma regra do site).
  function dominantPole(axis, value) {
    return value >= CENTER ? axis.leftPole : axis.rightPole;
  }

  function dominantPercent(value) {
    return value >= CENTER ? value : 100 - value;
  }

  // ---------- PCA ----------

  function identity(n) {
    var m = [];
    for (var i = 0; i < n; i++) {
      m.push(new Array(n).fill(0));
      m[i][i] = 1;
    }
    return m;
  }

  // Autovalores/autovetores de matriz simétrica por rotações de Jacobi.
  // Devolve { values: [...], vectors: [[...], ...] } com vectors[k] = autovetor k.
  function jacobiEigen(A) {
    var n = A.length;
    var a = A.map(function (r) { return r.slice(); });
    var V = identity(n);
    for (var sweep = 0; sweep < 100; sweep++) {
      var off = 0;
      for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-20) break;
      for (var p = 0; p < n; p++) {
        for (var q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-15) continue;
          var theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          var sign = theta >= 0 ? 1 : -1;
          var t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          var c = 1 / Math.sqrt(t * t + 1);
          var s = t * c;
          var k, akp, akq, apk, aqk, vkp, vkq;
          for (k = 0; k < n; k++) {
            akp = a[k][p]; akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[k][q] = s * akp + c * akq;
          }
          for (k = 0; k < n; k++) {
            apk = a[p][k]; aqk = a[q][k];
            a[p][k] = c * apk - s * aqk;
            a[q][k] = s * apk + c * aqk;
          }
          for (k = 0; k < n; k++) {
            vkp = V[k][p]; vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    var values = [], vectors = [];
    for (var d = 0; d < n; d++) {
      values.push(a[d][d]);
      var col = [];
      for (var r = 0; r < n; r++) col.push(V[r][d]);
      vectors.push(col);
    }
    return { values: values, vectors: vectors };
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // PCA 2D. Devolve:
  //  ok        — false quando não dá para calcular (n < 2 ou variância zero)
  //  reason    — explicação em português quando ok = false
  //  scores    — [[pc1, pc2], ...] na ordem dos vetores de entrada
  //  loadings  — [[peso de cada eixo no PC1], [idem PC2]]
  //  explained — fração da variância explicada por cada componente
  //  means     — média por eixo usada para centrar (para projetar outros vetores)
  function pca(vectors) {
    var n = vectors.length;
    var dim = n ? vectors[0].length : 0;
    var empty = {
      ok: false, reason: '', means: [],
      scores: vectors.map(function () { return [0, 0]; }),
      loadings: [new Array(dim).fill(0), new Array(dim).fill(0)],
      explained: [0, 0]
    };
    if (n < 2) {
      empty.reason = 'O PCA precisa de pelo menos 2 pessoas no filtro.';
      return empty;
    }
    var means = meanVector(vectors);
    var X = vectors.map(function (v) { return v.map(function (x, j) { return x - means[j]; }); });
    var cov = [];
    for (var a = 0; a < dim; a++) {
      cov.push(new Array(dim).fill(0));
      for (var b = 0; b < dim; b++) {
        var s = 0;
        for (var i = 0; i < n; i++) s += X[i][a] * X[i][b];
        cov[a][b] = s / (n - 1);
      }
    }
    var total = 0;
    for (var d = 0; d < dim; d++) total += cov[d][d];
    if (total <= 1e-12) {
      empty.reason = 'Todas as pessoas do filtro têm o mesmo perfil; não há variância para o PCA.';
      empty.means = means;
      return empty;
    }
    var eig = jacobiEigen(cov);
    var order = eig.values.map(function (v, i) { return i; })
      .sort(function (i, j) { return eig.values[j] - eig.values[i]; });
    var comps = [], explained = [];
    for (var c = 0; c < 2; c++) {
      var idx = order[c];
      var vec = idx === undefined ? new Array(dim).fill(0) : eig.vectors[idx].slice();
      // Orientação estável: o eixo de maior peso absoluto fica positivo.
      var big = 0;
      for (var k = 1; k < vec.length; k++) if (Math.abs(vec[k]) > Math.abs(vec[big])) big = k;
      if (vec[big] < 0) vec = vec.map(function (x) { return -x; });
      comps.push(vec);
      var lambda = idx === undefined ? 0 : Math.max(0, eig.values[idx]);
      explained.push(lambda / total);
    }
    var scores = X.map(function (row) { return [dot(row, comps[0]), dot(row, comps[1])]; });
    return { ok: true, reason: '', means: means, scores: scores, loadings: comps, explained: explained };
  }

  // Projeta um vetor qualquer (ex.: de outro ano) nos componentes já calculados.
  function pcaProject(model, vec) {
    if (!model || !model.ok) return [0, 0];
    var c = vec.map(function (x, j) { return x - model.means[j]; });
    return [dot(c, model.loadings[0]), dot(c, model.loadings[1])];
  }

  // ---------- Agrupamento hierárquico (só para ordenar) ----------

  function range(n) {
    var r = [];
    for (var i = 0; i < n; i++) r.push(i);
    return r;
  }

  function clusterOrder(vectors) {
    var n = vectors.length;
    if (n <= 2) return range(n);
    var dist = [];
    for (var i = 0; i < n; i++) {
      dist.push([]);
      for (var j = 0; j < n; j++) dist[i].push(i === j ? 0 : euclid(vectors[i], vectors[j]));
    }
    var cd = dist.map(function (r) { return r.slice(); });
    var sizes = new Array(n).fill(1);
    var orders = range(n).map(function (i) { return [i]; });
    var alive = new Array(n).fill(true);

    function endDist(orderA, orderB) {
      return dist[orderA[orderA.length - 1]][orderB[0]];
    }

    for (var step = 0; step < n - 1; step++) {
      var best = Infinity, bi = -1, bj = -1;
      for (var a = 0; a < n; a++) {
        if (!alive[a]) continue;
        for (var b = a + 1; b < n; b++) {
          if (!alive[b]) continue;
          if (cd[a][b] < best) { best = cd[a][b]; bi = a; bj = b; }
        }
      }
      if (bi < 0) break;
      var A = orders[bi], B = orders[bj];
      var rA = A.slice().reverse(), rB = B.slice().reverse();
      var candidates = [[A, B], [A, rB], [rA, B], [rA, rB]];
      var chosen = candidates[0], chosenD = Infinity;
      candidates.forEach(function (pair) {
        var d = endDist(pair[0], pair[1]);
        if (d < chosenD) { chosenD = d; chosen = pair; }
      });
      orders[bi] = chosen[0].concat(chosen[1]);
      var oldSize = sizes[bi];
      sizes[bi] += sizes[bj];
      alive[bj] = false;
      for (var k = 0; k < n; k++) {
        if (!alive[k] || k === bi) continue;
        var nd = (oldSize * cd[bi][k] + sizes[bj] * cd[bj][k]) / (oldSize + sizes[bj]);
        cd[bi][k] = nd;
        cd[k][bi] = nd;
      }
    }
    for (var f = 0; f < n; f++) if (alive[f]) return orders[f];
    return range(n);
  }

  function similarityMatrix(vectors) {
    var n = vectors.length, m = [];
    for (var i = 0; i < n; i++) {
      m.push([]);
      for (var j = 0; j < n; j++) m[i].push(i === j ? 100 : similarity(vectors[i], vectors[j]));
    }
    return m;
  }

  // Mudança por pessoa entre anos consecutivos em que ela tem resultado.
  // resultsByYear: { ano: vetor }. Devolve [{ from, to, delta: [...], distance }].
  function yearlyChanges(resultsByYear) {
    var years = Object.keys(resultsByYear).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 1; i < years.length; i++) {
      var a = resultsByYear[years[i - 1]], b = resultsByYear[years[i]];
      out.push({
        from: years[i - 1], to: years[i],
        delta: b.map(function (v, j) { return v - a[j]; }),
        distance: euclid(a, b)
      });
    }
    return out;
  }

  function round(v, d) {
    var f = Math.pow(10, d || 0);
    return Math.round(v * f) / f;
  }

  // ---------- Eixos compostos e lado econômico ----------
  // Um composto é a média de alguns eixos, cada um lido na direção indicada:
  // sign +1 usa o % do polo esquerdo; sign −1 usa o % do polo direito.
  // O valor resultante é o % do "polo esquerdo" do composto (leftPole).
  var COMPOSITES = [
    {
      id: 'economia', name: 'Economia (composto)', leftPole: 'Esquerda econômica', rightPole: 'Direita econômica',
      quadLeft: 'Esquerda', quadRight: 'Direita', tickLeft: 'Esquerda', tickRight: 'Direita',
      parts: [{ key: 'economia', sign: 1 }, { key: 'controle', sign: 1 }],
      description: 'média de Público↔Privado e Planejamento↔Livre mercado'
    },
    {
      id: 'costumes', name: 'Costumes (composto)', leftPole: 'Conservador', rightPole: 'Progressista',
      quadLeft: 'conservadora', quadRight: 'progressista',
      parts: [{ key: 'moral', sign: -1 }, { key: 'religiao', sign: -1 }, { key: 'imigracao', sign: 1 }],
      description: 'média de Tradicionalista, Religioso e Assimilação'
    },
    {
      id: 'autoridade', name: 'Autoridade (composto)', leftPole: 'Autoritário', rightPole: 'Libertário',
      quadLeft: 'autoritária', quadRight: 'libertária',
      parts: [{ key: 'representacao', sign: -1 }, { key: 'poder', sign: 1 }],
      description: 'média de Autocracia e Segurança'
    }
  ];

  function composite(vec, keys, def) {
    var s = 0, n = 0;
    def.parts.forEach(function (p) {
      var i = keys.indexOf(p.key);
      if (i < 0) return;
      s += p.sign > 0 ? vec[i] : 100 - vec[i];
      n++;
    });
    return n ? s / n : null;
  }

  var SIDES = {
    'left-radical': { key: 'left-radical', label: 'Esquerda radical', color: '#c0392b', order: 0 },
    'left': { key: 'left', label: 'Esquerda', color: '#e34948', order: 1 },
    'center': { key: 'center', label: 'Centro', color: '#8a8a84', order: 2 },
    'right': { key: 'right', label: 'Direita', color: '#2a78d6', order: 3 },
    'right-radical': { key: 'right-radical', label: 'Direita radical', color: '#1c5cab', order: 4 }
  };

  // Lado econômico pelo composto Economia, com as mesmas faixas da intensidade:
  // |v − 50| < 7,5 = Centro; ≥ 37,5 = radical.
  function economicSide(vec, keys) {
    var v = composite(vec, keys, COMPOSITES[0]);
    if (v === null) return SIDES.center;
    var d = v - CENTER;
    if (Math.abs(d) < 7.5) return SIDES.center;
    if (d > 0) return Math.abs(d) >= 37.5 ? SIDES['left-radical'] : SIDES.left;
    return Math.abs(d) >= 37.5 ? SIDES['right-radical'] : SIDES.right;
  }

  // Distância média por eixo (RMS): euclidiana / sqrt(n), em pontos de 0 a 100.
  function rmsDistance(a, b) {
    return euclid(a, b) / Math.sqrt(a.length);
  }

  global.Stats = {
    CENTER: CENTER,
    axisKeys: axisKeys,
    toVector: toVector,
    centered: centered,
    magnitude: magnitude,
    euclid: euclid,
    maxDistance: maxDistance,
    similarity: similarity,
    similarityMatrix: similarityMatrix,
    meanVector: meanVector,
    sdVector: sdVector,
    minMaxVector: minMaxVector,
    mean: mean,
    intensity: intensity,
    dominantPole: dominantPole,
    dominantPercent: dominantPercent,
    pca: pca,
    pcaProject: pcaProject,
    clusterOrder: clusterOrder,
    yearlyChanges: yearlyChanges,
    round: round,
    COMPOSITES: COMPOSITES,
    SIDES: SIDES,
    composite: composite,
    economicSide: economicSide,
    rmsDistance: rmsDistance
  };
})(window);
