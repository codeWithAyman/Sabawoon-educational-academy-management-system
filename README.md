# ScholarOS — Student Management System

> A complete, modern, production-ready **Student Management System** built with **Node.js + Express + PostgreSQL + React (Vite)**. One clean dashboard for admins, teachers, staff and students to manage everything that happens in a school — students, classes, attendance, marks, fees, notices, assignments, timetables and more.

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.x-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

1. [What is ScholarOS?](#what-is-scholaros)
2. [Why ScholarOS?](#why-scholaros)
3. [Features](#features)
4. [Tech Stack](#tech-stack)
5. [Architecture](#architecture)
6. [Folder Structure](#folder-structure)
7. [Environment Variables](#environment-variables)
8. [Default Logins (Demo Data)](#default-logins-demo-data)
9. [How to Host — Ubuntu VPS (Production)](#how-to-host--ubuntu-vps-production)
10. [How to Run — Local Development](#how-to-run--local-development)
    - [Linux](#linux-ubuntudebianfedoraarch)
    - [macOS](#macos)
    - [Windows](#windows)
11. [API Reference](#api-reference)
12. [Security Notes](#security-notes)
13. [Troubleshooting](#troubleshooting)
14. [Compare with Other Tools](#compare-with-other-tools)
15. [Future Improvements](#future-improvements)
16. [License](#license)

---

## What is ScholarOS?

**ScholarOS** is an end-to-end web application that digitises the daily operations of any school, college or coaching institute. It replaces the patchwork of Excel sheets, paper registers, WhatsApp groups and ad-hoc tools that most institutions still rely on with a single, role-based dashboard accessible from any browser.

It has four user roles out of the box (Admin, Teacher, Staff, Student) and ships with a fully-seeded demo dataset so you can log in and explore every feature within minutes of deploying.

## Why ScholarOS?

Most schools today either:

- Use **expensive SaaS** (Fedena, Classe365, Veracross, PowerSchool) which lock data behind a monthly bill per student, OR
- Use **free fragmented tools** (Google Classroom + Sheets + WhatsApp) which scatter data and have no real RBAC, OR
- Hire developers to build a custom system from scratch — slow and expensive.

**ScholarOS solves this** by being:

- **Free & self-hosted** — your data stays on your own server, forever.
- **One-stop** — students, attendance, marks, fees, notices, assignments and timetable all in one place.
- **Easy to host** — a single VPS (or even a Raspberry Pi) is enough. PM2 keeps it running 24×7.
- **Modern UI** — built with React 19, Tailwind, Recharts and Lucide icons. Looks and feels like a 2026 SaaS app.
- **Secure by default** — JWT auth, bcrypt password hashing, Helmet, CORS allow-list, role-based access control, rate-limiting, parametrised SQL.

If you want a system you can **deploy in 15 minutes and own forever**, ScholarOS is for you.

---

## Features

### Admin Dashboard
- Real-time stat cards: total students, teachers, classes, today's attendance, pending fees, notices, assignments
- 7-day attendance trend chart (Recharts)
- Recent notices & quick actions

### Student Management
- Self-registration + admin-created accounts
- Full CRUD on student profiles (personal, class/section/roll, guardian, contact, address)
- Powerful search & filters (by class, section, status, name, roll number)

### Teacher / Staff Management
- Admin creates teacher/staff accounts with role assignment
- Teacher profile: employee ID, qualification, specialization, salary
- Activate/deactivate users without deletion

### Class & Section Management
- Classes, sections, subjects, academic years
- Assign class teachers and students to classes

### Attendance
- Daily bulk attendance marking with Present / Absent / Late / Leave
- Auto-upsert on the unique `(student_id, date)` key — re-mark without duplicates
- Per-student attendance percentage and history
- 7-day school-wide trend

### Exams & Marks
- Create exams, enter subject-wise marks, set grades and remarks
- Publish results — students see their own marks only after publication

### Fees
- Per-student fee records with total / paid / due tracking
- Partial payments with receipt numbers
- Status: paid / partial / due / overdue
- Students view their own fee history only

### Notice Board
- Title, description, priority (low / normal / high / urgent), date
- Target audience: everyone / specific class / specific role
- Visibility automatically filtered per user

### Assignments
- Teachers upload assignment files (PDF/DOCX/images), set deadlines, assign to class+section
- Students submit work (file upload), teacher reviews
- Admin can monitor all assignments and submissions

### Timetable
- Day/period/subject/teacher/room/time mapping
- Students view their own class timetable

### Search & Filters
- Server-side search across students, teachers, classes, attendance, fees, marks, notices, assignments
- Filter by class, section, date, status, subject, role wherever relevant

### Role-Based Access Control (RBAC)
- **Admin** — full access
- **Teacher** — attendance, marks, assignments, notices, assigned students
- **Staff** — fees, notices, limited student management
- **Student** — own profile, attendance, fees, timetable, assignments, notices, results

### Secure Auth
- bcryptjs password hashing (10 rounds)
- JWT access tokens (7-day expiry, configurable)
- Helmet, CORS allow-list, express-rate-limit, express-validator
- Protected routes both on backend (middleware) and frontend (`<Protected>` wrapper)

### Mobile-Responsive UI
- Tailwind-powered, sidebar collapses to mobile drawer
- Toast notifications, loading & empty states, modals, beautiful forms

---

## Tech Stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Frontend     | React 19, Vite, React-Router v6, Tailwind CSS 3, Recharts, Lucide |
| Backend      | Node.js 22, Express 4, express-validator, multer (file uploads)   |
| Database     | PostgreSQL 18                                                     |
| Auth         | JWT (jsonwebtoken) + bcryptjs                                     |
| Security     | Helmet, CORS, express-rate-limit                                  |
| Process Mgr  | PM2 (with `pm2 startup systemd` for boot persistence)             |
| Optional     | Nginx (reverse proxy + HTTPS via Let's Encrypt)                   |

---

## Architecture

```
                     ┌──────────────────────────┐
   Browser           │  React SPA (Vite build)  │
   (any device)  ◄──►│  Tailwind + Recharts     │
                     └────────────┬─────────────┘
                                  │  /api/*  /uploads/*
                                  ▼
                     ┌──────────────────────────┐
                     │  Express server :5478    │
                     │  Helmet • CORS • JWT     │
                     │  Rate-limit • Validators │
                     └────────────┬─────────────┘
                                  │  pg pool
                                  ▼
                     ┌──────────────────────────┐
                     │      PostgreSQL 18       │
                     │   (database: hm_sms)     │
                     └──────────────────────────┘
```

The Express server serves the built React SPA from `frontend/dist` so the whole stack runs on a **single port (5478)** — no separate frontend container, no nginx required (but supported).

---

## Folder Structure

```
ScholarOS/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.js          # pg connection pool
│   │   │   ├── schema.sql       # all tables + indexes
│   │   │   ├── migrate.js       # creates schema
│   │   │   └── seed.js          # demo data (users, students, classes, fees)
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT verify + requireRoles()
│   │   ├── routes/
│   │   │   ├── auth.js          # /api/auth/*
│   │   │   ├── users.js
│   │   │   ├── students.js
│   │   │   ├── classes.js
│   │   │   ├── attendance.js
│   │   │   ├── marks.js
│   │   │   ├── fees.js
│   │   │   ├── notices.js
│   │   │   ├── assignments.js
│   │   │   ├── timetable.js
│   │   │   └── dashboard.js
│   │   ├── utils/helpers.js
│   │   └── server.js            # express app + SPA fallback
│   ├── uploads/                 # multer storage (assignments, submissions, avatars)
│   ├── .env                     # NOT committed
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/               # Landing, Login, Register, Dashboard, Students, …
│   │   ├── components/          # Layout, Toast, …
│   │   ├── context/AuthContext.jsx
│   │   ├── lib/api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── public/
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Environment Variables

`backend/.env` (already created on the demo VPS — `.env.example` is committed):

```env
PORT=5478
NODE_ENV=production
DATABASE_URL=postgresql://hm_user:STRONG_PASSWORD@localhost:5432/hm_sms
JWT_SECRET=replace-with-64-char-random-string
JWT_EXPIRES_IN=7d
CORS_ORIGIN=*
UPLOAD_MAX_MB=10
```

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Default Logins (Demo Data)

After running `node src/db/seed.js`, the following accounts exist:

| Role    | Email                  | Password       |
| ------- | ---------------------- | -------------- |
| Admin   | `admin@hmsms.local`    | `Admin@12345`  |
| Teacher | `teacher@hmsms.local`  | `Teacher@123`  |
| Staff   | `staff@hmsms.local`    | `Staff@123`    |
| Student | `alice@hmsms.local`    | `Student@123`  |

> **Change the admin password immediately after first login** via Profile → Change password.

---

## How to Host — Ubuntu VPS (Production)

This is the recommended way. Tested on Ubuntu 22.04 / 24.04 / 26.04 LTS.

### 1. Connect to the VPS

```bash
ssh ubuntu@YOUR_VPS_IP
```

### 2. Install Node.js 22, PM2, PostgreSQL

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (process manager)
sudo npm install -g pm2

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

### 3. Create database

```bash
DB_PASS="scholar_$(openssl rand -hex 8)"
sudo -u postgres psql -c "CREATE USER hm_user WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE hm_sms OWNER hm_user;"
sudo -u postgres psql -d hm_sms -c "GRANT ALL ON SCHEMA public TO hm_user;"
echo "DB password: $DB_PASS"   # save this
```

### 4. Clone & configure

```bash
cd ~
git clone https://github.com/Harshit-Mudgal/ScholarOS.git
cd ScholarOS/backend

cp .env.example .env
# edit .env — set DATABASE_URL with the password above and a fresh JWT_SECRET
nano .env

npm install
```

### 5. Migrate + seed the DB

```bash
node src/db/migrate.js
node src/db/seed.js
```

### 6. Build the frontend

```bash
cd ../frontend
npm install
npm run build
```

### 7. Start with PM2

```bash
cd ../backend
pm2 start src/server.js --name scholaros
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER
# Copy & run the sudo command PM2 prints to enable boot-time start
```

### 8. Open the firewall

**On AWS / GCP / Azure / DigitalOcean** — open inbound TCP **5478** in the security group.

**On UFW (if enabled)**:

```bash
sudo ufw allow 22
sudo ufw allow 5478
sudo ufw enable
```

### 9. Visit

```
http://YOUR_VPS_IP:5478
```

### 10. (Optional) Nginx + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/scholaros <<'NGINX'
server {
    listen 80;
    server_name school.example.com;
    client_max_body_size 20M;
    location / { proxy_pass http://127.0.0.1:5478; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
NGINX
sudo ln -s /etc/nginx/sites-available/scholaros /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d school.example.com
```

---

## How to Run — Local Development

### Linux (Ubuntu/Debian/Fedora/Arch)

```bash
# 1. Install Node 22 + PostgreSQL
sudo apt-get install -y nodejs npm postgresql       # Debian/Ubuntu
# sudo dnf install -y nodejs postgresql-server      # Fedora
# sudo pacman -S nodejs npm postgresql              # Arch

# 2. Start PostgreSQL
sudo systemctl enable --now postgresql

# 3. Create DB
sudo -u postgres psql -c "CREATE USER hm_user WITH PASSWORD 'hmpass';"
sudo -u postgres psql -c "CREATE DATABASE hm_sms OWNER hm_user;"

# 4. Clone + run
git clone https://github.com/Harshit-Mudgal/ScholarOS.git
cd ScholarOS/backend
cp .env.example .env       # edit DATABASE_URL & JWT_SECRET
npm install
node src/db/migrate.js && node src/db/seed.js
npm start &                # backend on :5478

cd ../frontend
npm install
npm run dev                # Vite dev server on :5173 (proxies /api to :5478)
```

Open `http://localhost:5173`.

### macOS

```bash
# 1. Install Homebrew (if missing)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Install Node + PostgreSQL
brew install node@22 postgresql@16
brew services start postgresql@16

# 3. Create DB
createuser -s hm_user
createdb -O hm_user hm_sms
psql -d hm_sms -c "ALTER USER hm_user WITH PASSWORD 'hmpass';"

# 4. Clone + run (same as Linux above)
git clone https://github.com/Harshit-Mudgal/ScholarOS.git
cd ScholarOS/backend && cp .env.example .env && npm install
node src/db/migrate.js && node src/db/seed.js
npm start &
cd ../frontend && npm install && npm run dev
```

Open `http://localhost:5173`.

### Windows

**Option A — Native (PowerShell)**

```powershell
# 1. Install Node 22 from https://nodejs.org/en/download
# 2. Install PostgreSQL 16+ from https://www.postgresql.org/download/windows/
#    During install set a postgres password (remember it) and let it run on port 5432.

# 3. Create DB (open SQL Shell / psql)
CREATE USER hm_user WITH PASSWORD 'hmpass';
CREATE DATABASE hm_sms OWNER hm_user;
\q

# 4. Clone + run (PowerShell)
git clone https://github.com/Harshit-Mudgal/ScholarOS.git
cd ScholarOS\backend
copy .env.example .env
notepad .env                      # set DATABASE_URL=postgresql://hm_user:hmpass@localhost:5432/hm_sms
npm install
node src/db/migrate.js
node src/db/seed.js
npm start                         # leave running

# In a second PowerShell tab
cd ScholarOS\frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

**Option B — WSL2 (recommended)**

```powershell
wsl --install -d Ubuntu-22.04
# inside the new Ubuntu shell, follow the Linux instructions above
```

---

## API Reference

All endpoints are prefixed with `/api`. Auth-required endpoints expect `Authorization: Bearer <jwt>`.

| Method | Endpoint                       | Role           | Purpose                          |
| ------ | ------------------------------ | -------------- | -------------------------------- |
| POST   | `/api/auth/register`           | public         | Student self-signup              |
| POST   | `/api/auth/login`              | public         | Login (returns JWT)              |
| GET    | `/api/auth/me`                 | any            | Current user profile             |
| PUT    | `/api/auth/me`                 | any            | Update own name/phone            |
| POST   | `/api/auth/change-password`    | any            | Change password                  |
| GET    | `/api/dashboard/stats`         | any            | Role-aware dashboard data        |
| GET    | `/api/users`                   | admin / staff  | List users (filter by role)      |
| POST   | `/api/users`                   | admin          | Create teacher/staff/admin       |
| GET    | `/api/students`                | admin/teach/staff | List students                 |
| POST   | `/api/students`                | admin          | Create student record            |
| GET    | `/api/classes`                 | any            | List classes/sections/subjects   |
| POST   | `/api/attendance/mark`         | admin/teach/staff | Bulk mark attendance          |
| GET    | `/api/attendance/stats/:sid`   | any            | Student attendance %             |
| GET/POST | `/api/marks`                 | admin/teach    | Exams + marks                    |
| GET/POST | `/api/fees`                  | admin/staff    | Fees CRUD                        |
| GET/POST | `/api/notices`               | any read, admin/staff/teach write | Notice board |
| GET/POST | `/api/assignments`           | admin/teach    | Assignment CRUD + file upload    |
| GET/POST | `/api/timetable`             | admin/teach    | Timetable                        |

Full schemas live in `backend/src/db/schema.sql`.

---

## Security Notes

- **Always change the seeded admin password after first login.**
- Rotate `JWT_SECRET` if you ever leak it — all existing tokens become invalid.
- `CORS_ORIGIN` defaults to `*` for easy first-run. **Tighten it to your domain in production.**
- Uploaded files are restricted by MIME type and size (`UPLOAD_MAX_MB`, default 10 MB).
- All SQL is parameterised (`$1`, `$2`, …) — no string concatenation.
- bcrypt cost = 10, JWT lifetime = 7 days (configurable).
- Rate-limit: 200 requests / 15 min per IP on `/api/auth/*`.
- Always run behind HTTPS in production (nginx + Let's Encrypt section above).
- Backup the DB regularly: `pg_dump hm_sms > backup_$(date +%F).sql`.

---

## Troubleshooting

| Problem                                   | Fix                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EADDRINUSE :::5478`                      | Another process on 5478. `sudo lsof -i :5478` → `kill <PID>` or change `PORT` in `.env`.  |
| `password authentication failed for user` | Re-check `DATABASE_URL` in `.env`; reset with `ALTER USER hm_user WITH PASSWORD '…';`.    |
| `relation "users" does not exist`         | Run `node src/db/migrate.js` first, then `node src/db/seed.js`.                           |
| Frontend shows blank page                 | Did you run `npm run build` in `frontend/` after a code change? Then `pm2 restart scholaros`. |
| Can't reach VPS on port 5478              | Open the port in the cloud provider's security group / firewall; also `sudo ufw allow 5478`. |
| Login returns 400                         | Use a valid email (no underscores in the domain part — express-validator strict mode).    |
| PM2 doesn't restart on reboot             | Run `pm2 startup systemd` and execute the `sudo` command it prints, then `pm2 save`.      |

View live logs:

```bash
pm2 logs scholaros --lines 100
```

---

## Compare with Other Tools

| Feature / Tool        | **ScholarOS (this repo)** | Fedena                   | Classe365              | OpenEduCat              | Google Classroom         |
| --------------------- | -------------------------- | ------------------------ | ---------------------- | ----------------------- | ------------------------ |
| **License / Price**   | **MIT, free forever**      | Paid SaaS / Pro          | Paid SaaS, per-student | Open-source (Odoo dep.) | Free (with Google acct)  |
| **Self-hosted**       | ✅ any VPS / Pi            | ❌ (cloud-only Pro)      | ❌ cloud-only          | ✅ but needs Odoo       | ❌                       |
| **Tech stack**        | Node + Postgres + React    | Ruby on Rails + MySQL    | Closed source          | Python/Odoo + Postgres  | Closed Google stack      |
| **One-port deploy**   | ✅ single port 5478        | ❌ multi-service         | n/a                    | ❌ Odoo stack           | n/a                      |
| **Setup time**        | **~15 min**                | Hours                    | Sign-up only           | Hours (Odoo install)    | Minutes (limited features)|
| **RBAC (4 roles)**    | ✅ admin/teach/staff/stu   | ✅                       | ✅                     | ✅                      | Partial (teacher/student)|
| **Attendance**        | ✅ daily + trend           | ✅                       | ✅                     | ✅                      | ❌                       |
| **Fees module**       | ✅ partials + receipts     | ✅                       | ✅                     | ✅                      | ❌                       |
| **Assignments + file submission** | ✅              | ✅                       | ✅                     | ✅                      | ✅                       |
| **Notice board**      | ✅ role-targeted           | ✅                       | ✅                     | ✅                      | Limited                  |
| **Mobile responsive UI** | ✅ Tailwind             | Partial                  | ✅                     | Partial                 | ✅                       |
| **API access**        | ✅ REST                    | Paid add-on              | Paid plan              | ✅ via Odoo             | ✅                       |
| **Owns your data**    | ✅ 100%                    | ❌ vendor                | ❌ vendor              | ✅                      | ❌ Google                |
| **Customisability**   | **★★★★★** (you have the code) | ★★ (theme only)      | ★ (very limited)       | ★★★★ (Odoo modules)     | ★ (none)                 |

**When should you pick ScholarOS?**

- You want a **system you fully own** that runs on a cheap VPS (₹400–₹800/month).
- You're a small-to-medium school, coaching, or institute that doesn't want recurring SaaS bills.
- You're a developer or agency building a custom solution for a client — fork it, rebrand it, ship it.
- You care about **data sovereignty** (your student data never leaves your server).

**When should you NOT pick it?**

- You need 24×7 vendor support — go with Classe365 / Fedena Pro.
- You have 50,000+ students from day one — start with a vendor that has built-in horizontal scaling.

---

## Future Improvements

- [ ] Email/SMS notifications (SendGrid / Twilio) for attendance + fee dues
- [ ] PDF report cards & fee receipts (`pdfkit`)
- [ ] Parent portal as a 5th role
- [ ] Online fee payments (Razorpay / Stripe)
- [ ] Bulk Excel import/export for students & marks
- [ ] Multi-school / tenant mode
- [ ] Mobile app (React Native, sharing the same `/api`)
- [ ] Audit log viewer in admin UI
- [ ] 2-factor auth for admin accounts
- [ ] Dark mode

---

## License

MIT © Harshit Mudgal — use it, fork it, sell it, just don't blame us if your principal asks for "one more report" at 11 pm.

---

### Live demo (current deployment)

The current owner runs this on an AWS EC2 instance at:

```
http://54.251.29.35:5478
```

Use the demo credentials in the [Default Logins](#default-logins-demo-data) table to sign in.

### Get help

- Open an issue: https://github.com/Harshit-Mudgal/ScholarOS/issues
- Or reach out via the repository's discussions tab.

Happy teaching. 📚
 


 