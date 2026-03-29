# 📋 Order Sheet Management System

A complete **single-file web application** for managing production orders — from order entry to despatch, payment tracking, and client notifications. Built for loadcell manufacturing operations.

![Status](https://img.shields.io/badge/Status-Production%20Ready-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Size](https://img.shields.io/badge/Size-68KB-lightgrey)
![No Backend](https://img.shields.io/badge/Backend-None%20Required-orange)

---

## 🚀 Live Demo

Deploy to GitHub Pages and access from any browser — phone, tablet, or laptop.

## ✨ Features

### Order Management
- **22-field order form** with sequential numbering (ORD-2026-0001, 0002...)
- Order numbers never skip or duplicate — cancelled orders preserve the number
- **Edit any order** anytime — loads all fields back into the form
- **Cancel orders** (not delete) — order number preserved with ✕ Cancelled status
- **Print any order** as a professional **A4 PDF** — fits perfectly on one page

### Smart Auto-Fill (saves time on repeat orders)
- **Party → Location** auto-fills from previous orders
- **Party → Email, Phone, Payment Mode, Credit Days** all auto-saved per client
- **Party → Laser/Logo** image saved permanently per client (with delete option)
- **Transporter → Email, Phone, ID, Tracking Link** all auto-saved per transporter
- Edit ✏️ or Delete 🗑 party names — all linked data migrates automatically

### Production Workflow
- **⏳ Pending → ✅ Done → Despatched** status tracking
- **Done button** auto-sends pickup email + WhatsApp to transporter with blank spaces for boxes & weight
- **Edit + add L.R. + DOD → Update** auto-sends despatch PDF + email + WhatsApp to client

### Despatch & Notifications
- **PDF Despatch Note** auto-generated (fields 3,7,8,10,14,18 only — client doesn't see internal details)
- **Email** opens with pre-filled subject, body, and all despatch details
- **WhatsApp** opens with formatted message including tracking link
- **Tracking link** auto-saved per transporter — never re-enter for same transporter

### Payment & Credit Tracking
- **Mode of Payment**: Advance / COD / Credit (auto-saved per client)
- **Credit days** countdown from Date of Despatch
- **⚠ OVERDUE** blinking red alert when credit days exceeded
- **Send Reminder** button — opens email + WhatsApp with overdue details
- **Mark Paid** button to clear the alert
- Dashboard shows **overdue count** in real-time

### Database & Export
- **Master Database** view with all orders in a searchable table
- **Stats dashboard**: total orders, total pcs, pending, done, overdue counts
- **CSV Export** with all 22+ fields
- **Google Sheets integration** via Apps Script (optional)

---

## 📁 Project Structure

```
order-form-project/
├── index.html              ← The entire application (single file, 68KB)
├── google_apps_script.js   ← Google Sheets connector (optional)
├── setup_guide.txt         ← Step-by-step setup instructions
└── README.md               ← This file
```

## 🛠 Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| PDF Generation | jsPDF (CDN) |
| Database | Browser localStorage |
| Notifications | mailto: + WhatsApp Web links |
| Hosting | GitHub Pages (free) |
| Backend (optional) | Google Apps Script → Google Sheets |

**Zero dependencies to install. No build step. No server required.**

---

## 📦 Deployment to GitHub Pages

### Step 1: Create Repository
1. Go to [github.com/new](https://github.com/new)
2. Repository name: `order-form`
3. Set to **Public**
4. Click **Create repository**

### Step 2: Upload Files
1. Click **uploading an existing file**
2. Drag all 4 files from this project folder
3. Click **Commit changes**

### Step 3: Enable GitHub Pages
1. Go to **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** → **/ (root)**
4. Click **Save**
5. Wait 1-2 minutes

### Step 4: Access Your Live Form
Your form is now live at:
```
https://YOUR-USERNAME.github.io/order-form/
```

---

## 🔗 Google Sheets Integration (Optional)

1. Create a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Paste the code from `google_apps_script.js`
4. Click **Deploy → New Deployment → Web App**
5. Set **Who has access: Anyone**
6. Copy the URL
7. Paste it in the setup banner on your form

See `setup_guide.txt` for detailed step-by-step instructions.

---

## 📋 Field Reference (Serial 1-22)

| # | Field | Auto-Saved Per |
|---|-------|---------------|
| 1 | Order No. | Auto-generated |
| 2 | Date | — |
| 3 | Name of Party | Dropdown + Add/Edit/Delete |
| 4 | Location | Per Party |
| 5 | Client Email | Per Party |
| 6 | Client Phone | Per Party |
| 7 | Type of Loadcell | — |
| 8 | Quantity (pcs.) | — |
| 9 | Capacity (tons) | — |
| 10 | Wire (type/mtr.) | — |
| 11 | Mode of Payment | Per Party |
| 12 | Laser / Logo | Per Party (image) |
| 13 | Production Remarks | — |
| 14 | Transporter Name | Dropdown + Add |
| 15 | Transporter ID | Per Transporter |
| 16 | Transporter Email | Per Transporter |
| 17 | Transporter Phone | Per Transporter |
| 18 | L.R. Number | — |
| 19 | Tracking Link | Per Transporter |
| 20 | DOD (Date of Despatch) | — |
| 21 | Order Remarks | — |
| 22 | Dept. Confirmation | Wiring / Packing / Testing |

---

## 🔄 Order Lifecycle

```
New Order → Submit → ⏳ Pending
                        ↓
              Production Complete → ✅ Done
                                     ↓ (sends pickup request to transporter)
                        Edit → Add L.R. + DOD → Update
                                     ↓ (sends despatch PDF + email + WhatsApp to client)
                                  Despatched
                                     ↓
                        Credit Period → ⚠ OVERDUE → Send Reminder
                                                      ↓
                                                  ✓ Mark Paid
```

---

## ⚠ Important Notes

- **Data is stored in browser localStorage** — clearing browser data will erase orders
- **For production use**, connect to Google Sheets for persistent backup
- **Multiple users** can use the same form if hosted online — each browser has its own local DB
- **For shared database**, deploy with Google Sheets integration

---

## 📄 License

MIT License — free for personal and commercial use.

---

Built with ❤️ for loadcell manufacturing operations.
