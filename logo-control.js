/* Camp Office — one shared "Print logos" control for the portal and every system on this domain.
   Two separate switches:  govt = Government of the Punjab logo,  pros = Public Prosecution Punjab logo.
   Effect: print, PDF, Word, Excel and pay-slip outputs follow these switches.
   - Everyone can change it for themselves (remembered in this browser).
   - Admin / Super Admin can press "Save for everyone" (stored in Firestore: siteContent/printLogos,
     an existing collection, so no change in security rules is needed).
   Pages use:  CampLogos.show('govt')  /  CampLogos.show('pros')  (true = print it).
   Safe by design: if this file is missing, pages fall back to "Punjab logo on, Prosecution logo off". */
(function () {
  if (window.CampLogos) return;
  var KEY = 'campLogosLocal';
  var DEFAULT = { govt: true, pros: false };
  var shared = null, superOk = false, draft = null, subs = [];

  /* Only the saved (shared) choice counts: nobody can change the logos on their own screen.
     The switches live on the Super Admin's Maintenance page. */
  try { localStorage.removeItem('campLogosLocal'); } catch (e) {}
  function eff() {
    var o = { govt: DEFAULT.govt, pros: DEFAULT.pros };
    if (shared) {
      if (typeof shared.govt === 'boolean') o.govt = shared.govt;
      if (typeof shared.pros === 'boolean') o.pros = shared.pros;
    }
    return o;
  }

  var PROS_SRC = 'logo-public-prosecution.png';
  /* where each print "letterhead" lives on the pages (the Prosecution logo is added at the right end when switched on) */
  /* [selector, mode]  append = add at the end;  row = stacked logo row (Punjab logo left, Prosecution logo right);
     lhrow = Case Notice letterhead row (logo, heading, then Prosecution logo in place of the empty spacer) */
  var MASTHEADS = [['.pb-print-masthead', 'append'], ['.print-masthead', 'append'], ['.ps-top', 'append'],
                   ['.print-sheet .p-logo', 'row'], ['.roster-sheet .p-logo', 'row'], ['.notice-sheet .lh-row', 'lhrow'], ['#printArea .pa-lh', 'append'], ['.print-sheet .p-lh-sp', 'append']];

  function css() {
    var s = document.createElement('style');
    s.id = 'campLogosCss';
    s.textContent =
      '@media print{html.camp-nologo-govt img[src*="logo-punjab-govt"],html.camp-nologo-pros img[src*="logo-public-prosecution"]{display:none!important}' +
      'html.camp-nologo-govt [data-camp-logo="govt"],html.camp-nologo-pros [data-camp-logo="pros"]{display:none!important}' +
      '#campLogosMount{display:none!important}}' +
      /* on-screen logos (top bar, side menu, sign-in seal) follow the switches too */
      'html.camp-scr-nologo-govt img[src*="logo-punjab-govt"]:not(.camp-pros-print),html.camp-scr-nologo-pros img[src*="logo-public-prosecution"]:not(.camp-pros-print){display:none!important}' +
      /* on-screen copies that exist only to preview a printout (pay slip etc.) follow the switch too */
      'html.camp-nologo-govt [data-camp-logo="govt"],html.camp-nologo-pros [data-camp-logo="pros"]{display:none!important}' +
      'img.camp-pros-print{height:56px;width:auto;margin-left:auto;flex:none;display:block}' +
      '.p-logo.camp-prow{display:flex!important;align-items:center;justify-content:space-between;width:auto!important;max-width:none!important;flex:none}' +
      '.p-logo.camp-prow>img:not(.camp-pros-print){margin:0!important}' +
      '.p-logo.camp-prow>img.camp-pros-print{height:52px;margin:0 0 0 auto!important}' +
      '.p-lh-sp>img.camp-pros-print{height:52px;width:auto;margin:0 0 0 auto;display:block}' +
      '#printArea .pa-lh>img.camp-pros-print{position:absolute;right:0;top:0;height:42px;margin:0}' +
      '.lh-row.camp-lhpros::after{display:none!important}.lh-row.camp-lhpros>img.camp-pros-print{flex:0 0 76px;height:60px;width:auto;max-width:76px;object-fit:contain;margin:0}' +
      '.ps-top img.camp-pros-print{display:block;position:absolute;right:0;top:0;height:60px;margin:0}.payslip-paper.rtl .ps-top img.camp-pros-print{right:auto;left:0}' +
      '#campLogosMount .cl-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(128,128,128,.3)}' +
      '#campLogosMount .cl-name b{display:block;font-size:14px}#campLogosMount .cl-name span{font-size:12px;opacity:.75}' +
      '#campLogosMount button.cl-sw{min-width:120px;white-space:nowrap;border:1px solid #153A5B;border-radius:8px;padding:8px 12px;font:600 13px system-ui,sans-serif;cursor:pointer;background:#153A5B;color:#fff}' +
      '#campLogosMount button.cl-sw.off{background:transparent;color:inherit;border-color:currentColor}' +
      '#campLogosMount .cl-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
      '#campLogosMount .cl-foot button{border:1px solid #b8860b;background:#fff8e1;color:#5c4400;border-radius:8px;padding:9px 14px;font:600 13px system-ui,sans-serif;cursor:pointer}' +
      '#campLogosMount .cl-msg{margin-top:8px;font-size:13px;min-height:18px;color:#2a7a2a}';
    document.head.appendChild(s);
  }

  /* browser-tab icon: the Punjab emblem is swapped for a plain "CO" icon while the Punjab logo is switched off */
  var NEUTRAL_ICON = 'data:image/png;base64,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';
  function syncFavicon() {
    var show = eff().govt, list = document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="shortcut icon"]');
    Array.prototype.forEach.call(list, function (l) {
      if (l.getAttribute('data-camp-orig') === null) l.setAttribute('data-camp-orig', l.getAttribute('href') || '');
      var want = show ? l.getAttribute('data-camp-orig') : NEUTRAL_ICON;
      if (l.getAttribute('href') !== want) l.setAttribute('href', want);
    });
  }

  function applyClasses() {
    var e = eff(), h = document.documentElement;
    h.classList.toggle('camp-nologo-govt', !e.govt);
    h.classList.toggle('camp-nologo-pros', !e.pros);
    h.classList.toggle('camp-scr-nologo-govt', !e.govt);   /* on-screen logos follow the switches exactly like the printouts */
    h.classList.toggle('camp-scr-nologo-pros', !e.pros);
    syncPros();
    syncFavicon();
    paint();
  }

  /* add / remove the Prosecution logo at the right end of every print letterhead */
  function syncPros() {
    var on = eff().pros;
    MASTHEADS.forEach(function (spec) {
      var sel = spec[0], mode = spec[1];
      var list = []; try { list = document.querySelectorAll(sel); } catch (e) {}
      Array.prototype.forEach.call(list, function (m) {
        if (m.closest && m.closest('#campLogosMount')) return;
        if (mode === 'row' && m.parentNode && m.parentNode.matches && m.parentNode.matches('.p-lh,.lh-row')) return;   /* letterhead rows that have their own right-hand spot */
        var has = m.querySelector(':scope > img.camp-pros-print');
        if (on && !has) {
          var i = document.createElement('img'); i.className = 'camp-pros-print'; i.setAttribute('data-camp-logo', 'pros');
          i.alt = 'Public Prosecution Punjab'; i.src = PROS_SRC;
          i.onerror = function () { i.src = '/camp-office-suite/' + PROS_SRC; i.onerror = null; };
          m.appendChild(i);
          if (mode === 'row') m.classList.add('camp-prow'); else if (mode === 'lhrow') m.classList.add('camp-lhpros');
        } else if (!on && has) {
          has.parentNode.removeChild(has);
          m.classList.remove('camp-prow'); m.classList.remove('camp-lhpros');
        }
      });
    });
  }

  function notify() { var e = eff(); subs.forEach(function (f) { try { f(e); } catch (x) {} }); }

  function T(en, ur) { var u = /^ur/i.test(document.documentElement.lang || '') || document.documentElement.dir === 'rtl'; return u ? ur : en; }
  var msg = '';
  /* the switches appear only inside <div id="campLogosMount"> (Maintenance page) and only for a Super Admin */
  function paint() {
    var host = document.getElementById('campLogosMount');
    if (!host) return;
    if (!superOk) { host.innerHTML = ''; return; }
    var cur = eff(), d = draft || { govt: cur.govt, pros: cur.pros };
    function row(k, en, ur, sub) {
      return '<div class="cl-row"><div class="cl-name"><b>' + en + ' &nbsp;|&nbsp; ' + ur + '</b><span>' + sub + '</span></div>' +
        '<button type="button" class="cl-sw ' + (d[k] ? '' : 'off') + '" data-k="' + k + '">' + (d[k] ? 'Shown / دکھایا' : 'Hidden / چھپایا') + '</button></div>';
    }
    var changed = d.govt !== cur.govt || d.pros !== cur.pros;
    host.innerHTML = row('govt', 'Punjab Govt logo', 'پنجاب حکومت کا لوگو', 'Whole portal: screen, print, PDF, Word, Excel, pay slip / پورا پورٹل: اسکرین، پرنٹ، پی ڈی ایف، ورڈ، ایکسل') +
      row('pros', 'Prosecution logo', 'پراسیکیوشن کا لوگو', 'Whole portal; in prints it sits at the right of the heading / پورا پورٹل؛ پرنٹ میں ہیڈنگ کے دائیں طرف') +
      '<div class="cl-foot"><button type="button" data-a="save"' + (changed ? '' : ' style="opacity:.55"') + '>Save for everyone<br>سب کے لیے محفوظ کریں</button></div>' +
      '<div class="cl-msg" role="status">' + (changed ? 'Not saved yet / ابھی محفوظ نہیں ہوا' : msg) + '</div>';
    Array.prototype.forEach.call(host.querySelectorAll('button.cl-sw'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k'), c2 = eff();
        draft = draft || { govt: c2.govt, pros: c2.pros };
        draft[k] = !draft[k]; msg = ''; paint();
      });
    });
    var sv = host.querySelector('[data-a="save"]');
    if (sv) sv.addEventListener('click', saveShared);
  }

  function fs() { try { return window.firebase && firebase.apps && firebase.apps.length && firebase.firestore ? firebase.firestore() : null; } catch (e) { return null; } }
  function saveShared() {
    var db = fs(); if (!db) { msg = 'No connection / رابطہ نہیں'; paint(); return; }
    var cur = eff(), e = draft || cur;
    db.collection('siteContent').doc('printLogos').set({ govt: e.govt, pros: e.pros, updatedAt: Date.now() }, { merge: true })
      .then(function () { shared = { govt: e.govt, pros: e.pros }; draft = null; msg = 'Saved for everyone / سب کے لیے محفوظ ہو گیا'; applyClasses(); notify(); })
      .catch(function () { msg = 'Not allowed / اجازت نہیں'; paint(); });
  }
  function connect() {
    var tries = 0;
    (function wait() {
      var db = fs();
      if (!db || !firebase.auth) { if (++tries < 60) setTimeout(wait, 500); return; }
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { superOk = false; paint(); return; }
        db.collection('siteContent').doc('printLogos').onSnapshot(function (s) {
          shared = s.exists ? s.data() : null; applyClasses(); notify();
        }, function () {});
        db.collection('users').doc(u.uid).get().then(function (s) {
          var d = s.exists ? s.data() : {}; superOk = d.roleV2 === 'super_admin'; paint();
        }).catch(function () {});
      });
    })();
  }

  window.CampLogos = {
    show: function (k) { return !!eff()[k === 'pros' || k === 'prosecution' ? 'pros' : 'govt']; },
    get: eff,
    onChange: function (f) { if (typeof f === 'function') subs.push(f); },
    refresh: syncPros,
    /* give every page a one-line way to ask for the logo file: returns bytes or null if the logo is switched off */
    /* {bytes, w, h} of the logo (PNG), or null when it is switched off / cannot be loaded */
    info: function (k) {
      var key = (k === 'pros' || k === 'prosecution') ? 'pros' : 'govt';
      if (!this.show(key)) return Promise.resolve(null);
      var file = key === 'pros' ? 'logo-public-prosecution.png' : 'logo-punjab-govt.png';
      function grab(u) { return fetch(u).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }); }
      return grab(file).then(function (b) { return b || grab('/camp-office-suite/' + file); }).then(function (b) {
        if (!b) return null;
        var u = new Uint8Array(b);
        if (u.length < 24 || u[1] !== 80 || u[2] !== 78 || u[3] !== 71) return null;
        var dv = new DataView(u.buffer, u.byteOffset, u.byteLength), w = dv.getUint32(16), h = dv.getUint32(20);
        return (w && h) ? { bytes: u, w: w, h: h } : null;
      });
    },
    bytes: function (k, src) {
      if (!this.show(k)) return Promise.resolve(null);
      return fetch(src || (k === 'pros' ? PROS_SRC : 'logo-punjab-govt.png')).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (b) { return b ? new Uint8Array(b) : null; }).catch(function () { return null; });
    }
  };

  function start() { css(); applyClasses(); paint(); connect();
    window.addEventListener('beforeprint', syncPros);
    try { var tm = 0; new MutationObserver(function () { if (!eff().pros && !document.querySelector('img.camp-pros-print')) return; clearTimeout(tm); tm = setTimeout(syncPros, 150); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
