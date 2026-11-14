/* Camp Office PWA bootstrap — one shared file for the portal and every system on this domain.
   Registers the service worker (needed for the browser's "Install app" option). */
(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function(){ /* installing is optional; never break the page */ });
  });
})();
/* Portal designs: load the whole-portal design chooser on the portal pages and on the Bill
   Register, Weekly Court Roster and Record Section systems. Other paths are not touched. */
(function(){
  try{
    if(!/^\/(camp-office-suite|bill-register-system|weekly-court-roster|record-section-system)\//.test(location.pathname || '')) return;
    if(document.getElementById('cmp-design-js')) return;
    /* show the chosen design at once from the cached copy; design-themes.js then refreshes it */
    try{
      var d = localStorage.getItem('cmpDesignOffice') || localStorage.getItem('cmpDesign');
      var c = localStorage.getItem('cmpDesignCss');
      if(d && c && !document.getElementById('cmp-design-css')){
        document.documentElement.setAttribute('data-design', d);
        var st = document.createElement('style'); st.id = 'cmp-design-css'; st.textContent = c;
        (document.head || document.documentElement).appendChild(st);
      }
    }catch(e2){}
    var s = document.createElement('script');
    s.id = 'cmp-design-js';
    s.src = '/camp-office-suite/design-themes.js?v=1';
    (document.head || document.documentElement).appendChild(s);
  }catch(e){}
})();
