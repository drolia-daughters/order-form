// ═══════════════════════════════════════════════════════════════
// COHORT ENGINE — data pool, business metrics, charts, demo data
// Used by cohort.html. Reads the same browser storage as every app.
// ═══════════════════════════════════════════════════════════════
(function(){
const CE=window.CE={};
const num=v=>parseFloat(v)||0;CE.num=num;
const mk=s=>String(s||'').slice(0,7); // YYYY-MM
CE.monthKey=mk;
CE.mIdx=s=>{const[y,m]=String(s).split('-').map(Number);return y*12+m-1;};
CE.mFromIdx=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');
CE.mLabel=s=>{const i=CE.mIdx(s);return new Date(Math.floor(i/12),i%12,1).toLocaleDateString('en-IN',{month:'short',year:'2-digit'});};
CE.inrShort=v=>{v=+v||0;const a=Math.abs(v);const s=v<0?'-':'';if(a>=1e7)return s+'₹'+(a/1e7).toFixed(2)+' Cr';if(a>=1e5)return s+'₹'+(a/1e5).toFixed(a>=1e6?1:2)+' L';if(a>=1e3)return s+'₹'+(a/1e3).toFixed(a>=1e4?0:1)+'k';return s+'₹'+Math.round(a);};

/* ═════ DATA POOL (real or demo) ═════ */
CE.demo=false;
CE.real=function(){const L=k=>ST.get(k,[]);const all=L(ST.K.orders);
  return {orders:all.filter(o=>o.status!=='cancelled'),cancelled:all.filter(o=>o.status==='cancelled'),jobs:L(ST.K.jobs),bills:L(ST.K.bills),fin:L(ST.K.fin),jw:L('jw_moves'),leads:L('crm_leads'),calls:L('crm_calls'),items:L('inv_items'),imports:L('inv_imports'),clients:ST.get(ST.K.clients,{})};};
CE.pool=function(){const P=CE.demo?(CE._demo||(CE._demo=CE.makeDemo())):CE.real();
  if(!P.lines){P.lines=[];P.orders.forEach(o=>ST.items(o).forEach(i=>P.lines.push({orderNo:o.orderNo,date:(o.date||'').slice(0,10),party:o.partyName||'',type:i.type||'',qty:num(i.qty),capacity:i.capacity||'',wire:i.wire||'',status:o.status,dod:o.dod||'',billNo:o.billNo||''})));}
  return P;};

/* ═════ PERIOD ═════ */
CE.period=function(code){const t=ST.today();const nowI=CE.mIdx(t);let from;
  if(code==='m3')from=nowI-2;else if(code==='m6')from=nowI-5;else if(code==='m24')from=nowI-23;
  else if(code==='fy'){const d=ST.parseISO(t);const fy=d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;from=fy*12+3;}
  else if(code==='all'){const P=CE.pool();const ds=P.orders.map(o=>o.date).concat(P.fin.map(f=>f.date)).filter(Boolean).sort();from=ds.length?Math.max(CE.mIdx(ds[0].slice(0,7)),nowI-35):nowI-11;}
  else from=nowI-11;
  const months=[];for(let i=from;i<=nowI;i++)months.push(CE.mFromIdx(i));
  const len=months.length;const prevMonths=[];for(let i=from-len;i<from;i++)prevMonths.push(CE.mFromIdx(i));
  return {code,months,from:months[0]+'-01',to:t,prevFrom:prevMonths[0]+'-01',prevTo:ST.addDays(months[0]+'-01',-1),label:{m3:'last 3 months',m6:'last 6 months',m12:'last 12 months',m24:'last 24 months',fy:'this financial year',all:'all time'}[code]||'last 12 months'};};
const inR=(d,a,b)=>{d=(d||'').slice(0,10);return d&&d>=a&&d<=b;};CE.inR=inR;

/* ═════ METRICS MODEL ═════ */
CE.model=function(code){const P=CE.pool();const per=CE.period(code);const t=ST.today();const M={P,per};
  const inPer=d=>inR(d,per.from,per.to),inPrev=d=>inR(d,per.prevFrom,per.prevTo);
  const idx={};per.months.forEach((m,i)=>idx[m]=i);const zeros=()=>per.months.map(()=>0);
  // revenue = income entries in Accounts (bills create them automatically); expenses likewise
  const inc=P.fin.filter(e=>e.type==='income'),exp=P.fin.filter(e=>e.type==='expense');
  M.hasRevenue=inc.length>0;
  M.revM=zeros();M.expM=zeros();inc.forEach(e=>{const k=mk(e.date);if(k in idx)M.revM[idx[k]]+=num(e.amount);});exp.forEach(e=>{const k=mk(e.date);if(k in idx)M.expM[idx[k]]+=num(e.amount);});
  M.rev=inc.filter(e=>inPer(e.date)).reduce((s,e)=>s+num(e.amount),0);M.revPrev=inc.filter(e=>inPrev(e.date)).reduce((s,e)=>s+num(e.amount),0);
  M.exp=exp.filter(e=>inPer(e.date)).reduce((s,e)=>s+num(e.amount),0);M.expPrev=exp.filter(e=>inPrev(e.date)).reduce((s,e)=>s+num(e.amount),0);
  M.expCat={};exp.filter(e=>inPer(e.date)).forEach(e=>M.expCat[e.category||'Misc']=(M.expCat[e.category||'Misc']||0)+num(e.amount));
  // orders
  const os=P.orders.filter(o=>inPer(o.date)),osPrev=P.orders.filter(o=>inPrev(o.date));M.os=os;
  const pcs=o=>ST.items(o).reduce((s,i)=>s+num(i.qty),0);M.pcsOf=pcs;
  M.ordM=zeros();M.pcsM=zeros();os.forEach(o=>{const k=mk(o.date);if(k in idx){M.ordM[idx[k]]++;M.pcsM[idx[k]]+=pcs(o);}});
  M.orders=os.length;M.ordersPrev=osPrev.length;M.pcs=os.reduce((s,o)=>s+pcs(o),0);M.pcsPrev=osPrev.reduce((s,o)=>s+pcs(o),0);
  M.avgPcsM=M.ordM.map((n,i)=>n?Math.round(M.pcsM[i]/n*10)/10:null);
  // customer value: income by party (bills + manual sales), else pcs
  const revBy={};inc.forEach(e=>{if(e.party)revBy[e.party]=revBy[e.party]||[];if(e.party)revBy[e.party].push(e);});M.revBy=revBy;
  // first order per customer (all time)
  const first={},dates={};P.orders.forEach(o=>{if(!o.partyName||!o.date)return;const d=o.date.slice(0,10);(dates[o.partyName]=dates[o.partyName]||[]).push(d);if(!first[o.partyName]||d<first[o.partyName])first[o.partyName]=d;});
  Object.values(dates).forEach(a=>a.sort());M.first=first;M.dates=dates;
  const custIn=new Set(os.map(o=>o.partyName)),custPrev=new Set(osPrev.map(o=>o.partyName));M.active=custIn.size;M.activePrev=custPrev.size;
  const repeatC=[...custIn].filter(p=>first[p]<per.from).length;M.repeatRate=custIn.size?Math.round(repeatC/custIn.size*100):0;
  const repeatPrev=[...custPrev].filter(p=>first[p]<per.prevFrom).length;M.repeatRatePrev=custPrev.size?Math.round(repeatPrev/custPrev.size*100):0;
  M.newM=zeros();M.retM=zeros();per.months.forEach((m,i)=>{const cs=new Set(P.orders.filter(o=>mk(o.date)===m).map(o=>o.partyName));cs.forEach(p=>{if(mk(first[p])===m)M.newM[i]++;else M.retM[i]++;});});
  M.newCust=[...custIn].filter(p=>inPer(first[p])).length;
  M.aov=M.orders&&M.hasRevenue?M.rev/M.orders:0;M.aovPrev=M.ordersPrev&&M.hasRevenue?M.revPrev/M.ordersPrev:0;
  // average selling price per type from bills (taxable ÷ qty) — used to value opportunities
  const price={};let pq=0,pv=0;P.bills.forEach(b=>(b.items||[]).forEach(i=>{const ty=(String(i.desc||'').replace(/^Load Cell\s*/i,'').split(' ')[0]||'').toUpperCase();const q=num(i.qty),v=num(i.taxable||num(i.qty)*num(i.rate));if(!q)return;price[ty]=price[ty]||{q:0,v:0};price[ty].q+=q;price[ty].v+=v;pq+=q;pv+=v;}));
  M.avgPrice=pq?pv/pq:0;M.priceOf=ty=>{const x=price[String(ty||'').toUpperCase()];return x&&x.q?x.v/x.q:M.avgPrice;};
  // top customers in period
  const tc={};os.forEach(o=>{const c=tc[o.partyName]=tc[o.partyName]||{name:o.partyName,orders:0,pcs:0,rev:0};c.orders++;c.pcs+=pcs(o);});
  inc.filter(e=>inPer(e.date)&&e.party).forEach(e=>{const c=tc[e.party]=tc[e.party]||{name:e.party,orders:0,pcs:0,rev:0};c.rev+=num(e.amount);});
  M.topCust=Object.values(tc).sort((a,b)=>M.hasRevenue?(b.rev-a.rev||b.pcs-a.pcs):(b.pcs-a.pcs));
  const totBase=M.topCust.reduce((s,c)=>s+(M.hasRevenue?c.rev:c.pcs),0);M.top5Share=totBase?Math.round(M.topCust.slice(0,5).reduce((s,c)=>s+(M.hasRevenue?c.rev:c.pcs),0)/totBase*100):0;
  M.top1Share=totBase&&M.topCust[0]?Math.round((M.hasRevenue?M.topCust[0].rev:M.topCust[0].pcs)/totBase*100):0;
  // product mix + city
  M.mix={};P.lines.filter(l=>inPer(l.date)).forEach(l=>M.mix[l.type||'—']=(M.mix[l.type||'—']||0)+l.qty);
  M.mixPrev={};P.lines.filter(l=>inPrev(l.date)).forEach(l=>M.mixPrev[l.type||'—']=(M.mixPrev[l.type||'—']||0)+l.qty);
  M.city={};os.forEach(o=>{const c=(o.location||(P.clients[o.partyName]||{}).location||'Unknown').trim()||'Unknown';M.city[c]=(M.city[c]||0)+pcs(o);});
  // receivables
  M.ageing={'Not due':0,'1–30 days':0,'31–60 days':0,'61–90 days':0,'90+ days':0};M.overdue=0;M.outstanding=0;M.overdueList=[];
  P.orders.forEach(o=>{const pi=ST.payInfo(o);if(pi.mode!=='Credit'||pi.action==='paid'||!o.dod)return;const v=num(o.billTotal);M.outstanding+=v;
    const b=pi.over<=0?'Not due':pi.over<=30?'1–30 days':pi.over<=60?'31–60 days':pi.over<=90?'61–90 days':'90+ days';M.ageing[b]+=v;if(pi.over>0){M.overdue+=v;M.overdueList.push({o,pi});}});
  inc.filter(e=>e.status&&e.status!=='Paid'&&e.source!=='bill').forEach(e=>{M.outstanding+=num(e.amount);});
  M.overdueList.sort((a,b)=>b.pi.over-a.pi.over);
  // customers + segments (RFM style)
  M.customers=Object.keys(dates).map(name=>{const ds=dates[name];const last=ds[ds.length-1];const since=ST.daysBetween(last,t);const gaps=ds.slice(1).map((d,i)=>ST.daysBetween(ds[i],d)).filter(g=>g>0);
    const gap=gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null;const ords=P.orders.filter(o=>o.partyName===name);
    const o12=ords.filter(o=>ST.daysBetween(o.date.slice(0,10),t)<=365).length;const pcsAll=ords.reduce((s,o)=>s+pcs(o),0);
    const rev=(revBy[name]||[]).reduce((s,e)=>s+num(e.amount),0);const rev12=(revBy[name]||[]).filter(e=>ST.daysBetween((e.date||'').slice(0,10),t)<=365).reduce((s,e)=>s+num(e.amount),0);
    const types={};ords.forEach(o=>ST.items(o).forEach(i=>types[i.type||'—']=(types[i.type||'—']||0)+num(i.qty)));
    const lim=gap?Math.max(gap*1.5,45):60;let seg;
    if(since>=180)seg='Lost';else if(ds.length===1)seg=since<90?'New':'Need attention';else if(since>Math.max((gap||60)*2,60))seg='At risk';else if(o12>=4&&since<=lim)seg='Champions';else if(since<=lim)seg='Loyal';else seg='Need attention';
    const months=Math.max(1,(CE.mIdx(last.slice(0,7))-CE.mIdx(ds[0].slice(0,7)))+1);
    return {name,first:ds[0],last,since,orders:ds.length,o12,gap,pcs:pcsAll,rev,rev12,types,seg,cohort:ds[0].slice(0,7),monthlyRev:rev/months,monthlyPcs:pcsAll/months,
      nextDue:gap?ST.addDays(last,gap):null,unpaid:ords.filter(o=>{const pi=ST.payInfo(o);return pi.mode==='Credit'&&pi.action!=='paid'&&o.dod;}).reduce((s,o)=>s+num(o.billTotal),0),
      phone:(ords.slice(-1)[0]||{}).clientPhone||(P.clients[name]||{}).phone||'',loc:(ords.slice(-1)[0]||{}).location||(P.clients[name]||{}).location||''};}).sort((a,b)=>(b.rev-a.rev)||(b.pcs-a.pcs));
  M.segs={};['Champions','Loyal','New','Need attention','At risk','Lost'].forEach(s=>M.segs[s]=M.customers.filter(c=>c.seg===s));
  // operations
  const J=P.jobs;M.jobs=J;M.stageCount={};['Received','Assembly','Wiring','Testing','Laser','Packing','Ready'].forEach(s=>M.stageCount[s]=J.filter(j=>j.stage===s).length);
  const stDays={};J.forEach(j=>{const h=(j.history||[]).filter(x=>x.date&&x.stage);for(let i=0;i<h.length-1;i++){if(h[i+1].stage===h[i].stage)continue;const d=(new Date(h[i+1].date)-new Date(h[i].date))/86400000;if(d>=0&&d<120){(stDays[h[i].stage]=stDays[h[i].stage]||[]).push(d);}}});
  M.stageDays={};Object.entries(stDays).forEach(([k,a])=>M.stageDays[k]=Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10);
  const desp=P.orders.filter(o=>o.dod&&inPer(o.dod));const cyc=desp.map(o=>({o,d:ST.daysBetween((o.approvedAt||o.date||o.dod).slice(0,10),o.dod.slice(0,10))})).filter(x=>x.d>=0&&x.d<200);
  M.cycle=cyc.length?Math.round(cyc.reduce((s,x)=>s+x.d,0)/cyc.length*10)/10:null;
  M.cycleM=zeros();const cycN=zeros();cyc.forEach(x=>{const k=mk(x.o.dod);if(k in idx){M.cycleM[idx[k]]+=x.d;cycN[idx[k]]++;}});M.cycleM=M.cycleM.map((v,i)=>cycN[i]?Math.round(v/cycN[i]*10)/10:0);
  const withTarget=desp.filter(o=>o.deliveryDate);M.onTime=withTarget.length?Math.round(withTarget.filter(o=>o.dod.slice(0,10)<=o.deliveryDate).length/withTarget.length*100):null;
  M.late=P.orders.filter(o=>o.deliveryDate&&o.status!=='completed'&&o.status!=='cancelled'&&o.deliveryDate<t).map(o=>({o,days:ST.daysBetween(o.deliveryDate,t),job:J.find(j=>j.orderRef===o.orderNo)}));
  M.waiting={laser:J.filter(j=>j.stage==='Testing').length,packing:0,bill:J.filter(j=>j.stage==='Ready'&&!(j.approvals&&j.approvals.bill)).length,pickup:J.filter(j=>j.stage==='Ready'&&!j.pickupMsgAt).length,orders:P.orders.filter(o=>o.status==='awaiting').length};
  // marketing
  const L=P.leads.filter(l=>!l.createdAt||inPer(l.createdAt)||code==='all');M.leads=L;
  const FUN=['New','Contacted','Interested','Quote Sent','Converted'];const rank=s=>{const i=FUN.indexOf(s);return i<0?(s==='Lost'?-1:0):i;};
  M.funnel=FUN.map((s,i)=>({stage:s,n:L.filter(l=>rank(l.status)>=i).length}));M.lost=L.filter(l=>l.status==='Lost').length;
  M.leadM=zeros();L.forEach(l=>{const k=mk(l.createdAt);if(k in idx)M.leadM[idx[k]]++;});
  const src={};L.forEach(l=>{const s=l.source||'Unknown';const x=src[s]=src[s]||{source:s,leads:0,conv:0,val:0};x.leads++;if(l.status==='Converted'){x.conv++;x.val+=num(l.value);}});
  M.sources=Object.values(src).map(x=>Object.assign(x,{rate:x.leads?Math.round(x.conv/x.leads*100):0})).sort((a,b)=>b.leads-a.leads);
  const cal={};L.forEach(l=>{const c=l.caller||'Unassigned';const x=cal[c]=cal[c]||{caller:c,leads:0,conv:0,calls:0};x.leads++;if(l.status==='Converted')x.conv++;});
  const leadCaller={};P.leads.forEach(l=>leadCaller[l.id]=l.caller||'Unassigned');P.calls.filter(c=>!c.datetime||inPer(c.datetime)).forEach(c=>{const k=leadCaller[c.leadId]||'Unassigned';(cal[k]=cal[k]||{caller:k,leads:0,conv:0,calls:0}).calls++;});
  M.callers=Object.values(cal).map(x=>Object.assign(x,{rate:x.leads?Math.round(x.conv/x.leads*100):0})).sort((a,b)=>b.conv-a.conv);
  M.convRate=L.length?Math.round(L.filter(l=>l.status==='Converted').length/L.length*100):0;
  M.staleQuotes=P.leads.filter(l=>l.status==='Quote Sent'&&l.createdAt&&ST.daysBetween(l.createdAt.slice(0,10),t)>7);
  // run-rate base for projections: last 12 months
  const y1=ST.addDays(t,-365);M.rev12=inc.filter(e=>inR(e.date,y1,t)).reduce((s,e)=>s+num(e.amount),0);M.pcs12=P.orders.filter(o=>inR(o.date,y1,t)).reduce((s,o)=>s+pcs(o),0);
  M.cust12=new Set(P.orders.filter(o=>inR(o.date,y1,t)).map(o=>o.partyName)).size;
  return M;};

/* ═════ GROWTH OPPORTUNITIES (ranked by estimated ₹ per year) ═════ */
CE.opportunities=function(M){const ops=[];const t=ST.today();const price=M.avgPrice;const val=(pcs,ty)=>pcs*(ty?M.priceOf(ty):price);
  const pv=c=>M.hasRevenue&&c.rev12?c.rev12:val(c.monthlyPcs*12);
  // 1. reorders due
  const due=M.customers.filter(c=>c.orders>=2&&c.nextDue&&c.seg!=='Lost'&&ST.daysBetween(t,c.nextDue)<=14&&c.since<=(c.gap||60)*2).sort((a,b)=>a.nextDue.localeCompare(b.nextDue));
  if(due.length)ops.push({id:'reorder',icon:'🔁',title:due.length+' customer'+(due.length>1?'s are':' is')+' due to reorder',value:due.reduce((s,c)=>s+(M.hasRevenue&&c.orders?c.rev/c.orders:val(c.pcs/c.orders)),0),
    why:'They usually order every few weeks — the next order is due now. A call or WhatsApp today wins the order before a competitor does.',people:due.slice(0,8).map(c=>({c,note:'orders every ~'+c.gap+' days · last '+ST.fmtDate(c.last)+(ST.daysBetween(t,c.nextDue)<0?' · '+(-ST.daysBetween(t,c.nextDue))+' days late':' · due '+ST.fmtDate(c.nextDue))})),
    msg:c=>`Dear ${c.name},\n\nHope all is well. It has been ${c.since} days since your last order with us (${Object.keys(c.types).slice(0,3).join(', ')}).\n\nDo you need load cells for your upcoming jobs? We can despatch quickly from stock.\n\nRegards,\n${ST.company().name}`});
  // 2. win back at-risk / lost
  const back=M.segs['At risk'].concat(M.segs['Lost'].filter(c=>c.since<540));
  if(back.length)ops.push({id:'winback',icon:'🎯',title:'Win back '+back.length+' quiet customer'+(back.length>1?'s':''),value:back.reduce((s,c)=>s+(M.hasRevenue?c.monthlyRev*12:val(c.monthlyPcs*12)),0)*0.3,
    why:'These customers used to buy but have gone quiet. Winning back even 3 in 10 is worth the amount shown. Ask why they stopped — price, quality or delivery?',people:back.slice(0,8).map(c=>({c,note:c.seg+' · last order '+c.since+' days ago · '+c.orders+' orders before'})),
    msg:c=>`Dear ${c.name},\n\nWe have missed your orders since ${ST.fmtDate(c.last)}. We would value your feedback — is there anything we can improve on price, quality or delivery?\n\nWe have new stock ready and can offer a special rate on your next order.\n\nRegards,\n${ST.company().name}`});
  // 3. collect overdue
  if(M.overdue>0)ops.push({id:'collect',icon:'💰',title:'Collect '+CE.inrShort(M.overdue)+' overdue',value:M.overdue,cash:true,
    why:'Money already earned but not received. Faster collection funds raw material and China imports without borrowing.',people:M.overdueList.slice(0,8).map(x=>({c:{name:x.o.partyName,phone:x.o.clientPhone||(M.P.clients[x.o.partyName]||{}).phone},note:x.o.orderNo+' · '+CE.inrShort(x.o.billTotal)+' · '+x.pi.over+' days overdue · '+x.pi.sent+' reminder(s)'})),
    msg:c=>`Dear ${c.name},\n\nThis is a gentle reminder about the pending payment for our recent supply. Kindly arrange it at the earliest.\n\nThank you.\n${ST.company().name}`,link:'orders.html',linkLabel:'Open Payments'});
  // 4. cross-sell popular types the customer never buys
  const typeCust={};M.customers.forEach(c=>Object.keys(c.types).forEach(ty=>typeCust[ty]=(typeCust[ty]||0)+1));
  const popular=Object.entries(typeCust).filter(([ty,n])=>ty!=='—'&&n>=Math.max(2,M.customers.length*0.25)).map(([ty])=>ty);
  const cross=M.customers.filter(c=>c.seg!=='Lost'&&c.orders>=2).map(c=>({c,miss:popular.filter(ty=>!c.types[ty])})).filter(x=>x.miss.length).slice(0,10);
  if(cross.length)ops.push({id:'cross',icon:'➕',title:'Cross-sell to '+cross.length+' regular customer'+(cross.length>1?'s':''),value:cross.reduce((s,x)=>s+val(Math.max(4,Math.round(x.c.pcs/x.c.orders*0.3)),x.miss[0]),0)*4,
    why:'Regular customers buy only some of your range. Offering the popular types they don\'t buy yet ('+popular.join(', ')+') adds sales with no new-customer cost.',people:cross.map(x=>({c:x.c,note:'buys '+Object.keys(x.c.types).join(', ')+' · never bought '+x.miss.join(', ')})),
    msg:c=>`Dear ${c.name},\n\nThank you for your regular orders. Did you know we also make ${popular.filter(ty=>!c.types[ty]).join(', ')} load cells with the same quality and quick delivery?\n\nShall we send you a quote?\n\nRegards,\n${ST.company().name}`});
  // 5. stale quotes in CRM
  if(M.staleQuotes.length)ops.push({id:'quotes',icon:'📝',title:'Follow up '+M.staleQuotes.length+' quote'+(M.staleQuotes.length>1?'s':'')+' older than 7 days',value:M.staleQuotes.reduce((s,l)=>s+num(l.value),0)*0.25,
    why:'A quote that is not followed up within a week usually goes to a competitor. A call now converts about 1 in 4.',people:M.staleQuotes.slice(0,8).map(l=>({c:{name:l.company,phone:l.phone},note:(l.product||'')+(l.qty?' · '+l.qty+' pcs':'')+(l.value?' · '+CE.inrShort(l.value):'')+' · quoted '+ST.fmtDate((l.createdAt||'').slice(0,10))})),
    msg:c=>`Dear ${c.name},\n\nFollowing up on the quotation we sent. Do you have any questions? We can adjust quantity or delivery to suit you.\n\nRegards,\n${ST.company().name}`,link:'marketing_crm.html',linkLabel:'Open CRM'});
  // 6. best lead source
  const srcs=M.sources.filter(s=>s.leads>=5);if(srcs.length>=2){const best=srcs.slice().sort((a,b)=>b.rate-a.rate)[0],worst=srcs.slice().sort((a,b)=>a.rate-b.rate)[0];
    if(best.rate-worst.rate>=10)ops.push({id:'source',icon:'📣',title:best.source+' converts '+best.rate+'% vs '+worst.source+' '+worst.rate+'%',value:(best.rate-worst.rate)/100*worst.leads*(M.hasRevenue&&M.orders?M.rev/M.orders:val(20))*2,
      why:'Spend more of the marketing budget and telecaller time on '+best.source+' leads and less on '+worst.source+'. Same effort, more orders.',people:[]});}
  // 7. concentration risk
  if(M.top1Share>=30)ops.push({id:'risk',icon:'⚠️',title:'One customer is '+M.top1Share+'% of sales',value:0,risk:true,why:(M.topCust[0]||{}).name+' alone brings '+M.top1Share+'% of sales — losing them would hurt badly. Grow 3–5 mid-size customers to spread the risk.',people:[]});
  // 8. bigger orders
  const shrink=M.customers.filter(c=>c.orders>=3&&c.seg!=='Lost').map(c=>{const os=M.P.orders.filter(o=>o.partyName===c.name).sort((a,b)=>a.date.localeCompare(b.date));const lastQ=M.pcsOf(os[os.length-1]);const avg=c.pcs/c.orders;return {c,lastQ,avg};}).filter(x=>x.lastQ<x.avg*0.7);
  if(shrink.length)ops.push({id:'shrink',icon:'📉',title:shrink.length+' customer'+(shrink.length>1?'s are':' is')+' ordering less than usual',value:shrink.reduce((s,x)=>s+val(x.avg-x.lastQ)*(365/(x.c.gap||60)),0),
    why:'Their latest order is well below their normal size — they may be splitting orders with another supplier. Ask, and offer a volume rate.',people:shrink.slice(0,8).map(x=>({c:x.c,note:'last order '+x.lastQ+' pcs vs usual '+Math.round(x.avg)+' pcs'})),
    msg:c=>`Dear ${c.name},\n\nWe noticed your recent order was smaller than usual. If you are buying elsewhere, please tell us — we would like to offer you a better rate for your full requirement.\n\nRegards,\n${ST.company().name}`});
  return ops.sort((a,b)=>(b.value||0)-(a.value||0));};

/* ═════ CHARTS (inline SVG, dark theme) ═════ */
CE.C={s:['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'],grid:'#262d3a',axis:'#7a8599',text:'#e8ecf4',surface:'#141820'};
const tip=()=>document.getElementById('vtip');
CE.tipShow=(html,e)=>{const t=tip();if(!t)return;t.innerHTML=html;t.style.display='block';const x=Math.min(e.clientX+14,innerWidth-t.offsetWidth-8),y=e.clientY+16+t.offsetHeight>innerHeight?e.clientY-t.offsetHeight-10:e.clientY+16;t.style.left=x+'px';t.style.top=y+'px';};
CE.tipHide=()=>{const t=tip();if(t)t.style.display='none';};
const intMax=(vals,m)=>vals.every(v=>v==null||Number.isInteger(v))?Math.max(4,Math.ceil(m/4)*4):m;
const niceMax=v=>{if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;};
const legend=series=>series.length<2?'':`<div class="lg">${series.map(s=>`<span><i style="background:${s.color}"></i>${ST.esc(s.name)}</span>`).join('')}</div>`;
const empty=(el,msg)=>{el.innerHTML=`<div class="empty">${msg||'No data for this period yet'}</div>`;};
const roundTop=(x,y,w,h,r)=>{r=Math.min(r,w/2,h);return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`;};
// Vertical bars (grouped or stacked) over months/categories
CE.bars=function(el,o){const series=o.series.map((s,i)=>Object.assign({color:CE.C.s[i]},s));const L=o.labels;const fmt=o.fmt||(v=>v.toLocaleString('en-IN'));
  if(!L.length||series.every(s=>s.values.every(v=>!v)))return empty(el,o.empty);
  const W=Math.max(280,el.clientWidth||600),H=o.height||210,pl=52,pr=8,pt=8,pb=24,iw=W-pl-pr,ih=H-pt-pb;
  const max=intMax(series.flatMap(s=>s.values),niceMax(o.stacked?Math.max(...L.map((_,i)=>series.reduce((s,x)=>s+(x.values[i]||0),0))):Math.max(...series.flatMap(s=>s.values))));
  const gw=iw/L.length;const step=Math.ceil(L.length*44/iw);let g='';
  for(let k=0;k<=4;k++){const y=pt+ih-ih*k/4;g+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="${CE.C.grid}" stroke-width="1"/><text x="${pl-6}" y="${y+3.5}" text-anchor="end" fill="${CE.C.axis}" font-size="10">${fmt(max*k/4)}</text>`;}
  L.forEach((lab,i)=>{const x0=pl+i*gw;
    if(o.stacked){const bw=Math.min(30,gw*0.62);let y=pt+ih;series.forEach((s,si)=>{const v=s.values[i]||0;if(!v)return;const h=ih*v/max;y-=h;const top=!series.slice(si+1).some(x=>x.values[i]);g+=top?`<path d="${roundTop(x0+(gw-bw)/2,y,bw,h,4)}" fill="${s.color}"/>`:`<rect x="${x0+(gw-bw)/2}" y="${y}" width="${bw}" height="${h}" fill="${s.color}"/>`;g+=`<line x1="${x0+(gw-bw)/2}" x2="${x0+(gw+bw)/2}" y1="${y}" y2="${y}" stroke="${CE.C.surface}" stroke-width="2"/>`;});}
    else{const n=series.length;const bw=Math.min(24,(gw*0.72-(n-1)*2)/n);const start=x0+(gw-(bw*n+(n-1)*2))/2;series.forEach((s,si)=>{const v=s.values[i]||0;if(v<=0)return;const h=ih*v/max;g+=`<path d="${roundTop(start+si*(bw+2),pt+ih-h,bw,h,4)}" fill="${s.color}"/>`;});}
    if(i%step===0)g+=`<text x="${x0+gw/2}" y="${H-7}" text-anchor="middle" fill="${CE.C.axis}" font-size="10">${ST.esc(lab)}</text>`;
    g+=`<rect class="hit" x="${x0}" y="${pt}" width="${gw}" height="${ih}" fill="transparent" data-i="${i}"/>`;});
  el.innerHTML=legend(series)+`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ST.esc(o.title||'bar chart')}">${g}</svg>`;
  el.querySelectorAll('.hit').forEach(r=>{r.addEventListener('mousemove',e=>{const i=+r.dataset.i;CE.tipShow(`<b>${ST.esc(L[i])}</b>`+series.map(s=>`<div><i style="background:${s.color}"></i>${ST.esc(s.name)}: <b>${(o.tipFmt||fmt)(s.values[i]||0)}</b></div>`).join('')+(o.stacked&&series.length>1?`<div style="opacity:.7">Total: ${(o.tipFmt||fmt)(series.reduce((t,s)=>t+(s.values[i]||0),0))}</div>`:''),e);r.setAttribute('fill','rgba(255,255,255,.04)');});
    r.addEventListener('mouseleave',()=>{CE.tipHide();r.setAttribute('fill','transparent');});});};
// Lines with crosshair
CE.lines=function(el,o){const series=o.series.map((s,i)=>Object.assign({color:CE.C.s[i]},s));const L=o.labels;const fmt=o.fmt||(v=>v.toLocaleString('en-IN'));
  if(!L.length||series.every(s=>s.values.every(v=>!v)))return empty(el,o.empty);
  const W=Math.max(280,el.clientWidth||600),H=o.height||210,pl=52,pr=12,pt=10,pb=24,iw=W-pl-pr,ih=H-pt-pb;const max=o.max||intMax(series.flatMap(s=>s.values),niceMax(Math.max(...series.flatMap(s=>s.values))));
  const X=i=>pl+(L.length===1?iw/2:iw*i/(L.length-1)),Y=v=>pt+ih-ih*v/max;const step=Math.ceil(L.length*44/iw);let g='';
  for(let k=0;k<=4;k++){const y=pt+ih-ih*k/4;g+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="${CE.C.grid}"/><text x="${pl-6}" y="${y+3.5}" text-anchor="end" fill="${CE.C.axis}" font-size="10">${fmt(max*k/4)}</text>`;}
  L.forEach((lab,i)=>{if(i%step===0)g+=`<text x="${X(i)}" y="${H-7}" text-anchor="middle" fill="${CE.C.axis}" font-size="10">${ST.esc(lab)}</text>`;});
  series.forEach(s=>{const pts=s.values.map((v,i)=>v==null?null:[X(i),Y(v)]);let d='';pts.forEach((p,i)=>{if(!p)return;d+=(d&&pts[i-1]?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1);});
    g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;if(L.length<=24)pts.forEach(p=>{if(p)g+=`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}" stroke="${CE.C.surface}" stroke-width="2"/>`;});});
  g+=`<line class="xh" x1="0" x2="0" y1="${pt}" y2="${pt+ih}" stroke="${CE.C.axis}" stroke-dasharray="3 3" visibility="hidden"/>`;
  L.forEach((_,i)=>{const w=L.length===1?iw:iw/(L.length-1);g+=`<rect class="hit" x="${X(i)-w/2}" y="${pt}" width="${w}" height="${ih}" fill="transparent" data-i="${i}"/>`;});
  el.innerHTML=legend(series)+`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ST.esc(o.title||'line chart')}">${g}</svg>`;const xh=el.querySelector('.xh');
  el.querySelectorAll('.hit').forEach(r=>{r.addEventListener('mousemove',e=>{const i=+r.dataset.i;xh.setAttribute('x1',X(i));xh.setAttribute('x2',X(i));xh.setAttribute('visibility','visible');CE.tipShow(`<b>${ST.esc(L[i])}</b>`+series.map(s=>`<div><i style="background:${s.color}"></i>${ST.esc(s.name)}: <b>${s.values[i]==null?'—':(o.tipFmt||fmt)(s.values[i])}</b></div>`).join(''),e);});
    r.addEventListener('mouseleave',()=>{CE.tipHide();xh.setAttribute('visibility','hidden');});});};
// Ranked horizontal bars (HTML) — label · bar · value
CE.hbars=function(el,o){const rows=(o.rows||[]).filter(r=>r.value>0);if(!rows.length)return empty(el,o.empty);const max=Math.max(...rows.map(r=>r.value));const fmt=o.fmt||(v=>v.toLocaleString('en-IN'));
  el.innerHTML=`<div class="hb">${rows.slice(0,o.limit||12).map((r,i)=>`<div class="hr" data-i="${i}"><span class="hl" title="${ST.esc(r.label)}">${ST.esc(r.label)}</span><span class="ht"><span class="hf" style="width:${Math.max(1.5,r.value/max*100)}%;background:${r.color||o.color||CE.C.s[0]}"></span></span><span class="hv">${fmt(r.value)}${r.sub?`<small>${ST.esc(r.sub)}</small>`:''}</span></div>`).join('')}</div>`;
  el.querySelectorAll('.hr').forEach(d=>{const r=rows[+d.dataset.i];d.addEventListener('mousemove',e=>CE.tipShow(`<b>${ST.esc(r.label)}</b><div>${fmt(r.value)}${r.sub?' · '+ST.esc(r.sub):''}</div>${r.tip?'<div style="opacity:.75">'+ST.esc(r.tip)+'</div>':''}`,e));d.addEventListener('mouseleave',CE.tipHide);});};

/* ═════ DEMO DATA (in memory only — never saved) ═════ */
CE.makeDemo=function(){let seed=20261004;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  const pick=a=>a[Math.floor(rnd()*a.length)];const today=ST.today();const iso=d=>ST.iso(d);
  const names=['Om Sai Weighing','Bharat Scales','Shakti Weighbridge Co','Ganesh Electronics','Prime Weigh Systems','Kaveri Scales','Royal Weighing','Navkar Industries','Unique Weighbridge','Vardhman Scales','Sapphire Weighing','Metro Scale House','Excel Weigh Tech','Sunrise Weighbridges','Krishna Weighing','Apex Scale Co','Global Weigh','Patel Weighing Works'];
  const cities=['Rajkot','Ahmedabad','Surat','Pune','Indore','Jaipur','Mumbai','Nagpur','Vadodara','Delhi'];
  const PR={DLC:1500,ALC:1400,AS:2100,DS:2000,'S TYPE':1800,JUMBO:3600,REG:1200};const TY=Object.keys(PR);
  const orders=[],bills=[],fin=[],jobs=[],clients={};let on=0,jn=0,bn=0;const t0=ST.parseISO(today);
  names.forEach((n,ci)=>{const city=cities[ci%cities.length];const phone='98'+String(10000000+Math.floor(rnd()*89999999));clients[n]={location:city,phone,paymentMode:rnd()<0.6?'Credit':'Advance',creditDays:pick(['30','45','30'])};
    const fav=[pick(TY.slice(0,3)),pick(TY)];let d=new Date(t0);d.setDate(d.getDate()-Math.floor((ci<12?380:60)+rnd()*330));const gap=20+Math.floor(rnd()*70);const churnAt=rnd()<0.3?new Date(t0.getTime()-(30+rnd()*300)*86400000):null;const size=4*(1+Math.floor(rnd()*(ci<4?14:6)));
    while(d<=t0&&(!churnAt||d<churnAt)){const items=[{type:fav[0],qty:String(size+4*Math.floor(rnd()*3)),capacity:pick(['30T','40T','50T','20T']),wire:pick(['Blue 16m','Grey 12m','Blue 20m'])}];if(rnd()<0.35&&fav[1]!==fav[0])items.push({type:fav[1],qty:String(4*(1+Math.floor(rnd()*4))),capacity:pick(['2T','5T','10T']),wire:'Grey 6m'});
      on++;const date=iso(d);const age=ST.daysBetween(date,today);const appr=new Date(d.getTime()+86400000*0.2);const cyc=4+Math.floor(rnd()*9);const dod=age>cyc?ST.addDays(date,cyc):'';const deliv=ST.addDays(date,7+Math.floor(rnd()*4));
      const o={orderNo:'ORD-'+date.slice(0,4)+'-'+String(on).padStart(4,'0'),date,deliveryDate:deliv,partyName:n,location:city,clientPhone:phone,items,status:dod?'completed':(age<1?'awaiting':'pending'),approvedAt:appr.toISOString(),paymentMode:clients[n].paymentMode,creditDays:clients[n].creditDays,dod,transporterName:pick(['VRL Logistics','Gati','TCI Freight'])};
      const sum=ST.itemsSummary(items);Object.assign(o,{loadcellType:sum.loadcellType,quantity:sum.quantity});
      // production job + history
      jn++;const stagesAll=['Received','Assembly','Wiring','Testing','Laser','Packing','Ready','Dispatched'];const reach=dod?7:Math.min(6,Math.floor(age/1.3));const h=[];let tt=appr.getTime();
      for(let s=0;s<=reach;s++){h.push({stage:stagesAll[s],date:new Date(tt).toISOString(),note:''});tt+=(s===3||s===5?1.6:0.9)*86400000*(0.6+rnd());}
      const j={jobNo:'JOB-'+String(jn).padStart(4,'0'),orderRef:o.orderNo,party:n,items,stage:stagesAll[reach],history:h,target:deliv,approvals:{},startDate:date};
      if(reach>=6){j.packedAt=h[5].date;j.boxes=String(Math.ceil(sum.quantity/4));j.weight=String(sum.quantity*11);}
      if(reach===5&&rnd()<0.5){j.packedAt=h[5].date;j.boxes='3';j.weight='60';}
      if(reach===6&&rnd()<0.5)j.pickupMsgAt=h[6].date;
      if(o.status!=='awaiting'){jobs.push(j);o.jobNo=j.jobNo;}
      if(dod){bn++;const its=items.map(i=>({desc:'Load Cell '+i.type+' '+i.capacity,hsn:'84239020',qty:i.qty,unit:'NOS',rate:PR[i.type]*(0.95+rnd()*0.1),gst:18}));its.forEach(i=>{i.rate=Math.round(i.rate);i.taxable=i.rate*num(i.qty);});
        const taxable=its.reduce((s,i)=>s+i.taxable,0);const total=Math.round(taxable*1.18);const no='ST/'+bn;bills.push({no,date:dod,jobNo:j.jobNo,orderNo:o.orderNo,buyer:{name:n,place:city},items:its,taxable,total});
        o.billNo=no;o.billTotal=total;const paid=o.paymentMode!=='Credit'||ST.daysBetween(dod,today)>(+o.creditDays+(rnd()<0.25?60:5));if(paid){o.paymentDone=true;o.paidDate=ST.addDays(dod,Math.min(ST.daysBetween(dod,today),+o.creditDays))+'T10:00:00Z';}
        if(!paid&&ST.daysBetween(dod,today)>+o.creditDays+2)o.reminders=[{at:ST.addDays(dod,+o.creditDays+2)+'T10:00:00Z',n:1}];
        fin.push({id:'d'+bn,type:'income',source:'bill',date:dod,amount:total,party:n,category:'Sales',ref:no,orderNo:o.orderNo,status:paid?'Paid':'Pending'});}
      orders.push(o);d=new Date(d.getTime()+(gap*(0.6+rnd()*0.8))*86400000);}});
  // a few orders still in the factory right now
  const ST8=['Received','Wiring','Testing','Laser','Packing','Ready'];
  ST8.forEach((st,k)=>{const n=names[(k*3+1)%names.length];const date=ST.addDays(today,-(k*2+1));on++;jn++;const items=[{type:pick(['DLC','ALC','AS']),qty:String(8*(1+k%3)),capacity:'30T',wire:'Blue 16m'}];
    const o={orderNo:'ORD-'+date.slice(0,4)+'-'+String(on).padStart(4,'0'),date,deliveryDate:k===5?ST.addDays(today,-2):ST.addDays(date,8),partyName:n,location:clients[n].location,clientPhone:clients[n].phone,items,status:'pending',approvedAt:date+'T06:00:00Z',paymentMode:clients[n].paymentMode,creditDays:clients[n].creditDays,transporterName:'VRL Logistics'};
    const sum=ST.itemsSummary(items);Object.assign(o,{loadcellType:sum.loadcellType,quantity:sum.quantity,jobNo:'JOB-'+String(jn).padStart(4,'0')});orders.push(o);
    const idx=['Received','Assembly','Wiring','Testing','Laser','Packing','Ready'].indexOf(st);const h=[];for(let s=0;s<=idx;s++)h.push({stage:['Received','Assembly','Wiring','Testing','Laser','Packing','Ready'][s],date:new Date(ST.parseISO(date).getTime()+s*0.4*86400000).toISOString()});
    const j={jobNo:o.jobNo,orderRef:o.orderNo,party:n,items,stage:st,history:h,target:o.deliveryDate,approvals:{},startDate:date};if(st==='Packing'||st==='Ready'){j.packedAt=h[h.length-1].date;j.boxes='2';j.weight='40';}jobs.push(j);});
  // monthly expenses
  for(let k=23;k>=0;k--){const m=new Date(t0.getFullYear(),t0.getMonth()-k,5);const key=iso(m).slice(0,7);const rev=fin.filter(e=>e.date.startsWith(key)).reduce((s,e)=>s+e.amount,0);
    [['Raw Material',rev*0.36],['China Import',rev*0.16],['Salary',95000],['Rent',35000],['Utilities',14000+rnd()*6000],['Transport',rev*0.02],['Marketing',8000+rnd()*7000]].forEach(([c,a],i)=>{if(a>0)fin.push({id:'e'+key+i,type:'expense',date:key+'-'+String(5+i*3).padStart(2,'0'),amount:Math.round(a),party:c==='Salary'?'Staff':c==='Rent'?'Landlord':pick(['Shree Metals','Ningbo Sensor Co','Torrent Power','VRL Logistics','IndiaMart']),category:c,status:'Paid'});});}
  // leads + calls
  const leads=[],calls=[];const SRC=[['IndiaMart',0.36,0.24],['JustDial',0.2,0.06],['Google',0.14,0.16],['Referral',0.12,0.42],['Exhibition',0.1,0.2],['Cold Call',0.08,0.05]];
  for(let i=0;i<160;i++){let r=rnd(),s=SRC[0];for(const x of SRC){if(r<x[1]){s=x;break;}r-=x[1];}const created=new Date(t0.getTime()-rnd()*360*86400000);
    const conv=rnd()<s[2];const st=conv?'Converted':pick(['New','Contacted','Contacted','Interested','Quote Sent','Lost','Lost']);
    const l={id:'L'+i,company:conv&&rnd()<0.6?pick(names):'Lead Co '+(i+1),source:s[0],caller:pick(['Telecaller 1','Telecaller 2']),status:st,product:pick(['DLC','ALC','Ball Type Loadcell','Complete Weighbridge']),qty:String(8*(1+Math.floor(rnd()*6))),value:String(Math.round((20+rnd()*120)*1000)),createdAt:created.toISOString(),phone:'97'+String(10000000+Math.floor(rnd()*89999999))};leads.push(l);
    const nc=1+Math.floor(rnd()*4);for(let c=0;c<nc;c++)calls.push({id:'c'+i+'_'+c,leadId:l.id,company:l.company,datetime:new Date(created.getTime()+c*2*86400000).toISOString(),outcome:pick(['Interested','No Answer','Callback Requested','Quote Requested'])});}
  return {orders:orders.filter(o=>o.status!=='cancelled'),cancelled:[],jobs,bills,fin,jw:[],leads,calls,items:[],imports:[],clients};};
})();
