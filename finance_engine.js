// ═══════════════════════════════════════════════════════════════
//  SENTIRE SMART FINANCE ENGINE — the thinking part of smart_finance.html.
//  No screen code here: only reading bank statements, recognising parties, matching payments
//  to invoices, working out who owes what, and writing the suggestions.
//  Works in the browser (window.SmartFinance) and in Node (for tests).
// ═══════════════════════════════════════════════════════════════
(function (root) {
  var F = {};
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function p2(n) { return String(n).padStart(2, '0'); }
  function r2(n) { return Math.round(n * 100) / 100; }

  // ───────── small readers ─────────
  F.num = function (v) {
    if (typeof v === 'number') return Math.abs(v);
    var s = String(v == null ? '' : v).replace(/[,₹\s]|INR|Rs\.?/gi, '').replace(/\(([\d.]+)\)/, '$1').replace(/(cr|dr)\.?$/i, '');
    var n = parseFloat(s); return isNaN(n) ? 0 : Math.abs(n);
  };
  F.parseDate = function (v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) { var d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); }
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    var s = String(v).trim(), m, y;
    m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})\b/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] <= 31) { y = +m[3]; if (y < 100) y += 2000; return y + '-' + p2(m[2]) + '-' + p2(m[1]); }
    m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3})[A-Za-z]*[\/\-. ,]*(\d{2,4})\b/);
    if (m && MON[m[2].toLowerCase()]) { y = +m[3]; if (y < 100) y += 2000; return y + '-' + p2(MON[m[2].toLowerCase()]) + '-' + p2(m[1]); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
    return null;
  };
  var lower = function (v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim(); };

  function bankOf(text) { return /hdfc/i.test(text) ? 'HDFC' : /icici/i.test(text) ? 'ICICI' : /state bank|\bsbi\b/i.test(text) ? 'SBI' : /axis/i.test(text) ? 'AXIS' : /kotak/i.test(text) ? 'KOTAK' : /bank of baroda|\bbob\b/i.test(text) ? 'BOB' : 'Bank'; }
  function acctOf(text) {      // only the last 4 digits of the account number are ever kept
    var m = String(text).match(/(?:a\/c|account)\s*(?:no|number|num)?\.?\s*[:\-]?\s*([0-9Xx*]{6,20})/i);
    if (!m) return ''; var d = m[1].replace(/[^0-9]/g, ''); return d.length >= 4 ? d.slice(-4) : '';
  }
  function txnKey(bank, t) { var ref = t.ref && !/^0+$/.test(t.ref) ? t.ref : t.nar.slice(0, 60); return bank + '|' + t.date + '|' + (t.dr ? 'expense' : 'income') + '|' + (t.dr || t.cr).toFixed(2) + '|' + ref; }
  F.looseKey = function (bank, date, isOut, amount, nar) { return bank + '|' + date + '|' + (isOut ? 'o' : 'i') + '|' + (+amount).toFixed(2) + '|' + String(nar || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24); };

  // ───────── statement from Excel / CSV (a grid of cells) ─────────
  F.stmtFromGrid = function (rows, fname) {
    var hi = -1, i;
    for (i = 0; i < Math.min(rows.length, 60); i++) {
      var r = rows[i].map(lower).join('|');
      if (/narration|description|particular|remark|details/.test(r) && /withdraw|debit|\bdr\b|amount/.test(r) && /date/.test(r)) { hi = i; break; }
    }
    if (hi < 0) throw new Error('Could not find the transaction table in this file.');
    var H = rows[hi].map(lower);
    var col = function () { for (var a = 0; a < arguments.length; a++) { var re = arguments[a], x = H.findIndex(function (h) { return re.test(h); }); if (x >= 0) return x; } return -1; };
    var cDate = col(/^transaction date|^txn date|^tran date/, /^date$/, /^date/, /date/), cNar = col(/narration/, /transaction remarks|remarks/, /description/, /particular/, /details/),
      cRef = col(/chq|cheque|ref/), cDr = col(/withdraw/, /debit/, /^dr\b/), cCr = col(/deposit/, /credit/, /^cr\b/), cAmt = col(/^amount|amount \(/), cDrCr = col(/dr ?\/ ?cr|cr ?\/ ?dr|type/), cBal = col(/balance/);
    var head = rows.slice(0, hi + 1).map(function (r) { return r.join(' '); }).join(' ') + ' ' + (fname || '');
    var out = { bank: bankOf(head), acct: acctOf(head), txns: [], unread: 0, closing: null, closingDate: '' };
    for (i = hi + 1; i < rows.length; i++) {
      var row = rows[i], date = F.parseDate(row[cDate]); if (!date) continue;
      var nar = String(row[cNar] || '').replace(/\s+/g, ' ').trim(); if (!nar) continue;
      var dr = F.num(cDr >= 0 ? row[cDr] : 0), cr = F.num(cCr >= 0 ? row[cCr] : 0);
      if (cDr < 0 && cAmt >= 0) { var a = F.num(row[cAmt]); if (/cr/.test(lower(cDrCr >= 0 ? row[cDrCr] : ''))) cr = a; else dr = a; }
      if (!dr && !cr) continue;
      var t = { date: date, nar: nar, ref: cRef >= 0 ? String(row[cRef] || '').trim() : '', dr: dr ? r2(dr) : 0, cr: dr ? 0 : r2(cr), sure: true };
      if (cBal >= 0 && String(row[cBal]).trim() !== '') { t.bal = signed(String(row[cBal])); if (!out.closingDate || date >= out.closingDate) { out.closing = t.bal; out.closingDate = date; } }
      t.key = txnKey(out.bank, t); out.txns.push(t);
    }
    return out;
  };
  function signed(s) { var n = F.num(s); return (/dr\.?\)?$/i.test(String(s).trim()) || /^\s*-/.test(String(s))) ? -n : n; }

  // ───────── statement from a PDF ─────────
  //  pages = [ [ {y, items:[{x, w, s}]} , … ] , … ]  (one list of text lines per page, as pdf.js gives them)
  //  The direction of every entry (money out or money in) is proved from the running balance:
  //  previous balance − amount = new balance → money out; + amount → money in.
  var RE_MONEY = /^-?[\d,]*\d\.\d{2}$/, RE_DATE = /^\d{1,2}[\/\-.](\d{1,2}|[A-Za-z]{3})[\/\-.]\d{2,4}$/;
  var RE_NOISE = /page\s*(no)?\.?\s*:?\s*\d+|statement of acc|statement summary|opening balance|closing bal|generated (on|by)|computer generated|registered office|bank (ltd|limited)|^\*|end of statement|^total|brought forward|carried forward|\bb\/f\b|\bc\/f\b|continued|customer care|www\./i;
  var RE_STOP = /statement summary|end of statement|^total\b|grand total|closing bal/i;
  function tokens(line) {
    var out = [];
    line.items.forEach(function (it) {
      var s = String(it.s || ''), len = s.length || 1, w = it.w || len * 4, re = /\S+/g, m;
      while ((m = re.exec(s))) out.push({ s: m[0], x: it.x + w * m.index / len, x2: it.x + w * (m.index + m[0].length) / len });
    });
    out.sort(function (a, b) { return a.x - b.x; });
    // "Cr" / "Dr" written after a number belongs to that number
    for (var i = out.length - 1; i > 0; i--) if (/^\(?(cr|dr)\.?\)?$/i.test(out[i].s) && RE_MONEY.test(out[i - 1].s)) { out[i - 1].mark = /cr/i.test(out[i].s) ? 'cr' : 'dr'; out[i - 1].x2 = out[i].x2; out.splice(i, 1); }
    return out;
  }
  F.stmtFromPdfLines = function (pages, fname) {
    var lines = []; pages.forEach(function (pg) { pg.forEach(function (l) { lines.push(tokens(l)); }); });
    var text = function (tk) { return tk.map(function (t) { return t.s; }).join(' '); };
    var isHead = function (lt) { lt = lt.toLowerCase(); return /date/.test(lt) && /narration|particular|description|remark|details/.test(lt) && /withdraw|debit|deposit|credit|balance|amount/.test(lt); };
    var hAt = lines.findIndex(function (tk) { return isHead(text(tk)); });
    var all = lines.slice(0, hAt >= 0 ? hAt : 40).map(text).join(' ') + ' ' + (fname || '');   // the top of the statement: bank name and account number
    var out = { bank: bankOf(all), acct: acctOf(all), txns: [], unread: 0, closing: null, closingDate: '' };
    var glue = (out.bank === 'HDFC' || out.bank === 'ICICI') ? '' : ' ';
    var cols = null, prev = null, cur = null, extra = 0;

    function readHeader(tk) {
      if (!isHead(text(tk))) return false;
      var c = {}, mid = function (t) { return (t.x + t.x2) / 2; };
      tk.forEach(function (t) {
        var s = t.s.toLowerCase();
        if (c.nar == null && /narration|particular|description|remark|details/.test(s)) c.nar = t.x;
        else if (c.ref == null && /chq|cheque|ref/.test(s)) c.ref = t.x;
        else if (c.wd == null && /withdraw|debit/.test(s)) c.wd = mid(t);
        else if (c.dep == null && /deposit|credit/.test(s)) c.dep = mid(t);
        else if (c.bal == null && /balance/.test(s)) c.bal = mid(t);
      });
      if (c.nar == null) return false;
      c.refBefore = c.ref != null && c.ref < c.nar;
      cols = c; return true;
    }
    function isStart(tk) {
      for (var i = 0; i < Math.min(tk.length, 3); i++) {
        if (RE_DATE.test(tk[i].s) && F.parseDate(tk[i].s)) return i === 0 || /^\d{1,5}\.?$/.test(tk[0].s) || RE_DATE.test(tk[0].s) ? { date: F.parseDate(tk[i].s), used: [i] } : null;
        if (i + 2 < tk.length && /^\d{1,2}$/.test(tk[i].s) && MON[tk[i + 1].s.slice(0, 3).toLowerCase()] && /^\d{4},?$/.test(tk[i + 2].s) && (i === 0 || /^\d{1,5}\.?$/.test(tk[0].s)))
          return { date: F.parseDate(tk[i].s + ' ' + tk[i + 1].s + ' ' + tk[i + 2].s), used: [i, i + 1, i + 2] };
        if (!/^\d{1,5}\.?$/.test(tk[i].s)) break;
      }
      return null;
    }
    function finish() { if (cur) { delete cur._l; delete cur._r; cur.nar = cur.nar.replace(/\s+/g, ' ').trim(); if (cur.nar) { cur.key = txnKey(out.bank, cur); out.txns.push(cur); } else out.unread++; cur = null; } }

    lines.forEach(function (tk) {
      if (!tk.length) return;
      var lt = text(tk);
      if (readHeader(tk)) { finish(); return; }
      if (prev == null && !out.txns.length && !cur && /opening balance|balance b\/?f|brought forward/i.test(lt)) { var ob = tk.filter(function (t) { return RE_MONEY.test(t.s); }).pop(); if (ob) prev = signedTok(ob); }
      var st = isStart(tk);
      if (!st) {                                   // a continuation line of the narration, or page furniture
        if (!cur) return;
        if (RE_STOP.test(lt)) { finish(); return; }
        if (RE_NOISE.test(lt) || extra >= 4) return;
        // narration only: no amounts on the line, and it sits between the date column and the amount columns
        if (!tk.some(function (t) { return RE_MONEY.test(t.s); }) && tk[0].x >= cur._l - 6 && tk[tk.length - 1].x2 <= cur._r + 2) { cur.nar += glue + lt; extra++; }
        return;
      }
      finish(); extra = 0;
      var money = tk.filter(function (t, i) { return RE_MONEY.test(t.s) && st.used.indexOf(i) < 0; });
      var hasBal = !cols || cols.bal != null;
      var bal = null, amts = money;
      if (hasBal && money.length >= 2) { bal = signedTok(money[money.length - 1]); amts = money.slice(0, -1); }
      else if (hasBal) { out.unread++; return; }
      var nz = amts.filter(function (t) { return F.num(t.s) > 0; });
      if (!nz.length) { if (bal != null) prev = bal; return; }
      var at = nz[0], amount = r2(F.num(at.s)), dir = null, sure = false;
      if (bal != null && prev != null) {
        if (Math.abs(prev - amount - bal) < 0.011) { dir = 'dr'; sure = true; }
        else if (Math.abs(prev + amount - bal) < 0.011) { dir = 'cr'; sure = true; }
      }
      if (!dir && at.mark) dir = at.mark;
      if (!dir && cols && cols.wd != null && cols.dep != null) {
        if (amts.length === 2 && nz.length === 1) { dir = (amts.indexOf(at) === 0) === (cols.wd < cols.dep) ? 'dr' : 'cr'; sure = true; }   // both columns printed, one is 0.00
        else { var m = (at.x + at.x2) / 2; dir = Math.abs(m - cols.wd) <= Math.abs(m - cols.dep) ? 'dr' : 'cr'; }
      }
      if (!dir && amts.length === 2) dir = amts.indexOf(at) === 0 ? 'dr' : 'cr';
      if (!dir) dir = 'dr';
      var rest = tk.filter(function (t, i) { return st.used.indexOf(i) < 0 && !RE_MONEY.test(t.s) && !RE_DATE.test(t.s) && !(i === 0 && /^\d{1,5}\.?$/.test(t.s) && st.used[0] > 0); });
      var ref = '', looksRef = function (t) { return /^[A-Z0-9]{5,25}$/i.test(t.s) && (t.s.match(/\d/g) || []).length >= 4; };
      if (cols && cols.ref != null && rest.length >= 2) {
        if (cols.refBefore) { if (looksRef(rest[0]) || /^-+$/.test(rest[0].s)) ref = rest.shift().s.replace(/^-+$/, ''); }
        else if (looksRef(rest[rest.length - 1])) ref = rest.pop().s;
      }
      cur = { date: st.date, nar: rest.map(function (t) { return t.s; }).join(' '), ref: ref, dr: dir === 'dr' ? amount : 0, cr: dir === 'cr' ? amount : 0, sure: sure,
        _l: tk[st.used[st.used.length - 1]].x2, _r: money.length ? money[0].x : 1e9 };
      if (bal != null) { cur.bal = bal; prev = bal; if (!out.closingDate || st.date >= out.closingDate) { out.closing = bal; out.closingDate = st.date; } }
    });
    finish();
    // The first entry has no earlier balance to prove it: use the opening balance printed in the statement summary.
    var f0 = out.txns[0];
    if (f0 && !f0.sure && f0.bal != null) {
      for (var li = 0; li < lines.length; li++) {
        if (!/opening bal/i.test(text(lines[li]))) continue;
        var mt = lines[li].filter(function (t) { return RE_MONEY.test(t.s); })[0] || (lines[li + 1] || []).filter(function (t) { return RE_MONEY.test(t.s); })[0];
        if (!mt) continue; var ob = signedTok(mt), a0 = f0.dr || f0.cr;
        if (Math.abs(ob - a0 - f0.bal) < 0.011) { f0.dr = a0; f0.cr = 0; f0.sure = true; } else if (Math.abs(ob + a0 - f0.bal) < 0.011) { f0.cr = a0; f0.dr = 0; f0.sure = true; }
        if (f0.sure) { f0.key = txnKey(out.bank, f0); break; }
      }
    }
    out.proved = out.txns.filter(function (t) { return t.sure; }).length;
    return out;
  };
  function signedTok(t) { var n = F.num(t.s); return (t.mark === 'dr' || /^-/.test(t.s)) ? -n : n; }

  // ───────── who is this entry about? ─────────
  F.guessMode = function (n) { var s = String(n).toUpperCase(); if (/UPI/.test(s)) return 'UPI'; if (/NEFT|RTGS|IMPS|FT-|INF\/|TRANSFER|NETBANK|\bIB\b/.test(s)) return 'Bank Transfer'; if (/CHQ|CHEQUE|CLG|CLEARING/.test(s)) return 'Cheque'; if (/^(ATW|NWD|EAW)|ATM|CASH|\bAWB\b/.test(s)) return 'Cash'; if (/POS|CARD|ECOM/.test(s)) return 'Card'; return 'Bank Transfer'; };
  // Pick the person / company name out of the bank's narration (banks put it next to the IFSC code).
  F.guessParty = function (n) {
    n = String(n || '');
    if (/^(ATW|NWD|ATM|EAW|CASH ?WDL)/i.test(n.trim())) return 'ATM Cash Withdrawal';
    var skip = /^((upi|neft|rtgs|imps|ach|nach|ecs|mmt|pos|inf|inft|ft|ib|chq|clg)( ?(dr|cr))?|dr|cr|atm|to|by|transfer|payment|paid|pay|from|ref|txn|sent|received|collect|p2a|p2m|na|null|bank|ltd|netbank.*)$/i;
    var parts = n.split(/[\/\-:|]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    var isIfsc = function (p) { return /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(p); };
    var ok = function (p) { return p && p.indexOf('@') < 0 && !isIfsc(p) && (p.match(/[A-Za-z]/g) || []).length >= 3 && !/\d{5,}/.test(p) && !skip.test(p) && !/,/.test(p); };
    var tidy = function (p) { return p.replace(/\s+/g, ' ').toUpperCase().slice(0, 40); };
    var fi = parts.findIndex(isIfsc), i;
    if (fi >= 0) { for (i = fi - 1; i >= 0; i--) { if (parts[i].indexOf('@') >= 0) continue; if (ok(parts[i])) return tidy(parts[i]); break; } for (i = fi + 1; i < parts.length; i++) if (ok(parts[i])) return tidy(parts[i]); }
    var at = parts.findIndex(function (p) { return p.indexOf('@') >= 0; }); if (at >= 0 && ok(parts[at + 1])) return tidy(parts[at + 1]);
    for (i = 0; i < parts.length; i++) if (ok(parts[i])) return tidy(parts[i]);
    var vpa = n.match(/([a-z0-9.\-_]+)@[a-z]+/i); return (vpa ? vpa[1] : n.slice(0, 30)).toUpperCase();
  };
  // A name boiled down for comparing: capitals only, no "M/S", "PVT LTD", dots or spaces.
  F.normName = function (s) { return String(s || '').toUpperCase().replace(/^M\/S\.?\s*/, '').replace(/&/g, ' AND ').replace(/\b(PVT|PRIVATE|LTD|LIMITED|LLP|CO|COMPANY|CORPORATION|CORP|AND|THE|MESSRS)\b\.?/g, ' ').replace(/[^A-Z0-9]/g, ''); };
  // Find the one known party this narration clearly points to (banks cut long names short, so a long-enough start of the name counts).
  F.matchParty = function (nar, names) {
    var hay = String(nar || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), best = null, bestScore = 0, second = 0, seen = {};
    (names || []).forEach(function (name) {
      var nn = F.normName(name); if (nn.length < 5 || seen[nn]) return; seen[nn] = 1;
      var score = 0;
      if (hay.indexOf(nn) >= 0) score = 100 + nn.length;
      else if (nn.length >= 10 && hay.indexOf(nn.slice(0, 10)) >= 0) { score = 10; for (var L = nn.length - 1; L > 10; L--) if (hay.indexOf(nn.slice(0, L)) >= 0) { score = L; break; } }
      if (!score) return;
      if (score > bestScore) { second = bestScore; best = name; bestScore = score; } else if (score > second) second = score;
    });
    if (!best) return null;
    // a full name must beat every other; a cut-short name must beat the next candidate clearly, or the software does not guess
    return (bestScore >= 100 ? bestScore > second : bestScore - second >= 3) ? best : null;
  };

  F.EXP_CATS = ['Raw Material', 'China Import', 'Salary', 'Rent', 'Utilities', 'Transport', 'Marketing', 'Equipment', 'Bank Charges', 'Taxes & Statutory', 'Loan / EMI', 'Drawings / Personal', 'Misc'];
  var CAT_STRONG = [
    ['Bank Charges', /\bchrg|charges|\bchgs?\b|sms alert|min bal|\bamc\b|card fee|service tax|gst on|cash handling|ach.*return|inspection/],
    ['Taxes & Statutory', /\bgst\b|gstn|cbdt|cbic|\btds\b|income tax|advance tax|epfo|\besic?\b|prof.{0,6}tax|icegate|customs|challan/],
    ['Loan / EMI', /\bemi\b|loan|\bod int|interest debit|int\.? ?coll/],
    ['Salary', /salary|wages|payroll|\bsal\b/], ['Rent', /\brent\b|lease/],
    ['Utilities', /electric|torrent|ugvcl|mgvcl|dgvcl|pgvcl|airtel|jio|vodafone|bsnl|broadband|recharge|\bdth\b|gujarat gas|adani gas/],
    ['Transport', /transport|logistic|courier|freight|cargo|roadways|\bvrl\b|delhivery|bluedart|blue dart|dtdc|gati|safexpress|porter|petrol|diesel|hpcl|iocl|bpcl|fastag|\buber\b|\bola\b|rapido/],
    ['China Import', /alibaba|forex|swift|outward remit|clearing agent/],
    ['Marketing', /google ads|facebook|indiamart|tradeindia|justdial|advert/]
  ];
  F.guessCat = function (n) { var s = String(n).toLowerCase(); for (var i = 0; i < CAT_STRONG.length; i++) if (CAT_STRONG[i][1].test(s)) return CAT_STRONG[i][0]; return ''; };
  F.ruleKey = function (isOut, nar) { var k = F.normName(F.guessParty(nar)); return k.length >= 3 ? (isOut ? 'o:' : 'i:') + k : ''; };

  // Decide what one bank entry is. kind: receipt (from a customer) · payment (to a supplier) · expense · income (other) · transfer (own money moved, cash drawn).
  // sure = the software may post it by itself; not sure = it waits on the Unposted sheet.
  F.classify = function (t, ctx) {
    var isOut = !!t.dr, nar = t.nar, guess = F.guessParty(nar), rk = F.ruleKey(isOut, nar), rule = rk && ctx.rules && ctx.rules[rk];
    var res = { kind: isOut ? 'expense' : 'receipt', party: guess, cat: '', sure: false, why: '' };
    if (rule) { res.kind = rule.kind; res.party = rule.party || guess; res.cat = rule.cat || ''; res.sure = true; res.why = 'You posted this party before'; }
    else if (!isOut) {
      var c = F.matchParty(nar, ctx.clients);
      if (c) { res.kind = 'receipt'; res.party = c; res.sure = true; res.why = 'Customer name found'; }
      else if (/\bint\.? ?pd\b|interest (paid|credit)|int\.? ?cr|sweep int|\bfd int/i.test(nar)) { res.kind = 'income'; res.party = t.bank || 'Bank'; res.cat = 'Bank Interest'; res.sure = true; res.why = 'Bank interest'; }
      else if (F.matchParty(nar, ctx.vendors)) { res.kind = 'payment'; res.party = F.matchParty(nar, ctx.vendors); res.why = 'Money back from a supplier? Please check'; }
      else res.why = 'Party not recognised';
    } else {
      var v = F.matchParty(nar, ctx.vendors), cat = F.guessCat(nar);
      if (v) { res.kind = 'payment'; res.party = v; res.sure = true; res.why = 'Supplier name found'; }
      else if (/^(ATW|NWD|EAW|ATM|CASH ?WDL)|cash withdraw|self\b/i.test(nar.trim())) { res.kind = 'transfer'; res.party = 'Cash withdrawal'; res.cat = 'Cash'; res.sure = /^(ATW|NWD|EAW|ATM|CASH ?WDL)|cash withdraw/i.test(nar.trim()); res.why = 'Cash drawn'; }
      else if (cat) { res.kind = 'expense'; res.cat = cat; res.sure = true; res.why = cat; }
      else if (F.matchParty(nar, ctx.clients)) { res.kind = 'receipt'; res.party = F.matchParty(nar, ctx.clients); res.why = 'Refund to a customer? Please check'; }
      else { res.cat = 'Misc'; res.why = 'Party not recognised'; }
    }
    if (t.sure === false) { res.sure = false; res.why = 'Could not prove money in / out from the balance — please check'; }
    return res;
  };

  // ───────── who owes what ─────────
  function daysBetween(a, b) { return Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); }
  F.daysBetween = daysBetween;
  // docs = bills [{party,date,amount,no,days}], pays = money [{party,date,amount}] → oldest bill is settled first.
  F.settle = function (docs, pays, today, defDays) {
    var by = {}, get = function (name) { var k = F.normName(name) || String(name || '').toUpperCase(); return by[k] || (by[k] = { party: name, docs: [], paid: 0, lastPay: '', pays: [] }); };
    docs.forEach(function (d) { get(d.party).docs.push(d); });
    pays.forEach(function (p) { var g = get(p.party); g.paid = r2(g.paid + p.amount); g.pays.push(p); if (p.date > g.lastPay) g.lastPay = p.date; });
    var list = Object.keys(by).map(function (k) {
      var g = by[k], pool = g.paid, row = { party: g.party, billed: 0, paid: g.paid, due: 0, overdue: 0, b: [0, 0, 0, 0], oldest: '', lastPay: g.lastPay, docs: [], pays: g.pays, advance: 0, maxLate: 0 };
      g.docs.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); }).forEach(function (d) {
        var used = Math.min(pool, d.amount); pool = r2(pool - used);
        var left = r2(d.amount - used), age = Math.max(0, daysBetween(d.date || today, today)), dueOn = addDays(d.date || today, d.days != null ? d.days : defDays), late = daysBetween(dueOn, today);
        row.billed = r2(row.billed + d.amount);
        row.docs.push({ id: d.id, no: d.no, date: d.date, amount: d.amount, left: left, age: age, dueOn: dueOn, late: left > 0.5 ? late : 0, opening: !!d.opening });
        if (left > 0.5) { row.due = r2(row.due + left); row.b[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3] += left; if (late > 0) { row.overdue = r2(row.overdue + left); if (late > row.maxLate) row.maxLate = late; } if (!row.oldest || d.date < row.oldest) row.oldest = d.date; }
      });
      row.advance = pool > 0.5 ? pool : 0;
      return row;
    });
    return list.sort(function (a, b) { return b.due - a.due; });
  };

  // The whole picture. d = {fin, txns, opening, accounts, items, clients, today}
  F.position = function (d) {
    var today = d.today, fin = d.fin || [], txns = (d.txns || []).filter(function (t) { return t.status === 'posted'; }), cl = d.clients || {};
    var seenInv = {}, recvDocs = [], payDocs = [];
    fin.forEach(function (e) {
      var amt = +(e.total || e.amount) || 0; if (!amt) return;
      if (e.type === 'income' && (e.kind === 'sale' || e.source === 'bill' || (e.status && e.status !== 'Paid'))) {
        if (e.status === 'Paid' && e.paidBy !== 'sfin') return;            // marked paid by hand (cash etc.)
        var k = F.normName(e.party) + '|' + String(e.invoiceNo || e.ref || e.id); if (seenInv[k]) return; seenInv[k] = 1;
        var c = cl[e.party] || cl[String(e.party || '').toUpperCase()] || {};
        recvDocs.push({ id: e.id, party: e.party, date: e.date, amount: amt, no: e.invoiceNo || e.ref || '', days: +c.creditDays > 0 ? +c.creditDays : null });
      } else if (e.kind === 'purchase' && e.paidBy !== 'manual') payDocs.push({ id: e.id, party: e.party, date: e.date, amount: amt, no: e.invoiceNo || e.ref || '' });
    });
    (d.opening || []).forEach(function (o) { if (o.off) return; (o.side === 'pay' ? payDocs : recvDocs).push({ id: o.id, party: o.party, date: o.date, amount: +o.amount || 0, no: o.ref || 'Opening balance', opening: true }); });
    var sum = function (a, f) { return r2(a.reduce(function (s, x) { return s + (f(x) || 0); }, 0)); };
    var P = { today: today };
    P.recv = F.settle(recvDocs, txns.filter(function (t) { return t.kind === 'receipt'; }), today, 30);
    P.pay = F.settle(payDocs, txns.filter(function (t) { return t.kind === 'payment'; }), today, 30);
    ['recv', 'pay'].forEach(function (s) { var L = P[s]; P[s + 'Total'] = sum(L, function (r) { return r.due; }); P[s + 'Overdue'] = sum(L, function (r) { return r.overdue; }); P[s + 'Advance'] = sum(L, function (r) { return r.advance; }); P[s + 'B'] = [0, 1, 2, 3].map(function (i) { return sum(L, function (r) { return r.b[i]; }); }); });
    P.accounts = Object.keys(d.accounts || {}).map(function (k) { return d.accounts[k]; });
    P.bank = sum(P.accounts, function (a) { return a.balance; }); P.bankKnown = P.accounts.some(function (a) { return a.balance != null; });
    P.stock = sum(d.items || [], function (i) { return (+i.stock || 0) * (+i.cost || 0); });
    P.stockNoCost = (d.items || []).filter(function (i) { return (+i.stock || 0) > 0 && !(+i.cost > 0); }).length;
    // month by month (last 6)
    var months = [], dt = new Date(today + 'T00:00:00'); dt.setDate(1);
    for (var i = 0; i < 6; i++) { months.unshift(dt.getFullYear() + '-' + p2(dt.getMonth() + 1)); dt.setMonth(dt.getMonth() - 1); }
    var inM = function (m) { return function (x) { return String(x.date || '').slice(0, 7) === m; }; };
    var sales = fin.filter(function (e) { return e.kind === 'sale'; }), purch = fin.filter(function (e) { return e.kind === 'purchase'; });
    var oldExp = fin.filter(function (e) { return e.type === 'expense' && e.kind !== 'purchase'; });
    var gst = function (e) { return (+e.cgst || 0) + (+e.sgst || 0) + (+e.igst || 0); }, tot = function (e) { return +(e.total || e.amount) || 0; }, net = function (e) { return e.taxable != null ? +e.taxable || 0 : tot(e) - gst(e); };
    P.months = months.map(function (m) {
      var f = inM(m), tx = txns.filter(f), k = function (kind) { return sum(tx.filter(function (t) { return t.kind === kind; }), function (t) { return t.amount; }); };
      var o = { m: m, sales: sum(sales.filter(f), tot), salesNet: sum(sales.filter(f), net), purchases: sum(purch.filter(f), tot), purchNet: sum(purch.filter(f), net), collected: k('receipt'), paid: k('payment'),
        expenses: r2(k('expense') + sum(oldExp.filter(f), function (e) { return +e.amount || 0; })), otherIncome: k('income'), gstOut: sum(sales.filter(f), gst), gstIn: sum(purch.filter(f), gst) };
      o.profit = r2(o.salesNet + o.otherIncome - o.purchNet - o.expenses); o.gstNet = r2(o.gstOut - o.gstIn); o.cashIn = r2(o.collected + o.otherIncome); o.cashOut = r2(o.paid + o.expenses);
      return o;
    });
    P.cur = P.months[5];
    var cats = {}; txns.filter(function (t) { return t.kind === 'expense'; }).forEach(function (t) { var m = String(t.date).slice(0, 7), c = t.cat || 'Misc'; (cats[c] = cats[c] || {})[m] = r2(((cats[c] || {})[m] || 0) + t.amount); });
    oldExp.forEach(function (e) { var m = String(e.date).slice(0, 7), c = e.category || 'Misc'; (cats[c] = cats[c] || {})[m] = r2((cats[c][m] || 0) + (+e.amount || 0)); });
    P.cats = cats;
    var full = P.months.slice(2, 5).filter(function (m) { return m.cashOut > 0; });
    P.avgOut = full.length ? r2(sum(full, function (m) { return m.cashOut; }) / full.length) : 0;
    var s90 = sum(sales.filter(function (e) { var a = daysBetween(e.date || today, today); return a >= 0 && a < 90; }), tot);
    P.dso = s90 > 0 ? Math.round(P.recvTotal / (s90 / 90)) : null;
    P.pending = (d.txns || []).filter(function (t) { return t.status === 'pending'; }).length;
    P.net = r2((P.bankKnown ? P.bank : 0) + P.recvTotal + P.stock - P.payTotal);
    return P;
  };

  // Plain suggestions from the picture. level: 'bad' (act now) · 'warn' (watch) · 'good' · 'info'
  F.advise = function (P) {
    var A = [], inr = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); }, add = function (level, title, text) { A.push({ level: level, title: title, text: text }); };
    if (P.pending) add('warn', P.pending + ' bank entr' + (P.pending > 1 ? 'ies are' : 'y is') + ' waiting on the Unposted sheet', 'Until they are posted, the outstanding and expense figures below are not complete.');
    var late = P.recv.filter(function (r) { return r.overdue > 0; }).sort(function (a, b) { return b.overdue - a.overdue; });
    if (late.length) add('bad', 'Collect ' + inr(P.recvOverdue) + ' that is past its due date', 'Call these first: ' + late.slice(0, 5).map(function (r) { return r.party + ' ' + inr(r.overdue) + ' (' + r.maxLate + ' days late)'; }).join(' · ') + (late.length > 5 ? ' · and ' + (late.length - 5) + ' more.' : '.'));
    var old = P.recv.filter(function (r) { return r.b[3] > 0; });
    if (old.length) add('bad', inr(P.recvB[3]) + ' has been unpaid for more than 90 days', old.slice(0, 5).map(function (r) { return r.party + ' ' + inr(r.b[3]); }).join(' · ') + '. Money this old is often lost: stop further credit to these parties until it is cleared, and get a written balance confirmation.');
    if (P.bankKnown && P.payOverdue > 0) {
      if (P.bank < P.payOverdue) add('bad', 'Bank balance ' + inr(P.bank) + ' does not cover the ' + inr(P.payOverdue) + ' of supplier bills already due', 'Short by ' + inr(P.payOverdue - P.bank) + '. Collect from the overdue customers first, and pay suppliers in order of age: ' + P.pay.filter(function (r) { return r.overdue > 0; }).slice(0, 4).map(function (r) { return r.party + ' ' + inr(r.overdue); }).join(' · ') + '.');
      else add('warn', inr(P.payOverdue) + ' of supplier bills are past due', 'The bank balance covers it. Oldest first: ' + P.pay.filter(function (r) { return r.overdue > 0; }).sort(function (a, b) { return b.maxLate - a.maxLate; }).slice(0, 4).map(function (r) { return r.party + ' ' + inr(r.overdue) + ' (' + r.maxLate + ' days late)'; }).join(' · ') + '.');
    }
    if (P.bankKnown && P.avgOut > 0) {
      var mths = P.bank / P.avgOut;
      if (mths < 1) add('bad', 'Cash in bank covers only ' + Math.max(0, Math.round(mths * 30)) + ' days of normal spending', 'Average money going out is ' + inr(P.avgOut) + ' a month and the bank holds ' + inr(P.bank) + '. Speed up collections and hold back non-urgent purchases.');
      else if (mths < 2) add('warn', 'Cash in bank covers about ' + mths.toFixed(1) + ' months of normal spending', 'Average money going out is ' + inr(P.avgOut) + ' a month. Two months of cover is a safer level.');
      else add('good', 'Cash in bank covers about ' + mths.toFixed(1) + ' months of normal spending', 'Average money going out is ' + inr(P.avgOut) + ' a month.');
    }
    if (P.recvTotal > 0 && P.recv[0] && P.recv[0].due / P.recvTotal > 0.35 && P.recv.length > 2) add('warn', Math.round(P.recv[0].due / P.recvTotal * 100) + '% of all money owed to you is with one party', P.recv[0].party + ' owes ' + inr(P.recv[0].due) + ' of ' + inr(P.recvTotal) + '. A delay from this one party would hurt cash badly.');
    if (P.dso != null && P.dso > 45) add('warn', 'Customers are taking about ' + P.dso + ' days to pay', 'That is the receivable compared with the last 90 days of sales. Every 10 days faster frees roughly ' + inr(P.recvTotal / P.dso * 10) + ' of cash.');
    if (P.recvAdvance > 0) add('info', inr(P.recvAdvance) + ' received in advance from customers', 'This money is for goods not yet billed: ' + P.recv.filter(function (r) { return r.advance > 0; }).slice(0, 5).map(function (r) { return r.party + ' ' + inr(r.advance); }).join(' · ') + '.');
    var c = P.cur, prev3 = P.months.slice(2, 5);
    Object.keys(P.cats).forEach(function (cat) {
      var now = P.cats[cat][c.m] || 0, avg = prev3.reduce(function (s, m) { return s + (P.cats[cat][m.m] || 0); }, 0) / 3;
      if (now > 5000 && avg > 0 && now > avg * 1.5) add('warn', cat + ' spending is up ' + Math.round((now / avg - 1) * 100) + '% this month', inr(now) + ' so far against a usual ' + inr(avg) + ' a month.');
    });
    if (c.gstNet > 0) add('info', 'GST to pay for this month so far: about ' + inr(c.gstNet), 'GST on sales ' + inr(c.gstOut) + ' less GST on purchases ' + inr(c.gstIn) + ', from the invoices entered. Keep this aside; confirm the final figure with your accountant.');
    if (P.stock > 0 && c.salesNet >= 0) { var avgSale = prev3.reduce(function (s, m) { return s + m.salesNet; }, 0) / 3; if (avgSale > 0 && P.stock > avgSale * 3) add('warn', 'Stock worth ' + inr(P.stock) + ' is more than 3 months of sales', 'Average sales are ' + inr(avgSale) + ' a month. Money is resting in stock: buy slower-moving items in smaller lots.'); }
    if (P.stockNoCost) add('info', P.stockNoCost + ' stock item' + (P.stockNoCost > 1 ? 's have' : ' has') + ' no cost price', 'They count as ₹0 in the stock value. Add the cost in Inventory for a true figure.');
    if (!P.bankKnown) add('info', 'No bank statement read yet', 'Add a statement under Bank & Unposted to see the bank balance and to match payments.');
    if (!A.some(function (a) { return a.level === 'bad' || a.level === 'warn'; }) && (P.recvTotal || P.payTotal || P.bankKnown)) add('good', 'Nothing needs urgent action', 'No overdue collections or payments were found in the data entered.');
    var rank = { bad: 0, warn: 1, info: 2, good: 3 };
    return A.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = F; else root.SmartFinance = F;
})(typeof window !== 'undefined' ? window : this);
