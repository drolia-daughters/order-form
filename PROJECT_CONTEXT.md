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
