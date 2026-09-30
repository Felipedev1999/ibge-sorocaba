/*
  js/auth.js — senha de entrada do painel.

  O painel só é desenhado depois da senha certa. Guardamos apenas o hash
  SHA-256 da senha (nunca a senha em texto). Para trocar a senha, gere o hash
  da nova e substitua PASSWORD_SHA256:
    node -e "console.log(require('crypto').createHash('sha256').update('NOVA','utf8').digest('hex'))"

  Importante: isto é uma porta, não um cofre. Quem abrir data/data.js
  diretamente (no disco ou no repositório) vê os dados. Para proteção real,
  os dados precisariam ser criptografados.

  O SHA-256 é calculado em JavaScript puro para funcionar também em file://,
  onde nem todo navegador expõe crypto.subtle.
*/
(function (global) {
  'use strict';

  var PASSWORD_SHA256 = '31297a479f458a70c5157569003736729d030bde039309f56ad6e4a3c2b9dfc7';
  var KEY = 'painel12.auth';

  // SHA-256 (FIPS 180-4) sobre UTF-8, saída em hex.
  function sha256(str) {
    var bytes = unescape(encodeURIComponent(str)).split('').map(function (c) { return c.charCodeAt(0); });
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? 0 : (l >>> (s * 8)) & 0xff);
    var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (var i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function stored() {
    try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(persist) {
    try { (persist ? localStorage : sessionStorage).setItem(KEY, PASSWORD_SHA256); } catch (e) { /* sem storage: pede de novo na próxima vez */ }
  }
  function forget() {
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) { /* nada */ }
  }

  function isUnlocked() { return stored() === PASSWORD_SHA256; }

  // Mostra a tela de senha e chama `onOk` quando a senha estiver certa.
  function whenUnlocked(onOk) {
    if (isUnlocked()) { onOk(); return; }
    var gate = document.createElement('div');
    gate.className = 'gate';
    gate.innerHTML =
      '<form class="gate-card" autocomplete="off">' +
      '<div class="logo"><b>12</b><span>eixos</span></div>' +
      '<p class="eyebrow">Painel do grupo</p>' +
      '<h1>Acesso <em>restrito</em></h1>' +
      '<p class="lead">Digite a senha para abrir o painel.</p>' +
      '<label class="gate-field"><span>Senha</span><input type="password" name="pw" autocomplete="current-password" required aria-label="Senha"></label>' +
      '<label class="toggle"><input type="checkbox" name="keep" checked><span>Lembrar neste dispositivo</span></label>' +
      '<p class="gate-error" role="alert" hidden>Senha incorreta.</p>' +
      '<button type="submit" class="btn btn-primary">Entrar</button>' +
      '</form>';
    document.body.appendChild(gate);
    document.body.classList.add('locked');
    var form = gate.querySelector('form');
    var input = gate.querySelector('input[name=pw]');
    var err = gate.querySelector('.gate-error');
    setTimeout(function () { input.focus(); }, 30);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sha256(input.value) === PASSWORD_SHA256) {
        remember(gate.querySelector('input[name=keep]').checked);
        gate.remove();
        document.body.classList.remove('locked');
        onOk();
      } else {
        err.hidden = false;
        input.value = '';
        input.focus();
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      }
    });
  }

  function lock() { forget(); location.reload(); }

  global.Auth = { whenUnlocked: whenUnlocked, lock: lock, isUnlocked: isUnlocked, sha256: sha256 };
})(window);
