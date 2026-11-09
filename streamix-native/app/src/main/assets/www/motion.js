/* =========================================================================
   STREAMIX — MOTEUR D'ANIMATION (v14)
   Splash, rideau de transition, ripple, reveal, retour haptique, toast.
   ========================================================================= */
(function () {
  'use strict';

  // La feuille de style ne cache les blocs que si ce script a bien démarré.
  document.documentElement.classList.add('mo');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var REDUCED = reduce;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, REDUCED ? 0 : ms); }); }

  /* ------------------------------------------------------------- RIPPLE */
  function ripple(e) {
    var el = e.currentTarget;
    if (!el || REDUCED) return;
    var r = el.getBoundingClientRect();
    var size = Math.max(r.width, r.height);
    var span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - r.left - size / 2) + 'px';
    span.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.appendChild(span);
    setTimeout(function () { span.remove(); }, 620);
  }

  function pressFeedback(e) {
    var el = e.currentTarget;
    if (!el || REDUCED) return;
    el.classList.add('press-down');
    setTimeout(function () { el.classList.remove('press-down'); }, 130);
  }

  function bindInteractions(root) {
    var sel = 'button, .whatsapp-buy, .tab-btn, .btn-primary, .admin-access-link, .close-modal, .close-admin';
    (root || document).querySelectorAll(sel).forEach(function (el) {
      if (el.dataset.motion) return;
      el.dataset.motion = '1';
      el.addEventListener('pointerdown', pressFeedback);
      el.addEventListener('pointerdown', ripple);
    });
  }

  /* Filet de sécurité : quoi qu'il arrive, l'écran devient visible. */
  function guard() {
    setTimeout(function () {
      var s = document.getElementById('splash');
      if (s && !s.classList.contains('splash-out')) {
        s.classList.add('splash-out');
        setTimeout(function () { s.style.display = 'none'; }, 700);
      }
      var lock = document.getElementById('lockScreen');
      if (lock) lock.classList.add('enter-run');
      document.documentElement.classList.add('enter-done');
    }, 3000);
  }

  /* -------------------------------------------------------------- SPLASH */
  function splash() {
    var el = document.getElementById('splash');
    guard();
    if (!el) { document.getElementById('lockScreen').classList.add('enter-run'); return Promise.resolve(); }
    var done = false;
    function finish() {
      if (done) return; done = true;
      el.classList.add('splash-out');
      document.getElementById('lockScreen').classList.add('enter-run');
      setTimeout(function () { el.style.display = 'none'; }, 700);
    }
    el.addEventListener('click', finish);
    var t = setTimeout(finish, 1250);
    el.addEventListener('click', function () { clearTimeout(t); });
    return wait(1300);
  }

  /* ------------------------------------------------------------- RIDEAU */
  var curtainEl = null;
  function curtain(text) {
    if (!curtainEl) {
      curtainEl = document.createElement('div');
      curtainEl.id = 'curtain';
      var logo = document.createElement('img');
      logo.className = 'c-logo';
      logo.src = 'logo-streamix-play.png';
      logo.alt = '';
      var bar = document.createElement('div');
      bar.className = 'c-bar';
      bar.appendChild(document.createElement('i'));
      var dots = document.createElement('div');
      dots.className = 'c-dots';
      for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
      var txt = document.createElement('div');
      txt.className = 'c-txt';
      txt.id = 'curtainText';
      curtainEl.appendChild(logo);
      curtainEl.appendChild(txt);
      curtainEl.appendChild(bar);
      curtainEl.appendChild(dots);
      document.body.appendChild(curtainEl);
    }
    var t = document.getElementById('curtainText');
    if (t) t.textContent = text || 'Préparation de ton catalogue…';
    curtainEl.classList.add('on');
    return wait(650);
  }
  function curtainOff() {
    if (curtainEl) curtainEl.classList.remove('on');
  }

  /* ------------------------------------------------------------- ENTRÉE */
  function enterScreens() {
    document.querySelectorAll('[data-enter]').forEach(function (el, i) {
      if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', 90 + i * 70);
    });
    var lock = document.getElementById('lockScreen');
    if (lock) lock.classList.add('enter-run');
  }

  /* --------------------------------------------------- FRAPPE AU CLAVIER */
  function bindTyping() {
    var input = document.getElementById('codeInput');
    var wrap = document.querySelector('.code-input-wrapper');
    if (!input || !wrap) return;
    input.addEventListener('input', function () {
      if (REDUCED) return;
      wrap.classList.remove('char-pop');
      void wrap.offsetWidth;
      wrap.classList.add('char-pop');
    });
    input.addEventListener('focus', function () {
      var card = document.querySelector('.code-card');
      if (card && !card.classList.contains('is-ok')) card.classList.add('focus-glow');
    });
    input.addEventListener('blur', function () {
      var card = document.querySelector('.code-card');
      if (card) card.classList.remove('focus-glow');
    });
  }

  /* ------------------------------------------------------------- BOUTON */
  function btnLoading(on, label) {
    var b = document.getElementById('unlockBtn');
    if (!b) return;
    var span = b.querySelector('span');
    if (on) {
      b.classList.add('btn-loading');
      if (span) span.textContent = 'VÉRIFICATION';
      if (!b.querySelector('.spin')) {
        var s = document.createElement('i');
        s.className = 'spin';
        b.appendChild(s);
      }
    } else {
      b.classList.remove('btn-loading');
      var sp = b.querySelector('.spin');
      if (sp) sp.remove();
      if (span) span.textContent = label != null ? label : 'ENTRER';
    }
  }

  function markSuccess() {
    var card = document.querySelector('.code-card');
    if (!card) return;
    card.classList.add('is-ok');
    if (!card.querySelector('.check-draw')) {
      var d = document.createElement('div');
      d.className = 'check-draw';
      d.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12.5l5.2 5.2L20 6.8"/></svg>';
      card.appendChild(d);
    }
    btnLoading(false, 'ACCÈS AUTORISÉ');
    if (navigator.vibrate) navigator.vibrate([18, 40, 18]);
  }

  function markError() {
    var card = document.querySelector('.code-card');
    if (!card) return;
    card.classList.remove('is-error');
    void card.offsetWidth;
    card.classList.add('is-error');
    setTimeout(function () { card.classList.remove('is-error'); }, 900);
    if (navigator.vibrate) navigator.vibrate(45);
  }

  /* -------------------------------------------------------------- TOAST */
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.style.cssText = 'position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#16161a;' +
        'color:#fff;padding:11px 20px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid #33333c;' +
        'z-index:9999;box-shadow:0 12px 30px rgba(0,0,0,.5)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    t.style.opacity = '1';
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    clearTimeout(t._h);
    t._h = setTimeout(function () {
      t.style.transition = 'opacity .3s ease,transform .3s ease';
      t.style.opacity = '0';
      t.style.transform = 'translate(-50%,12px)';
      setTimeout(function () { t.style.display = 'none'; t.style.transform = 'translateX(-50%)'; }, 320);
    }, ms || 2400);
  }

  /* --------------------------------------------------------- RÉVÉLATION */
  function revealAll() {
    document.querySelectorAll('[data-reveal]').forEach(function (el, i) {
      el.style.setProperty('--d', 60 + i * 55);
      el.classList.add('enter-run-el');
      el.style.animation = 'enterUp .5s var(--m-spring) both';
      el.style.animationDelay = (60 + i * 55) + 'ms';
    });
  }

  /* -------------------------------------------------------------- EXPORT */
  window.MOTION = {
    bind: bindInteractions,
    splash: splash,
    curtain: curtain,
    curtainOff: curtainOff,
    enter: enterScreens,
    btnLoading: btnLoading,
    success: markSuccess,
    error: markError,
    toast: toast,
    reveal: revealAll,
    wait: wait,
    reduced: REDUCED
  };

  /* ---------------------------------------------------------- DÉMARRAGE */
  document.addEventListener('DOMContentLoaded', function () {
    bindInteractions(document);
    bindTyping();
    splash().then(function () { enterScreens(); });
    // toute nouvelle modale ajoutée dynamiquement reçoit ses interactions
    new MutationObserver(function () { bindInteractions(document); })
      .observe(document.body, { childList: true, subtree: true });
  });
})();
