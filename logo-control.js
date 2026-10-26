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
  var shared = null, local = null, adminOk = false, subs = [];

  function readLocal() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return v; } catch (e) {}
    return null;
  }
  function writeLocal(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) {} }
  function eff() {
    var o = { govt: DEFAULT.govt, pros: DEFAULT.pros };
    [shared, local].forEach(function (s) {
      if (!s) return;
      if (typeof s.govt === 'boolean') o.govt = s.govt;
      if (typeof s.pros === 'boolean') o.pros = s.pros;
    });
    return o;
  }
  local = readLocal();

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
      '#campLogosChip,#campLogosPanel{display:none!important}}' +
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
      '#campLogosChip{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:2147483000;font:600 12px/1 system-ui,sans-serif;' +
      'background:#153A5B;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 12px;cursor:pointer;opacity:.82;box-shadow:0 2px 8px rgba(0,0,0,.3)}' +
      '#campLogosChip:hover,#campLogosChip:focus{opacity:1}' +
      '@media (min-width:900px){#campLogosChip,#campLogosPanel{left:268px!important}}' +   /* stay clear of the sidebar */
      '#campLogosPanel{position:fixed;left:10px;bottom:calc(52px + env(safe-area-inset-bottom,0px));z-index:2147483001;width:min(380px,calc(100vw - 20px));background:#fff;color:#1b2430;' +
      'border:1px solid #b8860b;border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.35);font:13px/1.45 system-ui,"Noto Nastaliq Urdu",sans-serif;display:none}' +
      '#campLogosPanel.open{display:block}' +
      '#campLogosPanel h4{margin:0 0 8px;font-size:14px;color:#153A5B}' +
      '#campLogosPanel .cl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid #e3e7ec}' +
      '#campLogosPanel .cl-name b{display:block;font-size:13px}#campLogosPanel .cl-name span{font-size:12px;color:#555}' +
      '#campLogosPanel button.cl-sw{min-width:112px;white-space:nowrap;border:1px solid #153A5B;border-radius:8px;padding:7px 10px;font:600 12px system-ui,sans-serif;cursor:pointer;background:#153A5B;color:#fff}' +
      '#campLogosPanel button.cl-sw.off{background:#fff;color:#153A5B}' +
      '#campLogosPanel .cl-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}' +
      '#campLogosPanel .cl-foot button{flex:1;min-width:120px;border:1px solid #b8860b;background:#fff8e1;color:#5c4400;border-radius:8px;padding:7px 8px;font:600 12px system-ui,sans-serif;cursor:pointer}' +
      '#campLogosPanel .cl-msg{margin-top:6px;font-size:12px;color:#2a6a2a;min-height:16px}' +
      '@media (prefers-color-scheme:dark){#campLogosPanel{background:#16222e;color:#e8eef5;border-color:#c9a227}#campLogosPanel h4{color:#9cc4ec}#campLogosPanel .cl-name span{color:#b6c3d1}#campLogosPanel .cl-row{border-color:#2d3d4d}' +
      '#campLogosPanel button.cl-sw.off{background:#16222e;color:#9cc4ec;border-color:#9cc4ec}#campLogosPanel .cl-foot button{background:#2b2410;color:#f0d98a}}';
    document.head.appendChild(s);
  }

  function applyClasses() {
    var e = eff(), h = document.documentElement;
    h.classList.toggle('camp-nologo-govt', !e.govt);
    h.classList.toggle('camp-nologo-pros', !e.pros);
    h.classList.toggle('camp-scr-nologo-govt', !e.govt);   /* on-screen logos follow the switches exactly like the printouts */
    h.classList.toggle('camp-scr-nologo-pros', !e.pros);
    syncPros();
    paint();
  }

  /* add / remove the Prosecution logo at the right end of every print letterhead */
  function syncPros() {
    var on = eff().pros;
    MASTHEADS.forEach(function (spec) {
      var sel = spec[0], mode = spec[1];
      var list = []; try { list = document.querySelectorAll(sel); } catch (e) {}
      Array.prototype.forEach.call(list, function (m) {
        if (m.closest && m.closest('#campLogosPanel')) return;
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

  var chip, panel;
  function T(en, ur) { var u = /^ur/i.test(document.documentElement.lang || '') || document.documentElement.dir === 'rtl'; return u ? ur : en; }
  function build() {
    if (document.getElementById('campLogosChip')) return;
    chip = document.createElement('button'); chip.id = 'campLogosChip'; chip.type = 'button'; chip.style.display = 'none';   /* shown only after sign-in */
    chip.setAttribute('aria-label', 'Print logos'); chip.title = 'Print logos / پرنٹ لوگو';
    chip.textContent = 'Logos / لوگو';
    panel = document.createElement('div'); panel.id = 'campLogosPanel'; panel.setAttribute('role', 'dialog');
    document.body.appendChild(panel); document.body.appendChild(chip);
    chip.addEventListener('click', function () { panel.classList.toggle('open'); paint(); });
    document.addEventListener('click', function (ev) { if (panel.classList.contains('open') && !panel.contains(ev.target) && ev.target !== chip) panel.classList.remove('open'); });
  }
  var msg = '';
  function paint() {
    if (!panel) return;
    var e = eff();
    function row(k, en, ur, sub) {
      return '<div class="cl-row"><div class="cl-name"><b>' + en + ' &nbsp;|&nbsp; ' + ur + '</b><span>' + sub + '</span></div>' +
        '<button type="button" class="cl-sw ' + (e[k] ? '' : 'off') + '" data-k="' + k + '">' + (e[k] ? 'Shown / دکھایا' : 'Hidden / چھپایا') + '</button></div>';
    }
    panel.innerHTML = '<h4>Print logos &nbsp;|&nbsp; پرنٹ میں لوگو</h4>' +
      row('govt', 'Punjab Govt logo', 'پنجاب حکومت کا لوگو', 'Print, PDF, Word, Excel, pay slip / پرنٹ، پی ڈی ایف، ورڈ، ایکسل') +
      row('pros', 'Prosecution logo', 'پراسیکیوشن کا لوگو', 'Placed at the right of the heading / ہیڈنگ کے دائیں طرف') +
      '<div class="cl-foot">' + (adminOk ? '<button type="button" data-a="save">Save for everyone<br>سب کے لیے محفوظ کریں</button>' : '') +
      (local ? '<button type="button" data-a="reset">Use the saved choice<br>محفوظ شدہ ترتیب استعمال کریں</button>' : '') + '</div>' +
      '<div class="cl-msg" role="status">' + msg + '</div>';
    Array.prototype.forEach.call(panel.querySelectorAll('button.cl-sw'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k'), cur = eff();
        local = local || { govt: cur.govt, pros: cur.pros };
        local[k] = !cur[k]; writeLocal(local); msg = ''; applyClasses(); notify();
      });
    });
    var sv = panel.querySelector('[data-a="save"]'), rs = panel.querySelector('[data-a="reset"]');
    if (sv) sv.addEventListener('click', saveShared);
    if (rs) rs.addEventListener('click', function () { local = null; writeLocal(null); msg = ''; applyClasses(); notify(); });
  }

  function fs() { try { return window.firebase && firebase.apps && firebase.apps.length && firebase.firestore ? firebase.firestore() : null; } catch (e) { return null; } }
  function saveShared() {
    var db = fs(); if (!db) { msg = 'No connection / رابطہ نہیں'; paint(); return; }
    var e = eff();
    db.collection('siteContent').doc('printLogos').set({ govt: e.govt, pros: e.pros, updatedAt: Date.now() }, { merge: true })
      .then(function () { shared = { govt: e.govt, pros: e.pros }; local = null; writeLocal(null); msg = 'Saved for everyone / سب کے لیے محفوظ ہو گیا'; applyClasses(); notify(); })
      .catch(function () { msg = 'Not allowed / اجازت نہیں'; paint(); });
  }
  function connect() {
    var tries = 0;
    (function wait() {
      var db = fs();
      if (!db || !firebase.auth) { if (++tries < 60) setTimeout(wait, 500); return; }
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { if (chip) chip.style.display = 'none'; return; }
        if (chip) chip.style.display = '';
        db.collection('siteContent').doc('printLogos').onSnapshot(function (s) {
          shared = s.exists ? s.data() : null; applyClasses(); notify();
        }, function () {});
        db.collection('users').doc(u.uid).get().then(function (s) {
          var d = s.exists ? s.data() : {}; adminOk = ['admin', 'super_admin'].indexOf(d.roleV2) !== -1; paint();
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

  function start() { css(); applyClasses(); build(); paint(); connect();
    window.addEventListener('beforeprint', syncPros);
    try { var tm = 0; new MutationObserver(function () { if (!eff().pros && !document.querySelector('img.camp-pros-print')) return; clearTimeout(tm); tm = setTimeout(syncPros, 150); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
