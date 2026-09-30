/*
  js/avatars.js — avatares das pessoas (foto ou iniciais).

  Foto: DATA.people[].photo, caminho relativo à pasta data/ (ex.: "photos/p01.jpg").
  Sem foto, ou se a imagem falhar, o avatar mostra as iniciais sobre a cor da
  pessoa. O anel colorido usa sempre a cor fixa da pessoa.

  Tudo em HTML/CSS: nada passa por canvas, para funcionar em file:// (o Chrome
  bloqueia a leitura de canvas com imagens locais). Nos gráficos ECharts, os
  avatares são uma camada HTML posicionada sobre o canvas (ver Charts).
*/
(function (global) {
  'use strict';

  var BASE = 'data/';

  function url(person) {
    if (!person || !person.photo) return null;
    var p = String(person.photo).trim();
    if (!p) return null;
    if (/^(https?:|data:|file:|\/)/i.test(p)) return p;
    return BASE + p.replace(/^\.?\//, '');
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Cria o elemento do avatar. size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  // opts: { color, label (nome para iniciais/alt), title }
  function el(person, size, opts) {
    opts = opts || {};
    var color = opts.color || person.color || '#8a8a84';
    var label = opts.label || person.alias || person.name || person.id;
    var node = document.createElement('span');
    node.className = 'avatar avatar-' + (size || 'md');
    node.style.setProperty('--ring', color);
    if (opts.title !== false) node.title = opts.title || label;
    node.setAttribute('aria-label', label);
    var src = url(person);
    if (src) {
      var img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = src;
      img.addEventListener('error', function () {
        node.textContent = initials(label);
      });
      node.appendChild(img);
    } else {
      node.textContent = initials(label);
    }
    return node;
  }

  function hasAny(people) {
    return (people || []).some(function (p) { return !!url(p); });
  }

  global.Avatars = { url: url, initials: initials, el: el, hasAny: hasAny };
})(window);
