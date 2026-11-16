// ═══════════════════════════════════════════════════════════════
// REMINDER AGENT — understands what you type or say and turns it into a reminder
// "remind me on 20th of every month to pay GST"          → ODS (monthly), day 20
// "every year on 15 March renew factory licence"         → Annual, 15 Mar
// "tomorrow at 11 am meeting with bank"                  → Business, tomorrow 11:00
// "follow up Bharat Scales quote in 3 days, 1 day before"→ Business, +3 days, alert 1 day before
// ═══════════════════════════════════════════════════════════════
(function(root){
const RA={};
const pad=n=>String(n).padStart(2,'0');
RA.iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
RA.today=()=>RA.iso(new Date());
RA.parse=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
RA.add=(s,n)=>{const d=RA.parse(s);d.setDate(d.getDate()+n);return RA.iso(d);};
RA.days=(a,b)=>Math.round((RA.parse(b)-RA.parse(a))/86400000);
RA.monthLen=(y,m)=>new Date(y,m,0).getDate();
const MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const MON_RE='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WD=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const NUMW={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifteen:15,thirty:30};
const monNum=w=>MON[w.toLowerCase().slice(0,4)]||MON[w.toLowerCase().slice(0,3)];

// Next date (yyyy-mm-dd) a reminder falls on, from a given day. Monthly: months without that day are skipped (same as Google Calendar).
RA.next=function(r,from){from=from||RA.today();if(r.lastDone&&r.lastDone>=from)from=RA.add(r.lastDone,1);const d=String(r.date||'').split('-').map(Number);if(d.length<3||!d[0])return null;
  if(r.repeat==='monthly'){let y=+from.slice(0,4),m=+from.slice(5,7);for(let i=0;i<14;i++){if(d[2]<=RA.monthLen(y,m)){const s=y+'-'+pad(m)+'-'+pad(d[2]);if(s>=from&&s>=r.date.slice(0,7)+'-01')return s;}m++;if(m>12){m=1;y++;}}return null;}
  if(r.repeat==='yearly'){for(let y=+from.slice(0,4);y<=+from.slice(0,4)+4;y++){if(d[2]<=RA.monthLen(y,d[1])){const s=y+'-'+pad(d[1])+'-'+pad(d[2]);if(s>=from)return s;}}return null;}
  return r.date>=from?r.date:null;};

// Read a sentence → {type, repeat, date, time, notifyDays, title, notes, missing[]}
RA.read=function(raw,opt){opt=opt||{};const today=opt.today||RA.today();const T=RA.parse(today);
  let s=' '+String(raw||'').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim()+' ';
  const out={type:null,repeat:'none',date:'',time:'',notifyDays:0,title:'',notes:'',missing:[],day:null,month:null,year:null};
  const cut=re=>{s=s.replace(re,' ');};const test=re=>re.test(s);let m;
  // ── column / repeat words ──
  if(test(/\bo\.?d\.?s\b/i)){out.type='ODS';cut(/\b(?:in|to|for|under|into)?\s*(?:the\s*|my\s*)?o\.?d\.?s\b(?:\s*(?:column|list|reminders?|folder))?/ig);}
  if(test(/\bbusiness\b/i)){out.type=out.type||'Business';cut(/\b(?:in|to|for|under|into)?\s*(?:the\s*|my\s*)?business\b(?:\s*(?:column|list|reminders?|folder))?/ig);}
  if(test(/\b(annual|annually|yearly|every year|each year|per year|once a year|every twelve months)\b/i)){out.type=out.type||'Annual';out.repeat='yearly';cut(/\b(?:as\s+)?(?:an?\s+)?(?:annual|annually|yearly|every year|each year|per year|once a year|every twelve months)\b(?:\s*(?:reminders?|column|list))?/ig);}
  if(test(/\b(monthly|every month|each month|per month|once a month|of every month|of each month|every \d{1,2}(?:st|nd|rd|th)?)\b/i)&&out.repeat!=='yearly'){out.type=out.type||'ODS';out.repeat='monthly';cut(/\b(?:monthly|every month|each month|per month|once a month|of every month|of each month|of the month|of month)\b(?:\s*(?:reminders?|column|list))?/ig);s=s.replace(/\bevery (\d{1,2}(?:st|nd|rd|th)?)\b/ig,' on $1 ');}
  if(out.type==='ODS')out.repeat='monthly';if(out.type==='Annual')out.repeat='yearly';
  // ── alert in advance ──
  if((m=s.match(/\b(?:and\s+)?(?:alert|notify|remind)?\s*(?:me\s+)?(\d{1,2}|a|an|one|two|three|four|five|seven|ten|fifteen)\s*(days?|weeks?)\s*(?:before|in advance|advance|prior|earlier|ahead)\b/i))){const n=NUMW[m[1].toLowerCase()]||+m[1];out.notifyDays=/week/i.test(m[2])?n*7:n;s=s.replace(m[0],' ');}
  else if((m=s.match(/\b(?:a|one)\s+day\s+(?:before|prior|earlier)\b|\bday before\b/i))){out.notifyDays=1;s=s.replace(m[0],' ');}
  // ── time ──
  if((m=s.match(/\b(?:at\s+|by\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[,.!])/i))){let h=+m[1]%12;if(/p/i.test(m[3]))h+=12;out.time=pad(h)+':'+(m[2]||'00');s=s.replace(m[0],' ');}
  else if((m=s.match(/\bat\s+(\d{1,2})[:.](\d{2})\b/i))){out.time=pad(Math.min(23,+m[1]))+':'+m[2];s=s.replace(m[0],' ');}
  else if((m=s.match(/\b(?:at\s+|in the\s+)?(morning|noon|afternoon|evening|night|tonight)\b/i))){out.time={morning:'09:30',noon:'12:00',afternoon:'14:30',evening:'18:00',night:'20:30',tonight:'20:30'}[m[1].toLowerCase()];if(m[1].toLowerCase()==='tonight')s=s.replace(m[0],' today ');else s=s.replace(m[0],' ');}
  // ── date ──
  const PRE='(?:\\b(?:on|by|before|from|for|due|till|until)\\s+(?:the\\s+)?)?';const setFull=(y,mo,d)=>{out.year=y;out.month=mo;out.day=d;};
  if((m=s.match(new RegExp(PRE+'\\bday after tomorrow\\b','i')))){out.date=RA.add(today,2);s=s.replace(m[0],' ');}
  else if((m=s.match(new RegExp(PRE+'\\btomorrow\\b','i')))){out.date=RA.add(today,1);s=s.replace(m[0],' ');}
  else if((m=s.match(new RegExp(PRE+'\\b(?:today|tonight)\\b','i')))){out.date=today;s=s.replace(m[0],' ');}
  else if((m=s.match(/\b(?:in|after)\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|ten|fifteen)\s+(days?|weeks?|months?)\b/i))){const n=NUMW[m[1].toLowerCase()]||+m[1];if(/month/i.test(m[2])){const d=new Date(T);d.setMonth(d.getMonth()+n);out.date=RA.iso(d);}else out.date=RA.add(today,/week/i.test(m[2])?n*7:n);s=s.replace(m[0],' ');}
  else if((m=s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/))){let y=+m[3];if(y<100)y+=2000;setFull(y,+m[2],+m[1]);s=s.replace(new RegExp(PRE+m[0].replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&')),' ');}
  else if((m=s.match(new RegExp(PRE+'\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?[\\s\\-]+'+MON_RE+'\\b(?:[\\s,\\-]+(\\d{4}))?','i')))){setFull(m[3]?+m[3]:null,monNum(m[2]),+m[1]);s=s.replace(m[0],' ');}
  else if((m=s.match(new RegExp(PRE+'\\b'+MON_RE+'\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?','i')))){setFull(m[3]?+m[3]:null,monNum(m[1]),+m[2]);s=s.replace(m[0],' ');}
  else if((m=s.match(/\b(\d{1,2})[\/\-](\d{1,2})\b(?![\/\-]\d)/))&&+m[2]<=12&&+m[1]<=31){setFull(null,+m[2],+m[1]);s=s.replace(new RegExp(PRE+m[0].replace(/[\/\-]/g,'\\$&')),' ');}
  else if((m=s.match(new RegExp('(?:\\b(?:on|by|before|due|till|until)\\s+(?:the\\s+)?|\\bthe\\s+)?\\b(next\\s+|this\\s+|coming\\s+)?('+WD.join('|')+')\\b','i')))){const w=WD.indexOf(m[2].toLowerCase());let add=(w-T.getDay()+7)%7;if(add===0)add=7;out.date=RA.add(today,add);s=s.replace(m[0],' ');}
  else if((m=s.match(/(?:\b(?:on|by|before|due|till|until)\s+(?:the\s+)?|\bthe\s+)(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*(?:days?|weeks?|months?|pcs|pieces|%|percent))/i))||(m=s.match(/\b(\d{1,2})(st|nd|rd|th)\b(?!\s*(?:days?|weeks?|months?))/i))){out.day=+m[1];s=s.replace(m[0],' ');}
  else if((m=s.match(new RegExp('\\b(?:in|every|each)\\s+'+MON_RE+'\\b','i')))){out.month=monNum(m[1]);s=s.replace(m[0],' ');}
  // resolve to an actual date
  if(!out.date){
    if(out.day&&out.month&&out.year){if(out.day<=RA.monthLen(out.year,out.month))out.date=out.year+'-'+pad(out.month)+'-'+pad(out.day);}
    else if(out.day&&out.month){let y=T.getFullYear();let c=y+'-'+pad(out.month)+'-'+pad(out.day);if(c<today)c=(y+1)+'-'+pad(out.month)+'-'+pad(out.day);if(out.day<=RA.monthLen(+c.slice(0,4),out.month))out.date=c;}
    else if(out.day&&out.day<=31){if(out.repeat==='yearly'){out.missing.push('month');}else{const tmp={date:today.slice(0,8)+pad(Math.min(out.day,28)),repeat:'monthly'};let y=T.getFullYear(),mo=T.getMonth()+1;for(let i=0;i<14;i++){if(out.day<=RA.monthLen(y,mo)){const c=y+'-'+pad(mo)+'-'+pad(out.day);if(c>=today){out.date=c;break;}}mo++;if(mo>12){mo=1;y++;}}void tmp;}}
  }
  if(!out.date&&!out.missing.length)out.missing.push('date');
  if(out.date&&out.repeat==='none'&&!out.type&&out.date<today)out.missing.push('past');
  // ── title: what is left ──
  cut(/\b(?:please|plz|pls|kindly|hey|ok|okay)\b/ig);
  cut(/\b(?:can you\s+)?(?:set|add|create|make|put)\s+(?:a\s+|an\s+|my\s+)?(?:new\s+)?(?:reminders?|alerts?)\b(?:\s+(?:to|for|about|that|of))?/ig);
  cut(/\b(?:remind|alert|notify|tell)\s+(?:me|us)\b(?:\s+(?:to|for|about|that|of))?/ig);
  cut(/\b(?:remember|reminder|reminders)\b(?:\s+(?:to|for|about|that))?/ig);
  cut(/\b(?:at|on|by|for|in|to)\s*$/ig);
  // messages: drop greetings and sign-offs, tidy punctuation
  s=s.replace(/^\s*(?:dear|respected|hello|hi|hey)?\s*(?:sir|madam|ma'am|team|all|friends?)?\s*(?:ji)?\s*[,!:-]+\s*/i,' ').replace(/\b(?:dear|hello|hi)\s+(?:sir|madam|ma'am|team)\b[,!]?/ig,' ');
  s=s.replace(/[\s.,;!-]*\b(?:regards|thanks|thank you|thanking you|warm regards|best regards|with regards)\b[\s\S]*$/i,' ');
  s=s.replace(/\s+([.,;:!?])/g,'$1').replace(/([.,;:!?]){2,}/g,'$1');
  let t=s.replace(/\s+/g,' ').trim().replace(/^(?:to|for|about|that|on|at|by|of|the|and|is|in|,|-|:)\s+/i,'').replace(/^(?:to|for|about|that|on|at|by|of|and)\s+/i,'').replace(/\s+(?:to|for|on|at|by|and|of|the|in|,|-)$/i,'').replace(/[,.;:\-\s]+$/,'').trim();
  if(t.length>90&&opt.message){out.notes=String(raw).trim();t=t.split(/(?<=[.!?])\s/)[0].slice(0,90);}
  out.title=t?t.charAt(0).toUpperCase()+t.slice(1):'';if(!out.title)out.missing.push('title');
  if(!out.type)out.type=out.repeat==='monthly'?'ODS':out.repeat==='yearly'?'Annual':'Business';
  if(!out.time)out.time='09:30';
  return out;};
if(typeof module!=='undefined')module.exports=RA;else root.RA=RA;
})(typeof window!=='undefined'?window:globalThis);
