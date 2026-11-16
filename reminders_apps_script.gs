// ═══════════════════════════════════════════════════════════════
//  SENTIRE REMINDERS — Google Apps Script (runs in YOUR Google account)
//  • Keeps all reminders in a Google Sheet "Sentire Reminders"
//  • Puts them on 3 Google Calendars so your phone alerts you:
//      Sentire – ODS (Monthly) · Sentire – Annual · Sentire – Business
//  • Every morning checks Gmail for due dates / renewals and adds them to "To review"
//  • Every morning emails you what is due today and in the next 7 days
//  Setup: see REMINDERS_SETUP.txt (paste this file, run setup, deploy as Web app)
// ═══════════════════════════════════════════════════════════════
var SHEET = 'Reminders';
var HEAD = ['id','type','title','notes','date','time','repeat','notifyDays','status','source','sourceRef','eventId','created','updated','lastDone'];
var TYPES = { ODS: 'Sentire – ODS (Monthly)', Annual: 'Sentire – Annual', Business: 'Sentire – Business' };

/* ═════ ONE-TIME SETUP — run this once from the editor ═════ */
function setup() {
  var p = props_();
  if (!p.getProperty('KEY')) p.setProperty('KEY', Utilities.getUuid().replace(/-/g, '').slice(0, 20));
  sheet_();
  ['ODS', 'Annual', 'Business'].forEach(function (t) { cal_(t); });
  // daily triggers: Gmail scan 7 AM, digest email 8 AM
  ScriptApp.getProjectTriggers().forEach(function (tr) { if (['scanGmail', 'dailyDigest'].indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('scanGmail').timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(8).create();
  var tz = Session.getScriptTimeZone();
  Logger.log('✓ Setup done.');
  Logger.log('SECRET KEY (paste into the Reminders page): ' + p.getProperty('KEY'));
  Logger.log('Google Sheet: ' + getSS_().getUrl());
  if (tz !== 'Asia/Kolkata' && tz !== 'Asia/Calcutta') Logger.log('⚠ Time zone is ' + tz + '. Set Project Settings → Time zone → (GMT+05:30) India, then run setup again.');
}

/* ═════ WEB API (the Reminders page talks to this) ═════ */
function doGet(e) {
  var q = (e && e.parameter) || {};
  if (!okKey_(q.key)) return json_({ ok: false, error: 'Wrong or missing key' });
  if (q.action === 'ping') return json_({ ok: true, tz: Session.getScriptTimeZone() });
  return json_({ ok: true, reminders: readAll_() });
}
function doPost(e) {
  var b = {};
  try { b = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  if (!okKey_(b.key)) return json_({ ok: false, error: 'Wrong or missing key' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (b.action === 'save') return json_({ ok: true, reminder: save_(b.reminder) });
    if (b.action === 'delete') { del_(b.id); return json_({ ok: true }); }
    if (b.action === 'done') return json_({ ok: true, reminder: done_(b.id, b.on) });
    if (b.action === 'dismiss') return json_({ ok: true, reminder: setStatus_(b.id, 'dismissed') });
    if (b.action === 'scan') { var n = scanGmail(); return json_({ ok: true, added: n, reminders: readAll_() }); }
    if (b.action === 'bulk') { (b.reminders || []).forEach(function (r) { save_(r); }); return json_({ ok: true, reminders: readAll_() }); }
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
  finally { lock.releaseLock(); }
}

/* ═════ STORAGE ═════ */
function props_() { return PropertiesService.getScriptProperties(); }
function okKey_(k) { var key = props_().getProperty('KEY'); return !!key && k === key; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function getSS_() {
  var id = props_().getProperty('SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var ss = SpreadsheetApp.create('Sentire Reminders'); props_().setProperty('SS_ID', ss.getId()); return ss;
}
function sheet_() {
  var ss = getSS_(); var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.getSheets()[0]; sh.setName(SHEET); sh.clear(); sh.appendRow(HEAD); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold'); }
  return sh;
}
function readAll_() {
  var sh = sheet_(); var v = sh.getDataRange().getValues(); var out = [];
  for (var i = 1; i < v.length; i++) { if (!v[i][0]) continue; var r = {}; HEAD.forEach(function (h, j) { r[h] = cell_(v[i][j], h); }); out.push(r); }
  return out;
}
function cell_(x, h) { // dates from Sheets come back as Date objects — keep our text formats
  if (x instanceof Date) { if (h === 'time') return Utilities.formatDate(x, Session.getScriptTimeZone(), 'HH:mm'); if (h === 'date') return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd'); return x.toISOString(); }
  return x === null || x === undefined ? '' : String(x);
}
function rowIndex_(id) { var ids = sheet_().getRange(1, 1, Math.max(1, sheet_().getLastRow()), 1).getValues(); for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 1; return -1; }
function write_(r) {
  var sh = sheet_(); var row = HEAD.map(function (h) { return r[h] === undefined || r[h] === null ? '' : String(r[h]); });
  var i = rowIndex_(r.id);
  if (i > 0) sh.getRange(i, 1, 1, HEAD.length).setNumberFormat('@').setValues([row]);
  else { sh.appendRow(row); sh.getRange(sh.getLastRow(), 1, 1, HEAD.length).setNumberFormat('@').setValues([row]); }
}
function find_(id) { var all = readAll_(); for (var i = 0; i < all.length; i++) if (all[i].id === String(id)) return all[i]; return null; }

/* ═════ SAVE / DELETE / DONE ═════ */
function clean_(r) {
  var x = {};
  x.id = String(r.id || ('r' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4)));
  x.type = TYPES[r.type] ? r.type : 'Business';
  x.title = String(r.title || 'Reminder').slice(0, 200);
  x.notes = String(r.notes || '').slice(0, 2000);
  x.date = /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  x.time = /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:30';
  x.repeat = x.type === 'ODS' ? 'monthly' : x.type === 'Annual' ? 'yearly' : (r.repeat === 'monthly' || r.repeat === 'yearly' ? r.repeat : 'none');
  x.notifyDays = String(Math.max(0, Math.min(28, parseInt(r.notifyDays, 10) || 0)));
  x.status = ['active', 'done', 'suggested', 'dismissed'].indexOf(r.status) >= 0 ? r.status : 'active';
  x.source = String(r.source || 'manual'); x.sourceRef = String(r.sourceRef || ''); x.lastDone = String(r.lastDone || '');
  return x;
}
function save_(input) {
  var r = clean_(input); var old = find_(r.id); var now = new Date().toISOString();
  r.created = old ? old.created : now; r.updated = now;
  if (old) removeEvent_(old); // remove using the OLD type/repeat, then create fresh
  r.eventId = '';
  r.eventId = syncEvent_(r);
  write_(r); return r;
}
function del_(id) { var r = find_(id); if (!r) return; removeEvent_(r); var i = rowIndex_(id); if (i > 0) sheet_().deleteRow(i); }
function setStatus_(id, st) { var r = find_(id); if (!r) return null; r.status = st; return save_(r); }
function done_(id, on) {
  var r = find_(id); if (!r) return null;
  if (r.repeat === 'none') { r.status = 'done'; r.lastDone = on || today_(); return save_(r); }
  r.lastDone = on || today_(); r.updated = new Date().toISOString(); write_(r); return r; // repeating: calendar keeps reminding next time
}
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

/* ═════ GOOGLE CALENDAR (phone alerts) ═════ */
function cal_(type) {
  var key = 'CAL_' + type; var id = props_().getProperty(key); var c = id ? CalendarApp.getCalendarById(id) : null;
  if (!c) {
    var colors = { ODS: CalendarApp.Color.BLUE, Annual: CalendarApp.Color.ORANGE, Business: CalendarApp.Color.GREEN };
    c = CalendarApp.createCalendar(TYPES[type], { color: colors[type] }); props_().setProperty(key, c.getId());
  }
  return c;
}
function removeEvent_(r) {
  if (!r || !r.eventId) return;
  try { var c = cal_(r.type);
    if (r.repeat === 'none') { var ev = c.getEventById(r.eventId); if (ev) ev.deleteEvent(); }
    else { var s = c.getEventSeriesById(r.eventId); if (s) s.deleteEventSeries(); }
  } catch (e) { Logger.log('remove event: ' + e); }
}
function syncEvent_(r) {
  removeEvent_(r);
  if (r.status !== 'active') return '';
  if (r.repeat === 'none' && r.date < today_()) return ''; // past one-time reminder: nothing to alert
  var c = cal_(r.type); var d = r.date.split('-').map(Number), t = r.time.split(':').map(Number);
  var start = new Date(d[0], d[1] - 1, d[2], t[0], t[1]); var end = new Date(start.getTime() + 15 * 60000);
  var opts = { description: (r.notes ? r.notes + '\n\n' : '') + 'Sentire Reminders · ' + r.type };
  var ev;
  if (r.repeat === 'monthly') ev = c.createEventSeries(r.title, start, end, CalendarApp.newRecurrence().addMonthlyRule().onlyOnMonthDay(d[2]), opts);
  else if (r.repeat === 'yearly') ev = c.createEventSeries(r.title, start, end, CalendarApp.newRecurrence().addYearlyRule().onlyInMonth(monthEnum_(d[1])).onlyOnMonthDay(d[2]), opts);
  else ev = c.createEvent(r.title, start, end, opts);
  ev.removeAllReminders(); ev.addPopupReminder(0);
  var nd = parseInt(r.notifyDays, 10) || 0; if (nd > 0) ev.addPopupReminder(Math.min(nd * 1440, 40320));
  return ev.getId();
}
function monthEnum_(m) { var M = CalendarApp.Month; return [M.JANUARY, M.FEBRUARY, M.MARCH, M.APRIL, M.MAY, M.JUNE, M.JULY, M.AUGUST, M.SEPTEMBER, M.OCTOBER, M.NOVEMBER, M.DECEMBER][m - 1]; }

/* ═════ GMAIL → "To review" (runs every morning; also from the page's "Check Gmail" button) ═════ */
var GMAIL_QUERY = 'newer_than:3d -category:promotions -category:social -in:chats ("due date" OR "due on" OR "last date" OR renewal OR renew OR expiry OR expires OR expiring OR "payment due" OR "valid till" OR "valid upto" OR "valid up to" OR EMI OR premium OR "auto-debit" OR "auto debit" OR reminder OR deadline)';
function scanGmail() {
  var seen = {}; readAll_().forEach(function (r) { if (r.sourceRef) seen[r.sourceRef] = 1; });
  var threads = GmailApp.search(GMAIL_QUERY, 0, 40); var added = 0;
  threads.forEach(function (th) {
    var msgs = th.getMessages(); var m = msgs[msgs.length - 1]; var mid = m.getId();
    if (seen[mid]) return;
    var subject = m.getSubject() || '(no subject)'; var body = (m.getPlainBody() || '').slice(0, 6000);
    var date = findDate_(subject + '\n' + body); if (!date) return;
    var text = (subject + ' ' + body).toLowerCase();
    var type = /\b(annual|yearly|renewal|renew|licen[cs]e|insurance|policy|premium|amc|registration|domain|subscription)\b/.test(text) ? 'Annual'
             : /\b(monthly|emi|gst|gstr|tds|pf|esic|rent|salary|every month)\b/.test(text) ? 'ODS' : 'Business';
    save_({ type: type, title: subject.replace(/^(re|fwd?|fw):\s*/i, '').slice(0, 120), date: date, time: '10:00', notifyDays: 2, status: 'suggested', source: 'gmail', sourceRef: mid,
      notes: 'From: ' + m.getFrom() + '\n' + body.replace(/\s+/g, ' ').slice(0, 300) + '\nOpen mail: https://mail.google.com/mail/u/0/#all/' + th.getId() });
    seen[mid] = 1; added++;
  });
  return added;
}
// First future date in the text, looking near words like "due", "last date", "expires" first
function findDate_(text) {
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  var today = today_(); var max = Utilities.formatDate(new Date(new Date().getTime() + 730 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ok = function (y, mo, d) { if (y < 100) y += 2000; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; var s = y + '-' + pad(mo) + '-' + pad(d); return s >= today && s <= max ? s : null; };
  var all = function (s) {
    var out = [], m, re;
    re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g; while ((m = re.exec(s))) out.push([m.index, ok(+m[3], +m[2], +m[1])]);
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g; while ((m = re.exec(s))) out.push([m.index, ok(+m[1], +m[2], +m[3])]);
    re = /\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s,\-]+(\d{2,4})\b/gi; while ((m = re.exec(s))) out.push([m.index, ok(+m[3], MON[m[2].toLowerCase()], +m[1])]);
    re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi; while ((m = re.exec(s))) out.push([m.index, ok(+m[3], MON[m[1].toLowerCase()], +m[2])]);
    return out.filter(function (x) { return x[1]; }).sort(function (a, b) { return a[0] - b[0]; });
  };
  var low = text.toLowerCase(); var kw = /(due|last date|expir|valid till|valid upto|valid up to|renew|deadline|payable by|pay by|before)/g; var k;
  while ((k = kw.exec(low))) { var near = all(text.slice(k.index, k.index + 120)); if (near.length) return near[0][1]; }
  var any = all(text); return any.length ? any[0][1] : null;
}

/* ═════ DAILY EMAIL: today + next 7 days ═════ */
function nextDate_(r, from) {
  var d = r.date.split('-').map(Number); var f = from.split('-').map(Number); var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  if (r.repeat === 'monthly') { var y = f[0], m = f[1]; for (var i = 0; i < 14; i++) { var len = new Date(y, m, 0).getDate(); if (d[2] <= len) { var s = y + '-' + pad(m) + '-' + pad(d[2]); if (s >= from && s >= r.date) return s; } m++; if (m > 12) { m = 1; y++; } } return null; }
  if (r.repeat === 'yearly') { for (var yy = f[0]; yy <= f[0] + 4; yy++) { var s2 = yy + '-' + pad(d[1]) + '-' + pad(d[2]); if (s2 >= from && new Date(yy, d[1] - 1, d[2]).getDate() === d[2]) return s2; } return null; }
  return r.date >= from ? r.date : null;
}
function dailyDigest() {
  var t = today_(); var in7 = Utilities.formatDate(new Date(new Date().getTime() + 7 * 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var all = readAll_(); var items = [];
  all.filter(function (r) { return r.status === 'active'; }).forEach(function (r) {
    var from = t; if (r.lastDone && r.lastDone >= t) { from = Utilities.formatDate(new Date(new Date(r.lastDone + 'T12:00:00').getTime() + 86400000), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
    var n = nextDate_(r, from); if (n && n <= in7) items.push({ r: r, n: n }); });
  var sug = all.filter(function (r) { return r.status === 'suggested'; }).length;
  if (!items.length && !sug) return;
  items.sort(function (a, b) { return a.n < b.n ? -1 : 1; });
  var row = function (x) { return '<tr><td style="padding:6px 10px;font-family:monospace">' + x.n.split('-').reverse().join('-') + (x.n === t ? ' <b style="color:#c00">TODAY</b>' : '') + '</td><td style="padding:6px 10px">' + x.r.type + '</td><td style="padding:6px 10px"><b>' + x.r.title + '</b></td></tr>'; };
  var html = '<h2 style="font-family:Arial">Sentire Reminders</h2>' + (items.length ? '<table style="font-family:Arial;border-collapse:collapse">' + items.map(row).join('') + '</table>' : '<p>Nothing due in the next 7 days.</p>') +
    (sug ? '<p style="font-family:Arial">📥 ' + sug + ' reminder(s) found in Gmail are waiting for you in <b>To review</b>.</p>' : '');
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Reminders: ' + items.filter(function (x) { return x.n === t; }).length + ' today, ' + items.length + ' this week', htmlBody: html });
}
