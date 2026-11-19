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
    var amt = function (lbl) { var m = t.match(new RegExp(lbl + '\\s*:?\\s*([\\d,]+\\.\\d{2})', 'i')); return m ? num(m[1]) : 0; };
    var taxable = amt('Tot\\.?Taxable Amt') || amt('Taxable Value') || amt('Total Taxable');
    var igst = amt('IGST Amt') || amt('Out Put IGST') || amt('Output IGST');
    var cgst = amt('CGST Amt') || amt('Out Put CGST') || amt('Output CGST');
    var sgst = amt('SGST Amt') || amt('Out Put SGST') || amt('Output SGST');
    var total = amt('Total Inv Amt') || amt('Grand Total') || amt('Invoice Total');
    var computed = Math.round((taxable + igst + cgst + sgst) * 100) / 100;
    if (!total || Math.abs(total - computed) > 1) total = computed || total;
    var gstType = igst > 0 ? 'IGST' : ((cgst > 0 || sgst > 0) ? 'CGST+SGST' : '');
    var gstPct = taxable ? Math.round((igst + cgst + sgst) / taxable * 100) : 0;
    return {
      kind: kind, invoiceNo: invoiceNo, eway: eway, date: date, party: party, gstin: gstin,
      address: address, pincode: pin, stateCode: stateCode, city: city,
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
    if (rec.phone === undefined) rec.phone = '';
    if (rec.email === undefined) rec.email = '';
    obj[name] = rec; ST.set(storeKey, obj);
    return name;
  }

  E.postSale = function (p, pdfName) {
    var all = fin();
    if (p.invoiceNo && all.some(function (e) { return e.kind === 'sale' && (e.invoiceNo || '') === p.invoiceNo; })) return { status: 'dup' };
    var os = orders(); var orderNo = '';
    var m = os.filter(function (o) { return (o.billNo || '') && o.billNo === p.invoiceNo; })[0] || os.filter(function (o) { return (o.partyName || '').toUpperCase() === cleanName(p.party) && !o.billNo; })[0];
    if (m) orderNo = m.orderNo;
    var name = upsertParty(CLIENTS, p);
    if (name) {
      var parties = ST.get(PARTIES, []); if (parties.indexOf(name) < 0) { parties.push(name); ST.set(PARTIES, parties); }
      if (p.city) { var pl = ST.get(PLOCS, {}); if (!pl[name]) { pl[name] = p.city; ST.set(PLOCS, pl); } }
    }
    all.push({ id: newId(), type: 'income', kind: 'sale', category: 'Sales', date: p.date, party: name || cleanName(p.party), invoiceNo: p.invoiceNo, ref: p.invoiceNo, gstin: p.gstin, address: p.address, pincode: p.pincode, stateCode: p.stateCode, taxable: p.taxable, cgst: p.cgst, sgst: p.sgst, igst: p.igst, gstType: p.gstType, gstPct: p.gstPct, total: p.total, amount: p.total, ewayBill: p.eway, orderNo: orderNo, status: 'Unpaid', mode: '', desc: 'Sales invoice', notes: 'From invoice ' + (p.invoiceNo || ''), pdfName: pdfName || '', source: 'migration' });
    ST.set(FK, all);
    try { E.addStockItems(p.items); } catch (e) {}
    return { status: 'posted', orderNo: orderNo, matched: !!m };
  };

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
})();
