# Sentire Command Center — versions

| Version | Date | What changed |
|---|---|---|
| 1.5.3 | 24 Nov 2026 | Accounts → Sales: '🧪 Test report' button now sits right beside each invoice number |
| 1.5.2 | 24 Nov 2026 | Accounts → Sales: bills sorted by GST bill number (newest first, by financial year); only the latest 10 shown, older bills behind a 'Show older bills' button |
| 1.5.1 | 24 Nov 2026 | Accounts → Sales: 🧪 Test Reports button at the top, and a 🧪 button on every sales bill that opens Test Reports on that customer / order |
| 1.5.0 | 24 Nov 2026 | Share invoices from WhatsApp: Command Center appears in the phone/PC Share list (installed app); shared PDF invoices open Accounts → Invoice Inbox and Data Migration runs by itself (share_handler.js in both service workers, share_target in sentire.webmanifest) |
| 1.4.0 | 24 Nov 2026 | Load cell serial numbers: new Test Reports app (upload testing-machine Excel; by customer: ordered / tested / despatched / not tested + checks; all load cells search); serial nos. linked to customer → order (type + actual capacity) → sales invoice; 🧪 Test Reports button in Accounts → Invoice Inbox; serial list in order details and in sales bill view; Masters → 🔎 Load cell S/N search (test data, order, invoice, warranty, repairs); Repairs looks up typed S/N and fills customer, order, warranty; Order Sheet: optional extended warranty (1/2/3/5 years) and Wire as a drop-down list (Masters → Wires) |
| 1.3.2 | 24 Nov 2026 | Undo of 1.3.1: column name is back to 'Type of Loadcell' |
| 1.3.1 | 24 Nov 2026 | Order Sheet: column 'Type of Loadcell' renamed to 'Item / Loadcell' (undone in 1.3.2) |
| 1.3.0 | 24 Nov 2026 | Main Page: every number in 'Today at a glance' opens a list of the items behind it; clicking a row opens that order / job / app directly (orders open their details, jobs open their job card, job workers open their register). Order details: items table now fits in the box |
| 1.2.0 | 24 Nov 2026 | Orders: new SP / pc column — special price for items sold WITHOUT warranty (old pieces). SP becomes the selling price (order value, advance check, bill rate); NO WARRANTY tag on orders, order sheet, job bill details and the tax invoice line; Repairs shows NO WARRANTY → chargeable when the item came from an SP order |
| 1.1.0 | 24 Nov 2026 | Migration: 👁 View button shows why a bill was not posted, fix and post from there; bills without an e-Way page now read correctly (taxable from HSN summary, CGST/SGST with %); AKRITI SALES CORPORATION and PUNAM SALES bills are never migrated |
| 1.0.0 | 24 Nov 2026 | Version number shown on every page (sidebar, login card, corner badge, window title) |
