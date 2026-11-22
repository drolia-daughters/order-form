# Sentire Command Center — Project Context

Read this first. It explains what the project is, how it is built, where the data lives, and what is not finished. Last updated: 16 November 2026.

## What it is

Sentire Command Center is the internal office software of **Sentire Technologies**, a load cell manufacturer in Vadodara, Gujarat. It runs the daily work of the business: orders, production, job work, stock, accounts, marketing leads and reminders.

It is a set of plain web pages. There is no build step and no server of our own. Open `index.html` and everything else loads from the same folder.

- **Users:** the owner (Admin), a Sub Admin, and office and factory staff. The plan is 1 Admin + 4 Users.
- **Hosting:** GitHub Pages, repository `drolia-daughters/order-form`, address `https://drolia-daughters.github.io/order-form/`.
- **Local testing:** double-click `Start_Command_Center.bat` (needs Python). It serves the folder at `http://localhost:8000`.

## How the business works (needed to understand the screens)

1. A client orders load cells with a capacity, wire type, wire length and often their own brand name laser-engraved (private label).
2. An order sheet is made and approved, then goes to production.
3. Production stages: Received → Assembly → Wiring → Testing → Laser → Packing → Ready → Dispatched.
4. Some work goes to outside job-work parties and comes back, or moves from one party to another.
5. After packing, the transporter gets a pickup request on WhatsApp. After the L.R. number is known, the client gets a despatch message.
6. Payment is Advance, COD or Credit. Credit orders are tracked for overdue days, reminders and escalation.

Client names are confidential (NDA). Never put real client names in code, sample data, documents or screenshots.

## The apps

`index.html` is the Main Page. It shows each app inside a frame and has a home dashboard and voice commands.

| App | File | What it does |
| --- | --- | --- |
| Main Page | `index.html` | Home dashboard, navigation, voice commands |
| Order Sheet | `orders.html` | Order entry with several items per order, auto-fill per client, print, despatch, payments and credit tracking |
| Marketing CRM | `marketing_crm.html` | Leads, telecallers, pipeline, call logs, follow-ups, competitors |
| Factory Production | `factory_production.html` | Kanban board through the production stages, approvals, bill and e-way bill JSON, L.R., despatch |
| Job Work | `job_work.html` | Goods sent to outside parties, transferred, received back; saved challans are locked |
| Loadcell Calculator | `loadcell_calculator.html` | Sensitivity trim: series resistor per leg, shunt, fitting sheet, matched sets |
| Inventory | `inventory_management.html` | Stock, transactions, BOM, reorder alerts, China import tracking |
| Accounts & Reports | `accounts_reports.html` | Income, expenses, P&L, receivables, bank statement import |
| Reminders | `reminders.html` | ODS (monthly), Annual and Business reminders; works as a phone app |
| Cohort | `cohort.html` | Business dashboard and "Ask" over all the data (the data pool) |
| Masters | `masters.html` | Clients, transporters, approvers, company details, holidays, payment rules |
| Log in | `login.html` | Login page (added November 2026) |
| Users | `users.html` | Admin only: add, edit and remove logins |

`hub.html` only redirects to `index.html` (old address).

## Shared code

| File | Purpose |
| --- | --- |
| `sentire_common.js` | The shared library, exposed as `window.ST`. Storage helpers, masters data, approvals by name + PIN, holiday calendar, order-sheet print layout, WhatsApp messages, payment reminder rules. Used by Orders, Production, Masters, Cohort and the Main Page. |
| `cohort_engine.js` | `window.CE`. Gathers data from every app and calculates the business metrics, charts and demo data for Cohort. |
| `voice_engine.js` | Voice commands (Chrome Web Speech API, `en-IN`). |
| `reminders_agent.js` | Reads a spoken or pasted sentence and turns it into a reminder (date, repeat, type). |
| `reminders_sw.js`, `reminders.webmanifest`, `reminders-192.png`, `reminders-512.png` | Make Reminders installable on a phone and able to receive "Share" from WhatsApp. |
| `auth.js`, `auth_config.js` | Login gate. Loaded first in the `<head>` of every app page, right after the Supabase library. `auth_config.js` holds the Supabase Project URL and publishable key. |
| `supabase_setup.sql`, `supabase_update_2_rights.sql` | Run once each, in this order, in the Supabase SQL Editor. Create the `profiles` table, the login functions and the per-user app rights. |

Outside libraries are loaded from CDNs: jsPDF (PDF), SheetJS `xlsx` (Excel import/export), `@supabase/supabase-js` v2 (login), Google Fonts (DM Sans, JetBrains Mono).

## Where the data lives — the most important fact

**All business data is saved in the browser's `localStorage`.** Each browser on each device has its own separate copy. Nothing is shared between two computers or between a laptop and a phone. Clearing browser data erases it.

Because every page is on the same site address, all the apps can read each other's data in that one browser. That is how Cohort and the Main Page dashboard work.

Storage keys (each holds JSON):

| Area | Keys |
| --- | --- |
| Orders | `ordersheet_master_db`, `ordersheet_parties`, `ordersheet_party_locs`, `ordersheet_client_contacts`, `ordersheet_transporters`, `ordersheet_transporter_contacts`, `order_form_script_url` |
| Production | `prod_jobs` |
| Masters and approvals | `st_company`, `st_approvers`, `st_holidays`, `st_payment_rules`, `st_approval_log`, `st_bills` |
| Job Work | `jw_parties`, `jw_moves`, `jw_admin_pin`, `jw_audit` |
| Inventory | `inv_items`, `inv_txns`, `inv_imports`, `inv_bom` |
| Accounts | `fin_entries`, `stmt_vendor_rules` |
| CRM | `crm_leads`, `crm_calls`, `crm_telecallers`, `crm_competitors` |
| Calculator | `lc_batches`, `lc_current` |
| Reminders | `rem_local`, `rem_cache`, `rem_queue`, `rem_cfg`, `rem_summary`, `rem_tab` |
| Login | `sentire_user` (who is logged in), plus the session that the Supabase library keeps under `sb-…-auth-token` |

`ST.K` in `sentire_common.js` lists the keys shared between apps. Orders are linked to production jobs by order number.

## Google Apps Script parts

Two small scripts run in the owner's Google account. Each is deployed as a Web app and the page calls its `/exec` address.

| Script file | Used by | What it does | Setup guide |
| --- | --- | --- | --- |
| `google_apps_script.js` | Orders | Optional: copies each order into a Google Sheet | `setup_guide.txt` |
| `reminders_apps_script.gs` | Reminders | Keeps reminders in a Google Sheet and three Google Calendars, scans Gmail for due dates, sends a daily email | `REMINDERS_SETUP.txt` |

Pages call these with `fetch(url, {method:'POST', body: JSON.stringify(...)})` and no custom headers. Do not add a `Content-Type: application/json` header: Apps Script cannot answer the browser's pre-flight request.

## Login and roles

There are two separate systems. Do not confuse them.

1. **Site login (new, on Supabase):** `login.html` + `auth.js` + `supabase_setup.sql`. One Admin and up to ten Users, each with a login ID and password. Supabase Auth holds the accounts; the table `public.profiles` holds login ID, name and role. Each account has an internal e-mail address that nobody sees; the page looks it up from the login ID and then signs in with Supabase. All user management goes through database functions (`setup_admin`, `admin_add_user`, `admin_update_user`, `admin_remove_user`) that check the caller is the Admin. Only the Admin can open `users.html`. **Rights:** `profiles.apps` lists the app pages a user may open (empty = all); the Admin sets it on the Users page (`admin_set_apps`, from `supabase_update_2_rights.sql`). `auth.js` hides those apps on the Main Page (`SentireAuth.filterApps`) and covers a blocked page with a notice (`SentireAuth.can`). Rights are per app only; there is no view-only mode yet. The login is **off** while the two values in `auth_config.js` are empty.
2. **Approver PINs (older):** kept in Masters (`st_approvers`). Roles are Admin, Sub Admin and Authorised. Any one of them approves Laser, Packing and Bill steps by choosing their name and typing their PIN. Job Work has its own admin PIN (`jw_admin_pin`) to unlock saved challans.

While the business data is still in `localStorage`, the site login is only a gate in the browser: the page files are public on GitHub, so it keeps ordinary visitors out but is not strong security. Once data moves into Supabase, the database access rules (Row Level Security, using `public.is_member()` and `public.is_admin()`) give real protection. Passwords and data are never in the repository.

The Supabase **secret key** (`sb_secret_…`) must never appear in this project. The pages use only the publishable key.

## Business rules built into the software

- Order numbers run in sequence (`ORD-2026-0001`) and are never reused; orders are cancelled, not deleted.
- The printed order sheet shows production fields only. Client contact, payment, transporter ID and email, L.R. and tracking are hidden on the print.
- Laser, Packing and Bill each need an approval before the next step.
- The transporter pickup WhatsApp goes after packing approval, with boxes and weight, before the 2 PM cut-off.
- The client WhatsApp goes after the L.R. number is entered.
- Overdue credit payments get reminders, then escalate to Admin and Sub Admin.
- Job-work challans cannot be changed after goods are sent, transferred or received, except by the Admin.
- WhatsApp and email only open ready to send. A person must press Send; the browser cannot send them alone.
- Gujarat holidays for 2026 are pre-loaded; delivery dates skip holidays.

## Known limits and open work

- **No shared data.** This is the biggest gap. Two people cannot work on the same orders from two devices.
- **No restore.** Cohort can download the data pool as a backup, but nothing can load a backup back in.
- **Login not live yet.** The Supabase login is written and its database rules are tested on a copy, but `supabase_setup.sql` must be run in the real project and the pages tested in a live browser.
- **GitHub copy is old.** The repository holds an earlier version with fewer apps; the current folder has not been uploaded yet.
- **Planned:** a daily import from the Sales Nayak CRM backup, Tally data into the data pool, and bank statement posting into Accounts.

## Next step: move the data into Supabase

Decided on 16 November 2026: the database is **Supabase** (hosted Postgres), project `https://phuducopbugeyvkzhvki.supabase.co`, region Mumbai. The pages stay on GitHub Pages and talk to Supabase directly with the publishable key.

Done so far: login only. Still to do: move each app's data from `localStorage` into Supabase tables, with access rules, one app at a time — Masters and Orders first, then Production, Job Work, Inventory, Accounts, CRM. Order numbers must then be given out by the database, so two people cannot get the same number. A one-time upload of each device's existing data is needed.

## Rules for anyone changing the code

- Keep it simple: plain HTML, CSS and JavaScript, one file per app, no framework and no build step. The owner is a beginner programmer and must be able to follow it.
- Keep all files in one folder. Pages find each other and the shared scripts by file name.
- Keep the three `<script>` tags (Supabase library, `auth_config.js`, `auth.js`) first in the `<head>` of every app page, in that order.
- Do not rename a storage key without moving the old data; it would hide existing records.
- Never commit real client names, phone numbers, passwords, PINs, secret keys or exported data. The repository is public.
- Indian formats: dates and numbers use `en-IN`, money is in rupees, GST fields are used on bills.
- Write on-screen text in plain, short English. Staff are not technical.

## Shared live data (sync)
Business data is no longer per-browser. `sync.js` (loaded after `auth.js` on every app page except login/users/hub/reminders) mirrors the shared browser-storage keys (`ordersheet_*`, `prod_*`, `fin_*`, `st_*`, `inv_*`, `crm_*`, `jw_*` except `jw_admin_until`, `lc_batches`, `stmt_*`) to the Supabase table `public.kv_store` (one row per key: `key`, `value jsonb`, `version`). Apps still read/write `localStorage` as before; `sync.js` patches `Storage.setItem`, pushes through the RPC `kv_put(key, value, base_version)` (optimistic versioning, 3-way merge by `id`/`orderNo`/`jobNo`/`code` on conflict), pulls changes by Realtime + a 15 s poll, and refreshes the page (`window.sentireRefresh` on Orders, otherwise a reload when the user is not typing). The first time a browser connects, its existing data is uploaded and merged. Delete rights: `kv_put` rejects (for non-Admins) any write that makes an array/object shorter ("Only the Admin can delete"); `sync.js` also hides/blocks the delete buttons for non-Admins. SQL: `supabase_update_3_sync.sql`. Orders → "+ New item (not in list)" adds an item type (`ordersheet_lc_types`) and optionally an Inventory record.

## Approve / delete rights
`profiles.can_approve` and `profiles.can_delete` (booleans; Admin is always true). Sub Admin = both, Approver = approve only. Set on the Users page (`admin_set_perms`, `supabase_update_4_permissions.sql`). `SentireAuth.canApprove()/canDelete()` drive the UI; `sync.js` hides/blocks the approve buttons (`approveOrder`, `approveLaser`, `approvePacking`, `approveBill`) and delete buttons for people without the right; `ST.approve` (PIN approvals) also needs `canApprove()`. The database enforces delete (`kv_put` rejects shrinking a list unless `can_delete()`); approval is enforced in the browser only. Orders record `approvedBy`.

## Security page: who is logged in, from where, remote log out (19 Nov 2026)
`supabase_update_7_sessions.sql` + Edge Function `secure-login` (copy in `supabase_functions/`). Every successful login, Admin (`admin_login_ok`) and user (`login_ok`), is written to `security_log` with IP, city, region and country (looked up by the function from ipwho.is, with ipapi.co as backup) plus the browser/computer. Each login also gets a row in `public.login_sessions` (linked to `auth.sessions` by `auth_session_id`). **Who may use it:** the Admin and the Sub Admin (a user with both the delete and the approve right), via `public.is_security_admin()` / `SentireAuth.isSecurityAdmin()`. The 🛡 Security button sits in the Main Page sidebar right under Masters, and in the top bar. `security.html` shows **Logged in now** (`admin_logged_in()`, from `auth.sessions`; logins from before tracking take their IP from the matching security-log entry) with **Log out** (`admin_end_session`, that device) and **All devices** (`admin_end_all_sessions`), then the security log. Logging out deletes the `auth.sessions` row; `session_alive()` (used by `is_member`, `is_admin`, `is_security_admin`, `my_profile`) checks the token's `session_id` still exists, so access to data stops at once. Every open page calls `session_ping()` once a minute and goes to the login page ("You were logged out by the Admin") when it answers `ended`. The page's own Log out now ends only that device (`signOut({scope:'local'})`). The Admin red alert bar also counts logins from outside India. The Admin password check ("Approve anyway") no longer leaves a login session open. Old log entries get their place filled in when the Security page is opened (`mode: 'locate'`).

## Two-device limit, saved / blocked addresses, Inter mode (19 Nov 2026)
`supabase_update_8_ip_rules.sql` + `secure-login`. **Two devices:** at login the function counts the person's other live `auth.sessions` (`svc_device_count`, service role only; sessions idle 7+ days are ended first) and refuses a login past `security_settings.max_devices` (2) with "You are already logged in on 2 devices. Kindly log out from one device…" (HTTP 409, logged as `DEVICE_LIMIT`). **Addresses:** `public.ip_rules` (ip, label, status `allowed`/`blocked`), managed on the Security page through `admin_ip_list`, `admin_ip_set`, `admin_ip_remove`. A blocked address always gets **Error 2** ("You are not allowed to log in from this place. Contact your Admin.", HTTP 403, `code: 2`, logged `IP_BLOCKED`). **Inter mode** (`security_settings.inter_mode`, `admin_set_inter_mode`; cannot go on with no saved address; the page offers to save this computer's address first): when on, a **user** (not an Admin — the Admins are exempt) logging in from an address that is not saved gets Error 2 (logged `IP_NOT_ALLOWED`; the Admin's red bar shows it; the log row has a "Save IP" button). Rules apply at login only; people already logged in stay logged in. Mode `whoami` of the function returns the caller's IP and place. **Emergency** if locked out: Supabase SQL Editor → `update public.security_settings set inter_mode = false;`

## Installable app / desktop icon (19 Nov 2026)
The suite is a PWA so staff can install it as a desktop app with the Sentire "ST" icon. Files at repo root: `sentire.webmanifest` (name "Sentire Command Center", short_name "Sentire", start_url `login.html`, standalone, theme #2563eb), icons `sentire-192.png` / `sentire-512.png` / `sentire-maskable-512.png` / `sentire-32.png` (blue rounded square, white "ST"), and `sentire_sw.js` (minimal service worker — install/activate + empty fetch handler, **no caching**, so pages never go stale). `login.html` and `index.html` link the manifest + icons and register the SW in `<head>`. Install from Chrome/Edge: address-bar install icon, or ⋮ → Save and share → Install page as app. `Sentire.ico` is also in the repo for making a classic Windows `.url` desktop shortcut (IconFile → that .ico) if PWA install isn't wanted. Desktop folder is OneDrive-redirected, so the bridge could not write there directly.

## Accounts: Sales, Purchase & Invoice Inbox / Data Migration (19 Nov 2026)
`accounts_reports.html` now has **🟢 Sales**, **🔴 Purchase** and **📥 Invoices** tabs on top of the existing `fin_entries` engine. Invoice entries carry `kind:'sale'|'purchase'`, invoiceNo, gstin, taxable, cgst, sgst, igst, gstType, gstPct, total (plus type income/expense + amount so dashboard/reports keep working); sales also carry orderNo + ewayBill. **Invoice Inbox:** drop many PDFs → **Data Migration** button reads each with pdf.js (loaded on demand from cdnjs 3.11.174) and runs `parseInvoice()` (regex parser tuned against real Tally pdf.js text: invoice no, date, buyer, buyer GSTIN excl. our own from st_company, taxable, IGST/CGST/SGST, total). **Sentire sales invoices** (we are seller) post automatically when confident; **purchases** (varied supplier formats) show an editable amber review row to confirm before posting. Dedup by invoiceNo. Sales auto-link to the order whose billNo matches. NOT YET: the PDF files themselves are not archived cross-device (phase 2 = Supabase Storage); an AI reader for arbitrary purchase layouts is the other optional upgrade.

## Repairs & Warranty app (repairs.html) — 19 Nov 2026
New suite app (key `repairs`, orange 🔧) for warranty returns/rejections. Data key `repairs_jobs` (added `repairs_` to sync.js SHARED regex so it syncs). Tabs: Dashboard (open/overdue/dispatched-this-month/avg turnaround, status breakdown, top fault categories), **+ New Repair** (intake: customer dropdown → pulls their past orders to pick the original sale → auto 1-year warranty check in/out; product, serial, qty, problem reported, fault category, problem found, action taken, parts, technician, charge, status), **Open Repairs** (rows red when in-house > TARGET=7 days, status-advance/edit/view/WhatsApp), **History** (searchable), **💡 Knowledge Base** (describe product+fault → shows past repairs of the same fault with how they were fixed — `similar()` keyword+category+product scorer; also live in the New Repair form as "we've seen this N times"). Printable **Repair Job Card** (view/print). WhatsApp status update to customer via ST.openWA. RMA auto-number RMA-YYYY-####. Uses ST.* from sentire_common.js. NOT YET: photo attachments of defects, spare-parts link to inventory, serial-number full-history view, out-of-warranty charge → auto-post to Accounts.

## Vendors master + bulk Sales folder migration in Masters (19 Nov 2026)
Shared **invoice_engine.js** (`window.InvoiceEngine`: loadPdfJs/pdfText, `parse` (enhanced — also pulls buyer address, pincode, stateCode=GSTIN[:2], city), `postSale`/`postPurchase` which upsert the client/vendor master + parties + partyLocs and link the order, dedup by invoiceNo, `pdfFiles`). Included in masters.html. **Masters** now has a **Vendors** tab (key `ordersheet_vendors`, synced; a party can be both client & vendor, kept separate) with render/editVendor mirroring Clients, and a **📥 Migrate Invoices** tab: a 📁 folder picker (webkitdirectory) + file picker for the **Sales** folder → **Migrate Sales Invoices** reads every PDF, auto-posts confident Sentire sales invoices (to fin_entries + Clients master + order link), shows posted/dup/needs-check results. Purchase section present but deferred (per Abhishek: prove sales first; purchases vary per vendor). Added `vendors:'ordersheet_vendors'` to ST.K. **Rights:** User 10 = jai (jaimini accounts) — added repairs.html to apps (already had accounts_reports.html + masters.html); Admins (admin, ka01) see everything (apps=null). NOTE: accounts_reports.html still has its own inline parser/inbox (not yet converged to invoice_engine.js).

## Unattended logout: 4 hours (22 Nov 2026)
`auth.js` only, no database change. Every click / key / touch / scroll / mouse move on any page stamps `localStorage.sentire_last_active` (written at most every 15 s; shared by all tabs and the Main Page iframes). A login unattended for 4 hours (`IDLE_MS`) is logged out on that device (`SentireAuth.idleOut()` → `signOut({scope:'local'})`), checked every 30 s, before any new activity is counted, and when a page is opened (covers a computer that was shut or asleep). The login page then says "You were logged out because this device was not used for 4 hours" (`sentire_kicked = 'idle'`). `login.html` calls `SentireAuth.active()` at a fresh login to start the clock. Applies to everyone, Admins included.

## Smart Finance — Admin and Sub Admin only (22 Nov 2026)
New page `smart_finance.html` + `finance_engine.js` (pure logic, also runs in Node for tests). Opened from the 🦅 Smart Finance button on the Main Page sidebar (shown only when `SentireAuth.isSecurityAdmin()`); the page itself refuses everyone else, so "User 10" (approve right only) cannot open it. **Private data:** its own lists use names starting `sfin_` — `sfin_txns` (bank entries: status posted / pending / ignored; kind receipt / payment / expense / income / transfer), `sfin_rules` (narration party → kind, party, category; learned when the user posts from the Unposted sheet), `sfin_accounts` (bank + last 4 digits + closing balance + as-of date), `sfin_opening` (opening outstanding per party). `sync.js` syncs `sfin_` names only for the Admin / Sub Admin and wipes them from the browser for anyone else; `auth.js` wipes them at log out; `supabase_update_9_smart_finance.sql` makes the database refuse `sfin_` rows to everyone else (read policy + write trigger on `kv_store`). **Statements:** PDF (pdf.js, text positions; a locked PDF asks for its password in the browser), Excel, CSV. For PDFs the money-in / money-out direction of each line is proved from the running balance; a line that cannot be proved goes to the Unposted sheet. Duplicates are skipped by exact key (same format as Accounts `stmtKey`) and by a loose key, including entries posted earlier from the Accounts "Import Statement" tab. **Auto-posting:** a saved rule, a known customer / supplier name found in the narration (`matchParty`), bank charges / tax / EMI / utility keywords, ATM cash. Everything else waits on the Unposted sheet. **Outstanding:** bills = `fin_entries` sales (`kind:'sale'`, bills from Production, unpaid income) and purchases (`kind:'purchase'`) + opening balances; bank receipts / payments settle the oldest bill of that party first (`settle`). A sales bill fully covered is set `status:'Paid', paidBy:'sfin'` in `fin_entries` and its order gets `paymentDone` (reverted if the bank entry is changed). Due date = bill date + client `creditDays` (Masters), 30 when not set; suppliers 30. **Overview:** bank, to receive, to pay, stock value (`inv_items` stock × cost), 6-month table, GST estimate, and rule-based suggestions (`advise`). Not built yet: reading photos / scanned bills (OCR).

