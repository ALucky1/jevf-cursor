/*!
 * jefe-cursor v1.0.0 — a custom cursor that talks back when you click.
 * MIT License. https://github.com/ALucky1/jefe-cursor
 *
 * Drop-in usage:
 *   <script src="jefe-cursor.js" data-jefe-auto></script>
 *
 * Manual usage:
 *   <script src="jefe-cursor.js"></script>
 *   <script>JefeCursor.init({ volume: 0.6 });</script>
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JefeCursor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STYLE_ID = 'jefe-cursor-style';
  var HTML_CLASS = 'jefe-cursor-on';
  var STORE_KEY = 'jefe-cursor:muted';

  var defaults = {
    // Where the art lives. Paths are resolved against the page, not this script.
    image: 'cursor/cursor.png',
    image2x: 'cursor/cursor@2x.png',
    // Hotspot: the pixel inside the 1x image that is "the point of the arrow".
    // [16, 0] is the tip of the left antenna.
    hotspot: [16, 0],
    // Sound sources, best format first. The browser picks the first it can decode.
    sound: ['cursor/click.mp3', 'cursor/click.ogg'],
    volume: 0.7,
    // What happens when you click again while the sound is still playing:
    //   'restart' — cut it off and start over (default, keeps clicking snappy)
    //   'overlap' — let them stack on top of each other
    //   'ignore'  — let the current one finish, drop the new click
    retrigger: 'restart',
    // Which mouse buttons make noise. 0 = left, 1 = middle, 2 = right.
    buttons: [0],
    // Cursor art on touch screens is pointless, and surprise audio is rude there.
    requireFinePointer: true,
    // Leave text inputs alone so people can still see where they are typing.
    preserveTextCursor: true,
    // Inject a small speaker button so visitors can shut it up.
    toggleButton: false,
    toggleButtonLabel: 'sound',
    // Remember the mute choice across page loads.
    persistMute: true,
    onReady: null
  };

  var cfg = null;
  var ctx = null;          // AudioContext, created lazily on first gesture
  var buffer = null;       // decoded click, shared by every playback
  var active = [];         // currently-playing sources, for 'restart'/'ignore'
  var fallbackAudio = null;// <audio> path when Web Audio is unavailable
  var muted = false;
  var started = false;
  var decodeFailed = false;

  function supportsFinePointer() {
    return !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
  }

  function readStoredMute() {
    try {
      return window.localStorage.getItem(STORE_KEY) === '1';
    } catch (e) {
      return false; // private mode, blocked storage — just default to audible
    }
  }

  function writeStoredMute(value) {
    try {
      window.localStorage.setItem(STORE_KEY, value ? '1' : '0');
    } catch (e) { /* not worth breaking the cursor over */ }
  }

  function cssUrl(path) {
    return 'url("' + String(path).replace(/"/g, '\\"') + '")';
  }

  function injectStyle() {
    var prev = document.getElementById(STYLE_ID);
    if (prev) prev.parentNode.removeChild(prev);

    var hx = cfg.hotspot[0];
    var hy = cfg.hotspot[1];
    var one = cssUrl(cfg.image);
    var two = cfg.image2x ? cssUrl(cfg.image2x) : null;
    var point = ' ' + hx + ' ' + hy + ', auto';

    // Three declarations, weakest first. Browsers keep the last one they parse,
    // so old engines land on the plain url() and modern ones get the 2x art.
    var decls = ['cursor: ' + one + point + ';'];
    if (two) {
      var set = one + ' 1x, ' + two + ' 2x';
      decls.push('cursor: -webkit-image-set(' + set + ')' + point + ';');
      decls.push('cursor: image-set(' + set + ')' + point + ';');
    }
    var rule = decls.join(' ');

    var css =
      'html.' + HTML_CLASS + ', html.' + HTML_CLASS + ' * { ' + rule + ' }';

    if (cfg.preserveTextCursor) {
      css += '\nhtml.' + HTML_CLASS + ' input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]),' +
             ' html.' + HTML_CLASS + ' textarea,' +
             ' html.' + HTML_CLASS + ' [contenteditable="true"] { cursor: text; }';
    }

    css += '\n.jefe-cursor-toggle{position:fixed;right:14px;bottom:14px;z-index:2147483000;' +
           'font:600 12px/1 ui-sans-serif,system-ui,-apple-system,sans-serif;letter-spacing:.06em;' +
           'text-transform:uppercase;padding:8px 12px;border-radius:999px;' +
           'background:rgba(20,19,23,.82);color:#f4ece0;border:1px solid rgba(244,236,224,.22);' +
           'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}' +
           '\n.jefe-cursor-toggle[aria-pressed="true"]{opacity:.55;}' +
           '\n@media (prefers-reduced-motion: reduce){.jefe-cursor-toggle{transition:none}}';

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(el);
  }

  function pickSound() {
    var list = Array.isArray(cfg.sound) ? cfg.sound : [cfg.sound];
    if (!list.length) return null;
    var probe = document.createElement('audio');
    if (!probe.canPlayType) return list[0];
    for (var i = 0; i < list.length; i++) {
      var src = list[i];
      var type = /\.mp3($|\?)/i.test(src) ? 'audio/mpeg'
               : /\.ogg($|\?)/i.test(src) ? 'audio/ogg'
               : /\.wav($|\?)/i.test(src) ? 'audio/wav'
               : /\.m4a($|\?)/i.test(src) ? 'audio/mp4'
               : '';
      if (!type || probe.canPlayType(type)) return src;
    }
    return list[0];
  }

  function ensureContext() {
    if (ctx || decodeFailed) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { decodeFailed = true; return; }
    try {
      ctx = new AC();
    } catch (e) {
      decodeFailed = true;
    }
  }

  function loadBuffer() {
    if (!ctx || buffer || decodeFailed) return Promise.resolve();
    var src = pickSound();
    if (!src) { decodeFailed = true; return Promise.resolve(); }
    return fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + src);
        return r.arrayBuffer();
      })
      .then(function (bytes) {
        return new Promise(function (resolve, reject) {
          // Safari still wants the callback form of decodeAudioData.
          var ret = ctx.decodeAudioData(bytes, resolve, reject);
          if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
        });
      })
      .then(function (decoded) { buffer = decoded; })
      .catch(function (err) {
        decodeFailed = true;
        if (window.console) console.warn('[jefe-cursor] falling back to <audio>:', err.message);
      });
  }

  function playViaFallback() {
    var src = pickSound();
    if (!src) return;
    if (cfg.retrigger === 'overlap') {
      var once = new Audio(src);
      once.volume = cfg.volume;
      once.play().catch(function () {});
      return;
    }
    if (!fallbackAudio) {
      fallbackAudio = new Audio(src);
      fallbackAudio.preload = 'auto';
    }
    fallbackAudio.volume = cfg.volume;
    if (cfg.retrigger === 'ignore' && !fallbackAudio.paused) return;
    try { fallbackAudio.currentTime = 0; } catch (e) { /* not seekable yet */ }
    fallbackAudio.play().catch(function () {});
  }

  function play() {
    if (muted) return;

    if (decodeFailed || !window.AudioContext && !window.webkitAudioContext) {
      playViaFallback();
      return;
    }

    ensureContext();
    if (!ctx) { playViaFallback(); return; }

    // A click is a user gesture, so this is the moment we are allowed to start.
    if (ctx.state === 'suspended') ctx.resume();

    if (!buffer) {
      // First click of the page: kick off the load, and take the <audio> path
      // this once so the very first click is not silent.
      loadBuffer();
      playViaFallback();
      return;
    }

    if (cfg.retrigger === 'ignore' && active.length) return;
    if (cfg.retrigger === 'restart') stopAll();

    var source = ctx.createBufferSource();
    var gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = cfg.volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = function () {
      var i = active.indexOf(source);
      if (i > -1) active.splice(i, 1);
    };
    active.push(source);
    source.start(0);
  }

  function stopAll() {
    for (var i = active.length - 1; i >= 0; i--) {
      try { active[i].stop(0); } catch (e) { /* already finished */ }
    }
    active.length = 0;
    if (fallbackAudio && !fallbackAudio.paused) {
      fallbackAudio.pause();
      try { fallbackAudio.currentTime = 0; } catch (e) {}
    }
  }

  function onPointerDown(e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    if (cfg.buttons.indexOf(e.button) === -1) return;
    play();
  }

  function buildToggle() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jefe-cursor-toggle';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Toggle click sound');
    btn.textContent = (muted ? '🔇 ' : '🔊 ') + cfg.toggleButtonLabel;
    btn.addEventListener('click', function () {
      api.toggle();
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.textContent = (muted ? '🔇 ' : '🔊 ') + cfg.toggleButtonLabel;
    });
    document.body.appendChild(btn);
    return btn;
  }

  var api = {
    init: function (options) {
      if (started) return api;
      cfg = {};
      for (var k in defaults) if (Object.prototype.hasOwnProperty.call(defaults, k)) cfg[k] = defaults[k];
      for (var o in (options || {})) if (Object.prototype.hasOwnProperty.call(options, o)) cfg[o] = options[o];

      if (cfg.requireFinePointer && !supportsFinePointer()) return api;

      started = true;
      muted = cfg.persistMute ? readStoredMute() : false;

      var boot = function () {
        injectStyle();
        document.documentElement.classList.add(HTML_CLASS);
        document.addEventListener('pointerdown', onPointerDown, true);
        if (cfg.toggleButton) buildToggle();
        if (typeof cfg.onReady === 'function') cfg.onReady(api);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        boot();
      }
      return api;
    },

    destroy: function () {
      if (!started) return api;
      stopAll();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.documentElement.classList.remove(HTML_CLASS);
      var style = document.getElementById(STYLE_ID);
      if (style) style.parentNode.removeChild(style);
      var btn = document.querySelector('.jefe-cursor-toggle');
      if (btn) btn.parentNode.removeChild(btn);
      started = false;
      return api;
    },

    play: play,
    mute: function () { muted = true; stopAll(); if (cfg && cfg.persistMute) writeStoredMute(true); return api; },
    unmute: function () { muted = false; if (cfg && cfg.persistMute) writeStoredMute(false); return api; },
    toggle: function () { return muted ? api.unmute() : api.mute(); },
    isMuted: function () { return muted; },
    setVolume: function (v) { if (cfg) cfg.volume = Math.max(0, Math.min(1, v)); return api; },
    version: '1.0.0'
  };

  // data-jefe-auto on the <script> tag boots it with zero extra code.
  var self_script = document.currentScript;
  if (self_script && self_script.hasAttribute('data-jefe-auto')) {
    var opts = {};
    var base = self_script.getAttribute('data-base');
    if (base) {
      var b = base.replace(/\/+$/, '') + '/';
      opts.image = b + 'cursor.png';
      opts.image2x = b + 'cursor@2x.png';
      opts.sound = [b + 'click.mp3', b + 'click.ogg'];
    }
    var vol = self_script.getAttribute('data-volume');
    if (vol) opts.volume = parseFloat(vol);
    var rt = self_script.getAttribute('data-retrigger');
    if (rt) opts.retrigger = rt;
    if (self_script.hasAttribute('data-toggle-button')) opts.toggleButton = true;
    api.init(opts);
  }

  return api;
});
