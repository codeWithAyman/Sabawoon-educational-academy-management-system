# Updates & Backup — Setup & Operations Guide

The **Updates & Backup** page (admin-only, sidebar → *Updates & Backup*) performs real
operations against the live PostgreSQL database, the server filesystem, and GitHub.

## What it does

| Action | What really happens |
| --- | --- |
| **Create Backup** | Runs `pg_dump --format=custom` (`-Fc`) of the whole database into `backend/backups/sabawoon-backup-YYYY-MM-DD-HHMMSS.dump`, then validates the file with `pg_restore --list`. |
| **Download** | Streams the actual `.dump` file from the server to the browser (Content-Disposition attachment). |
| **Upload Backup to GitHub** | Validates the file, checks the destination repo is **private**, then uploads it as a **release asset** on the rolling tag `db-backups` in the backup repository, and verifies the asset exists afterwards. |
| **Verify GitHub copies** | Lists the remote release assets and reconciles them against local history. |
| **Restore Backup** | Safety backup → optional test-database pre-flight → `pg_restore --clean --if-exists --single-transaction` → row-count verification. |
| **Check for Updates** | Reads `/releases/latest` from the configured release repository, compares tags with the installed version. |

## Backup format

`pg_dump` **custom format (`-Fc`)** — a single compressed binary file that contains the
complete schema **and** data: all tables (students, enrollments, classes, teachers,
attendance, marks, fees, payments, finance transactions, inventory, settings, users…),
sequences, constraints and indexes. Custom format is chosen because it supports
selective, reliable restoration with `pg_restore` and is compressed.

Restore manually (if ever needed):

```bash
pg_restore -h localhost -U hm_user -d hm_sms --clean --if-exists <backup-file>.dump
```

`.env` files, database passwords, GitHub tokens and other configuration are **never**
included in the backup — only database objects and rows.

## Where files live

- Backup files: `backend/backups/` (configurable with `BACKUP_DIR` in `backend/.env`)
- History: `backend/backups/history.json` — real record of every create / download /
  upload / restore, including errors. This directory is git-ignored.

Nothing is stored in browser localStorage; the browser only downloads files.

## GitHub configuration (required for upload & update checks)

All configuration lives in `backend/.env` — the token is read **only by the backend**
and is never sent to the browser or committed.

```env
GITHUB_TOKEN=github_pat_...        # fine-grained or classic PAT with "repo" scope
GITHUB_BACKUP_REPO_OWNER=your-user
GITHUB_BACKUP_REPO_NAME=sabawoon-db-backups     # MUST be a PRIVATE repository
GITHUB_RELEASE_REPO_OWNER=your-user
GITHUB_RELEASE_REPO_NAME=your-app-repo          # where official releases are published
```

Setup steps:

1. Create a **private** repository for backups, e.g. `sabawoon-db-backups`.
2. Push at least one commit (e.g. a README) — GitHub cannot create releases on an
   empty repository.
3. Create a GitHub token with `repo` scope and put it in `backend/.env`.
4. Restart the backend.

The upload endpoint **refuses** to upload to a public repository (checked via the API
before every upload).

Backups are stored as **release assets** on the tag `db-backups`, not as Git commits —
files never accumulate in ordinary Git history. Each backup is one asset on one rolling
release.

Current configuration on this machine:

- Backup repository: `codeWithAyman/sabawoon-db-backups` (private, created 2026-10-18)
- Release repository: `codeWithAyman/Sabawoon-educational-academy-management-system`

## Restore safety

A restore only starts after: admin JWT + role check, admin **password re-verification**,
typing the word `RESTORE`, file validation (`pg_restore --list`), and it first creates
an automatic safety backup of the current database. If `PG_ADMIN_URL` (superuser
connection string) is configured, the backup is additionally restored into a temporary
test database and row counts are compared **before** anything touches the live
database. The live restore runs inside a single transaction (`--single-transaction`),
so a failure rolls back completely — the database is never left half-overwritten.
After success, row counts of key tables are verified and the frontend reloads so every
screen shows the restored records.

> Recommended: set `PG_ADMIN_URL` in `backend/.env` to enable the pre-flight test
> database (requires a PostgreSQL role with CREATEDB, e.g. `postgres`).

## Update checking (current web version)

* **Check for Updates** calls the GitHub Releases API for the configured release
  repository and compares the newest release tag with `APP_VERSION` (backend/.env).
* Release notes, publication date and downloadable release files (assets) are shown.
* The browser build **cannot install** an update automatically — the page links to the
  official release files for manual download. It never pretends to install anything.
* Publishing a GitHub Release with a tag like `v1.1.0` makes it visible to all installs.

### Future Electron packaging

When the app is packaged with Electron:

* Use `electron-updater` against the same release repository (GitHub provider).
* Reuse `/api/backup/updates/check` for version metadata; add the Electron download
  step in the desktop shell (`main` process), not in this page.
* The browser download helper in `UpdatesBackup.jsx` (`downloadBackupFile`) is the
  single place to swap in `dialog.showSaveDialog` for native save dialogs.
* Updates must never touch the PostgreSQL database — all data stays on the PC server.

## Offline behaviour

| Operation | Internet needed? |
| --- | --- |
| Create backup, download backup, view history | No — runs entirely on the local PC/server |
| Upload to GitHub, verify remote, check updates | Yes |

Network failures are reported honestly (e.g. "Could not reach GitHub…"), never as
success.

## API (admin-only, `/api/backup/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/config` | Tool/GitHub configuration status (no secrets) |
| POST | `/create` | Create + validate a full backup |
| GET | `/list[?remote=1]` | History merged with filesystem state (+ remote verification) |
| GET | `/download/:filename` | Stream a backup file |
| POST | `/upload-github` | Upload one backup to the private repo |
| POST | `/restore` | Controlled restore (password + typed confirmation) |
| GET | `/updates/check` | Latest GitHub release vs installed version |
