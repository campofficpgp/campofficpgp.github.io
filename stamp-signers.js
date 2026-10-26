/* stamp-signers.js — shared pick-list for the "Prepared by / Approved by" sign-off stamps (name + designation + office address).
   Starting list is built in; if an admin saves {items:[{name,designation,address}]} in Firestore lookupLists/stampSignatories,
   that list replaces it (loaded with StampSigners.load(db)). Nothing here is required: every stamp can still be typed by hand. */
(function(){
  var ADDR = 'Camp Office Prosecutor General Punjab\nSupreme Court Of Pakistan\nIslamabad';
  var LIST = [
    {name:'Iftikhar Ahmed', designation:'Junior Clerk', address:ADDR},
    {name:'Tariq Siddique', designation:'APG', address:ADDR},
    {name:'Ahmad Raza Gilani', designation:'APG', address:ADDR},
    {name:'Rai Akhtar Hussain', designation:'APG', address:ADDR},
    {name:'M. Irfan Zia', designation:'DPG', address:ADDR},
    {name:'Ms. Memoona Ehsan Ul Haq', designation:'DPG', address:ADDR},
    {name:'Sajjad Hussain', designation:'DPG', address:ADDR},
    {name:'Mirza Abid Majeed', designation:'DPG', address:ADDR}
  ];
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  var api = {
    addr: ADDR,
    list: function(){ return LIST; },
    get: function(i){ return LIST[parseInt(i, 10)] || null; },
    /* Firestore override (safe to call with any firebase db; failures are ignored) */
    load: function(db){
      try{
        return db.collection('lookupLists').doc('stampSignatories').get().then(function(d){
          var it = d.exists && d.data() && d.data().items;
          if(it && it.length){
            LIST = it.map(function(x){ return {name:String(x.name||''), designation:String(x.designation||''), address:String(x.address||ADDR)}; });
            api.refresh();
          }
        }).catch(function(){});
      }catch(e){ return Promise.resolve(); }
    },
    /* <option> tags, first one is the empty "choose" entry */
    options: function(urdu){
      return '<option value="">' + (urdu ? '— فہرست سے چنیں (یا خود لکھیں) —' : '— Choose from list (or type) —') + '</option>' +
        LIST.map(function(x,i){ return '<option value="'+i+'">'+esc(x.name + (x.designation ? ' — ' + x.designation : ''))+'</option>'; }).join('');
    },
    /* wire an existing <select>: fills it and calls onPick(item) when something is chosen (then resets it) */
    mount: function(sel, onPick, urdu){
      if(!sel) return;
      sel.__ss = { onPick:onPick, urdu:urdu };
      sel.innerHTML = api.options(urdu && urdu());
      if(!sel.__ssWired){
        sel.__ssWired = true;
        sel.addEventListener('change', function(){
          var it = api.get(sel.value);
          sel.value = '';
          if(it && sel.__ss.onPick) sel.__ss.onPick(it);
        });
      }
      mounted.push(sel);
    },
    refresh: function(){ mounted.forEach(function(s){ if(document.body.contains(s)) s.innerHTML = api.options(s.__ss.urdu && s.__ss.urdu()); }); }
  };
  var mounted = [];
  window.StampSigners = api;
})();
