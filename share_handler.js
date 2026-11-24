// Sentire — "Share to Command Center" (1.5.0)
// WhatsApp (or any app) → Share → Sentire Command Center: the shared PDF invoices arrive here as a POST to
// share-invoice, are kept in IndexedDB (sentire-share / files) and the app opens Accounts → Invoice Inbox,
// which picks them up and runs Data Migration by itself. Used by both service workers (same scope).
function stShareDb(){return new Promise(function(res,rej){var r=indexedDB.open('sentire-share',1);r.onupgradeneeded=function(){r.result.createObjectStore('files',{keyPath:'id'});};r.onsuccess=function(){res(r.result);};r.onerror=function(){rej(r.error);};});}
async function stHandleShare(request){
  try{var fd=await request.formData();var files=fd.getAll('files').filter(function(f){return f&&f.size;});
    if(files.length){var db=await stShareDb();await new Promise(function(res,rej){var tx=db.transaction('files','readwrite');var st=tx.objectStore('files');
      files.forEach(function(f,i){st.put({id:Date.now()+'-'+i,name:f.name||('shared-'+i+'.pdf'),type:f.type||'application/pdf',blob:f,at:Date.now()});});tx.oncomplete=res;tx.onerror=function(){rej(tx.error);};});}
  }catch(e){}
  return Response.redirect('index.html#accounts',303);}
self.addEventListener('fetch',function(e){var u=new URL(e.request.url);
  if(e.request.method==='POST'&&u.origin===location.origin&&/\/share-invoice\/?$/.test(u.pathname)){e.stopImmediatePropagation();e.respondWith(stHandleShare(e.request));}});
