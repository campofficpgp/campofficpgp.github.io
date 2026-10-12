/* ============================================================================
   Camp Office — Firebase App Check with Google reCAPTCHA   (app-check.js, site root)
   ----------------------------------------------------------------------------
   Proves to Firebase, invisibly, that a request really comes from one of OUR pages
   and from a real browser (Google reCAPTCHA), so scripts/bots calling the Firebase
   API directly can be refused by the server (Firestore + Authentication).

   Load order on every page (plain <script>, NOT deferred):
       firebase-app-compat.js  ->  firebase-app-check-compat.js  ->  /app-check.js
       ->  (the page's own firebase.initializeApp(...))
   This file wraps firebase.initializeApp so every Firebase app the page makes
   (including the temporary one used to create an account) is protected.

   THE ONLY THING TO EDIT:  put the reCAPTCHA v3 SITE key between the quotes below.
   While it is left as the placeholder this file does nothing at all, so uploading
   it early is safe.  (The site key is public by design; the SECRET key never goes here.)
   ========================================================================== */
(function () {
  'use strict';
  var SITE_KEY = 'PASTE_RECAPTCHA_V3_SITE_KEY_HERE';

  if (!window.firebase || !firebase.initializeApp || window.__campAppCheck) { return; }
  window.__campAppCheck = true;
  if (!SITE_KEY || SITE_KEY.indexOf('PASTE_') === 0) { return; }       /* not configured yet */
  if (typeof firebase.appCheck !== 'function') { return; }              /* SDK script missing: pages keep working */

  var original = firebase.initializeApp;
  firebase.initializeApp = function () {
    var app = original.apply(this, arguments);
    try {
      if (!app.__campAC) {
        app.__campAC = true;
        /* debug token only for local testing, never set on the live site */
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; }
        firebase.appCheck(app).activate(SITE_KEY, true);                /* true = refresh the token automatically */
      }
    } catch (e) { try { console.warn('App Check could not start:', e && e.message); } catch (x) {} }
    return app;
  };
})();
