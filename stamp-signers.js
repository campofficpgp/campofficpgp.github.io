/* stamp-signers.js — shared pick-list for the "Prepared by / Approved by" sign-off stamps (name + designation + office address).
   The starting list is built in. An admin (the "lists" permission) can change it with "Edit list": the list is then saved in
   Firestore lookupLists/stampSignatories ({items:[{name,designation,address}]}) and replaces the built-in one on every page.
   Nothing here is required: every stamp can still be typed by hand. */
(function(){
  var ADDR = 'Camp Office Prosecutor General Punjab\nSupreme Court Of Pakistan\nIslamabad';
  var DEFAULTS = [
    {name:'Iftikhar Ahmed', designation:'Junior Clerk', address:ADDR},
    {name:'Tariq Siddique', designation:'APG', address:ADDR},
    {name:'Ahmad Raza Gilani', designation:'APG', address:ADDR},
    {name:'Rai Akhtar Hussain', designation:'APG', address:ADDR},
    {name:'M. Irfan Zia', designation:'DPG', address:ADDR},
    {name:'Ms. Memoona Ehsan Ul Haq', designation:'DPG', address:ADDR},
    {name:'Sajjad Hussain', designation:'DPG', address:ADDR},
    {name:'Mirza Abid Majeed', designation:'DPG', address:ADDR}
  ];
  var LIST = DEFAULTS.slice();
  var DB = null, mounted = [];
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isUr(){ try{ return document.body.classList.contains('lang-ur') || document.documentElement.lang === 'ur' || document.documentElement.dir === 'rtl' || (typeof isUrdu !== 'undefined' && isUrdu === true); }catch(e){ return false; } }

  /* styles (only the manager window and the small "Edit list" link) */
  var css = document.createElement('style');
  css.textContent =
    '.ss-manage{display:none;font-size:11px;font-weight:700;color:#8a6a10;cursor:pointer;text-decoration:none;margin:0 0 4px;}' +
    'html.ss-can-edit .ss-manage{display:inline-block;}' +
    '.ss-back{position:fixed;inset:0;background:rgba(10,20,35,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px;}' +
    '.ss-box{background:#fff;color:#1d2733;border-radius:10px;width:min(760px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:inherit;}' +
    '.ss-hd{padding:14px 16px 6px;} .ss-hd h3{margin:0 0 3px;font-size:16px;color:#153A5B;} .ss-hd p{margin:0;font-size:12px;color:#5b6773;line-height:1.6;}' +
    '.ss-body{padding:6px 16px;overflow:auto;flex:1;}' +
    '.ss-row{display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:6px;align-items:start;padding:6px 0;border-bottom:1px solid #e3e8ee;}' +
    '.ss-row input,.ss-row textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #c9d1da;border-radius:6px;font-size:13px;font-family:inherit;background:#fff;color:#1d2733;}' +
    '.ss-row textarea{resize:vertical;} .ss-del{border:none;background:#c0392b;color:#fff;border-radius:6px;width:30px;height:30px;cursor:pointer;font-size:14px;}' +
    '.ss-colh{display:grid;grid-template-columns:1fr 1fr 1.4fr 30px;gap:6px;font-size:11.5px;font-weight:700;color:#5b6773;padding:4px 0;}' +
    '.ss-ft{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px 14px;border-top:1px solid #e3e8ee;}' +
    '.ss-ft button{padding:8px 14px;border:none;border-radius:6px;font-size:13px;cursor:pointer;background:#e8edf2;color:#1d2733;}' +
    '.ss-ft button.ss-go{background:#1F4E78;color:#fff;font-weight:600;} .ss-msg{flex:1;min-width:120px;font-size:12px;color:#5b6773;}' +
    '@media (max-width:640px){.ss-row{grid-template-columns:1fr;} .ss-colh{display:none;} .ss-del{width:100%;}}';
  (document.head || document.documentElement).appendChild(css);

  function manageLinkHtml(urdu){
    return '<a href="#" class="ss-manage" onclick="return StampSigners.openManager()">✎ ' + (urdu ? 'فہرست میں ترمیم' : 'Edit list') + '</a>';
  }

  /* does the signed-in user hold the "lists" permission? (same test as the Firestore rule: can('lists','l')) */
  function checkEdit(db){
    try{
      var u = firebase.auth().currentUser; if(!u) return;
      db.collection('users').doc(u.uid).get().then(function(d){
        var x = (d && d.exists && d.data()) || {}, r = x.roleV2 || '', pm = x.perms || {};
        var ok = r === 'super_admin' || (pm.lists ? pm.lists.l === true : r === 'admin');
        if(x.approvalStatus && x.approvalStatus !== 'approved') ok = false;
        document.documentElement.classList.toggle('ss-can-edit', !!ok);
      }).catch(function(){});
    }catch(e){}
  }

  var api = {
    addr: ADDR,
    list: function(){ return LIST; },
    get: function(i){ return LIST[parseInt(i, 10)] || null; },
    manageLinkHtml: manageLinkHtml,
    /* Firestore list (replaces the built-in one) + decide whether the "Edit list" link is shown */
    load: function(db){
      DB = db;
      checkEdit(db);
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
    /* wire an existing <select>: fills it, adds the small "Edit list" link after it, and calls onPick(item) when something is chosen */
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
        sel.insertAdjacentHTML('afterend', manageLinkHtml(urdu && urdu()));
      }
      mounted.push(sel);
    },
    refresh: function(){ mounted.forEach(function(s){ if(document.body.contains(s)) s.innerHTML = api.options(s.__ss.urdu && s.__ss.urdu()); }); },

    /* ---- the "Edit list" window ---- */
    openManager: function(){
      if(!DB){ try{ DB = firebase.firestore(); }catch(e){} }
      var ur = isUr(), back = document.createElement('div');
      back.className = 'ss-back'; back.setAttribute('role', 'dialog');
      back.innerHTML =
        '<div class="ss-box"><div class="ss-hd"><h3>' + (ur ? 'اسٹامپ کی فہرست (نام، عہدہ، دفتر کا پتہ)' : 'Stamp list (name, designation, office address)') + '</h3>' +
        '<p>' + (ur ? 'یہ فہرست Prepared by / Approved by کے ڈراپ ڈاؤن میں سب صفحات پر نظر آتی ہے۔ محفوظ کرتے ہی سب کے لیے بدل جاتی ہے۔' :
                      'This list appears in the Prepared by / Approved by drop-down on every page. Saving changes it for everyone.') + '</p></div>' +
        '<div class="ss-body"><div class="ss-colh"><span>' + (ur ? 'نام' : 'Name') + '</span><span>' + (ur ? 'عہدہ' : 'Designation') + '</span><span>' + (ur ? 'دفتر کا پتہ' : 'Office address') + '</span><span></span></div><div class="ss-rows"></div></div>' +
        '<div class="ss-ft"><button type="button" class="ss-add">+ ' + (ur ? 'نیا نام' : 'Add person') + '</button><button type="button" class="ss-reset">' + (ur ? 'ابتدائی فہرست' : 'Reset to starting list') + '</button>' +
        '<span class="ss-msg" role="status"></span><button type="button" class="ss-cancel">' + (ur ? 'بند کریں' : 'Close') + '</button><button type="button" class="ss-go">' + (ur ? 'محفوظ کریں' : 'Save') + '</button></div></div>';
      document.body.appendChild(back);
      var rows = back.querySelector('.ss-rows'), msg = back.querySelector('.ss-msg');
      function addRow(it){
        var r = document.createElement('div'); r.className = 'ss-row';
        r.innerHTML = '<input type="text" class="ss-n" placeholder="' + (ur ? 'نام' : 'Name') + '" value="' + esc(it.name) + '">' +
          '<input type="text" class="ss-d" placeholder="' + (ur ? 'عہدہ' : 'Designation') + '" value="' + esc(it.designation) + '">' +
          '<textarea class="ss-a" rows="3" placeholder="' + (ur ? 'دفتر کا پتہ' : 'Office address') + '">' + esc(it.address) + '</textarea>' +
          '<button type="button" class="ss-del" title="' + (ur ? 'ہٹائیں' : 'Remove') + '">✕</button>';
        r.querySelector('.ss-del').onclick = function(){ r.remove(); };
        rows.appendChild(r);
      }
      function fill(list){ rows.innerHTML = ''; list.forEach(addRow); }
      function close(){ back.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e){ if(e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      back.addEventListener('mousedown', function(e){ if(e.target === back) close(); });
      back.querySelector('.ss-cancel').onclick = close;
      back.querySelector('.ss-add').onclick = function(){ addRow({name:'', designation:'', address:ADDR}); rows.lastChild.querySelector('input').focus(); };
      back.querySelector('.ss-reset').onclick = function(){ fill(DEFAULTS); msg.textContent = ur ? 'ابتدائی فہرست بھر دی گئی — محفوظ کریں دبائیں۔' : 'Starting list filled in — press Save.'; };
      back.querySelector('.ss-go').onclick = function(){
        var items = [].slice.call(rows.querySelectorAll('.ss-row')).map(function(r){
          return {name:r.querySelector('.ss-n').value.trim(), designation:r.querySelector('.ss-d').value.trim(), address:r.querySelector('.ss-a').value.trim()};
        }).filter(function(x){ return x.name; });
        if(!items.length){ msg.textContent = ur ? 'کم از کم ایک نام ضروری ہے۔' : 'At least one name is needed.'; return; }
        if(!DB){ msg.textContent = ur ? 'ڈیٹا بیس تک رسائی نہیں۔' : 'No database connection.'; return; }
        msg.textContent = ur ? 'محفوظ ہو رہا ہے…' : 'Saving…';
        var who = ''; try{ who = firebase.auth().currentUser.email || ''; }catch(e){}
        var stamp = null; try{ stamp = firebase.firestore.FieldValue.serverTimestamp(); }catch(e){}
        DB.collection('lookupLists').doc('stampSignatories').set({items:items, updatedBy:who, updatedAt:stamp}).then(function(){
          LIST = items.slice(); api.refresh(); msg.textContent = ur ? 'محفوظ ہو گئی۔' : 'Saved.';
          setTimeout(close, 700);
        }).catch(function(err){
          msg.textContent = (ur ? 'محفوظ نہیں ہو سکی: ' : 'Could not save: ') + ((err && (err.code === 'permission-denied')) ? (ur ? 'آپ کو فہرستیں بدلنے کی اجازت نہیں۔' : 'you do not have permission to change lists.') : (err && err.message || err));
        });
      };
      fill(LIST);
      return false;
    }
  };
  window.StampSigners = api;
})();
