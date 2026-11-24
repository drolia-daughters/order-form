// ─────────────────────────────────────────────────────────────
//  Sentire Invoice Engine — shared by Masters (migration) and Accounts.
//  Reads a Tally invoice PDF, pulls out the fields, and posts it:
//   • Sales   → Accounts (fin_entries, kind 'sale')   + updates the CLIENT master + links the order
//   • Purchase→ Accounts (fin_entries, kind 'purchase')+ updates the VENDOR master
//  Client / vendor NAMES are stored in UPPER CASE; the address is kept separate from the name.
//  Needs sentire_common.js (ST) + pdf.js (loaded on demand).
// ─────────────────────────────────────────────────────────────
(function () {
  var E = window.InvoiceEngine = {};
  var FK = 'fin_entries';
  var CLIENTS = 'ordersheet_client_contacts', PARTIES = 'ordersheet_parties', PLOCS = 'ordersheet_party_locs', VENDORS = 'ordersheet_vendors';

  // ---- PDF reading (pdf.js 3.11.174 from cdnjs, loaded once) ----
  var _pdf = null;
  E.loadPdfJs = function () {
    if (_pdf) return _pdf;
    _pdf = new Promise(function (res, rej) {
      if (window.pdfjsLib) { setW(); return res(); }
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function () { setW(); res(); };
      s.onerror = function () { rej(new Error('Could not load the PDF reader (check the internet).')); };
      document.head.appendChild(s);
      function setW() { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {} }
    });
    return _pdf;
  };
  // Returns the PDF text with LINE breaks kept (so the buyer's name stays on its own line).
  E.pdfText = async function (file) {
    await E.loadPdfJs();
    var buf = await file.arrayBuffer();
    var doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    var all = '';
    for (var p = 1; p <= doc.numPages; p++) {
      var pg = await doc.getPage(p); var tc = await pg.getTextContent();
      var lastY = null, line = '', lines = [];
      tc.items.forEach(function (it) {
        var y = (it.transform && it.transform[5]) || 0;
        if (lastY !== null && Math.abs(y - lastY) > 3) { if (line.trim()) lines.push(line.trim()); line = ''; }
        line += it.str + ' ';
        if (it.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; lastY = null; return; }
        lastY = y;
      });
      if (line.trim()) lines.push(line.trim());
      all += lines.join('\n') + '\n';
    }
    return all;
  };

  // ---- parsing ----
  var MON = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  function toISO(d) { if (!d) return ''; var m = d.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/); if (!m) return ''; var y = m[3]; if (y.length === 2) y = '20' + y; return y + '-' + MON[m[2].toLowerCase()] + '-' + String(m[1]).padStart(2, '0'); }
  function num(s) { return s ? parseFloat(String(s).replace(/[^\d.]/g, '')) || 0 : 0; }
  function ourGstin() { try { var c = (window.ST && ST.company && ST.company()) || {}; return (c.gstin || '24AFYPD1767N1ZT').toUpperCase(); } catch (e) { return '24AFYPD1767N1ZT'; } }
  E.ourGstin = ourGstin;
  function cleanName(s) { return String(s || '').replace(/^M\/S\.?\s*/i, '').replace(/\s+/g, ' ').trim().toUpperCase(); }

  // HSN/SAC summary: the 'Total' row ends with the taxable value, e.g. "Total 2,700.00 1,350.00 1,350.00 15,000.00"
  function hsnTaxable(t) { var m = t.match(/HSN\/SAC.{0,200}?Taxable.{0,600}?\bTotal\s+((?:[\d,]+\.\d{2}\s*){2,6})/i); if (!m) return 0; var n = m[1].trim().split(/\s+/); return num(n[n.length - 1]); }
  // Item table total with the rupee sign (pdf text shows it as ₹ or ī), e.g. "Total ī 38,232.00"
  function rupeeTotal(t) { var m = t.match(/\bTotal\s+[^\d\s,.]{1,2}\s*([\d,]+\.\d{2})/); return m ? num(m[1]) : 0; }
  E.hsnTaxable = hsnTaxable; E.rupeeTotal = rupeeTotal;
  E.parse = function (raw) {
    var lines = String(raw || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var t = String(raw || '').replace(/\s+/g, ' ');
    var our = ourGstin();
    var weAreSeller = /sentire\s+technologies/i.test(t.slice(0, 400)) || /for\s+Sentire Technologies/i.test(t);
    var kind = weAreSeller ? 'sale' : 'purchase';
    var invoiceNo = (t.match(/Tax Invoice\s*-\s*([A-Z0-9][A-Z0-9/\-]+)/i) || [])[1] || (t.match(/Invoice No\.?\s*(?:e-?Way Bill No\.?\s*)?([A-Z0-9][A-Z0-9/\-]{2,})/i) || [])[1] || '';
    invoiceNo = invoiceNo.replace(/[^A-Z0-9/\-]/gi, '');
    var eway = (t.match(/e-?Way Bill No\.?\s*:?\s*(\d{10,})/i) || [])[1] || '';
    var dm = t.match(/\b(\d{1,2}-[A-Za-z]{3}-\d{2,4})\b/); var date = dm ? toISO(dm[1]) : '';
    var gstins = Array.from(new Set((t.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/g) || [])));
    var gstin = gstins.filter(function (g) { return g !== our; })[0] || '';
    // Buyer name (own line) + address (following lines) — read from the line-structured text
    var party = '', address = '';
    var bi = lines.findIndex(function (l) { return /Buyer\s*\(Bill to\)/i.test(l); });
    if (bi < 0) bi = lines.findIndex(function (l) { return /Consignee\s*\(Ship to\)/i.test(l); });
    if (bi >= 0) {
      var first = lines[bi].replace(/.*Buyer\s*\(Bill to\)\s*/i, '').replace(/.*Consignee\s*\(Ship to\)\s*/i, '').trim();
      var start = bi;
      if (!first) { start = bi + 1; first = (lines[start] || '').trim(); }
      party = first;
      var addr = [];
      for (var k = start + 1; k < lines.length; k++) {
        if (/GSTIN\/?UIN|State Name|Invoice No|Place of Supply|Consignee|Buyer|Delivery Note|Dispatch/i.test(lines[k])) break;
        addr.push(lines[k]);
      }
      address = addr.join(', ').replace(/\s*,\s*,\s*/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');
    }
    if (!party) { // fallback: flattened text
      var block = (t.match(/Buyer \(Bill to\)\s+(.+?)\s+GSTIN\/UIN/i) || [])[1] || '';
      var nm = block.match(/^(M\/S\.?\s+[A-Za-z0-9 .&'\-]+?)\s+(?:Block|Plot|Shop|Flat|Shed|Survey|Door|No\.|H\.?No|\d)/i) || block.match(/^(M\/S\.?\s+[A-Za-z0-9 .&'\-]{2,40})/i);
      party = (nm ? nm[1] : block).trim();
      address = block.slice((nm ? nm[1] : '').length).replace(/^[,\s]+/, '').trim();
    }
    party = cleanName(party);
    // 1.7.0: customer's phone is written in Tally's "Other References" box (e.g. "mo:9897035019")
    var phone = '';
    var ori = lines.findIndex(function (l) { return /Other\s+References/i.test(l); });
    if (ori >= 0) { for (var q = ori; q < Math.min(lines.length, ori + 4) && !phone; q++) { var pm = lines[q].replace(/Other\s+References/i, '').match(/(?:\+?91[\s-]?)?([6-9]\d{9})\b/); if (pm) phone = pm[1]; } }
    if (!phone) { var pm2 = t.match(/\b(?:mo|mob|mobile)\s*[:.\-]?\s*(?:\+?91[\s-]?)?([6-9]\d{9})\b/i); if (pm2) phone = pm2[1]; }
    var stateCode = gstin ? gstin.slice(0, 2) : '';
    var pin = (t.match(/Ship To[\s\S]{0,260}?\b(\d{6})\b/i) || [])[1] || '';
    if (!pin) { var all6 = t.match(/\b\d{6}\b/g) || []; pin = all6.length ? all6[all6.length - 1] : ''; }
    var city = '';
    var caps = (address.match(/\b[A-Z]{3,}\b/g) || []); if (caps.length) city = caps[caps.length - 1];
    // line items (product + qty) — prefer the clean e-Way 'Goods Details' lines, else the invoice table
    var items = [];
    lines.forEach(function (l) { var m = l.match(/^\d{6,8}\s+([A-Z0-9][A-Z0-9\-\/ ]{1,30}?)\s+\d{1,2}\s+[\d,]+\.\d{2}\s+PCS\s+(\d+)/i); if (m) items.push({ product: m[1].trim().toUpperCase(), qty: +m[2] || 0 }); });
    if (!items.length) lines.forEach(function (l) { var m = l.match(/^\d+\s+([A-Z0-9][A-Z0-9\-\/ ]{1,30}?)\s+[\d,]+\.\d{2}\s+pcs\.?\s+[\d,]+\.\d{2}\s+(\d+)\s+pcs/i); if (m) items.push({ product: m[1].trim().toUpperCase(), qty: +m[2] || 0 }); });
    var byProd = {}; items.forEach(function (it) { if (!it.product) return; byProd[it.product] = (byProd[it.product] || 0) + it.qty; });
    items = Object.keys(byProd).map(function (k) { return { product: k, qty: byProd[k] }; });
    var amt = function (lbl) { var m = t.match(new RegExp(lbl + '(?:\\s*\\d{1,2}(?:\\.\\d+)?\\s*%)?\\s*:?\\s*([\\d,]+\\.\\d{2})', 'i')); return m ? num(m[1]) : 0; };
    var taxable = amt('Tot\\.?Taxable Amt') || amt('Taxable Value') || amt('Total Taxable');
    if (!taxable) taxable = hsnTaxable(t);   // bills without an e-Way page: take it from the HSN/SAC tax summary
    var igst = amt('IGST Amt') || amt('Out Put IGST') || amt('Output IGST');
    var cgst = amt('CGST Amt') || amt('Out Put CGST') || amt('Output CGST');
    var sgst = amt('SGST Amt') || amt('Out Put SGST') || amt('Output SGST');
    var total = amt('Total Inv Amt') || amt('Grand Total') || amt('Invoice Total');
    if (!total) total = rupeeTotal(t);
    var computed = Math.round((taxable + igst + cgst + sgst) * 100) / 100;
    if (!total || Math.abs(total - computed) > 1) total = computed || total;
    var gstType = igst > 0 ? 'IGST' : ((cgst > 0 || sgst > 0) ? 'CGST+SGST' : '');
    var gstPct = taxable ? Math.round((igst + cgst + sgst) / taxable * 100) : 0;
    return {
      kind: kind, invoiceNo: invoiceNo, eway: eway, date: date, party: party, gstin: gstin,
      address: address, pincode: pin, stateCode: stateCode, city: city, phone: phone,
      taxable: taxable, cgst: cgst, sgst: sgst, igst: igst, gstType: gstType, gstPct: gstPct, total: total, items: items,
      confident: !!(invoiceNo && date && taxable && total && party)
    };
  };

  // ---- posting ----
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fin() { return ST.get(FK, []); }
  function orders() { return ST.get('ordersheet_master_db', []); }

  // Key = the UPPER-CASE name. Address stays in its own field, never in the name.
  function upsertParty(storeKey, p) {
    var name = cleanName(p.party); if (!name) return '';
    var obj = ST.get(storeKey, {}); var rec = obj[name] || {};
    if (p.gstin) rec.gstin = p.gstin;
    if (p.address && !rec.address) rec.address = p.address;
    if (p.pincode && !rec.pincode) rec.pincode = p.pincode;
    if (p.stateCode) rec.stateCode = p.stateCode;
    if (p.city && !rec.location) rec.location = p.city;
    if (p.phone && !rec.phone) rec.phone = p.phone;
    if (rec.phone === undefined) rec.phone = '';
    if (rec.email === undefined) rec.email = '';
    obj[name] = rec; ST.set(storeKey, obj);
    return name;
  }

  E.postSale = function (p, pdfName) {
    var all = fin();
    if (p.invoiceNo && all.some(function (e) { return e.kind === 'sale' && (e.invoiceNo || '') === p.invoiceNo; })) return { status: 'dup' };
    var os = orders(); var orderNo = '';
    var m = os.filter(function (o) { return (o.billNo || '') && o.billNo === p.invoiceNo; })[0] || E.readyOrder(p);
    if (m) orderNo = m.orderNo;
    var name = upsertParty(CLIENTS, p);
    if (name) {
      var parties = ST.get(PARTIES, []); if (parties.indexOf(name) < 0) { parties.push(name); ST.set(PARTIES, parties); }
      if (p.city) { var pl = ST.get(PLOCS, {}); if (!pl[name]) { pl[name] = p.city; ST.set(PLOCS, pl); } }
    }
    all.push({ id: newId(), type: 'income', kind: 'sale', category: 'Sales', date: p.date, party: name || cleanName(p.party), invoiceNo: p.invoiceNo, ref: p.invoiceNo, gstin: p.gstin, address: p.address, pincode: p.pincode, stateCode: p.stateCode, taxable: p.taxable, cgst: p.cgst, sgst: p.sgst, igst: p.igst, gstType: p.gstType, gstPct: p.gstPct, total: p.total, amount: p.total, ewayBill: p.eway, orderNo: orderNo, status: 'Unpaid', mode: '', desc: 'Sales invoice', notes: 'From invoice ' + (p.invoiceNo || ''), pdfName: pdfName || '', source: 'migration' });
    ST.set(FK, all);
    try { E.addStockItems(p.items); } catch (e) {}
    var desp = false; if (m) { try { desp = E.despatchFromBill(m.orderNo, p); } catch (e) {} }
    return { status: 'posted', orderNo: orderNo, matched: !!m, despatched: desp };
  };

  // 1.7.0: the order of this party whose production job is READY (oldest first) — the migrated bill is its despatch bill
  function sameP(a, b) { var x = String(a || '').toUpperCase().replace(/^M\/S\.?\s*/, '').replace(/[^A-Z0-9]/g, ''), y = String(b || '').toUpperCase().replace(/^M\/S\.?\s*/, '').replace(/[^A-Z0-9]/g, ''); if (!x || !y) return false; return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0 || (x.length >= 8 && y.length >= 8 && x.slice(0, 8) === y.slice(0, 8)); }
  E.sameParty = sameP;
  E.readyOrder = function (p) {
    var jobs = ST.get('prod_jobs', []);
    var mine = orders().filter(function (o) { return o.status !== 'cancelled' && !o.billNo && sameP(o.partyName, p.party); }).sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    var stageOf = function (o) { var j = jobs.filter(function (x) { return x.orderRef === o.orderNo; })[0]; return j ? j.stage : ''; };
    // 1st choice: job READY to despatch. 2nd (1.7.1): already despatched without a bill, despatched within 10 days of the bill date
    return mine.filter(function (o) { return stageOf(o) === 'Ready'; })[0]
      || mine.filter(function (o) { var d = o.dod || ''; return (stageOf(o) === 'Dispatched' || o.status === 'completed') && d && p.date && Math.abs((new Date(d) - new Date(p.date)) / 864e5) <= 10; })[0] || null;
  };
  // Post the bill + e-way bill on the order and its production job, and move the job from Ready to Dispatched
  E.despatchFromBill = function (orderNo, p) {
    var o = ST.findOrder(orderNo); if (!o) return false;
    ST.updateOrder(orderNo, function (x) { x.billNo = x.billNo || p.invoiceNo; x.billDate = p.date; x.billTotal = p.total; x.billTaxable = p.taxable; x.billIgst = p.igst; x.billCgst = p.cgst; x.billSgst = p.sgst; x.billGstType = p.gstType; x.billGstPct = p.gstPct; if (p.eway) x.ewayBill = p.eway; });
    var jobs = ST.get('prod_jobs', []); var j = jobs.filter(function (x) { return x.orderRef === orderNo; })[0];
    if (j && j.stage !== 'Ready' && j.stage !== 'Dispatched') return false;   // only a READY job is despatched from a bill
    var dod = o.dod || p.date;
    ST.recordDespatch(orderNo, { lr: o.lrNumber || '', dod: dod, transporter: o.transporterName || '' });
    var jobs2 = ST.get('prod_jobs', []); var j2 = jobs2.filter(function (x) { return x.orderRef === orderNo; })[0];
    if (j2) { j2.billNo = p.invoiceNo; if (p.eway) j2.ewayBill = p.eway; var h = j2.history || []; if (h.length && h[h.length - 1].stage === 'Dispatched') h[h.length - 1].note = 'Despatched · bill ' + p.invoiceNo + (p.eway ? ' · e-way bill ' + p.eway : '') + ' (from migrated sales bill)'; ST.set('prod_jobs', jobs2); }
    return true;
  };

  // 1.8.0: keep the ORIGINAL bill PDF (Tally format) in the private 'invoices' store, so View shows the bill exactly as printed.
  function sb() { return window.SentireAuth && SentireAuth.enabled && SentireAuth.client ? SentireAuth.client : null; }
  E.pdfPathFor = function (kind, invoiceNo, party) { var n = String(invoiceNo || 'bill').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''); return (kind === 'purchase' ? 'purchase/' + String(party || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 40) + '__' : 'sales/') + n + '.pdf'; };
  // Upload the PDF and note its place on the matching Accounts entry (also for bills posted earlier: re-migrating attaches the PDF)
  E.savePdf = async function (file, kind, invoiceNo, party) {
    var c = sb(); if (!c || !file || !invoiceNo) return '';
    var path = E.pdfPathFor(kind, invoiceNo, party);
    var r = await c.storage.from('invoices').upload(path, file, { upsert: true, contentType: 'application/pdf' });
    if (r.error) { console.warn('PDF not saved', r.error); return ''; }
    var all = fin(), ch = false; all.forEach(function (e) { if (e.kind === kind && String(e.invoiceNo || '').toUpperCase() === String(invoiceNo).toUpperCase() && (kind === 'sale' || sameP(e.party, party))) { if (e.pdfPath !== path) { e.pdfPath = path; ch = true; } } });
    if (ch) ST.set(FK, all);
    return path;
  };
  E.pdfUrl = async function (path) { var c = sb(); if (!c || !path) return ''; var r = await c.storage.from('invoices').createSignedUrl(path, 3600); return r.error ? '' : r.data.signedUrl; };

  E.postPurchase = function (p, pdfName) {
    var all = fin();
    if (p.invoiceNo && all.some(function (e) { return e.kind === 'purchase' && (e.invoiceNo || '') === p.invoiceNo && cleanName(e.party) === cleanName(p.party); })) return { status: 'dup' };
    var name = upsertParty(VENDORS, p);
    all.push({ id: newId(), type: 'expense', kind: 'purchase', category: 'Purchase', date: p.date, party: name || cleanName(p.party), invoiceNo: p.invoiceNo, ref: p.invoiceNo, gstin: p.gstin, address: p.address, pincode: p.pincode, stateCode: p.stateCode, taxable: p.taxable, cgst: p.cgst, sgst: p.sgst, igst: p.igst, gstType: p.gstType, gstPct: p.gstPct, total: p.total, amount: p.total, status: 'Paid', mode: '', desc: 'Purchase invoice', notes: 'From invoice ' + (p.invoiceNo || ''), pdfName: pdfName || '', source: 'migration' });
    ST.set(FK, all);
    return { status: 'posted' };
  };

  // Add the sold loadcell models to Stock Items if they are missing (does NOT change quantities).
  E.addStockItems = function (items) {
    if (!items || !items.length) return 0;
    var inv = ST.get('inv_items', []); var added = 0, today = new Date().toISOString().split('T')[0];
    items.forEach(function (it) {
      var code = String(it.product || '').toUpperCase().trim(); if (!code) return;
      if (inv.some(function (x) { return String(x.code || '').toUpperCase() === code; })) return;
      inv.push({ code: code, name: code, category: 'Finished Good', unit: 'Pcs', stock: 0, reorder: 5, leadTime: 50, cost: 0, supplier: '', moq: 0, notes: 'Added from a sales invoice', updated: today });
      added++;
    });
    if (added) ST.set('inv_items', inv);
    return added;
  };

  E.pdfFiles = function (fileList) {
    return Array.prototype.filter.call(fileList || [], function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name); });
  };

  // ---- Parties whose bills are NEVER migrated (asked 24 Nov 2026). Add more names here in CAPITALS. ----
  E.SKIP_PARTIES = ['AKRITI SALES CORPORATION', 'PUNAM SALES'];
  function key(n) { return cleanName(n).replace(/[^A-Z0-9]/g, '').replace(/POONAM/g, 'PUNAM'); }
  E.skipParty = function (name) {
    var k = key(name); if (!k) return '';
    for (var i = 0; i < E.SKIP_PARTIES.length; i++) { var s = key(E.SKIP_PARTIES[i]); if (k.indexOf(s) === 0 || s.indexOf(k) === 0 && k.length > 6) return E.SKIP_PARTIES[i]; }
    return '';
  };

  // ---- Why was a bill not posted? A plain-language checklist ----
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN'); }
  E.diagnose = function (o) {
    var p = o.p || {}, t = String(o.text || '').replace(/\s+/g, ' '), out = [];
    if (o.error) { out.push({ bad: 1, label: 'Reading the PDF', value: o.error, help: 'The file could not be opened. Check the internet (the PDF reader loads from the internet), or the PDF may be damaged — export it again from Tally.' }); return out; }
    if (t.trim().length < 60) { out.push({ bad: 1, label: 'Text in the PDF', value: 'almost no text found', help: 'This looks like a scanned photo of the bill. A scanned bill has no text to read. Export the bill from Tally as a PDF instead of scanning it.' }); }
    var sk = E.skipParty(p.party);
    if (sk) out.push({ bad: 1, label: 'Excluded party', value: p.party, help: 'Bills of ' + sk + ' are set to never be migrated. Nothing is wrong with the bill.' });
    if (o.status === 'dup') { var d = o.dup || {}; out.push({ bad: 1, label: 'Already posted', value: 'Invoice ' + (p.invoiceNo || ''), help: 'This invoice number is already in Accounts' + (d.date ? ' (dated ' + d.date + ', ' + (d.party || '') + ', ' + rs(d.total || d.amount) + ')' : '') + '. It was not posted twice. Nothing to fix.' }); }
    out.push(p.kind === 'sale' ? { ok: 1, label: 'Sentire sales bill', value: 'yes — "Sentire Technologies" found as the seller' }
      : { bad: 1, label: 'Sentire sales bill', value: 'no', help: '"Sentire Technologies" was not found at the top of the bill, so it was treated as a PURCHASE bill. If it is our sales bill, choose Sale and post it.' });
    var F = [
      ['invoiceNo', 'Invoice number', p.invoiceNo, 'Looks for "Tax Invoice - 123" or "Invoice No." on the bill.'],
      ['date', 'Invoice date', p.date, 'Looks for a date written like 5-Nov-26 or 05-Nov-2026.'],
      ['party', 'Customer name', p.party, 'Looks for the line "Buyer (Bill to)" and takes the name under it.'],
      ['taxable', 'Taxable amount', p.taxable ? rs(p.taxable) : '', 'Looks for "Tot.Taxable Amt", "Taxable Value" or "Total Taxable" followed by an amount like 12,345.00.'],
      ['total', 'Invoice total', p.total ? rs(p.total) : '', 'Looks for "Total Inv Amt", "Grand Total" or "Invoice Total", or adds taxable + GST.']
    ];
    F.forEach(function (f) { out.push(f[2] ? { ok: 1, label: f[1], value: f[2] } : { bad: 1, label: f[1], value: 'NOT FOUND', help: f[3] + ' Type it in the box below and press Post.' }); });
    var gst = (+p.igst || 0) + (+p.cgst || 0) + (+p.sgst || 0);
    out.push(gst ? { ok: 1, label: 'GST', value: (p.gstType || 'GST') + ' ' + rs(gst) + (p.gstPct ? ' (' + p.gstPct + '%)' : '') }
      : { warn: 1, label: 'GST', value: 'not found', help: 'No CGST/SGST/IGST amount was found. Fine for a bill without GST; otherwise check the bill.' });
    var m = t.match(/(?:Total Inv Amt|Grand Total|Invoice Total)\s*:?\s*([\d,]+\.\d{2})/i);
    if (m && p.taxable) { var printed = num(m[1]), calc = Math.round(((+p.taxable || 0) + gst) * 100) / 100; if (Math.abs(printed - calc) > 1) out.push({ warn: 1, label: 'Total check', value: 'bill says ' + rs(printed) + ', taxable + GST = ' + rs(calc), help: 'The printed total does not match taxable + GST (round-off, freight or a misread amount). Check the figures below.' }); }
    out.push(p.gstin ? { ok: 1, label: 'Customer GSTIN', value: p.gstin } : { warn: 1, label: 'Customer GSTIN', value: 'not found', help: 'Not needed to post, but the client master will have no GSTIN.' });
    return out;
  };

  // opts: {name, file, text, p, error, status, dup, canPost, onPost(p)}
  E.whyModal = function (o) {
    var old = document.getElementById('ieWhy'); if (old) old.remove();
    var p = o.p = o.p || {}, D = E.diagnose(o), bad = D.filter(function (x) { return x.bad; });
    var url = o.file ? URL.createObjectURL(o.file) : '';
    var ic = function (x) { return x.bad ? '<b style="color:#ef4444">✗</b>' : x.warn ? '<b style="color:#f59e0b">!</b>' : '<b style="color:#22c55e">✓</b>'; };
    var inp = function (k, lbl, type) { return '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#9aa4b8">' + lbl + '<input data-ie="' + k + '" type="' + (type || 'text') + '" value="' + esc(p[k] == null ? '' : p[k]) + '" style="padding:7px 8px;border-radius:7px;border:1px solid #2c3647;background:#0f141d;color:#e8ecf4;font-size:13px"></label>'; };
    var gstNow = (+p.igst || 0) + (+p.cgst || 0) + (+p.sgst || 0);
    var w = document.createElement('div'); w.id = 'ieWhy';
    w.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,Segoe UI,Arial,sans-serif';
    w.innerHTML = '<div style="background:#151b26;color:#e8ecf4;border:1px solid #2c3647;border-radius:14px;width:min(1200px,100%);max-height:94vh;display:grid;grid-template-columns:' + (url ? 'minmax(0,1.05fr) minmax(0,1fr)' : '1fr') + ';overflow:hidden">'
      + (url ? '<iframe src="' + url + '" style="width:100%;height:94vh;border:0;background:#fff"></iframe>' : '')
      + '<div style="padding:18px 20px;overflow:auto;max-height:94vh">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div style="font-size:17px;font-weight:700">Why this bill was not posted</div><div style="font-size:12px;color:#9aa4b8;margin-top:2px">📄 ' + esc(o.name || '') + '</div></div><button data-x style="background:none;border:1px solid #2c3647;color:#e8ecf4;border-radius:8px;padding:5px 10px;cursor:pointer">✕ Close</button></div>'
      + '<div style="margin:12px 0;padding:10px 12px;border-radius:10px;background:' + (bad.length ? 'rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35)' : 'rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35)') + ';font-size:13px">'
      + (bad.length ? '<b>' + bad.length + ' problem(s):</b> ' + bad.map(function (x) { return esc(x.label); }).join(', ') : 'No blocking problem found — check the figures and press Post.') + '</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px">' + D.map(function (x) { return '<tr style="border-top:1px solid #222b3a"><td style="padding:7px 6px;width:22px;vertical-align:top">' + ic(x) + '</td><td style="padding:7px 6px;vertical-align:top;white-space:nowrap;color:#9aa4b8">' + esc(x.label) + '</td><td style="padding:7px 6px"><b>' + esc(x.value) + '</b>' + (x.help ? '<div style="font-size:12px;color:#9aa4b8;margin-top:3px">' + esc(x.help) + '</div>' : '') + '</td></tr>'; }).join('') + '</table>'
      + (o.canPost ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #2c3647"><div style="font-weight:700;font-size:13px;margin-bottom:8px">Fix and post</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + inp('invoiceNo', 'Invoice number') + inp('date', 'Date (YYYY-MM-DD)', 'date') + '<div style="grid-column:1/-1">' + inp('party', 'Customer name') + '</div>' + inp('gstin', 'Customer GSTIN') + inp('taxable', 'Taxable amount ₹', 'number')
        + '<label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:#9aa4b8">GST amount ₹<input data-ie="_gst" type="number" value="' + (gstNow || '') + '" style="padding:7px 8px;border-radius:7px;border:1px solid #2c3647;background:#0f141d;color:#e8ecf4;font-size:13px"></label>' + inp('total', 'Invoice total ₹', 'number') + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button data-post style="background:#16a34a;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer">✓ Post this bill</button><span data-msg style="font-size:12px;color:#f59e0b"></span></div></div>' : '')
      + (o.text ? '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:12px;color:#9aa4b8">Show the text the software read from the PDF</summary><pre style="white-space:pre-wrap;font-size:11px;background:#0f141d;border:1px solid #2c3647;border-radius:8px;padding:10px;max-height:260px;overflow:auto">' + esc(o.text) + '</pre></details>' : '')
      + '</div></div>';
    document.body.appendChild(w);
    var close = function () { w.remove(); if (url) URL.revokeObjectURL(url); };
    w.addEventListener('click', function (e) { if (e.target === w || e.target.closest('[data-x]')) close(); });
    var pb = w.querySelector('[data-post]');
    if (pb) pb.onclick = function () {
      var q = {}; for (var k in p) q[k] = p[k];
      w.querySelectorAll('[data-ie]').forEach(function (i) { var k = i.getAttribute('data-ie'), v = i.value.trim(); q[k] = i.type === 'number' ? (+v || 0) : v; });
      q.party = cleanName(q.party); q.gstin = String(q.gstin || '').toUpperCase();
      if (q._gst !== (+p.igst || 0) + (+p.cgst || 0) + (+p.sgst || 0)) { if (q.gstin && q.gstin.slice(0, 2) !== ourGstin().slice(0, 2)) { q.igst = q._gst; q.cgst = q.sgst = 0; q.gstType = q._gst ? 'IGST' : ''; } else { q.cgst = q.sgst = Math.round(q._gst / 2 * 100) / 100; q.igst = 0; q.gstType = q._gst ? 'CGST+SGST' : ''; } }
      q.gstPct = q.taxable ? Math.round(((+q.igst || 0) + (+q.cgst || 0) + (+q.sgst || 0)) / q.taxable * 100) : 0;
      if (!q.total) q.total = Math.round(((+q.taxable || 0) + (+q._gst || 0)) * 100) / 100;
      delete q._gst; q.kind = 'sale';
      var miss = [['invoiceNo', 'invoice number'], ['date', 'date'], ['party', 'customer name'], ['taxable', 'taxable amount'], ['total', 'total']].filter(function (f) { return !q[f[0]]; }).map(function (f) { return f[1]; });
      var msg = w.querySelector('[data-msg]');
      if (miss.length) { msg.textContent = 'Still missing: ' + miss.join(', '); return; }
      var sk = E.skipParty(q.party); if (sk && !confirm(q.party + ' is on the do-not-migrate list. Post it anyway?')) return;
      q.confident = true; var r = o.onPost ? o.onPost(q) : null;
      if (r && r.status === 'dup') { msg.textContent = 'Invoice ' + q.invoiceNo + ' is already posted.'; return; }
      close();
    };
  };
})();
