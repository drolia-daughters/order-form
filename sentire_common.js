// ═══════════════════════════════════════════════════════════════
// SENTIRE COMMON — shared by Orders, Production, Masters, Cohort, Accounts
// Masters data · approvals (name + PIN) · holiday calendar · direct print
// · order-sheet print layout · WhatsApp · payment reminder rules
// ═══════════════════════════════════════════════════════════════
(function(){
const ST=window.ST={};

// ─── Storage ───
ST.K={orders:'ordersheet_master_db',parties:'ordersheet_parties',partyLocs:'ordersheet_party_locs',clients:'ordersheet_client_contacts',
  transporters:'ordersheet_transporters',trContacts:'ordersheet_transporter_contacts',jobs:'prod_jobs',fin:'fin_entries',
  company:'st_company',approvers:'st_approvers',holidays:'st_holidays',rules:'st_payment_rules',log:'st_approval_log',bills:'st_bills'};
ST.get=(k,def)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?def:v;}catch(e){return def;}};
ST.set=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
ST.esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
ST.today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
ST.iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
ST.parseISO=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
ST.fmtDate=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'-'+m[2]+'-'+m[1]:(s||'');};
ST.daysBetween=(a,b)=>Math.round((ST.parseISO(b)-ST.parseISO(a))/86400000);
ST.addDays=(s,n)=>{const d=ST.parseISO(s);d.setDate(d.getDate()+n);return ST.iso(d);};
ST.inr=n=>'₹'+(Math.round((+n||0)*100)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});

// ─── Masters ───
ST.companyDefaults={name:'Sentire Technologies',address:'',city:'Vadodara',state:'Gujarat',stateCode:'24',pincode:'',gstin:'',phone:'',email:'',
  pickupAddress:'',hsn:'',gst:18,invoicePrefix:'ST/26-27/',cutoff:'14:00',weeklyOff:[0],bankDetails:''};
ST.company=()=>Object.assign({},ST.companyDefaults,ST.get(ST.K.company,{}));
ST.rulesDefaults={firstAfter:1,gap:7,max:3};
ST.rules=()=>Object.assign({},ST.rulesDefaults,ST.get(ST.K.rules,{}));
ST.clients=()=>ST.get(ST.K.clients,{});
ST.client=name=>{const c=ST.clients()[name]||{};const loc=ST.get(ST.K.partyLocs,{})[name];return Object.assign({location:loc||''},c);};
ST.transporter=name=>ST.get(ST.K.trContacts,{})[name]||{};
ST.approvers=()=>ST.get(ST.K.approvers,[]);

// ─── Items: an order can have several loadcell lines ───
ST.items=o=>{if(o&&Array.isArray(o.items)&&o.items.length)return o.items;
  return [{type:(o&&(o.loadcellType||o.type))||'',qty:(o&&(o.quantity||o.qty))||'',capacity:(o&&(o.capacity||o.cap))||'',wire:(o&&o.wire)||''}];};
ST.itemsSummary=items=>{const uniq=a=>[...new Set(a.map(x=>String(x||'').trim()).filter(Boolean))];
  const total=items.reduce((s,i)=>s+(parseFloat(i.qty)||0),0);
  return {loadcellType:uniq(items.map(i=>i.type)).join(', '),quantity:total?String(total):'',capacity:uniq(items.map(i=>i.capacity)).join(' / '),wire:uniq(items.map(i=>i.wire)).join(' / '),
    itemsText:items.map(i=>(i.type||'?')+' × '+(i.qty||'?')+(i.capacity?' ('+i.capacity+(i.wire?', '+i.wire:'')+')':(i.wire?' ('+i.wire+')':''))).join('; ')};};
ST.itemsShort=items=>items.map(i=>(i.type||'?')+' '+(i.qty||'?')+' pcs').join(', ');

// ─── WhatsApp ───
ST.waPhone=p=>{let d=String(p||'').replace(/[^0-9]/g,'');if(d.length===11&&d[0]==='0')d=d.slice(1);if(d.length===10)d='91'+d;return d;};
ST.openWA=(phone,text)=>{const p=ST.waPhone(phone);window.open('https://wa.me/'+(p||'')+'?text='+encodeURIComponent(text),'_blank');};

// ─── PIN hashing ───
async function hashPin(pin){const txt='sentire-approver|'+pin;
  try{if(window.crypto&&crypto.subtle){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return 'h1:'+[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}}catch(e){}
  let h=5381;for(const c of txt)h=((h<<5)+h+c.charCodeAt(0))>>>0;return 'h0:'+h.toString(16);}
ST.hashPin=hashPin;

// ─── Small modal framework ───
const css=document.createElement('style');css.textContent=`
.st-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'DM Sans',system-ui,sans-serif;}
.st-md{background:#141820;border:1px solid #262d3a;border-radius:14px;width:100%;max-width:460px;max-height:92vh;overflow:auto;color:#e8ecf4;box-shadow:0 20px 60px rgba(0,0,0,.6);}
.st-md.wide{max-width:980px;}
.st-md h3{font-size:17px;padding:18px 20px 4px;}
.st-md .st-sub{font-size:12px;color:#7a8599;padding:0 20px 10px;line-height:1.5;white-space:pre-line;}
.st-md .st-body{padding:4px 20px 8px;}
.st-md label{display:block;font-size:11px;font-weight:600;color:#7a8599;text-transform:uppercase;margin:10px 0 4px;font-family:'JetBrains Mono',monospace;}
.st-md input,.st-md select,.st-md textarea{width:100%;background:#0c0f14;border:1px solid #262d3a;border-radius:8px;padding:10px 12px;color:#e8ecf4;font-size:14px;font-family:inherit;outline:none;}
.st-md input:focus,.st-md select:focus{border-color:#3b82f6;}
.st-md .st-err{color:#ef4444;font-size:12px;min-height:16px;margin-top:8px;}
.st-md .st-act{display:flex;gap:10px;justify-content:flex-end;padding:12px 20px 18px;flex-wrap:wrap;}
.st-btn{padding:10px 18px;border-radius:8px;border:1px solid #262d3a;background:transparent;color:#e8ecf4;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit;}
.st-btn.pri{background:#3b82f6;border-color:#3b82f6;color:#fff;}.st-btn.ok{background:#22c55e;border-color:#22c55e;color:#fff;}
.st-btn.wa{background:rgba(37,211,102,.14);border-color:rgba(37,211,102,.4);color:#25d366;}
.st-lines{background:#0c0f14;border:1px solid #262d3a;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.6;white-space:pre-line;}
.st-cal{position:absolute;z-index:100001;background:#141820;border:1px solid #262d3a;border-radius:12px;padding:12px;width:300px;box-shadow:0 14px 40px rgba(0,0,0,.6);font-family:'DM Sans',system-ui,sans-serif;color:#e8ecf4;}
.st-cal .hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:700;font-size:14px;}
.st-cal .hd button{background:#1a1f2b;border:1px solid #262d3a;color:#e8ecf4;border-radius:6px;width:30px;height:28px;cursor:pointer;font-size:14px;}
.st-cal .gr{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
.st-cal .wd{font-size:10px;color:#7a8599;text-align:center;font-family:'JetBrains Mono',monospace;padding:2px 0;}
.st-cal .dy{height:34px;border-radius:6px;border:1px solid transparent;background:#1a1f2b;color:#e8ecf4;cursor:pointer;font-size:13px;position:relative;font-family:inherit;}
.st-cal .dy:hover{border-color:#3b82f6;}
.st-cal .dy.off{background:rgba(239,68,68,.10);color:#f87171;}
.st-cal .dy.hol{background:rgba(239,68,68,.28);color:#fff;font-weight:700;}
.st-cal .dy.hol::after{content:'';position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:#fbbf24;}
.st-cal .dy.tdy{border-color:#22c55e;}.st-cal .dy.sel{background:#3b82f6;color:#fff;}
.st-cal .dy.past{opacity:.45;}
.st-cal .ls{margin-top:8px;font-size:11px;color:#9aa4b5;max-height:90px;overflow:auto;line-height:1.6;border-top:1px solid #262d3a;padding-top:6px;}
.st-cal .ls b{color:#f87171;font-weight:600;}
.st-cal .lg{display:flex;gap:10px;font-size:10px;color:#7a8599;margin-top:6px;}
.st-cal .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:3px;vertical-align:-1px;}
.st-calbtn{border:1px solid #262d3a;background:#1a1f2b;color:#e8ecf4;border-radius:8px;padding:0 10px;font-size:16px;cursor:pointer;flex-shrink:0;}
.st-calbtn:hover{border-color:#3b82f6;}
.st-calwrap{display:flex;gap:6px;align-items:stretch;}
.st-holwarn{font-size:11px;color:#f87171;margin-top:4px;font-family:'JetBrains Mono',monospace;min-height:0;}
`;document.head.appendChild(css);

ST.modal=function({title,sub,html,wide,buttons}){return new Promise(res=>{
  const ov=document.createElement('div');ov.className='st-ov';
  ov.innerHTML=`<div class="st-md${wide?' wide':''}"><h3>${title||''}</h3>${sub?`<div class="st-sub">${sub}</div>`:''}<div class="st-body">${html||''}<div class="st-err"></div></div><div class="st-act"></div></div>`;
  const act=ov.querySelector('.st-act');const err=ov.querySelector('.st-err');
  const close=v=>{ov.remove();res(v);};
  (buttons||[{label:'Close',value:null}]).forEach(b=>{const el=document.createElement('button');el.type='button';el.className='st-btn '+(b.cls||'');el.textContent=b.label;
    el.onclick=async()=>{if(b.onClick){err.textContent='';const r=await b.onClick(ov,err);if(r===false)return;close(r===undefined?b.value:r);}else close(b.value);};act.appendChild(el);});
  ov.addEventListener('keydown',e=>{if(e.key==='Escape')close(null);});
  document.body.appendChild(ov);const f=ov.querySelector('input,select,textarea');if(f)setTimeout(()=>f.focus(),30);
});};

// ─── APPROVAL: Admin, Sub Admin or Authorised person picks their name and enters their PIN ───
ST.ROLES=['Admin','Sub Admin','Authorised'];
ST.approve=async function({title,lines,ref,action,roles}){
  if(window.SentireAuth&&SentireAuth.canApprove&&!SentireAuth.canApprove()){alert('Only the Admin, Sub Admin or an approver can approve.');return null;}
  roles=roles||ST.ROLES;
  let list=ST.approvers().filter(a=>roles.includes(a.role));
  if(!ST.approvers().length){
    const made=await ST.modal({title:'Set up the first Admin',sub:'No approvers exist yet. Create the Admin now — later you can add Sub Admin and Authorised persons in Masters → Approvers.',
      html:`<label>Admin name</label><input id="stA_n" placeholder="e.g. Abhishek"><label>WhatsApp number</label><input id="stA_p" placeholder="98xxxxxxxx"><label>PIN (at least 4 digits)</label><input id="stA_1" type="password" inputmode="numeric"><label>PIN again</label><input id="stA_2" type="password" inputmode="numeric">`,
      buttons:[{label:'Cancel',value:null},{label:'Create Admin',cls:'pri',onClick:async(ov,err)=>{const n=ov.querySelector('#stA_n').value.trim(),p1=ov.querySelector('#stA_1').value,p2=ov.querySelector('#stA_2').value;
        if(!n){err.textContent='Enter a name.';return false;}if(!/^\d{4,}$/.test(p1)){err.textContent='PIN must be at least 4 digits.';return false;}if(p1!==p2){err.textContent='The two PINs do not match.';return false;}
        const a={id:'ap'+Date.now().toString(36),name:n,role:'Admin',phone:ov.querySelector('#stA_p').value.trim(),pinHash:await hashPin(p1)};ST.set(ST.K.approvers,[a]);return true;}}]});
    if(!made)return null;list=ST.approvers().filter(a=>roles.includes(a.role));}
  if(!list.length){alert('No approver with role '+roles.join(' / ')+' exists. Add one in Masters → Approvers.');return null;}
  const opts=list.map(a=>`<option value="${a.id}">${ST.esc(a.name)} — ${a.role}</option>`).join('');
  const r=await ST.modal({title:'🔐 '+(title||'Approval needed'),sub:'Approved by: '+roles.join(', '),
    html:`${lines?`<div class="st-lines">${ST.esc(Array.isArray(lines)?lines.join('\n'):lines)}</div>`:''}<label>Approver</label><select id="stAp">${opts}</select><label>PIN</label><input id="stPin" type="password" inputmode="numeric" autocomplete="off">`,
    buttons:[{label:'Cancel',value:null},{label:'✓ Approve',cls:'ok',onClick:async(ov,err)=>{const a=list.find(x=>x.id===ov.querySelector('#stAp').value);const pin=ov.querySelector('#stPin').value;
      if(!pin){err.textContent='Enter the PIN.';return false;}if(await hashPin(pin)!==a.pinHash){err.textContent='Wrong PIN for '+a.name+'.';ov.querySelector('#stPin').value='';return false;}
      return {by:a.name,role:a.role,at:new Date().toISOString()};}}]});
  if(r){const log=ST.get(ST.K.log,[]);log.push(Object.assign({action:action||title,ref:ref||''},r));ST.set(ST.K.log,log.slice(-2000));}
  return r;};
// Enter on PIN field = Approve
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&(e.target.id==='stPin'||e.target.id==='stA_2')){const b=e.target.closest('.st-md').querySelector('.st-btn.ok,.st-btn.pri');if(b){e.preventDefault();b.click();}}});

// ─── HOLIDAYS (industrial holiday calendar) ───
// Gujarat 2026 dates from the state government list; edit or add years in Masters → Holidays.
ST.DEFAULT_HOLIDAYS=[
  ['2026-01-14','Uttarayan / Makar Sankranti'],['2026-01-26','Republic Day'],['2026-03-04','Dhuleti'],['2026-05-01','Gujarat Day / May Day'],
  ['2026-08-15','Independence Day'],['2026-08-28','Raksha Bandhan'],['2026-09-04','Janmashtami'],['2026-10-02','Gandhi Jayanti'],
  ['2026-10-20','Dussehra'],['2026-11-08','Diwali'],['2026-11-10','Bestu Varas (Gujarati New Year)'],['2026-11-11','Bhai Beej'],
  ['2027-01-14','Uttarayan / Makar Sankranti'],['2027-01-26','Republic Day'],['2027-05-01','Gujarat Day / May Day'],['2027-08-15','Independence Day'],['2027-10-02','Gandhi Jayanti']
].map(([date,name])=>({date,name}));
ST.holidays=()=>{const h=ST.get(ST.K.holidays,null);return (h||ST.DEFAULT_HOLIDAYS).slice().sort((a,b)=>a.date.localeCompare(b.date));};
ST.holidayName=s=>{const h=ST.holidays().find(x=>x.date===s);if(h)return h.name;const d=ST.parseISO(s);if(d&&(ST.company().weeklyOff||[0]).includes(d.getDay()))return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]+' (weekly off)';return '';};
ST.nextWorkingDay=s=>{let d=ST.addDays(s,1),i=0;while(ST.holidayName(d)&&i++<30)d=ST.addDays(d,1);return d;};

// Attach a 📅 calendar button (with holidays marked) to a date input
ST.attachCalendar=function(input){if(!input||input.dataset.stCal)return;input.dataset.stCal='1';
  const wrap=document.createElement('div');wrap.className='st-calwrap';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);input.style.flex='1';
  const b=document.createElement('button');b.type='button';b.className='st-calbtn';b.textContent='📅';b.title='Pick a date — holidays are marked in red';wrap.appendChild(b);
  const warn=document.createElement('div');warn.className='st-holwarn';wrap.parentNode.insertBefore(warn,wrap.nextSibling);
  const check=()=>{const n=input.value?ST.holidayName(input.value):'';warn.textContent=n?'⚠ Holiday: '+n:'';};
  input.addEventListener('change',check);input.addEventListener('input',check);input._stCheck=check;
  b.onclick=e=>{e.stopPropagation();ST.openCalendar(input,b);};};
ST.openCalendar=function(input,anchor){document.querySelectorAll('.st-cal').forEach(x=>x.remove());
  const sel=input.value;let cur=ST.parseISO(sel)||new Date();cur=new Date(cur.getFullYear(),cur.getMonth(),1);
  const box=document.createElement('div');box.className='st-cal';document.body.appendChild(box);
  const place=()=>{const r=anchor.getBoundingClientRect();let x=r.right+window.scrollX-300,y=r.bottom+window.scrollY+6;if(x<8)x=8;
    if(r.bottom+box.offsetHeight+10>window.innerHeight&&r.top>box.offsetHeight)y=r.top+window.scrollY-box.offsetHeight-6;box.style.left=x+'px';box.style.top=y+'px';};
  const draw=()=>{const y=cur.getFullYear(),m=cur.getMonth();const first=(new Date(y,m,1).getDay()+6)%7;const days=new Date(y,m+1,0).getDate();const t=ST.today();
    const hol=ST.holidays().filter(h=>h.date.startsWith(y+'-'+String(m+1).padStart(2,'0')));
    let cells='';for(let i=0;i<first;i++)cells+='<span></span>';
    for(let d=1;d<=days;d++){const s=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');const h=hol.find(x=>x.date===s);const off=!h&&ST.holidayName(s);
      cells+=`<button type="button" class="dy${h?' hol':''}${off?' off':''}${s===t?' tdy':''}${s===sel?' sel':''}${s<t?' past':''}" data-d="${s}" title="${h?ST.esc(h.name):off?'Weekly off':''}">${d}</button>`;}
    box.innerHTML=`<div class="hd"><button type="button" data-n="-1">‹</button><span>${cur.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</span><button type="button" data-n="1">›</button></div>
    <div class="gr">${['Mo','Tu','We','Th','Fr','Sa','Su'].map(w=>`<div class="wd">${w}</div>`).join('')}${cells}</div>
    <div class="lg"><span><i style="background:rgba(239,68,68,.5)"></i>Holiday</span><span><i style="background:rgba(239,68,68,.15)"></i>Weekly off</span><span><i style="border:1px solid #22c55e"></i>Today</span></div>
    <div class="ls">${hol.length?hol.map(h=>`<div><b>${ST.fmtDate(h.date)}</b> ${ST.esc(h.name)}</div>`).join(''):'No holidays this month'}</div>`;
    box.querySelectorAll('[data-n]').forEach(x=>x.onclick=e=>{e.stopPropagation();cur=new Date(y,m+(+x.dataset.n),1);draw();});
    box.querySelectorAll('.dy').forEach(x=>x.onclick=e=>{e.stopPropagation();const s=x.dataset.d;const n=ST.holidayName(s);
      if(n&&!confirm(ST.fmtDate(s)+' is a holiday ('+n+').\nUse this date anyway?'))return;
      input.value=s;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));box.remove();});
    place();};
  draw();box.addEventListener('click',e=>e.stopPropagation());
  setTimeout(()=>document.addEventListener('click',function off(){box.remove();document.removeEventListener('click',off);}),0);};

// ─── DIRECT PRINT: opens the printer dialog instead of saving the PDF ───
ST.printDoc=function(doc,name){
  if(location.protocol==='file:'){doc.autoPrint();const w=window.open(doc.output('bloburl'),'_blank');if(!w)doc.save((name||'print')+'.pdf');return;}
  const url=URL.createObjectURL(doc.output('blob'));
  let fr=document.getElementById('st-print-frame');if(fr)fr.remove();
  fr=document.createElement('iframe');fr.id='st-print-frame';fr.setAttribute('aria-hidden','true');
  fr.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  fr.onload=()=>{setTimeout(()=>{try{fr.contentWindow.focus();fr.contentWindow.print();}catch(e){doc.autoPrint();window.open(doc.output('bloburl'),'_blank');}},250);};
  fr.src=url;document.body.appendChild(fr);};

// ─── ORDER SHEET PRINT LAYOUT (half A4) — used by Order Sheet and the Production job card ───
// Shows only what production needs. Client contact, payment, transporter ID/email, L.R. and tracking stay in the database.
ST.drawOrderSheet=function(doc,o,top,opt){opt=opt||{};
  const W=210,M=10,CW=W-2*M,HH=opt.full?297:148.5;let y=top+7;
  const items=ST.items(o);const multi=items.length>1;
  // Header
  doc.setFillColor(30,41,59);doc.rect(M,y,CW,13,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(255);doc.text('ORDER SHEET',M+4,y+8.5);
  doc.setFontSize(10);doc.text(String(o.orderNo||'')+(opt.jobNo&&opt.jobNo!==o.orderNo?'   ·   '+opt.jobNo:''),W-M-4,y+5.5,{align:'right'});
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(210);doc.text('Date: '+(ST.fmtDate(o.date)||'—'),W-M-4,y+10.5,{align:'right'});
  if(o.status==='cancelled'){doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(239,68,68);doc.text('CANCELLED',W/2,y+8.5,{align:'center'});}
  else if(opt.stage){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(134,239,172);doc.text('Stage: '+opt.stage,W/2+8,y+8.5,{align:'center'});}
  y+=16;doc.setDrawColor(190);doc.setLineWidth(0.2);
  // Height plan: shrink the logo box and remarks when there are many items so the sheet stays in half a page
  let rowH=7.5,lh=30,prodH=20;const fixed=10+9+9+9+2+11+6; // party, capacity/total row, transporter, order remarks, gap+dept, footer
  const avail=HH-7-16-fixed;
  const need=()=>(multi?(7+items.length*rowH):9)+lh+prodH;
  if(need()>avail){lh=Math.max(14,lh-(need()-avail));}
  if(need()>avail){prodH=Math.max(12,prodH-(need()-avail));}
  if(need()>avail&&multi){rowH=Math.max(5.5,(avail-7-lh-prodH)/items.length);}
  const cell=(x,w,lw,label,val,h,o2)=>{o2=o2||{};doc.rect(x,y,w,h);doc.setFillColor(243,245,248);doc.rect(x,y,lw,h,'FD');
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(90);doc.splitTextToSize(label,lw-3).forEach((l,i)=>doc.text(l,x+2,y+Math.min(5.4,h/2+1.5)+i*3.4));
    if(val==null)return;doc.setFont('helvetica',o2.bold?'bold':'normal');doc.setFontSize(o2.big?12:10);doc.setTextColor(20);
    const maxL=Math.max(1,Math.floor((h-2)/4.4));doc.splitTextToSize(String(val===''?'':val||'—'),w-lw-4).slice(0,maxL).forEach((ln,i)=>doc.text(ln,x+lw+2,y+Math.min(o2.big?6.4:5.6,h/2+2)+i*4.4));};
  const row=(cols,h)=>{let x=M;cols.forEach(c=>{const w=CW*c[2];cell(x,w,c[3],c[0],c[1],h,c[4]);x+=w;});y+=h;};
  const tr=ST.transporter(o.transporterName);const tPhone=o.transporterPhone||tr.phone||'';
  const desp=o.dod||o.deliveryDate||'';const despLabel=o.dod?'Despatch Date':'Delivery Date';
  row([['Name of Party',o.partyName,0.62,25,{bold:true,big:true}],['Location',o.location,0.38,20]],10);
  if(!multi){const it=items[0];
    row([['Type of Loadcell',it.type,0.42,25],['Qty (pcs.)',it.qty,0.2,17,{bold:true,big:true}],['Wire',it.wire,0.38,13]],9);
    row([['Capacity',it.capacity,0.5,25],[despLabel,ST.fmtDate(desp),0.5,25,{bold:true}]],9);
  }else{
    const cols=[['Type of Loadcell',0.3],['Qty (pcs.)',0.16],['Capacity',0.24],['Wire',0.3]];
    let x=M;doc.setFillColor(226,232,240);doc.rect(M,y,CW,7,'FD');cols.forEach(c=>{const w=CW*c[1];doc.rect(x,y,w,7);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(60);doc.text(c[0],x+2,y+4.8);x+=w;});y+=7;
    items.forEach(it=>{let x2=M;[[it.type,0.3],[it.qty,0.16,true],[it.capacity,0.24],[it.wire,0.3]].forEach(c=>{const w=CW*c[1];doc.rect(x2,y,w,rowH);doc.setFont('helvetica',c[2]?'bold':'normal');doc.setFontSize(rowH<7?9:10);doc.setTextColor(20);
      doc.text(doc.splitTextToSize(String(c[0]||'—'),w-4)[0],x2+2,y+rowH/2+1.6);x2+=w;});y+=rowH;});
    const tot=items.reduce((s,i)=>s+(parseFloat(i.qty)||0),0);
    row([['Total Qty',tot+' pcs',0.5,25,{bold:true}],[despLabel,ST.fmtDate(desp),0.5,25,{bold:true}]],9);}
  cell(M,CW,25,'Laser / Logo',o.laserLogo||(o.logoImage?'':'—'),lh,{bold:true,big:true});
  if(o.logoImage){try{const fmt=((o.logoImage.match(/^data:image\/(\w+)/)||[])[1]||'PNG').toUpperCase();const p=doc.getImageProperties(o.logoImage);const mh=lh-4,mw=100;let w=mh*p.width/p.height,h=mh;if(w>mw){w=mw;h=mw*p.height/p.width;}doc.addImage(o.logoImage,fmt==='JPG'?'JPEG':fmt,W-M-4-w,y+(lh-h)/2,w,h);}catch(e){}}
  y+=lh;
  row([['Transporter',o.transporterName,0.62,25],['Tr. Phone',tPhone,0.38,20]],9);
  row([['Order Remarks',o.orderRemarks,1,25]],9);
  row([['Production Remarks',o.productionRemarks,1,25]],prodH);
  y+=2;const cw=CW/3;['Wiring','Packing','Testing'].forEach((d,i)=>{const v=o[d.toLowerCase()+'By'];doc.rect(M+i*cw,y,cw,11);
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(90);doc.text(d,M+i*cw+2,y+4.2);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(20);doc.text(v?String(v):'Sign: ____________',M+i*cw+2,y+9);});
  y+=11;doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(150);
  doc.text((o.approvedAt?'Approved '+new Date(o.approvedAt).toLocaleDateString('en-IN')+'  |  ':'')+'Printed '+new Date().toLocaleString('en-IN')+'  |  '+ST.company().name,W/2,Math.min(y+4.5,top+HH-3),{align:'center'});
  return y;};
// Lays out orders two per A4 page (an order with very many items gets a full page) and prints directly
ST.printOrderSheets=function(list,opt){opt=opt||{};if(!window.jspdf){alert('The PDF tool could not load. Connect to the internet once and reload the page.');return;}
  const{jsPDF}=window.jspdf;const doc=new jsPDF('p','mm','a4');let slot=0,first=true;
  const cut=()=>{doc.setDrawColor(160);doc.setLineWidth(0.2);doc.setLineDashPattern([2,2],0);doc.line(5,148.5,205,148.5);doc.setLineDashPattern([],0);doc.setFontSize(7);doc.setTextColor(160);doc.text('cut here',200,147,{align:'right'});};
  list.forEach(entry=>{const o=entry.order||entry;const eo=entry.opt||{};const big=ST.items(o).length>6;
    if(big){if(!first)doc.addPage();ST.drawOrderSheet(doc,o,0,Object.assign({full:true},eo));slot=2;first=false;return;}
    if(!first&&slot%2===0)doc.addPage();ST.drawOrderSheet(doc,o,slot%2===0?0:148.5,eo);if(slot%2===0)cut();slot++;first=false;});
  ST.printDoc(doc,opt.name||'OrderSheets');return doc;};

// ─── Orders ↔ production jobs ───
ST.orders=()=>ST.get(ST.K.orders,[]);
ST.jobs=()=>ST.get(ST.K.jobs,[]);
ST.findOrder=no=>ST.orders().find(o=>o.orderNo===no);
ST.updateOrder=(no,fn)=>{const db=ST.orders();const o=db.find(x=>x.orderNo===no);if(!o)return null;fn(o);ST.set(ST.K.orders,db);return o;};
ST.updateJobByOrder=(no,fn)=>{const jobs=ST.jobs();const j=jobs.find(x=>x.orderRef===no);if(!j)return null;fn(j);ST.set(ST.K.jobs,jobs);return j;};
// Order object for printing a job card (uses the linked order so it looks exactly like the order sheet)
ST.orderForJob=j=>{const o=j.orderRef&&ST.findOrder(j.orderRef);if(o)return o;
  return {orderNo:j.orderRef||j.jobNo,date:j.startDate,partyName:j.party,location:(ST.client(j.party)||{}).location||'',items:j.items||[{type:j.type,qty:j.qty,capacity:j.cap,wire:j.wire}],
    deliveryDate:j.target,dod:j.dod,laserLogo:'',productionRemarks:j.remarks,orderRemarks:'',transporterName:j.transporter||'',status:''};};

// ─── Messages ───
ST.pickupMessage=(j,o,when)=>{const c=ST.company();const items=ST.items((o&&(o.items||o.loadcellType))?o:j);
  return `Dear ${(o&&o.transporterName)||j.transporter||'Transporter'},\n\n🚚 *Pickup Request — ${c.name}*\n\nPlease send a vehicle *${when}* to collect goods.\n\n• Pickup address: ${c.pickupAddress||c.address||'(our factory)'}\n• Consignee: ${j.party}${o&&o.location?', '+o.location:''}\n• No. of boxes: *${j.boxes||'—'}*\n• Approx. weight: *${j.weight||'—'} kg*\n• Items: ${ST.itemsShort(items)}\n• Ref: ${j.orderRef||''} / ${j.jobNo}\n${c.phone?'• Contact: '+c.phone+'\n':''}\nKindly confirm the vehicle and time.\n\nThank you.`;};
ST.despatchMessage=(o,j)=>{const items=ST.items(o);const boxes=(j&&j.boxes)||o.boxes,weight=(j&&j.weight)||o.weight;
  return `Dear ${o.partyName},\n\n📦 *Your goods have been despatched.*\n\n• Order: ${o.orderNo}${o.billNo?'\n• Invoice: '+o.billNo:''}\n• Items: ${ST.itemsShort(items)}\n• Transporter: ${o.transporterName||'—'}\n• L.R. No: *${o.lrNumber||'—'}*\n• No. of boxes: ${boxes||'—'}\n• Weight: ${weight?weight+' kg':'—'}\n• Despatch date: ${ST.fmtDate(o.dod)||'—'}${o.trackingLink?'\n• Track: '+o.trackingLink:''}\n\nThank you for your order.\n— ${ST.company().name}`;};

// Despatch: record LR on the order AND the production job, then message the customer
ST.recordDespatch=function(orderNo,d){const now=new Date().toISOString();
  const o=ST.updateOrder(orderNo,o=>{o.lrNumber=d.lr;o.dod=d.dod;if(d.transporter)o.transporterName=d.transporter;if(d.tracking)o.trackingLink=d.tracking;
    if(d.boxes)o.boxes=d.boxes;if(d.weight)o.weight=d.weight;if(o.status!=='cancelled'){o.status='completed';o.completedAt=o.completedAt||now;}o.despatchMsgAt=null;});
  const j=ST.updateJobByOrder(orderNo,j=>{j.lrNumber=d.lr;j.dod=d.dod;if(d.boxes)j.boxes=d.boxes;if(d.weight)j.weight=d.weight;if(d.transporter)j.transporter=d.transporter;
    if(j.stage!=='Dispatched'){j.stage='Dispatched';(j.history=j.history||[]).push({stage:'Dispatched',date:now,note:'Despatched · L.R. '+d.lr});}});
  return {order:o,job:j};};
ST.sendDespatchWA=function(orderNo){const o=ST.findOrder(orderNo);if(!o)return false;const j=ST.jobs().find(x=>x.orderRef===orderNo);
  const phone=o.clientPhone||ST.client(o.partyName).phone;
  if(!phone){alert('No WhatsApp number for '+o.partyName+'. Add it in Masters → Clients, then use "Resend despatch WhatsApp".');return false;}
  ST.openWA(phone,ST.despatchMessage(o,j));ST.updateOrder(orderNo,x=>{x.despatchMsgAt=new Date().toISOString();});return true;};

// ─── PAYMENTS: due date, reminders, escalation ───
ST.payInfo=function(o){const cl=ST.client(o.partyName);const mode=o.paymentMode||cl.paymentMode||'';const days=parseInt(o.creditDays||cl.creditDays)||0;
  const r={mode,days,due:'',over:0,sent:(o.reminders||[]).length,last:'',next:'',action:'none',label:''};
  if(o.status==='cancelled'){r.label='Cancelled';return r;}
  if(o.paymentDone){r.action='paid';r.label='Paid';return r;}
  if(mode!=='Credit'){r.label=mode||'—';return r;}
  if(!o.dod){r.label='Not despatched yet';return r;}
  r.due=ST.addDays(o.dod.slice(0,10),days);const t=ST.today();r.over=ST.daysBetween(r.due,t);
  const R=ST.rules();const rem=o.reminders||[];r.last=rem.length?rem[rem.length-1].at.slice(0,10):'';
  if(o.escalatedAt){r.action='escalated';r.label='Escalated to Admin';return r;}
  if(r.over<R.firstAfter){r.action='wait';r.next=ST.addDays(r.due,R.firstAfter);r.label=r.over<0?'Due in '+(-r.over)+' days':'Due today';return r;}
  if(rem.length<R.max){r.next=rem.length?ST.addDays(r.last,R.gap):ST.addDays(r.due,R.firstAfter);r.action=r.next<=t?'remind':'wait';r.label='Overdue '+r.over+' d · reminder '+rem.length+'/'+R.max;return r;}
  r.next=ST.addDays(r.last,R.gap);r.action=r.next<=t?'escalate':'wait';r.label='Overdue '+r.over+' d · '+R.max+' reminders sent';return r;};
ST.reminderMessage=(o,info)=>`Dear ${o.partyName},\n\n🔔 *Payment Reminder${info.sent?' ('+(info.sent+1)+')':''}*\n\nPayment for order *${o.orderNo}*${o.billNo?' (Invoice '+o.billNo+')':''}${o.billTotal?' of *'+ST.inr(o.billTotal)+'*':''} was due on *${ST.fmtDate(info.due)}* and is overdue by *${info.over} days*.\n\n• Despatched: ${ST.fmtDate(o.dod)}\n• Credit period: ${info.days} days\n${o.lrNumber?'• L.R.: '+o.lrNumber+'\n':''}\nKindly arrange the payment at the earliest.\n\nThank you.\n— ${ST.company().name}`;
ST.escalationMessage=(o,info)=>`⚠️ *Payment escalation*\n\n${o.partyName} has not paid order *${o.orderNo}*${o.billNo?' / '+o.billNo:''}${o.billTotal?' ('+ST.inr(o.billTotal)+')':''}.\n\n• Due: ${ST.fmtDate(info.due)} — overdue *${info.over} days*\n• Reminders sent: ${info.sent} (last ${ST.fmtDate(info.last)})\n• Client phone: ${o.clientPhone||ST.client(o.partyName).phone||'—'}\n\nPlease follow up personally.`;
ST.sendReminder=function(orderNo){const o=ST.findOrder(orderNo);if(!o)return;const info=ST.payInfo(o);const phone=o.clientPhone||ST.client(o.partyName).phone;
  if(!phone){alert('No WhatsApp number for '+o.partyName+'. Add it in Masters → Clients.');return false;}
  ST.openWA(phone,ST.reminderMessage(o,info));ST.updateOrder(orderNo,x=>{(x.reminders=x.reminders||[]).push({at:new Date().toISOString(),n:info.sent+1});});return true;};
ST.escalate=async function(orderNo){const o=ST.findOrder(orderNo);if(!o)return;const info=ST.payInfo(o);
  const to=ST.approvers().filter(a=>a.role==='Admin'||a.role==='Sub Admin');
  if(!to.length){alert('No Admin or Sub Admin set up. Add them in Masters → Approvers.');return false;}
  const msg=ST.escalationMessage(o,info);
  await ST.modal({title:'⚠️ Escalate '+o.orderNo,sub:'Send to each person below (one tap each).',
    html:`<div class="st-lines">${ST.esc(msg)}</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">${to.map(a=>`<button type="button" class="st-btn wa" data-p="${ST.esc(a.phone||'')}" data-n="${ST.esc(a.name)}" data-o="${ST.esc(o.orderNo)}">💬 Send to ${ST.esc(a.name)} (${a.role})${a.phone?'':' — no number'}</button>`).join('')}</div>`,
    buttons:[{label:'Done',value:true}]}).catch(()=>{});
  return true;};
// Delegated click for escalation buttons (each is its own tap so the browser allows the WhatsApp window)
document.addEventListener('click',e=>{const b=e.target.closest('.st-btn.wa[data-p]');if(!b)return;const md=b.closest('.st-md');const msg=md.querySelector('.st-lines').textContent;
  if(!b.dataset.p){alert('No WhatsApp number saved for '+b.dataset.n+'. Add it in Masters → Approvers.');return;}
  ST.openWA(b.dataset.p,msg);b.textContent='✓ Sent to '+b.dataset.n;b.disabled=true;
  const no=b.dataset.o;if(no)ST.updateOrder(no,x=>{x.escalatedAt=x.escalatedAt||new Date().toISOString();});document.dispatchEvent(new CustomEvent('st-changed'));});


// Despatch recorded → show the customer message with a Send button (one tap, so the browser allows WhatsApp)
ST.offerDespatch=async function(orderNo){const o=ST.findOrder(orderNo);if(!o)return;const j=ST.jobs().find(x=>x.orderRef===orderNo);const msg=ST.despatchMessage(o,j);
  const phone=o.clientPhone||ST.client(o.partyName).phone;const email=o.clientEmail||ST.client(o.partyName).email;
  const btns=[{label:'Later',value:null}];
  if(email)btns.push({label:'📧 Email',onClick:()=>{window.open('mailto:'+email+'?subject='+encodeURIComponent('Order Despatched - '+o.orderNo+' | L.R. '+(o.lrNumber||''))+'&body='+encodeURIComponent(msg.replace(/\*/g,'')),'_blank');return false;}});
  btns.push({label:'💬 Send WhatsApp',cls:'ok',onClick:()=>ST.sendDespatchWA(orderNo)?true:false});
  await ST.modal({title:'📦 Despatched — inform the customer',sub:phone?'WhatsApp to '+o.partyName+' ('+phone+')':'No WhatsApp number saved for '+o.partyName+' — add it in Masters → Clients.',html:`<div class="st-lines">${ST.esc(msg)}</div>`,buttons:btns});};
// Payment received: mark the order paid and the linked bill entry in Accounts
ST.markPaid=function(orderNo){const now=new Date().toISOString();const o=ST.updateOrder(orderNo,x=>{x.paymentDone=true;x.paidDate=now;});
  if(o&&o.billNo){const fin=ST.get(ST.K.fin,[]);let ch=false;fin.forEach(e=>{if(e.source==='bill'&&e.ref===o.billNo&&e.status!=='Paid'){e.status='Paid';ch=true;}});if(ch)ST.set(ST.K.fin,fin);}
  return o;};
// Amount in words (Indian system)
ST.words=function(n){n=Math.round((+n||0)*100)/100;const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const three=x=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  let r=Math.floor(n),p=Math.round((n-r)*100);const parts=[];const cr=Math.floor(r/1e7);r%=1e7;const la=Math.floor(r/1e5);r%=1e5;const th=Math.floor(r/1000);r%=1000;
  if(cr)parts.push(three(cr)+' Crore');if(la)parts.push(two(la)+' Lakh');if(th)parts.push(two(th)+' Thousand');if(r)parts.push(three(r));
  return 'Rupees '+(parts.join(' ')||'Zero')+(p?' and '+two(p)+' Paise':'')+' Only';};
})();
