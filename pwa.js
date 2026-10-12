/* Camp Office PWA bootstrap — one shared file for the portal and every system on this domain.
   Registers the service worker (needed for the browser's "Install app" option). */
(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(){ /* installing is optional; never break the page */ });
  });
})();
