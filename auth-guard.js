/* ============================================================================
   Camp Office — shared session guard   (auth-guard.js, served from the site root)
   ----------------------------------------------------------------------------
   Loaded by every page of the portal and by the five separate systems (they all
   live on the same origin, cmpofficepgp.org, and share one Firebase sign-in).

   0) SUPER ADMIN ONLY: a small "Auto sign-out ON/OFF" button (bottom-left) switches the auto sign-out OFF for 1 h / 4 h / 1 day;
      it switches itself back ON (never permanent). Stored in this browser only. Other users are never affected.
   1) AUTO SIGN-OUT.  After 30 minutes (Super Admin: 10 minutes) without ANY activity in ANY open tab the
      user is signed out (a 2-minute warning with a "Stay signed in" button comes
      first).  Activity is shared between tabs through localStorage, so working in
      Case Entry keeps the whole session alive, and a closed/forgotten portal tab
      can no longer leave the account signed in forever.
      STALE SESSIONS.  A login that the browser restored after the computer / browser was off is judged by the
      activity stamp that was there BEFORE this page took part (so a mouse move while the page loads can no longer
      "refresh" a day-old session), and any login older than 12 hours is ended when a page is opened.
   2) APPROVAL GATE (optional).  A page that sets  window.CAMP_REQUIRE_APPROVED = true
      before this script is blocked, with a full-screen notice, unless the signed-in
      user's  users/{uid}  profile is approved and active.  (The Firestore rules are
      the real protection; this stops the screen from even opening.)
   3) READ-ONLY NOTICE (optional).  window.CAMP_WRITE_ROLES = ['admin','super_admin']
      shows a banner to everybody else on that page, so they know saving is not allowed.

   4) SUPER ADMIN SIGN-IN CODE.  When the Super Admin has turned the sign-in code ON and this sign-in has not yet been
      verified, any page other than the portal sends the Super Admin to the portal, which shows the code screen.
      (The Firestore rules are the real lock; this only avoids a page full of "permission denied".)

   5) MAINTENANCE SWITCH.  The Super Admin can close the portal (maintenance.html).  The document appConfig/maintenance
      { closed, message, reopenAtMs } is watched live; while it says closed (and the reopen time, if any, has not come)
      every signed-in user except the Super Admin gets a full-screen "portal closed" notice with the message and the
      reopening time.  Nothing is signed out and no data is touched; the Super Admin keeps working normally.
      This is a SCREEN lock for normal users (like the approval gate); the Firestore rules do not read this switch.

   No page logic is replaced: the guard only watches the existing Firebase session.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__campGuardLoaded) { return; }
  window.__campGuardLoaded = true;

  var IDLE_MS = 30 * 60 * 1000;      /* sign out after this much inactivity          */
  var IDLE_SUPER_MS = 10 * 60 * 1000;/* ... for the Super Admin                      */
  var MAX_SESSION_MS = 12 * 60 * 60 * 1000;  /* a login older than this is ended when a page opens */
  var KEY_SUPER = 'campSuperUid';    /* uid of the Super Admin (so every page knows the shorter limit) */
  var WARN_MS = 2 * 60 * 1000;       /* show the warning this long before sign-out   */
  var TICK_MS = 1000;                /* how often the idle clock is checked          */
  var SAVE_EVERY_MS = 5000;          /* how often activity is written to storage     */
  var KEY_ACTIVITY = 'campLastActivity';
  var KEY_IDLE_OUT = 'campIdleLogout';
  var PORTAL_URL = '/camp-office-suite/';
  var FN_STATUS = 'https://us-central1-camp-office-project.cloudfunctions.net/campOtpStatus';

  var auth = null, db = null, user = null;
  var memLast = Date.now(), lastSaved = 0;
  var firstAuthSeen = false;
  /* the activity stamp as it was BEFORE anything on this page could touch it (-1 = storage unreadable) */
  var INITIAL_LAST = (function () {
    try { var v = parseInt(localStorage.getItem('campLastActivity'), 10); return isNaN(v) ? 0 : v; } catch (e) { return -1; }
  }());
  var bannerEl = null, blockEl = null, roBannerEl = null;
  var timer = null;

  /* ----------------------------------------------------------- idle limit */
  function isSuperUid(uid) {
    try { return !!uid && localStorage.getItem(KEY_SUPER) === uid; } catch (e) { return false; }
  }
  /* SUPER ADMIN ONLY: auto sign-out can be switched OFF for 1 h / 4 h / 1 day (never permanently); it switches itself back ON.
     Kept in this browser only (localStorage), shared by its open tabs. Everybody else is never affected. */
  var KEY_PAUSE = 'campIdlePauseUntil';
  var PAUSE_HOURS = [1, 4, 24];
  var PAUSE_BIG_MS = 48 * 60 * 60 * 1000;
  function pauseUntil() { try { var v = parseInt(localStorage.getItem(KEY_PAUSE), 10); return isNaN(v) ? 0 : v; } catch (e) { return 0; } }
  function pauseActive(uid) { return isSuperUid(uid) && pauseUntil() > Date.now(); }
  function idleFor(uid) { return pauseActive(uid) ? PAUSE_BIG_MS : (isSuperUid(uid) ? IDLE_SUPER_MS : IDLE_MS); }
  function setPause(hours) {
    if (!user || !isSuperUid(user.uid)) { return false; }
    if (!hours) { try { localStorage.removeItem(KEY_PAUSE); } catch (e) {} touch(true); return true; }
    if (PAUSE_HOURS.indexOf(hours) < 0) { return false; }
    try { localStorage.setItem(KEY_PAUSE, String(Date.now() + hours * 3600 * 1000)); } catch (e) { return false; }
    touch(true); return true;
  }
  function markSuper(uid) { try { if (uid) { localStorage.setItem(KEY_SUPER, uid); } } catch (e) {} }
  function unmarkSuper(uid) { try { if (localStorage.getItem(KEY_SUPER) === uid) { localStorage.removeItem(KEY_SUPER); } } catch (e) {} }

  /* ---------------------------------------------------------------- storage */
  function getLast() {
    try {
      var v = parseInt(localStorage.getItem(KEY_ACTIVITY), 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return memLast; }
  }
  function touch(force) {
    var t = Date.now();
    if (!force && t - lastSaved < SAVE_EVERY_MS) { return; }
    lastSaved = t; memLast = t;
    try { localStorage.setItem(KEY_ACTIVITY, String(t)); } catch (e) { /* storage blocked: per-tab fallback */ }
  }

  /* --------------------------------------------------------------- styling */
  function addStyle() {
    if (document.getElementById('cg-style')) { return; }
    var st = document.createElement('style');
    st.id = 'cg-style';
    st.textContent =
      '.cg-banner{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483600;width:min(460px,calc(100vw - 24px));' +
      'background:#17294a;color:#fff;border:2px solid #d4a13d;border-radius:12px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.35);' +
      'font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:14px;line-height:1.6}' +
      '.cg-banner .cg-ur,.cg-block .cg-ur{direction:rtl;text-align:right;font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic",Tahoma,Arial,sans-serif;font-size:15px;line-height:2}' +
      '.cg-banner .cg-en,.cg-block .cg-en{direction:ltr;text-align:left;font-size:12.5px;opacity:.88}' +
      '.cg-time{font-weight:700;color:#ffd77a;font-variant-numeric:tabular-nums}' +
      '.cg-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}' +
      '.cg-btn{border:1px solid #d4a13d;background:#d4a13d;color:#17294a;border-radius:8px;padding:9px 16px;font-weight:700;font-size:14px;cursor:pointer;text-decoration:none;display:inline-block}' +
      '.cg-btn.cg-alt{background:transparent;color:inherit;border-color:currentColor}' +
      '.cg-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
      '.cg-block{position:fixed;inset:0;z-index:2147483646;background:rgba(15,25,45,.96);color:#fff;display:flex;align-items:center;justify-content:center;padding:16px;' +
      'font-family:"Segoe UI",Tahoma,Arial,sans-serif}' +
      '.cg-block .cg-card{max-width:460px;width:100%;background:#17294a;border:1px solid #3a4f7d;border-radius:14px;padding:26px 24px;text-align:center}' +
      '.cg-block h2{margin:0 0 8px;font-size:20px;color:#ffd77a}' +
      '.cg-block .cg-row{justify-content:center}' +
      '.cg-ro{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#fbebd0;color:#5a4309;border-bottom:2px solid #b8860b;padding:8px 14px;text-align:center;' +
      'font-family:"Segoe UI",Tahoma,Arial,sans-serif;font-size:13.5px;line-height:1.7}' +
      '.cg-ro .cg-ur{direction:rtl;font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic",Tahoma,Arial,sans-serif}' +
      /* nothing from the portal's own notice bars, idle-sign-out banner, closed-portal strip or the auto sign-out ON/OFF pill is ever printed */
      '@media print{.cg-ro,.cg-banner,.cg-block,[data-cg-pause],a[href$="maintenance.html"]{display:none !important;visibility:hidden !important}}';
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------ idle logic */
  function signOutIdle() {
    try { localStorage.setItem(KEY_IDLE_OUT, String(Date.now())); } catch (e) {}
    hideBanner();
    if (auth) { auth.signOut(); }
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function showBanner(secsLeft) {
    addStyle();
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.className = 'cg-banner';
      bannerEl.setAttribute('role', 'alertdialog');
      bannerEl.setAttribute('aria-live', 'assertive');
      bannerEl.setAttribute('aria-label', 'Session about to expire');
      bannerEl.innerHTML =
        '<div class="cg-ur">کافی دیر سے کوئی سرگرمی نہیں ہوئی۔ حفاظت کے لیے <span class="cg-time" data-cg-time></span> میں آپ خود بخود لاگ آؤٹ ہو جائیں گے۔</div>' +
        '<div class="cg-en">No activity for a while. For your protection you will be signed out automatically in <span class="cg-time" data-cg-time2></span>.</div>' +
        '<div class="cg-row"><button type="button" class="cg-btn" data-cg-stay>لاگ اِن رکھیں / Stay signed in</button>' +
        '<button type="button" class="cg-btn cg-alt" data-cg-out>ابھی لاگ آؤٹ / Sign out now</button></div>';
      document.body.appendChild(bannerEl);
      bannerEl.querySelector('[data-cg-stay]').addEventListener('click', function () { touch(true); hideBanner(); });
      bannerEl.querySelector('[data-cg-out]').addEventListener('click', function () { signOutIdle(); });
      try { bannerEl.querySelector('[data-cg-stay]').focus(); } catch (e) {}
    }
    var txt = Math.floor(secsLeft / 60) + ':' + pad2(secsLeft % 60);
    var a = bannerEl.querySelector('[data-cg-time]'), b = bannerEl.querySelector('[data-cg-time2]');
    if (a) { a.textContent = txt; }
    if (b) { b.textContent = txt; }
  }
  function hideBanner() {
    if (bannerEl && bannerEl.parentNode) { bannerEl.parentNode.removeChild(bannerEl); }
    bannerEl = null;
  }
  function tick() {
    applyMaint();
    if (!user) { hideBanner(); pauseUiHide(); return; }
    var pu = pauseUntil();
    if (pu && pu <= Date.now()) { try { localStorage.removeItem(KEY_PAUSE); } catch (e) {} touch(true); }   /* the OFF time is over: ON again, fresh clock */
    pauseUiRefresh();
    var limit = idleFor(user.uid);
    var idle = Date.now() - getLast();
    if (idle >= limit) { signOutIdle(); return; }
    if (idle >= limit - WARN_MS) { showBanner(Math.max(0, Math.ceil((limit - idle) / 1000))); }
    else { hideBanner(); }
  }

  /* ------------------------------------- Super Admin: auto sign-out ON / OFF */
  var pauseEl = null, pauseOpen = false;
  function pauseUiHide() { if (pauseEl && pauseEl.parentNode) { pauseEl.parentNode.removeChild(pauseEl); } pauseEl = null; pauseOpen = false; }
  function fmtLeft(ms) { var m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + pad2(m % 60) + 'm' : m + ' min'; }
  function pauseUiRefresh() {
    if (!user || !isSuperUid(user.uid) || bannerEl) { if (!user || !isSuperUid(user.uid)) { pauseUiHide(); } return; }
    if (!document.body) { return; }
    if (!pauseEl) {
      addStyle();
      pauseEl = document.createElement('div');
      pauseEl.setAttribute('data-cg-pause', '');
      pauseEl.className = 'no-print';
      pauseEl.style.cssText = 'position:fixed;left:12px;bottom:46px;z-index:2147483000;font:12px/1.4 system-ui,Segoe UI,Arial,sans-serif;direction:ltr';
      document.body.appendChild(pauseEl);
      pauseEl.addEventListener('click', function (e) {
        var t = e.target.closest('[data-cg-act]'); if (!t) { return; }
        var a = t.getAttribute('data-cg-act');
        if (a === 'toggle') { pauseOpen = !pauseOpen; }
        else if (a === 'on') { setPause(0); pauseOpen = false; }
        else { setPause(parseInt(a, 10)); pauseOpen = false; }
        pauseUiRender();
      });
    }
    pauseUiRender();
  }
  function pauseUiRender() {
    if (!pauseEl) { return; }
    var pu = pauseUntil(), off = pu > Date.now();
    var btn = 'border:1px solid #1f4e79;background:#fff;color:#1f4e79;border-radius:14px;padding:4px 10px;cursor:pointer;font:inherit;margin:2px';
    var h = '<button type="button" data-cg-act="toggle" style="' + btn + (off ? ';background:#fff4d6;border-color:#b7791f;color:#7a4b00' : '') + '">' +
      (off ? '⏱ Auto sign-out OFF · ' + fmtLeft(pu - Date.now()) + ' left / آٹو لاگ آؤٹ بند' : '⏱ Auto sign-out ON · 10 min / آٹو لاگ آؤٹ چالو') + '</button>';
    if (pauseOpen) {
      h += '<div style="margin-top:4px;background:#fff;border:1px solid #cbd5e0;border-radius:10px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,.2)">' +
        '<div style="margin:0 4px 4px;color:#555">Switch OFF for / بند رکھیں:</div>' +
        '<button type="button" data-cg-act="1" style="' + btn + '">1 hour / ایک گھنٹہ</button>' +
        '<button type="button" data-cg-act="4" style="' + btn + '">4 hours / چار گھنٹے</button>' +
        '<button type="button" data-cg-act="24" style="' + btn + '">1 day / ایک دن</button>' +
        (off ? '<div><button type="button" data-cg-act="on" style="' + btn + ';background:#e6f4ea;border-color:#2e7d32;color:#1b4d20">Turn ON now / ابھی چالو کریں</button></div>' : '') +
        '<div style="margin:4px;color:#777;max-width:230px">It switches itself back ON. Close the browser tab when you leave the desk. / وقت ختم ہوتے ہی خود چالو ہو جائے گا۔</div></div>';
    }
    if (pauseEl.__h !== h) { pauseEl.__h = h; pauseEl.innerHTML = h; }   /* only when changed, so a click is never lost */
  }

  /* ------------------------------------------------------- approval gate */
  function setInert(on) {
    try { if (on) { document.body.setAttribute('inert', ''); } else { document.body.removeAttribute('inert'); } } catch (e) {}
  }
  function unblock() {
    if (blockEl && blockEl.parentNode) { blockEl.parentNode.removeChild(blockEl); }
    blockEl = null; setInert(!!maintEl);
  }
  function block(kind) {
    addStyle();
    unblock();
    var titleUr, titleEn, bodyUr, bodyEn;
    if (kind === 'error') {
      titleUr = 'جانچ مکمل نہیں ہو سکی'; titleEn = 'Could not verify your account';
      bodyUr = 'آپ کے اکاؤنٹ کی حالت معلوم نہیں ہو سکی۔ انٹرنیٹ چیک کریں اور صفحہ دوبارہ کھولیں۔';
      bodyEn = 'We could not check your account status. Check your connection and reload the page.';
    } else {
      titleUr = 'رسائی منظور نہیں'; titleEn = 'Access not approved';
      bodyUr = 'آپ کا اکاؤنٹ اس وقت منظور شدہ اور فعال نہیں ہے۔ براہ کرم اپنے دفتر کے ایڈمن سے رابطہ کریں۔';
      bodyEn = 'Your account is not approved and active right now. Please contact your office administrator.';
    }
    blockEl = document.createElement('div');
    blockEl.className = 'cg-block';
    blockEl.setAttribute('role', 'alertdialog');
    blockEl.setAttribute('aria-modal', 'true');
    blockEl.innerHTML =
      '<div class="cg-card"><h2>' + titleUr + ' / ' + titleEn + '</h2>' +
      '<div class="cg-ur">' + bodyUr + '</div><div class="cg-en">' + bodyEn + '</div>' +
      '<div class="cg-row"><a class="cg-btn" href="' + PORTAL_URL + '">پورٹل پر جائیں / Go to portal</a>' +
      '<button type="button" class="cg-btn cg-alt" data-cg-out>لاگ آؤٹ / Sign out</button></div></div>';
    /* appended to <html>, outside <body>, so that making <body> inert does not disable it */
    document.documentElement.appendChild(blockEl);
    setInert(true);
    blockEl.querySelector('[data-cg-out]').addEventListener('click', function () {
      if (auth) { auth.signOut().then(function () { location.href = PORTAL_URL; }); }
    });
  }
  function applyWriteRole(role) {
    var allowed = window.CAMP_WRITE_ROLES;
    if (!allowed || !allowed.length) { return; }
    var ok = allowed.indexOf(role) !== -1;
    document.documentElement.classList.toggle('camp-readonly', !ok);
    if (ok) {
      if (roBannerEl && roBannerEl.parentNode) { roBannerEl.parentNode.removeChild(roBannerEl); }
      roBannerEl = null; return;
    }
    if (roBannerEl) { return; }
    addStyle();
    roBannerEl = document.createElement('div');
    roBannerEl.className = 'cg-ro';
    roBannerEl.setAttribute('role', 'status');
    roBannerEl.innerHTML = '<span class="cg-ur">آپ کو اس صفحے پر صرف دیکھنے کی اجازت ہے؛ تبدیلی صرف ایڈمن کر سکتا ہے۔</span> · ' +
      '<span>View-only for your role: only an administrator can save changes here.</span>';
    document.body.appendChild(roBannerEl);
  }
  function checkApproved(u) {
    if (!window.CAMP_REQUIRE_APPROVED || !db) { return; }
    db.collection('users').doc(u.uid).get().then(function (snap) {
      var x = snap.exists ? snap.data() : null;
      var ok = !!x && x.approvalStatus === 'approved' && x.isActive !== false;
      window.CAMP_ROLE = x ? (x.roleV2 || 'viewer') : null;
      if (!ok) { block('denied'); return; }
      unblock();
      applyWriteRole(window.CAMP_ROLE);
    }).catch(function () { block('error'); });
  }

  /* ------------------------------------------------- Super Admin sign-in code */
  function onPortalPage() {
    var p = location.pathname;
    return p === PORTAL_URL || p === PORTAL_URL + 'index.html' || p === '/' || p === '/index.html';
  }
  function checkOtp(u) {
    if (onPortalPage()) { return; }
    u.getIdTokenResult().then(function (res) {
      var key = u.uid + ':' + (res.claims && res.claims.auth_time);
      try { if (sessionStorage.getItem('campOtpOk') === key) { return; } } catch (e) {}
      return fetch(FN_STATUS, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + res.token }, body: '{}' })
        .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j || {} }; }); })
        .then(function (r) {
          if (r.s !== 200) { return; }                       /* server unreachable / not deployed yet: leave the page alone */
          if (r.j.isSuper) { markSuper(u.uid); } else { unmarkSuper(u.uid); }
          if (r.j.required && !r.j.verified) { location.href = PORTAL_URL; return; }
          if (!r.j.isSuper || r.j.verified) { try { sessionStorage.setItem('campOtpOk', key); } catch (e) {} }
        });
    }).catch(function () { /* ignore: never block a page because this extra check could not run */ });
  }

  /* ------------------------------------------------ one sign-in page for everything
     Nobody signs in on a system's own page any more: if no one is signed in, the page goes to the portal's
     sign-in page (the only place for sign-in, forgot-password and account requests). After signing in the portal
     brings the person back to the page he came from (remembered for one hour in this tab only). */
  var JUMPED = false;
  function sendToPortalSignIn() {
    if (JUMPED || onPortalPage() || window.CAMP_NO_SIGNIN_REDIRECT) { return; }
    JUMPED = true;
    try {
      var p = location.pathname + location.search + location.hash;
      if (p.charAt(0) === '/' && p.charAt(1) !== '/' && p.charAt(1) !== '\\') {
        sessionStorage.setItem('campReturnTo', JSON.stringify({ p: p, t: Date.now() }));
      }
    } catch (e) {}
    try {
      addStyle();
      var c = document.createElement('div');
      c.className = 'cg-block'; c.style.zIndex = '2147483647'; c.style.background = '#0f192d';
      c.setAttribute('role', 'status');
      c.innerHTML = '<div class="cg-card"><div class="cg-ur">سائن اِن صفحے پر لے جایا جا رہا ہے…</div><div class="cg-en">Taking you to the sign-in page…</div></div>';
      document.documentElement.appendChild(c);
    } catch (e) {}
    location.replace(PORTAL_URL);
  }

  /* ------------------------------------------------------ Maintenance switch */
  var maintEl = null, maintBar = null, maintUid = null, maintUnsub = null, maintDoc = null, maintIsSuper = null;
  function maintClosedNow() {
    var d = maintDoc;
    if (!d || d.closed !== true) { return false; }
    var r = Number(d.reopenAtMs) || 0;
    return !(r > 0 && Date.now() >= r);
  }
  function fmtKarachi(ms) {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(ms)).replace(',', '');
    } catch (e) { return new Date(ms).toString(); }
  }
  function mkEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text != null) { e.textContent = text; }
    return e;
  }
  function hideMaint() {
    if (maintEl && maintEl.parentNode) { maintEl.parentNode.removeChild(maintEl); }
    maintEl = null;
    setInert(!!blockEl);
  }
  function showMaint() {
    addStyle();
    var d = maintDoc || {};
    var r = Number(d.reopenAtMs) || 0;
    var msg = typeof d.message === 'string' ? d.message.trim() : '';
    var sig = (msg || '') + '|' + r;
    if (maintEl && maintEl.getAttribute('data-sig') === sig) { return; }   /* already showing the same notice */
    if (maintEl && maintEl.parentNode) { maintEl.parentNode.removeChild(maintEl); }
    maintEl = mkEl('div', 'cg-block');
    maintEl.setAttribute('data-sig', sig);
    maintEl.setAttribute('role', 'alertdialog');
    maintEl.setAttribute('aria-modal', 'true');
    maintEl.style.zIndex = '2147483647';
    var card = mkEl('div', 'cg-card');
    card.appendChild(mkEl('h2', null, 'پورٹل عارضی طور پر بند ہے / The portal is temporarily closed'));
    var ur = mkEl('div', 'cg-ur', msg || 'پورٹل اس وقت بند ہے۔ براہ کرم بعد میں دوبارہ کوشش کریں۔');
    card.appendChild(ur);
    if (!msg) { card.appendChild(mkEl('div', 'cg-en', 'The portal is closed at the moment. Please try again later.')); }
    var when = mkEl('div', 'cg-ur');
    when.style.marginTop = '8px';
    if (r > 0) {
      when.appendChild(document.createTextNode('کھلنے کا وقت / Reopens at: '));
      when.appendChild(mkEl('span', 'cg-time', fmtKarachi(r)));
    } else {
      when.appendChild(document.createTextNode('کھلنے کا وقت ابھی طے نہیں / Reopening time not announced yet'));
    }
    card.appendChild(when);
    var row = mkEl('div', 'cg-row');
    var again = mkEl('button', 'cg-btn', 'دوبارہ دیکھیں / Check again');
    again.type = 'button';
    again.addEventListener('click', function () { try { location.reload(); } catch (e) {} });
    var out = mkEl('button', 'cg-btn cg-alt', 'لاگ آؤٹ / Sign out');
    out.type = 'button';
    out.addEventListener('click', function () { if (auth) { auth.signOut().then(function () { location.href = PORTAL_URL; }); } });
    row.appendChild(again); row.appendChild(out);
    card.appendChild(row);
    maintEl.appendChild(card);
    document.documentElement.appendChild(maintEl);   /* outside <body>, so making <body> inert does not disable it */
    setInert(true);
    try { again.focus(); } catch (e) {}
  }
  /* Super Admin: a thin red strip while the portal is closed, so it is never forgotten */
  function superStrip(on) {
    if (!on) {
      if (maintBar && maintBar.parentNode) { maintBar.parentNode.removeChild(maintBar); }
      maintBar = null; return;
    }
    if (maintBar) { return; }
    addStyle();
    maintBar = mkEl('a', 'cg-ro');
    maintBar.href = PORTAL_URL + 'maintenance.html';
    maintBar.style.cssText = 'top:auto;bottom:0;background:#b3261e;color:#fff;border-bottom:0;border-top:2px solid #7d1a15;text-decoration:none;display:block;font-weight:700;padding:5px 10px;font-size:12.5px;line-height:1.5';
    maintBar.textContent = '🔒 پورٹل دوسروں کے لیے بند ہے — منظم کریں / Closed for everyone else — manage';
    document.body.appendChild(maintBar);
  }
  function applyMaint() {
    if (!user || maintIsSuper === null) { hideMaint(); superStrip(false); return; }
    var closed = maintClosedNow();
    if (maintIsSuper) { hideMaint(); superStrip(closed); return; }
    superStrip(false);
    if (closed) { showMaint(); } else { hideMaint(); }
  }
  /* is this signed-in user the Super Admin?  profile first; the sign-in-code endpoint as a fallback */
  function findSuper(u) {
    function viaServer() {
      return u.getIdToken().then(function (tok) {
        return fetch(FN_STATUS, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: '{}' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { return !!(j && j.isSuper); });
      }).catch(function () { return false; });
    }
    if (!db) { return Promise.resolve(false); }
    return db.collection('users').doc(u.uid).get().then(function (snap) {
      var x = snap.exists ? snap.data() : null;
      return !!x && x.roleV2 === 'super_admin';
    }).catch(function () { return viaServer(); });
  }
  function addMaintLink() {
    /* Super Admin only: a "Maintenance" entry in the sidebar footer of every portal page that has one */
    if (!maintIsSuper) { return; }
    var foot = document.querySelector('.sidebar-foot');
    if (!foot || foot.querySelector('[data-cg-maint]')) { return; }
    var a = document.createElement('a');
    a.href = PORTAL_URL + 'maintenance.html';
    a.setAttribute('data-cg-maint', '1');
    var ico = mkEl('span', 'ico', '🔒');
    var lab = mkEl('span', 'label', 'Maintenance');
    a.appendChild(ico); a.appendChild(lab);
    foot.insertBefore(a, foot.firstChild);
  }
  function stopMaint() {
    if (maintUnsub) { try { maintUnsub(); } catch (e) {} }
    maintUnsub = null; maintUid = null; maintDoc = null; maintIsSuper = null;
    hideMaint(); superStrip(false);
  }
  function startMaint(u) {
    if (!db || !u || maintUid === u.uid) { return; }
    stopMaint();
    maintUid = u.uid;
    var myUid = u.uid;
    findSuper(u).then(function (isSup) {
      if (maintUid !== myUid) { return; }
      maintIsSuper = !!isSup;
      if (isSup) { markSuper(myUid); addMaintLink(); setTimeout(addMaintLink, 1500); }
      applyMaint();
    });
    try {
      maintUnsub = db.collection('appConfig').doc('maintenance').onSnapshot(function (snap) {
        maintDoc = snap.exists ? (snap.data() || null) : null;
        applyMaint();
      }, function () { /* cannot read the switch: leave the page alone (never lock people out by mistake) */ });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ Logout button on every page
     One shared "Logout / لاگ آؤٹ" item at the bottom of the side menu of every page that loads this guard (all systems and all
     portal pages), so a user can sign out from wherever he is. A page with no side menu (the Shared Dropdown Lists page) gets a
     small button in the top corner instead. Set window.CAMP_NO_LOGOUT_LINK = true on a page to switch it off. */
  function doLogout(e) {
    if (e) { e.preventDefault(); }
    try {
      if (window.CampActivity && CampActivity.logoutThenSignOut && db && auth && auth.currentUser) {
        CampActivity.logoutThenSignOut(db, auth, auth.currentUser, null);
        return;
      }
    } catch (err) { /* fall through to a plain sign-out */ }
    if (auth) { auth.signOut(); }
  }
  function addLogoutLink() {
    try {
      if (window.CAMP_NO_LOGOUT_LINK || window.self !== window.top) { return; }
      var foots = document.querySelectorAll('.sidebar-foot');
      if (foots.length) {
        Array.prototype.forEach.call(foots, function (f) {
          if (f.querySelector('[data-cg-logout]')) { return; }
          var a = document.createElement('a');
          a.href = '#logout'; a.setAttribute('data-cg-logout', '1');
          a.title = 'Logout / لاگ آؤٹ';
          var ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = '\uD83D\uDEAA';
          var lb = document.createElement('span'); lb.className = 'label';
          lb.setAttribute('data-en', 'Logout'); lb.setAttribute('data-ur', 'لاگ آؤٹ');
          lb.textContent = 'Logout / لاگ آؤٹ';
          a.appendChild(ico); a.appendChild(lb);
          a.addEventListener('click', doLogout);
          f.appendChild(a);
        });
        return;
      }
      if (document.querySelector('[data-cg-logout]') || document.getElementById('logoutBtn')) { return; }
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-cg-logout', '1');
      b.textContent = '\uD83D\uDEAA Logout / لاگ آؤٹ';
      b.style.cssText = 'position:fixed;top:10px;inset-inline-end:12px;z-index:2147483000;background:#17294a;color:#fff;border:1px solid #d4a13d;border-radius:18px;padding:6px 14px;font:600 12px system-ui,sans-serif;cursor:pointer;';
      b.addEventListener('click', doLogout);
      (document.body || document.documentElement).appendChild(b);
    } catch (e) { /* never break the page for a button */ }
  }

  /* ------------------------------------------------------------------ One theme choice for every page
     The portal pages remember the colour theme under "cmpTheme", the five separate systems under "campOfficeTheme" (and in
     users/{uid}.theme). That made a choice made in one place invisible in the other. From here on the two are kept equal:
       - when this page loads, the two local values are made the same (the cloud-backed "campOfficeTheme" wins if they differ);
       - whenever a page saves its theme, the other key gets the same value and the user's profile (users/{uid}.theme) is updated;
       - after sign-in, the profile value is applied if it differs from what this browser has.
     Only these two keys are touched; no data is changed. A page that does not know a theme name simply shows its default colours. */
  var THEME_KEYS = ['cmpTheme', 'campOfficeTheme'];
  var rawSet = null, rawGet = null;
  function themeOk(v) { return typeof v === 'string' && /^[a-z0-9]{1,20}$/.test(v); }
  function themeApply(id) {
    try {
      if (!themeOk(id)) { return; }
      document.documentElement.setAttribute('data-theme', id);
      if (document.body) { document.body.setAttribute('data-theme', id); }
    } catch (e) { /* ignore */ }
  }
  function themeSaveCloud(id) {
    try {
      var u = auth && auth.currentUser;
      if (!u || !db || !themeOk(id)) { return; }
      db.collection('users').doc(u.uid).set({ theme: id }, { merge: true }).catch(function () { /* the page's own save shows its message */ });
    } catch (e) { /* ignore */ }
  }
  function themeInit() {
    try {
      var P = Storage.prototype;
      rawSet = P.setItem; rawGet = P.getItem;
      var a = rawGet.call(localStorage, 'cmpTheme'), b = rawGet.call(localStorage, 'campOfficeTheme');
      var pick = themeOk(b) ? b : (themeOk(a) ? a : null);
      if (pick) {
        if (a !== pick) { rawSet.call(localStorage, 'cmpTheme', pick); }
        if (b !== pick) { rawSet.call(localStorage, 'campOfficeTheme', pick); }
      }
      P.setItem = function (k, v) {
        rawSet.apply(this, arguments);
        try {
          if (this === localStorage && (k === 'cmpTheme' || k === 'campOfficeTheme') && themeOk(String(v))) {
            var other = (k === 'cmpTheme') ? 'campOfficeTheme' : 'cmpTheme';
            if (rawGet.call(localStorage, other) !== String(v)) { rawSet.call(localStorage, other, String(v)); }
            themeSaveCloud(String(v));
          }
        } catch (e) { /* never break a page's own save */ }
      };
    } catch (e) { /* storage blocked: nothing to do */ }
  }
  function themeFromCloud(u) {
    try {
      if (!db || !u || !rawGet) { return; }
      db.collection('users').doc(u.uid).get().then(function (snap) {
        var t = snap && snap.exists ? snap.data().theme : null;
        if (!themeOk(t)) { return; }
        var cur = rawGet.call(localStorage, 'campOfficeTheme');
        if (cur === t) { return; }
        rawSet.call(localStorage, 'campOfficeTheme', t);
        rawSet.call(localStorage, 'cmpTheme', t);
        themeApply(t);
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }
  themeInit();

  /* ------------------------------------------------------------------ wire */
  function bind() {
    addStyle();
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function () { touch(false); }, { capture: true, passive: true });
    });
    window.addEventListener('scroll', function () { touch(false); }, { capture: true, passive: true });
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    if (!getLast()) { touch(true); }               /* first ever run: start the clock, do not sign anybody out */
    auth.onAuthStateChanged(function (u) {
      user = u || null;
      if (!user) { hideBanner(); unblock(); stopMaint(); sendToPortalSignIn(); return; }
      var ls = 0;
      try { ls = user.metadata && user.metadata.lastSignInTime ? Date.parse(user.metadata.lastSignInTime) : 0; } catch (e) {}
      var now = Date.now(), seen = firstAuthSeen;
      firstAuthSeen = true;
      if (ls && now - ls < 2 * 60 * 1000) { touch(true); }          /* a sign-in that just happened counts as activity */
      else if (!seen) {
        /* a login the browser restored: judge it by the stamp from BEFORE this page opened, never by what happened since */
        var limit = idleFor(user.uid);
        var tooOld = !!ls && now - ls > MAX_SESSION_MS;
        var staleIdle = INITIAL_LAST > 0 ? (now - INITIAL_LAST >= limit) : (!!ls && now - ls >= limit);
        if (tooOld || staleIdle) { signOutIdle(); return; }
      }
      tick();                                       /* a stale restored session is signed out at once */
      if (auth.currentUser) { checkApproved(user); checkOtp(user); startMaint(user); }
      if (auth.currentUser) { addLogoutLink(); }
      if (auth.currentUser) { themeFromCloud(user); }
    });
    if (timer) { clearInterval(timer); }
    timer = setInterval(tick, TICK_MS);
  }
  function init(tries) {
    if (window.firebase && firebase.apps && firebase.apps.length && firebase.auth) {
      auth = firebase.auth();
      db = firebase.firestore ? firebase.firestore() : null;
      bind();
      return;
    }
    if (tries > 60) { return; }
    setTimeout(function () { init(tries + 1); }, 250);
  }

  /* Floating bars at the bottom (maintenance bar, auto sign-out button, accessibility button) must never hide page content.
     1) A fixed empty space of 140px at the end of every page, and 110px at the end of the side menu (screen only, not print).
     2) Inner scrolling boxes (a table that scrolls inside its own frame, e.g. Lookup) get the same space at their end.
     3) The sign-out button always sits just above the maintenance bar, even when the bar wraps onto two lines on a phone. */
  (function () {
    var css = '@media screen{' +
      'html body{padding-bottom:140px !important;box-sizing:border-box}' +
      'aside.sidebar,#sidebar,nav.sidebar{padding-bottom:110px !important}' +
      '.cg-pad-scroll{padding-bottom:110px !important}' +
      '#chatPanel .chat-input-bar{margin-bottom:84px !important}' +
      '}';
    function put() {
      if (document.getElementById('cg-bottom-space')) { return; }
      var st = document.createElement('style'); st.id = 'cg-bottom-space'; st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    }
    put();
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', put); }
  })();
  function reserveBottom() {
    try {
      if (!document.body) { return; }
      var barH = (maintBar && maintBar.parentNode) ? maintBar.getBoundingClientRect().height : 0;
      if (pauseEl && pauseEl.parentNode) { pauseEl.style.bottom = (barH ? Math.ceil(barH) + 12 : 16) + 'px'; }
      var list = document.querySelectorAll('div,main,section,article,form');
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.classList.contains('cg-pad-scroll') || el.clientHeight < 150) { continue; }
        var cs = window.getComputedStyle(el);
        if (!/auto|scroll/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 4) { continue; }
        if (cs.position === 'fixed' || el.closest('[role="dialog"],dialog,.modal,.hist-back,[aria-modal="true"]')) { continue; }
        el.classList.add('cg-pad-scroll');
      }
    } catch (e) {}
  }
  setInterval(reserveBottom, 2500);
  window.addEventListener('resize', reserveBottom);
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', reserveBottom); } else { setTimeout(reserveBottom, 300); }

  window.CampGuard = {
    idleMs: IDLE_MS,
    touch: function () { touch(true); },
    signOut: signOutIdle,
    markSuper: markSuper,
    pauseIdle: setPause,
    pauseUntil: pauseUntil,
    unmarkSuper: unmarkSuper,
    maintenanceClosed: function () { return maintClosedNow(); },
    lastIdleLogout: function () {
      try { return parseInt(localStorage.getItem(KEY_IDLE_OUT), 10) || 0; } catch (e) { return 0; }
    },
    clearIdleLogout: function () { try { localStorage.removeItem(KEY_IDLE_OUT); } catch (e) {} }
  };

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { init(0); }); }
  else { init(0); }
})();

