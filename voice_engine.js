// ═══════════════════════════════════════════════════════════════
// SENTIRE VOICE ENGINE v1.0 — Add to any page for voice control
// Usage: <script src="voice_engine.js"></script> before </body>
// ═══════════════════════════════════════════════════════════════
(function(){
let VR=null,listening=false,currentField=null;
const page=location.pathname.split('/').pop()||'index.html';

// ─── CREATE FLOATING MIC BUTTON ───
const micCSS=document.createElement('style');
micCSS.textContent=`
.v-mic{position:fixed;bottom:24px;left:24px;width:56px;height:56px;border-radius:50%;border:2px solid #333;background:#1a1f2b;color:#7a8599;font-size:24px;cursor:pointer;z-index:9999;display:flex;align-items:center;justify-content:center;transition:all 0.3s;box-shadow:0 4px 20px rgba(0,0,0,0.4);}
.v-mic:hover{border-color:#3b82f6;color:#3b82f6;transform:scale(1.1);}
.v-mic.on{border-color:#ef4444;color:#ef4444;animation:vp 1.5s infinite;box-shadow:0 0 25px rgba(239,68,68,0.4);}
@keyframes vp{0%,100%{box-shadow:0 0 10px rgba(239,68,68,0.2);}50%{box-shadow:0 0 35px rgba(239,68,68,0.5);}}
.v-bar{position:fixed;bottom:90px;left:16px;background:#141820;border:1px solid #262d3a;border-radius:12px;padding:10px 16px;z-index:9999;font-family:'DM Sans',sans-serif;max-width:340px;display:none;box-shadow:0 8px 30px rgba(0,0,0,0.5);}
.v-bar.show{display:block;}
.v-bar .v-status{font-size:11px;color:#7a8599;font-family:'JetBrains Mono',monospace;}
.v-bar .v-status.active{color:#ef4444;}
.v-bar .v-status.ok{color:#22c55e;}
.v-bar .v-text{font-size:14px;color:#e8ecf4;font-weight:600;margin-top:4px;min-height:20px;}
.v-bar .v-hint{font-size:9px;color:#4a5568;font-family:'JetBrains Mono',monospace;margin-top:6px;line-height:1.4;}
`;
document.head.appendChild(micCSS);

const micBtn=document.createElement('button');
micBtn.className='v-mic';micBtn.innerHTML='🎤';micBtn.title='Voice Commands (Spacebar)';
micBtn.onclick=toggleV;document.body.appendChild(micBtn);

const bar=document.createElement('div');
bar.className='v-bar';
bar.innerHTML='<div class="v-status" id="vSt">Tap mic or press Spacebar</div><div class="v-text" id="vTx"></div><div class="v-hint" id="vHint"></div>';
document.body.appendChild(bar);

// Set hints based on page
const hints={
'index.html':'Say: "party name [name]" · "quantity [number]" · "loadcell ALC" · "submit order" · "show database" · "print"',
'marketing_crm.html':'Say: "add lead" · "company [name]" · "phone [number]" · "show pipeline" · "show dashboard"',
'factory_production.html':'Say: "new job" · "party [name]" · "quantity [number]" · "next stage" · "show board"',
'inventory_management.html':'Say: "add item" · "stock in" · "stock out" · "check stock" · "show imports"',
'accounts_reports.html':'Say: "add income" · "add expense" · "amount [number]" · "generate report" · "show receivables"',
'hub.html':'Say: "open orders" · "open marketing" · "open production" · "open inventory" · "open accounts"'
};
document.getElementById('vHint').textContent=hints[page]||'Say a command...';

// ─── SPEECH RECOGNITION ───
function initV(){
if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)){document.getElementById('vSt').textContent='Voice not supported. Use Chrome.';return false;}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
VR=new SR();VR.continuous=true;VR.interimResults=true;VR.lang='en-IN';
VR.onresult=function(e){let f='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)f+=e.results[i][0].transcript;else interim+=e.results[i][0].transcript;}
document.getElementById('vTx').textContent=interim||f;if(f)handleCmd(f.toLowerCase().trim());};
VR.onerror=function(e){if(e.error==='no-speech'){setStatus('No speech heard. Try again.','');}};
VR.onend=function(){if(listening)try{VR.start();}catch(e){}};
return true;}

function toggleV(){if(!VR&&!initV())return;if(listening)stopV();else startV();}
function startV(){try{VR.start();listening=true;micBtn.classList.add('on');bar.classList.add('show');setStatus('🔴 Listening...','active');}catch(e){}}
function stopV(){try{VR.stop();}catch(e){}listening=false;micBtn.classList.remove('on');setStatus('Mic off','');setTimeout(()=>bar.classList.remove('show'),2000);}
function setStatus(t,cls){const s=document.getElementById('vSt');s.textContent=t;s.className='v-status'+(cls?' '+cls:'');}
function confirm(t){setStatus('✓ '+t,'ok');speak(t);}

// ─── TEXT TO SPEECH ───
function speak(t){if('speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='en-IN';u.rate=1.1;speechSynthesis.speak(u);}}

// ─── FIELD SETTER ───
function setField(id,val){const el=document.getElementById(id);if(!el)return false;el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
function clickBtn(sel){const b=document.querySelector(sel);if(b){b.click();return true;}return false;}
function selectDD(id,val){const el=document.getElementById(id);if(!el)return false;for(let o of el.options){if(o.value.toLowerCase().includes(val)||o.textContent.toLowerCase().includes(val)){el.value=o.value;el.dispatchEvent(new Event('change',{bubbles:true}));return true;}}return false;}

// ─── EXTRACT VALUE FROM COMMAND ───
function extractAfter(cmd,keyword){const i=cmd.indexOf(keyword);if(i<0)return'';return cmd.substring(i+keyword.length).trim();}
function extractNumber(cmd){const m=cmd.match(/\d+/);return m?m[0]:'';}

// ─── COMMAND HANDLER ───
function handleCmd(cmd){
// ──── GLOBAL NAVIGATION ────
if(cmd.includes('open order')||cmd.includes('order sheet')||cmd.includes('go to order')){confirm('Opening Orders');location.href='index.html';return;}
if(cmd.includes('open marketing')||cmd.includes('open crm')||cmd.includes('go to marketing')){confirm('Opening CRM');location.href='marketing_crm.html';return;}
if(cmd.includes('open production')||cmd.includes('open factory')||cmd.includes('go to production')){confirm('Opening Production');location.href='factory_production.html';return;}
if(cmd.includes('open inventory')||cmd.includes('open stock')||cmd.includes('go to inventory')){confirm('Opening Inventory');location.href='inventory_management.html';return;}
if(cmd.includes('open account')||cmd.includes('open finance')||cmd.includes('go to account')){confirm('Opening Accounts');location.href='accounts_reports.html';return;}
if(cmd.includes('go home')||cmd.includes('go back')||cmd.includes('main menu')||cmd.includes('command center')){confirm('Going to Hub');location.href='hub.html';return;}
if(cmd.includes('stop listening')||cmd.includes('stop voice')||cmd.includes('mic off')){stopV();return;}

// ──── ORDER SHEET (index.html) ────
if(page==='index.html'||page===''){
if(cmd.includes('new order')||cmd.includes('new form')){clickBtn('.tab-btn');confirm('New Order form');return;}
if(cmd.includes('show database')||cmd.includes('master database')||cmd.includes('show orders')){document.querySelectorAll('.tab-btn')[1]?.click();confirm('Showing Database');return;}
if(cmd.includes('party name')||cmd.includes('party is')||cmd.includes('company name')||cmd.includes('client name')){
const v=extractAfter(cmd,cmd.includes('party name')?'party name':cmd.includes('party is')?'party is':cmd.includes('company name')?'company name':'client name');
if(v){selectDD('partyName',v)||setField('partyName',v);confirm('Party: '+v);}return;}
if(cmd.includes('location')||cmd.includes('city is')){const v=extractAfter(cmd,cmd.includes('location')?'location':'city is');if(v){setField('location',v);confirm('Location: '+v);}return;}
if(cmd.includes('email')){const v=extractAfter(cmd,'email');if(v){setField('clientEmail',v.replace(/\s+at\s+/g,'@').replace(/\s+dot\s+/g,'.').replace(/\s/g,''));confirm('Email set');}return;}
if(cmd.includes('phone')||cmd.includes('mobile')){const n=cmd.replace(/[^0-9+]/g,'');if(n.length>=10){setField('clientPhone',n);confirm('Phone: '+n);}return;}
if(cmd.includes('loadcell')||cmd.includes('load cell')||cmd.includes('type alc')||cmd.includes('type dlc')){
const types=['ALC','DLC','AS','DS','REG','CUT','JUMBO','S.E','S TYPE'];
types.forEach(t=>{if(cmd.toUpperCase().includes(t)){document.querySelectorAll('input[name=\"lc\"]').forEach(cb=>{if(cb.value===t){cb.checked=true;cb.closest('.chip-check')?.classList.add('checked');}});}});
confirm('Loadcell type set');return;}
if(cmd.includes('quantity')||cmd.includes('pieces')||cmd.includes('pcs')){const n=extractNumber(cmd);if(n){setField('quantity',n);confirm('Quantity: '+n);}return;}
if(cmd.includes('capacity')){const v=extractAfter(cmd,'capacity');if(v){setField('capacity',v);confirm('Capacity: '+v);}return;}
if(cmd.includes('wire')){const v=extractAfter(cmd,'wire');if(v){setField('wire',v);confirm('Wire: '+v);}return;}
if(cmd.includes('payment advance')){selectDD('paymentMode','Advance');confirm('Payment: Advance');return;}
if(cmd.includes('payment cod')||cmd.includes('cash on delivery')){selectDD('paymentMode','COD');confirm('Payment: COD');return;}
if(cmd.includes('payment credit')||cmd.includes('credit payment')){selectDD('paymentMode','Credit');confirm('Payment: Credit');return;}
if(cmd.includes('credit days')||cmd.includes('credit period')){const n=extractNumber(cmd);if(n){setField('creditDays',n);confirm('Credit Days: '+n);}return;}
if(cmd.includes('transporter')){const v=extractAfter(cmd,'transporter');if(v){selectDD('transporterName',v);confirm('Transporter: '+v);}return;}
if(cmd.includes('remark')||cmd.includes('note')){const v=extractAfter(cmd,cmd.includes('remark')?'remark':'note');if(v){setField('orderRemarks',v);confirm('Remarks added');}return;}
if(cmd.includes('submit order')||cmd.includes('save order')||cmd.includes('place order')){clickBtn('#submitBtn');confirm('Order submitted');return;}
if(cmd.includes('mark done')||cmd.includes('order complete')||cmd.includes('order done')){clickBtn('#completedBtn');confirm('Marked complete');return;}
if(cmd.includes('clear form')||cmd.includes('reset form')){clickBtn('.btn-ghost');confirm('Form cleared');return;}
if(cmd.includes('print order')||cmd.includes('print pdf')){clickBtn('#printFormBtn');confirm('Printing PDF');return;}
if(cmd.includes('export csv')||cmd.includes('download csv')){if(typeof exportCSV==='function')exportCSV();confirm('Exporting CSV');return;}
}

// ──── MARKETING CRM ────
if(page==='marketing_crm.html'){
if(cmd.includes('add lead')||cmd.includes('new lead')){if(typeof showView==='function')showView('addlead');confirm('Add Lead form');return;}
if(cmd.includes('show dashboard')||cmd.includes('dashboard')){if(typeof showView==='function')showView('dashboard');confirm('Dashboard');return;}
if(cmd.includes('show lead')||cmd.includes('lead database')){if(typeof showView==='function')showView('leads');confirm('Lead Database');return;}
if(cmd.includes('show pipeline')||cmd.includes('pipeline')){if(typeof showView==='function')showView('pipeline');confirm('Pipeline');return;}
if(cmd.includes('call log')||cmd.includes('show calls')){if(typeof showView==='function')showView('calls');confirm('Call Log');return;}
if(cmd.includes('follow up')||cmd.includes('followup')){if(typeof showView==='function')showView('followups');confirm('Follow-ups');return;}
if(cmd.includes('competitor')){if(typeof showView==='function')showView('competitors');confirm('Competitors');return;}
if(cmd.includes('company name')||cmd.includes('company is')){const v=extractAfter(cmd,cmd.includes('company name')?'company name':'company is');if(v){setField('lf_company',v);confirm('Company: '+v);}return;}
if(cmd.includes('contact name')||cmd.includes('contact is')||cmd.includes('person name')){const v=extractAfter(cmd,cmd.includes('contact name')?'contact name':cmd.includes('contact is')?'contact is':'person name');if(v){setField('lf_contact',v);confirm('Contact: '+v);}return;}
if(cmd.includes('phone')||cmd.includes('mobile')){const n=cmd.replace(/[^0-9+]/g,'');if(n.length>=10){setField('lf_phone',n);confirm('Phone: '+n);}return;}
if(cmd.includes('email')){const v=extractAfter(cmd,'email');if(v){setField('lf_email',v.replace(/\s+at\s+/g,'@').replace(/\s+dot\s+/g,'.').replace(/\s/g,''));confirm('Email set');}return;}
if(cmd.includes('city is')||cmd.includes('city ')){const v=extractAfter(cmd,'city');if(v){setField('lf_city',v);confirm('City: '+v);}return;}
if(cmd.includes('source indiamart')){selectDD('lf_source','IndiaMart');confirm('Source: IndiaMart');return;}
if(cmd.includes('source justdial')){selectDD('lf_source','JustDial');confirm('Source: JustDial');return;}
if(cmd.includes('source google')){selectDD('lf_source','Google');confirm('Source: Google');return;}
if(cmd.includes('source referral')){selectDD('lf_source','Referral');confirm('Source: Referral');return;}
if(cmd.includes('status interested')){selectDD('lf_status','Interested');confirm('Status: Interested');return;}
if(cmd.includes('status contacted')){selectDD('lf_status','Contacted');confirm('Status: Contacted');return;}
if(cmd.includes('status converted')){selectDD('lf_status','Converted');confirm('Status: Converted');return;}
if(cmd.includes('priority hot')){selectDD('lf_priority','Hot');confirm('Priority: Hot');return;}
if(cmd.includes('priority high')){selectDD('lf_priority','High');confirm('Priority: High');return;}
if(cmd.includes('save lead')||cmd.includes('submit lead')){clickBtn('#leadSubmitBtn');confirm('Lead saved');return;}
if(cmd.includes('export')||cmd.includes('csv')){if(typeof exportLeadsCSV==='function')exportLeadsCSV();confirm('Exporting');return;}
}

// ──── FACTORY PRODUCTION ────
if(page==='factory_production.html'){
if(cmd.includes('new job')||cmd.includes('add job')){if(typeof showV==='function')showV('add');confirm('New Job form');return;}
if(cmd.includes('show board')||cmd.includes('board')){if(typeof showV==='function')showV('board');confirm('Production Board');return;}
if(cmd.includes('show job')||cmd.includes('all job')){if(typeof showV==='function')showV('jobs');confirm('All Jobs');return;}
if(cmd.includes('dashboard')){if(typeof showV==='function')showV('dash');confirm('Dashboard');return;}
if(cmd.includes('party name')||cmd.includes('party is')){const v=extractAfter(cmd,cmd.includes('party name')?'party name':'party is');if(v){setField('jf_party',v);confirm('Party: '+v);}return;}
if(cmd.includes('quantity')||cmd.includes('pieces')){const n=extractNumber(cmd);if(n){setField('jf_qty',n);confirm('Quantity: '+n);}return;}
if(cmd.includes('order reference')||cmd.includes('order number')){const v=extractAfter(cmd,cmd.includes('order reference')?'order reference':'order number');if(v){setField('jf_order',v);confirm('Order Ref: '+v);}return;}
if(cmd.includes('priority urgent')){selectDD('jf_pri','Urgent');confirm('Priority: Urgent');return;}
if(cmd.includes('priority high')){selectDD('jf_pri','High');confirm('Priority: High');return;}
if(cmd.includes('save job')||cmd.includes('create job')||cmd.includes('submit job')){clickBtn('#jfBtn');confirm('Job saved');return;}
}

// ──── INVENTORY ────
if(page==='inventory_management.html'){
if(cmd.includes('add item')||cmd.includes('new item')){if(typeof showV==='function')showV('add');confirm('Add Item form');return;}
if(cmd.includes('show item')||cmd.includes('stock item')){if(typeof showV==='function')showV('items');confirm('Stock Items');return;}
if(cmd.includes('show bom')||cmd.includes('bill of material')){if(typeof showV==='function')showV('bom');confirm('BOM');return;}
if(cmd.includes('show import')||cmd.includes('china import')){if(typeof showV==='function')showV('import');confirm('Import Tracking');return;}
if(cmd.includes('transaction')||cmd.includes('stock movement')){if(typeof showV==='function')showV('txn');confirm('Transactions');return;}
if(cmd.includes('dashboard')){if(typeof showV==='function')showV('dash');confirm('Dashboard');return;}
if(cmd.includes('stock in')){if(typeof addTxn==='function')addTxn('in');confirm('Stock In');return;}
if(cmd.includes('stock out')){if(typeof addTxn==='function')addTxn('out');confirm('Stock Out');return;}
if(cmd.includes('item code')){const v=extractAfter(cmd,'item code');if(v){setField('if_code',v.toUpperCase());confirm('Code: '+v);}return;}
if(cmd.includes('item name')){const v=extractAfter(cmd,'item name');if(v){setField('if_name',v);confirm('Name: '+v);}return;}
if(cmd.includes('quantity')||cmd.includes('stock level')){const n=extractNumber(cmd);if(n){setField('if_stock',n);confirm('Stock: '+n);}return;}
if(cmd.includes('reorder level')||cmd.includes('reorder')){const n=extractNumber(cmd);if(n){setField('if_reorder',n);confirm('Reorder: '+n);}return;}
if(cmd.includes('save item')||cmd.includes('submit item')){clickBtn('#ifBtn');confirm('Item saved');return;}
}

// ──── ACCOUNTS ────
if(page==='accounts_reports.html'){
if(cmd.includes('add income')||cmd.includes('new income')){if(typeof showV==='function')showV('add');if(typeof setType==='function')setType('income');confirm('Add Income');return;}
if(cmd.includes('add expense')||cmd.includes('new expense')){if(typeof showV==='function')showV('add');if(typeof setType==='function')setType('expense');confirm('Add Expense');return;}
if(cmd.includes('show income')){if(typeof showV==='function')showV('income');confirm('Income');return;}
if(cmd.includes('show expense')){if(typeof showV==='function')showV('expense');confirm('Expenses');return;}
if(cmd.includes('show report')||cmd.includes('generate report')){if(typeof showV==='function')showV('report');if(typeof genReport==='function')genReport();confirm('Report');return;}
if(cmd.includes('receivable')){if(typeof showV==='function')showV('receivable');confirm('Receivables');return;}
if(cmd.includes('dashboard')){if(typeof showV==='function')showV('dash');confirm('Dashboard');return;}
if(cmd.includes('amount')){const n=extractNumber(cmd);if(n){setField('ef_amount',n);confirm('Amount: '+n);}return;}
if(cmd.includes('party name')||cmd.includes('vendor')){const v=extractAfter(cmd,cmd.includes('party')?'party name':'vendor');if(v){setField('ef_party',v);confirm('Party: '+v);}return;}
if(cmd.includes('description')){const v=extractAfter(cmd,'description');if(v){setField('ef_desc',v);confirm('Description added');}return;}
if(cmd.includes('save entry')||cmd.includes('submit entry')){clickBtn('#efBtn');confirm('Entry saved');return;}
if(cmd.includes('export')||cmd.includes('csv')){if(typeof exportReport==='function')exportReport();confirm('Exporting');return;}
}

// Not recognized
setStatus('❓ "'+cmd+'" — try again','');
}

// ─── KEYBOARD SHORTCUT ───
document.addEventListener('keydown',function(e){if(e.code==='Space'&&(e.target===document.body||e.target.tagName==='DIV')){e.preventDefault();toggleV();}});

// Auto-announce page
const pageNames={'index.html':'Order Sheet','marketing_crm.html':'Marketing CRM','factory_production.html':'Factory Production','inventory_management.html':'Inventory Management','accounts_reports.html':'Accounts and Reports','hub.html':'Command Center'};
})();
