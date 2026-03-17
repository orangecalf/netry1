# Contact Manager

A mobile-first web app to manage contacts with follow-up scheduling, task reminders, and vCard sync.

## Features

- **Contact management** — store phone, work email, personal email, company, notes
- **Categories** — tag contacts with color-coded categories
- **Auto follow-up scheduling** — set a follow-up interval per category; after logging a contact, the next reminder date is automatically calculated
- **Task reminders** — create tasks linked to specific contacts with due dates
- **Email notifications** — daily digest at 8am for overdue follow-ups + 1-hour-ahead task reminders
- **vCard import/export** — import `.vcf` files from iPhone, Android, or Google Contacts; export back to `.vcf`
- **JWT authentication** — secure login/registration

## Quick Start

```bash
cd contacts-app
npm install
cp .env.example .env
# Edit .env with your JWT_SECRET and optional SMTP settings
npm run dev
```

- API server: http://localhost:3001
- Frontend dev server: http://localhost:5173

## Production Build

```bash
npm run build
NODE_ENV=production npm start
```

The server serves the built frontend at http://localhost:3001.

## Email Reminders Setup

Set SMTP credentials in `.env`. For Gmail, create an [App Password](https://myaccount.google.com/apppasswords).

Without SMTP configured, reminders are logged to the console only.

## Syncing Contacts with Your Phone

**Import from phone:**
1. Export contacts from your phone as a `.vcf` file
   - iPhone: Contacts → select all → Share → Export vCard
   - Android: Contacts → ⋮ → Import/Export → Export .vcf
   - Google: contacts.google.com → Export → vCard
2. In Settings → Import .vcf

**Export to phone:**
1. Settings → Export .vcf
2. Import the downloaded file into your phone's contacts app
