/*
  js/filters.js — filtros de pessoas.

  Estado de filtro (fstate):
    {
      mode: 'all' | 'selected' | 'attr',
      selected: ['p01', 'p03'],            // usado no modo 'selected'
      attrs: {                             // usado nos modos 'selected' e 'attr'
        gender: ['Homem'],                 // categoria: lista de valores aceitos
        age: { min: 25, max: 35 }          // número: intervalo fechado
      }
    }

  Regras
  - 'all': ninguém é filtrado.
  - 'attr': só os filtros por atributo se aplicam.
  - 'selected': seleção manual E filtros por atributo (interseção).
  - Pessoa sem valor no atributo filtrado só entra se o filtro de categoria
    incluir o marcador NONE ("(sem valor)"). Em intervalos numéricos ela sai.
  - Atributos vêm de DATA.attributeDefs. "Idade" é derivada e aparece sozinha
    quando alguém tem attrs.birthYear (idade = ano − birthYear) ou attrs.ageAt,
    a idade informada em um ano: { "2026": 26 } → 26 em 2026, 27 em 2027...
*/
(function (global) {
  'use strict';

  var NONE = '__none__';
  var NONE_LABEL = '(sem valor)';

  function attributeDefs(data) {
    var defs = (data.attributeDefs || []).map(function (d) {
      return {
        key: d.key, label: d.label || d.key, type: d.type === 'number' ? 'number' : 'category',
        values: Array.isArray(d.values) ? d.values.slice() : null, derived: false
      };
    });
    var hasBirth = defs.some(function (d) { return d.key === 'birthYear' && d.type === 'number'; }) ||
      (data.people || []).some(function (p) { return p.attrs && p.attrs.birthYear !== undefined && p.attrs.birthYear !== null && p.attrs.birthYear !== ''; });
    var hasAgeAt = (data.people || []).some(function (p) { return p.attrs && p.attrs.ageAt && typeof p.attrs.ageAt === 'object' && Object.keys(p.attrs.ageAt).length; });
    var hasAge = defs.some(function (d) { return d.key === 'age'; });
    if ((hasBirth || hasAgeAt) && !hasAge) {
      defs.push({ key: 'age', label: 'Idade', type: 'number', values: null, derived: true });
    }
    return defs;
  }

  function defByKey(data, key) {
    return attributeDefs(data).filter(function (d) { return d.key === key; })[0] || null;
  }

  // Valor do atributo para uma pessoa. `year` é necessário para a idade.
  function attrValue(person, def, year) {
    var attrs = (person && person.attrs) || {};
    if (def.derived && def.key === 'age') {
      if (year === undefined || year === null) return null;
      var by = attrs.birthYear;
      if (by !== undefined && by !== null && by !== '') return Number(year) - Number(by);
      if (attrs.ageAt && typeof attrs.ageAt === 'object') {
        var refs = Object.keys(attrs.ageAt).map(Number).filter(function (y) { return isFinite(y) && isFinite(Number(attrs.ageAt[y])); });
        if (!refs.length) return null;
        refs.sort(function (a, b) { return Math.abs(a - year) - Math.abs(b - year); });
        return Number(attrs.ageAt[refs[0]]) + (Number(year) - refs[0]);
      }
      return null;
    }
    var v = attrs[def.key];
    if (v === undefined || v === null || v === '') return null;
    return def.type === 'number' ? Number(v) : String(v);
  }

  // Valores possíveis de uma categoria: os declarados em `values` primeiro,
  // depois os observados nas pessoas (ordem alfabética).
  function categoryValues(data, def) {
    var out = (def.values || []).slice();
    var seen = {};
    out.forEach(function (v) { seen[v] = true; });
    var extra = [];
    (data.people || []).forEach(function (p) {
      var v = attrValue(p, def, null);
      if (v !== null && !seen[v]) { seen[v] = true; extra.push(v); }
    });
    extra.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
    return out.concat(extra);
  }

  function hasMissing(data, def, year) {
    return (data.people || []).some(function (p) { return attrValue(p, def, year) === null; });
  }

  function numericRange(data, def, year) {
    var mn = Infinity, mx = -Infinity;
    (data.people || []).forEach(function (p) {
      var v = attrValue(p, def, year);
      if (v === null || !isFinite(v)) return;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    });
    if (mn === Infinity) return null;
    return { min: mn, max: mx };
  }

  function defaultState() {
    return { mode: 'all', selected: [], attrs: {} };
  }

  function attrFilterActive(fstate, key) {
    var f = fstate.attrs && fstate.attrs[key];
    if (!f) return false;
    if (Array.isArray(f)) return f.length > 0;
    return (f.min !== undefined && f.min !== null && f.min !== '') ||
           (f.max !== undefined && f.max !== null && f.max !== '');
  }

  function matchesAttrs(person, defs, fstate, year) {
    for (var i = 0; i < defs.length; i++) {
      var def = defs[i];
      if (!attrFilterActive(fstate, def.key)) continue;
      var f = fstate.attrs[def.key];
      var v = attrValue(person, def, year);
      if (def.type === 'category') {
        var allowed = f.map(String);
        if (v === null) { if (allowed.indexOf(NONE) < 0) return false; }
        else if (allowed.indexOf(String(v)) < 0) return false;
      } else {
        if (v === null) return false;
        if (f.min !== undefined && f.min !== null && f.min !== '' && v < Number(f.min)) return false;
        if (f.max !== undefined && f.max !== null && f.max !== '' && v > Number(f.max)) return false;
      }
    }
    return true;
  }

  // Aplica o filtro sobre `base` (pessoas com resultado no ano).
  function apply(data, year, fstate, base) {
    var defs = attributeDefs(data);
    var mode = fstate.mode || 'all';
    return base.filter(function (p) {
      if (mode === 'all') return true;
      if (mode === 'selected' && (fstate.selected || []).indexOf(p.id) < 0) return false;
      return matchesAttrs(p, defs, fstate, year);
    });
  }

  // Chips descritivos dos filtros ativos, para exibição/remoção.
  // Cada chip: { kind: 'mode'|'attr', key, label }
  function chips(data, fstate) {
    var out = [];
    var mode = fstate.mode || 'all';
    if (mode === 'selected') {
      out.push({ kind: 'mode', key: 'selected', label: 'Seleção manual: ' + (fstate.selected || []).length + ' pessoa(s)' });
    }
    if (mode !== 'all') {
      attributeDefs(data).forEach(function (def) {
        if (!attrFilterActive(fstate, def.key)) return;
        var f = fstate.attrs[def.key], text;
        if (def.type === 'category') {
          text = f.map(function (v) { return v === NONE ? NONE_LABEL : v; }).join(', ');
        } else {
          var lo = (f.min === undefined || f.min === null || f.min === '') ? null : f.min;
          var hi = (f.max === undefined || f.max === null || f.max === '') ? null : f.max;
          text = lo !== null && hi !== null ? lo + ' a ' + hi : lo !== null ? 'a partir de ' + lo : 'até ' + hi;
        }
        out.push({ kind: 'attr', key: def.key, label: def.label + ': ' + text });
      });
    }
    return out;
  }

  function isActive(fstate) {
    if ((fstate.mode || 'all') === 'all') return false;
    if (fstate.mode === 'selected') return true;
    return Object.keys(fstate.attrs || {}).some(function (k) { return attrFilterActive(fstate, k); });
  }

  // ---------- serialização para a URL (hash) ----------
  // fm=selected&sel=p01.p02&a_gender=Homem|Mulher&a_age=25-35

  function serialize(fstate) {
    var params = {};
    if (fstate.mode && fstate.mode !== 'all') params.fm = fstate.mode;
    if (fstate.selected && fstate.selected.length) params.sel = fstate.selected.join('.');
    Object.keys(fstate.attrs || {}).forEach(function (key) {
      if (!attrFilterActive(fstate, key)) return;
      var f = fstate.attrs[key];
      if (Array.isArray(f)) params['a_' + key] = f.join('|');
      else params['a_' + key] = (f.min === undefined || f.min === null ? '' : f.min) + '~' + (f.max === undefined || f.max === null ? '' : f.max);
    });
    return params;
  }

  function parse(params, data) {
    var fstate = defaultState();
    if (params.fm === 'selected' || params.fm === 'attr') fstate.mode = params.fm;
    if (params.sel) fstate.selected = params.sel.split('.').filter(Boolean);
    var defs = attributeDefs(data);
    Object.keys(params).forEach(function (k) {
      if (k.indexOf('a_') !== 0) return;
      var key = k.slice(2);
      var def = defs.filter(function (d) { return d.key === key; })[0];
      if (!def) return;
      var raw = params[k];
      if (def.type === 'category') {
        fstate.attrs[key] = raw.split('|').filter(function (s) { return s !== ''; });
      } else {
        var parts = raw.split('~');
        var f = {};
        if (parts[0] !== '' && isFinite(Number(parts[0]))) f.min = Number(parts[0]);
        if (parts[1] !== undefined && parts[1] !== '' && isFinite(Number(parts[1]))) f.max = Number(parts[1]);
        if (f.min !== undefined || f.max !== undefined) fstate.attrs[key] = f;
      }
    });
    return fstate;
  }

  global.Filters = {
    NONE: NONE,
    NONE_LABEL: NONE_LABEL,
    attributeDefs: attributeDefs,
    defByKey: defByKey,
    attrValue: attrValue,
    categoryValues: categoryValues,
    hasMissing: hasMissing,
    numericRange: numericRange,
    defaultState: defaultState,
    attrFilterActive: attrFilterActive,
    apply: apply,
    chips: chips,
    isActive: isActive,
    serialize: serialize,
    parse: parse
  };
})(window);
