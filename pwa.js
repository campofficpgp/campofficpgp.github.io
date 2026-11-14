/* Camp Office PWA bootstrap — one shared file for the portal and every system on this domain.
   Registers the service worker (needed for the browser's "Install app" option). */
(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(){ /* installing is optional; never break the page */ });
  });
})();
/* Portal designs: load the whole-portal design chooser on the Camp Office suite pages only
   (/camp-office-suite/...). Other systems on this domain are not touched. */
(function(){
  try{
    if(!/^\/camp-office-suite\//.test(location.pathname || '')) return;
    if(document.getElementById('cmp-design-js')) return;
    var s = document.createElement('script');
    s.id = 'cmp-design-js';
    s.src = '/camp-office-suite/design-themes.js?v=1';
    (document.head || document.documentElement).appendChild(s);
  }catch(e){}
})();
