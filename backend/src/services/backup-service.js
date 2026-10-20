/*
  BACKUP SERVICE — shared core for every database backup path.

  Used by:
    - the administrator API routes   (backend/src/routes/backup.js)
    - the in-application scheduler   (startBackupScheduler below)
    - the Windows scheduled task     (backend/src/services/run-scheduled-backup.cjs)

  It performs real PostgreSQL backups with pg_dump (custom format),
  validates them, records honest history, keeps a configurable number of
  daily/monthly copies, and uploads an optional copy to the administrator's
  PRIVATE GitHub backup repository. The GitHub token never leaves this
  server-side process.

  All configuration comes from environment variables (see backend/.env.example).
*/

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/* ==========================================================================
   CONFIGURATION
========================================================================== */

/*
  Default location:
    - development:  backend/backups  (next to the backend code)
    - packaged app: %APPDATA%\Sabawoon Educational Academy\backups
      (the Electron main process passes BACKUP_DIR explicitly, and the
      backend's working directory is the user-data folder, so "./backups"
      also lands outside the installation directory — never inside
      app.asar, resources or the install folder).
*/
let BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "./backups");

let HISTORY_FILE = path.join(BACKUP_DIR, "history.json");

let LOCK_FILE = path.join(BACKUP_DIR, "backup-run.lock");

function setBackupDirectory(directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) {
    const error = new Error("Backup folder must be an absolute local path.");
    error.code = "BACKUP_DIR_INVALID";
    throw error;
  }
  BACKUP_DIR = path.resolve(directory);
  HISTORY_FILE = path.join(BACKUP_DIR, "history.json");
  LOCK_FILE = path.join(BACKUP_DIR, "backup-run.lock");
  backupDirReady();
  return BACKUP_DIR;
}

// Backup files are uploaded to GitHub as release assets on this tag, so
// they stay outside ordinary Git history.
const BACKUP_RELEASE_TAG = "db-backups";

// Largest backup we buffer in memory for upload (GitHub release assets
// allow up to 2 GB; the in-process limit stays conservative and is
// configurable).
const MAX_UPLOAD_BYTES =
  Math.max(1, parseInt(process.env.BACKUP_MAX_UPLOAD_MB || "60", 10) || 60) *
  1024 *
  1024;

// Retention: keep the newest N daily backups and the newest M monthly ones.
const RETENTION_DAILY = (() => {
  const parsed = parseInt(process.env.BACKUP_RETENTION_DAILY || "30", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
})();

const RETENTION_MONTHLY = (() => {
  const parsed = parseInt(process.env.BACKUP_RETENTION_MONTHLY || "12", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 12;
})();

// Daily automatic backup time, local PC time, "HH:MM" (24h). Default 04:00.
function scheduledDailyAt() {
  const raw = (process.env.BACKUP_DAILY_AT || "04:00").trim();

  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    console.warn(
      `[backup] BACKUP_DAILY_AT="${raw}" is not a valid HH:MM time — using 04:00.`,
    );

    return { hours: 4, minutes: 0, text: "04:00" };
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    text: `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`,
  };
}

function automaticBackupsEnabled() {
  return (process.env.BACKUP_AUTOMATIC || "1").trim() !== "0";
}

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/;

function backupDirReady() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/*
  Older packaged builds stored backups inside the installation's resources
  folder. On first start with the new location, any previous history and
  backup files are MOVED (never deleted) into the persistent directory so
  no existing backup is lost.
*/
function migrateLegacyBackupDir() {
  const legacyRoot = process.env.SABAWOON_BACKEND_DIR;

  if (!legacyRoot) return;

  const legacyDir = path.join(legacyRoot, "backups");
  const legacyHistory = path.join(legacyDir, "history.json");

  if (legacyDir === BACKUP_DIR) return;
  if (!fs.existsSync(legacyHistory)) return;

  try {
    backupDirReady();

    // Only migrate when the new location has no history of its own.
    if (fs.existsSync(HISTORY_FILE)) return;

    for (const name of fs.readdirSync(legacyDir)) {
      const from = path.join(legacyDir, name);
      const to = path.join(BACKUP_DIR, name);

      if (fs.existsSync(to)) continue;

      try {
        fs.renameSync(from, to);
      } catch {
        // Different volume — copy instead of moving.
        fs.copyFileSync(from, to);
        try {
          fs.unlinkSync(from);
        } catch {
          // Leaving the legacy copy in place is harmless.
        }
      }
    }

    console.log(
      `[backup] Migrated previous backups from ${legacyDir} to ${BACKUP_DIR}.`,
    );
  } catch (error) {
    console.error(`[backup] Could not migrate legacy backups: ${error.message}`);
  }
}

/* ==========================================================================
   POSTGRESQL TOOL DISCOVERY (pg_dump / pg_restore)
========================================================================== */

function candidatePgBinDirs() {
  const dirs = [];

  if (process.env.PG_BIN_DIR) {
    dirs.push(path.resolve(process.env.PG_BIN_DIR));
  }

  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";

    for (const major of [18, 17, 16, 15, 14, 13]) {
      dirs.push(path.join(base, String(major), "bin"));
    }

    dirs.push("C:\\Program Files (x86)\\PostgreSQL\\17\\bin");
  } else {
    dirs.push(
      "/usr/bin",
      "/usr/local/bin",
      "/usr/lib/postgresql/17/bin",
      "/usr/lib/postgresql/16/bin",
      "/usr/lib/postgresql/15/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/opt/postgresql@17/bin",
      "/opt/homebrew/opt/postgresql@16/bin",
    );
  }

  return dirs;
}

const pgToolCache = {};

function resolvePgTool(name) {
  if (pgToolCache[name]) {
    return pgToolCache[name];
  }

  const executable = process.platform === "win32" ? `${name}.exe` : name;

  for (const dir of candidatePgBinDirs()) {
    const candidate = path.join(dir, executable);

    try {
      if (fs.existsSync(candidate)) {
        pgToolCache[name] = candidate;
        return candidate;
      }
    } catch {
      // Unreadable directory — keep looking.
    }
  }

  // Fall back to PATH lookup.
  pgToolCache[name] = executable;
  return executable;
}

function pgConnectionInfo() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    throw new Error("DATABASE_URL is not configured on the server.");
  }

  const url = new URL(raw);

  return {
    host: url.hostname || "localhost",
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    database: (url.pathname || "/").replace(/^\//, "") || undefined,
  };
}

function pgChildEnv() {
  const connection = pgConnectionInfo();

  return {
    ...process.env,
    PGPASSWORD: connection.password,
    PGCONNECT_TIMEOUT: "15",
  };
}

async function runPgTool(name, args) {
  const toolPath = resolvePgTool(name);

  try {
    const { stdout, stderr } = await execFileAsync(toolPath, args, {
      env: pgChildEnv(),
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });

    return { stdout, stderr, toolPath };
  } catch (error) {
    const detailed = new Error(
      `${name} failed: ${error.stderr || error.message || "unknown error"}`,
    );

    detailed.shortMessage = error.stderr || error.message;
    detailed.code = error.code;
    throw detailed;
  }
}

async function checkPgTools() {
  const results = {};

  for (const tool of ["pg_dump", "pg_restore"]) {
    try {
      const { stdout } = await runPgTool(tool, ["--version"]);

      results[tool] = {
        available: true,
        path: resolvePgTool(tool),
        version: stdout.trim(),
      };
    } catch (error) {
      results[tool] = {
        available: false,
        path: resolvePgTool(tool),
        error: error.shortMessage || error.message,
      };
    }
  }

  return results;
}

/* ==========================================================================
   HISTORY (a real JSON file next to the backup files — survives restores)
========================================================================== */

function emptyHistory() {
  return { backups: [], restores: [], lastScheduledResult: null };
}

function loadHistory() {
  backupDirReady();

  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      backups: Array.isArray(parsed.backups) ? parsed.backups : [],
      restores: Array.isArray(parsed.restores) ? parsed.restores : [],
      lastScheduledResult: parsed.lastScheduledResult || null,
    };
  } catch {
    return emptyHistory();
  }
}

function saveHistory(history) {
  backupDirReady();

  const temporary = `${HISTORY_FILE}.tmp`;

  fs.writeFileSync(temporary, JSON.stringify(history, null, 2), "utf8");
  fs.renameSync(temporary, HISTORY_FILE);
}

function findBackup(history, filename) {
  return history.backups.find((entry) => entry.filename === filename) || null;
}

function backupFilePath(filename) {
  return path.join(BACKUP_DIR, filename);
}

function assertSafeFilename(filename) {
  if (
    typeof filename !== "string" ||
    !SAFE_FILENAME.test(filename) ||
    filename !== path.basename(filename)
  ) {
    const error = new Error("Invalid backup filename.");
    error.status = 400;
    error.code = "INVALID_FILENAME";
    throw error;
  }

  return filename;
}

function decorateBackup(entry) {
  let localAvailable = false;
  let currentSizeBytes = null;

  try {
    const stats = fs.statSync(backupFilePath(entry.filename));

    localAvailable = stats.isFile();
    currentSizeBytes = stats.size;
  } catch {
    localAvailable = false;
  }

  return {
    ...entry,
    localAvailable,
    currentSizeBytes,
  };
}

/* ==========================================================================
   DUMPING + VALIDATION
========================================================================== */

/*
  Timestamped, readable file names, e.g.
    Sabawoon_Backup_2026-10-20_04-00-00.dump
  The stamp uses this PC's local time; the recorded createdAt in the
  history is an absolute UTC timestamp.
*/
function timestampSlug(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

async function createDumpFile(targetPath) {
  const connection = pgConnectionInfo();

  await runPgTool("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    targetPath,
    "--host",
    connection.host,
    "--port",
    String(connection.port),
    "--username",
    connection.user,
    connection.database,
  ]);

  const stats = await fsp.stat(targetPath);

  if (!stats.size) {
    throw new Error("pg_dump produced an empty file.");
  }

  return stats.size;
}

async function validateDumpFile(targetPath) {
  try {
    const { stdout } = await runPgTool("pg_restore", ["--list", targetPath]);

    if (!/Archive created at/.test(stdout)) {
      return {
        valid: false,
        reason: "The file is not a pg_dump custom-format archive.",
      };
    }

    const tableMatches = stdout.match(/\bTABLE DATA\b/g) || [];

    return {
      valid: true,
      tableDataEntries: tableMatches.length,
      toc: stdout.split("\n").filter(Boolean).length,
    };
  } catch (error) {
    return {
      valid: false,
      reason:
        error.shortMessage || error.message || "pg_restore could not read the file.",
    };
  }
}

/* ==========================================================================
   GITHUB (backup upload only; token stays server-side)
========================================================================== */

function parseRepoSlug(value) {
  if (!value || typeof value !== "string") return null;

  const slug = value
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");

  const parts = slug.split("/").filter(Boolean);

  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) {
    return null;
  }

  return parts.join("/");
}

function repoSlugFromEnv(combinedKey, ownerKey, nameKey) {
  const combined = parseRepoSlug(process.env[combinedKey]);

  if (combined) return combined;

  const owner = (process.env[ownerKey] || "").trim();
  const name = (process.env[nameKey] || "").trim();

  if (owner && name) return parseRepoSlug(`${owner}/${name}`);

  return null;
}

function backupRepoSlug() {
  return repoSlugFromEnv(
    "GITHUB_BACKUP_REPO",
    "GITHUB_BACKUP_REPO_OWNER",
    "GITHUB_BACKUP_REPO_NAME",
  );
}

function githubToken() {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  return token || null;
}

function githubUploadConfigured() {
  return Boolean(githubToken() && backupRepoSlug());
}

async function githubApi(url, options = {}) {
  const token = githubToken();

  if (!token) {
    const error = new Error(
      "GitHub is not configured: GITHUB_TOKEN is missing on the server.",
    );
    error.status = 503;
    error.code = "GITHUB_NOT_CONFIGURED";
    throw error;
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {}),
      },
    });
  } catch {
    const error = new Error(
      "Could not reach GitHub. Check the server's internet connection.",
    );
    error.status = 502;
    error.code = "GITHUB_UNREACHABLE";
    throw error;
  }

  const text = await response.text();

  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(
      body?.message || `GitHub API returned HTTP ${response.status}.`,
    );
    error.status = 502;
    error.code = "GITHUB_API_ERROR";
    error.githubStatus = response.status;

    if (/Repository is empty/i.test(text)) {
      error.message =
        "The GitHub repository has no commits yet, so GitHub cannot create " +
        "a release on it. Push any file (e.g. a README.md) to the backup " +
        "repository once, then retry.";
    }

    throw error;
  }

  return body;
}

async function ensureBackupRelease() {
  const repo = backupRepoSlug();

  try {
    return await githubApi(
      `https://api.github.com/repos/${repo}/releases/tags/${BACKUP_RELEASE_TAG}`,
    );
  } catch (error) {
    if (error.githubStatus !== 404) throw error;
  }

  // No release yet — create one. It holds backup assets outside Git history.
  return githubApi(`https://api.github.com/repos/${repo}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: BACKUP_RELEASE_TAG,
      name: "Sabawoon Database Backups",
      body:
        "Container release for Sabawoon database backup files (.dump). " +
        "Backup files are attached as release assets so they never enter " +
        "ordinary Git history. This repository must remain PRIVATE.",
      draft: false,
      prerelease: false,
      make_latest: "false",
    }),
  });
}

function assetUploadTarget(release) {
  return (release.upload_url || "").replace(/\{.*\}$/, "");
}

async function verifyBackupRepoIsPrivate(repo) {
  const repository = await githubApi(`https://api.github.com/repos/${repo}`);

  if (!repository.private) {
    const error = new Error(
      `Repository ${repo} is PUBLIC. Database backups contain sensitive ` +
        "academy data and must never be uploaded to a public repository. " +
        "Make it private (or point GITHUB_BACKUP_REPO at a private repo).",
    );
    error.status = 400;
    error.code = "BACKUP_REPO_NOT_PRIVATE";
    throw error;
  }

  return repository;
}

/*
  Uploads one local backup file to the private repository as a release
  asset and records the honest outcome in the history. Throws on failure
  AFTER recording it — the local backup is never touched.
*/
async function uploadBackupToGithub(entry, actorName) {
  const repo = backupRepoSlug();

  const filePath = backupFilePath(entry.filename);

  let stats;

  try {
    stats = await fsp.stat(filePath);
  } catch {
    const error = new Error("The backup file no longer exists on disk.");
    error.code = "BACKUP_FILE_MISSING";
    throw error;
  }

  const history = loadHistory();
  const historyEntry = findBackup(history, entry.filename) || entry;

  try {
    // 1) Validate the file is a real, restorable dump before uploading.
    const validation = await validateDumpFile(filePath);

    if (!validation.valid) {
      const error = new Error(`Refusing to upload: ${validation.reason}`);
      error.code = "BACKUP_INVALID";
      throw error;
    }

    if (stats.size > MAX_UPLOAD_BYTES) {
      const error = new Error(
        `Backup is ${(stats.size / 1024 / 1024).toFixed(1)} MB; the upload ` +
          `path supports up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB ` +
          "(configure BACKUP_MAX_UPLOAD_MB to change this).",
      );
      error.code = "BACKUP_TOO_LARGE";
      throw error;
    }

    // 2) Verify the destination repository exists AND is PRIVATE.
    await verifyBackupRepoIsPrivate(repo);

    // 3) Confirm the upload target release, then upload the asset.
    const release = await ensureBackupRelease();

    const existing = (release.assets || []).find(
      (asset) => asset.name === entry.filename,
    );

    if (existing) {
      historyEntry.github = {
        status: "uploaded",
        uploadedAt: existing.created_at,
        repository: repo,
        releaseTag: BACKUP_RELEASE_TAG,
        releaseUrl: release.html_url,
        assetId: existing.id,
        assetUrl: existing.browser_download_url,
        sizeBytes: existing.size,
        uploadedBy: actorName,
        error: null,
      };

      saveHistory(history);

      return { alreadyUploaded: true, asset: existing };
    }

    const fileBuffer = await fsp.readFile(filePath);

    const uploadUrl =
      `${assetUploadTarget(release)}?name=${encodeURIComponent(entry.filename)}` +
      `&label=${encodeURIComponent(`Sabawoon database backup ${entry.filename}`)}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken()}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(fileBuffer.length),
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: fileBuffer,
    });

    const uploadText = await uploadResponse.text();

    let uploadedAsset = null;

    try {
      uploadedAsset = uploadText ? JSON.parse(uploadText) : null;
    } catch {
      uploadedAsset = null;
    }

    if (!uploadResponse.ok) {
      const error = new Error(
        uploadedAsset?.message || `GitHub returned HTTP ${uploadResponse.status}.`,
      );
      error.code = "GITHUB_UPLOAD_FAILED";
      throw error;
    }

    // 4) Confirm the asset really exists on GitHub by listing it back.
    const assetsAfter = await githubApi(
      `https://api.github.com/repos/${repo}/releases/${release.id}/assets?per_page=100`,
    );

    const confirmed = assetsAfter.find((asset) => asset.name === entry.filename);

    if (!confirmed) {
      const error = new Error(
        "Upload returned success but the asset could not be found afterwards.",
      );
      error.code = "GITHUB_UPLOAD_UNVERIFIED";
      throw error;
    }

    historyEntry.github = {
      status: "uploaded",
      uploadedAt: confirmed.created_at,
      repository: repo,
      releaseTag: BACKUP_RELEASE_TAG,
      releaseUrl: release.html_url,
      assetId: confirmed.id,
      assetUrl: confirmed.browser_download_url,
      sizeBytes: confirmed.size,
      uploadedBy: actorName,
      error: null,
    };

    saveHistory(history);

    console.log(
      `[backup] ${entry.filename} uploaded to ${repo} (asset ${confirmed.id}) by ${actorName}`,
    );

    return { alreadyUploaded: false, asset: confirmed };
  } catch (error) {
    // Record the failure honestly; the local backup stays untouched.
    historyEntry.github = {
      status: "failed",
      attemptedAt: new Date().toISOString(),
      repository: repo,
      error: error.message,
    };

    saveHistory(history);

    throw error;
  }
}

/* ==========================================================================
   RUN LOCK — prevents overlapping or duplicate backup jobs
========================================================================== */

const LOCK_STALE_MS = 2 * 60 * 60 * 1000; // a backup never takes 2 hours

function acquireRunLock() {
  backupDirReady();

  try {
    const fd = fs.openSync(LOCK_FILE, "wx");

    fs.writeSync(
      fd,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    fs.closeSync(fd);

    return true;
  } catch (error) {
    if (error.code !== "EEXIST") return false;

    // Break locks left behind by a crashed process.
    try {
      const stats = fs.statSync(LOCK_FILE);

      if (Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
        fs.unlinkSync(LOCK_FILE);

        const fd = fs.openSync(LOCK_FILE, "wx");

        fs.writeSync(
          fd,
          JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        );
        fs.closeSync(fd);

        return true;
      }
    } catch {
      // Could not inspect or replace the lock — treat it as held.
    }

    return false;
  }
}

function releaseRunLock() {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    // Already gone.
  }
}

/* ==========================================================================
   RETENTION — keep the most recent 30 daily + 12 monthly backups
========================================================================== */

/*
  Never deletes the newest backup, never deletes an unknown/corrupt entry,
  and never deletes anything when the result would be zero backups. Only
  real files recorded in the history are considered.
*/
function applyRetention(history, { log = true } = {}) {
  const removed = [];

  const candidates = history.backups
    .filter((entry) => {
      const time = Date.parse(entry.createdAt || "");
      return Number.isFinite(time);
    })
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (candidates.length <= 1) {
    return removed;
  }

  const keep = new Set();
  const seenDays = new Set();
  const seenMonths = new Set();

  for (const entry of candidates) {
    const date = new Date(entry.createdAt);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

    // 1) always keep the newest backup
    if (keep.size === 0) {
      keep.add(entry.filename);
      seenDays.add(dayKey);
      seenMonths.add(monthKey);
      continue;
    }

    // 2) newest backup of each of the most recent N days
    if (seenDays.size < RETENTION_DAILY && !seenDays.has(dayKey)) {
      keep.add(entry.filename);
      seenDays.add(dayKey);
      seenMonths.add(monthKey);
      continue;
    }

    // 3) newest backup of each of the most recent M months
    if (!seenMonths.has(monthKey) && seenMonths.size < RETENTION_MONTHLY) {
      keep.add(entry.filename);
      seenMonths.add(monthKey);
      continue;
    }
  }

  const remaining = [];

  for (const entry of history.backups) {
    if (keep.has(entry.filename)) {
      remaining.push(entry);
      continue;
    }

    // Only prune real files that fall outside the retention windows.
    let stats = null;

    try {
      stats = fs.statSync(backupFilePath(entry.filename));
    } catch {
      stats = null;
    }

    if (stats && stats.isFile()) {
      try {
        fs.unlinkSync(backupFilePath(entry.filename));
        removed.push(entry.filename);

        if (log) {
          console.log(`[backup] Retention removed old backup ${entry.filename}`);
        }
      } catch (error) {
        // Deletion failed — keep the history entry honest and move on.
        remaining.push(entry);
      }
    } else if (false) {
      // No file on disk: drop the stale history entry, it describes
      // nothing that exists.
      removed.push(entry.filename);
    }
  }

  history.backups = remaining;

  return removed;
}

/* ==========================================================================
   CREATE A BACKUP (dump → validate → history → optional GitHub upload)
========================================================================== */

let backupInProgress = false;

function isBackupInProgress() {
  return backupInProgress;
}

/*
  Creates a real pg_dump backup of the configured database.

  Returns { ok, backup, github, error } — local and GitHub results are
  always separate. A failed upload never deletes or invalidates the local
  backup.
*/
async function runBackup({
  trigger = "manual",
  actor = { id: null, name: "administrator", role: "admin" },

} = {}) {
  if (backupInProgress) {
    const error = new Error("A backup is already running. Wait for it to finish.");
    error.code = "BACKUP_IN_PROGRESS";
    throw error;
  }

  backupInProgress = true;

  if (!acquireRunLock()) {
    backupInProgress = false;

    const error = new Error(
      "Another backup job is already running on this computer.",
    );
    error.code = "BACKUP_LOCKED";
    throw error;
  }

  const history = loadHistory();

  try {
    backupDirReady();

    const stamp = timestampSlug();
    const filename = `Sabawoon_Backup_${stamp}.dump`;
    const targetPath = backupFilePath(filename);

    const startedAt = Date.now();

    const sizeBytes = await createDumpFile(targetPath);

    const validation = await validateDumpFile(targetPath);

    if (!validation.valid) {
      await fsp.unlink(targetPath).catch(() => {});

      const error = new Error(
        `Backup was created but failed validation: ${validation.reason}`,
      );
      error.code = "BACKUP_INVALID";
      throw error;
    }

    const entry = {
      filename,
      createdAt: new Date().toISOString(),
      sizeBytes,
      format: "pg_dump custom format (-Fc)",
      contents:
        "Full database schema and data (all tables, sequences, constraints, indexes)",
      validation,
      durationMs: Date.now() - startedAt,
      trigger,
      createdBy: actor,
      error: null,
    };

    history.backups.unshift(entry);
    saveHistory(history);

    // Keep local storage bounded (never touches the newest backup).
    applyRetention(history);
    saveHistory(history);

    console.log(
      `[backup] ${filename} created (${sizeBytes} bytes, ${trigger}) by ${actor.name}`,
    );

    /* Online backup uploads are intentionally not part of this application. */

    if (false) {
      try {
        await uploadBackupToGithub(entry, actor.name);

        githubResult = { status: "uploaded" };
      } catch (error) {
        // The local backup stays valid — recorded honestly in the history.
        githubResult = { status: "failed", error: error.message, code: error.code };
      }
    } else {
      githubResult = {
        status: "skipped",
        reason: "GitHub backup is not configured on this server.",
      };
    }

    return {
      ok: true,
      backup: decorateBackup(findBackup(loadHistory(), filename) || entry),
    };
  } finally {
    backupInProgress = false;
    releaseRunLock();
  }
}

/* ==========================================================================
   SCHEDULED DAILY BACKUPS
========================================================================== */

function lastBackupDate(history) {
  let newest = null;

  for (const entry of history.backups) {
    const time = Date.parse(entry.createdAt || "");

    if (!Number.isFinite(time)) continue;
    if (newest === null || time > newest) newest = time;
  }

  return newest;
}

/*
  A backup is due once the configured daily time has passed and no backup
  exists from that moment or later. Missed runs (computer switched off at
  the scheduled time) are caught up the next time the service runs.
*/
function nextDueAt(now = new Date()) {
  const { hours, minutes } = scheduledDailyAt();

  const target = new Date(now);

  target.setHours(hours, minutes, 0, 0);

  if (target.getTime() > now.getTime()) {
    // The last scheduled moment was yesterday at the configured time.
    target.setDate(target.getDate() - 1);
  }

  return target;
}

function backupIsDue(now = new Date()) {
  const history = loadHistory();
  const last = lastBackupDate(history);

  return last === null || last < nextDueAt(now).getTime();
}

/*
  The one entry point used by both the in-app scheduler and the Windows
  scheduled task. Skips (without error) when everything is up to date or
  another job holds the lock.
*/
async function runScheduledBackupIfDue({ force = false } = {}) {
  if (!force && !backupIsDue()) {
    return { ok: true, skipped: true, reason: "up_to_date" };
  }

  const actor = {
    id: null,
    name: "Scheduled automatic backup",
    role: "system",
  };

  try {
    const result = await runBackup({ trigger: "automatic", actor });

    const fresh = loadHistory();

    fresh.lastScheduledResult = {
      at: new Date().toISOString(),
      ok: true,
      filename: result.backup.filename,
      error: null,
    };

    saveHistory(fresh);

    return result;
  } catch (error) {
    const fresh = loadHistory();

    fresh.lastScheduledResult = {
      at: new Date().toISOString(),
      ok: false,
      filename: null,
      error: error.message,
    };

    saveHistory(fresh);

    console.error(`[backup] Scheduled backup failed: ${error.message}`);

    throw error;
  }
}

/*
  In-application scheduler. Runs in the existing backend process so daily
  backups happen whenever the application (or backend) is running, and
  catches up missed days at startup. For runs while the application is
  fully closed, the Electron app registers a Windows scheduled task that
  executes run-scheduled-backup.cjs directly.
*/
function startBackupScheduler({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (!automaticBackupsEnabled()) {
    console.log("[backup] Automatic daily backups are disabled (BACKUP_AUTOMATIC=0).");
    return null;
  }

  migrateLegacyBackupDir();

  const dueText = scheduledDailyAt().text;

  console.log(
    `[backup] Automatic daily backups enabled — due at ${dueText} local time; ` +
      "missed days are caught up when the application next runs.",
  );

  let running = false;

  const tick = async () => {
    if (running) return;
    if (!backupIsDue()) return;

    running = true;

    try {
      const result = await runScheduledBackupIfDue();

      if (!result.skipped) {
        console.log(
          `[backup] Scheduled backup finished: ${result.backup.filename} ` +
            "(stored locally)",
        );
      }
    } catch (error) {
      console.error(`[backup] Automatic backup failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  // First check shortly after startup (catch-up after downtime), then
  // periodically.
  const initial = setTimeout(tick, 15 * 1000);
  const timer = setInterval(tick, intervalMs);

  return { initial, timer };
}

/* ==========================================================================
   SCHEDULE STATUS (shown on the backup page / config endpoint)
========================================================================== */

function scheduleStatus() {
  const history = loadHistory();
  const last = lastBackupDate(history);
  const due = nextDueAt();

  return {
    enabled: automaticBackupsEnabled(),
    dailyAt: scheduledDailyAt().text,
    lastBackupAt: last ? new Date(last).toISOString() : null,
    nextDueAt: new Date(
      last === null || last < due.getTime()
        ? due.getTime()
        : due.getTime() + 24 * 60 * 60 * 1000,
    ).toISOString(),
    lastResult: history.lastScheduledResult,
    retention: {
      daily: RETENTION_DAILY,
      monthly: RETENTION_MONTHLY,
    },
  };
}

module.exports = {
  BACKUP_DIR,
  HISTORY_FILE,
  MAX_UPLOAD_BYTES,
  RETENTION_DAILY,
  RETENTION_MONTHLY,
  SAFE_FILENAME,
  acquireRunLock,
  applyRetention,
  assertSafeFilename,
  backupDirReady,
  backupFilePath,
  backupIsDue,
  backupRepoSlug,
  checkPgTools,
  createDumpFile,
  decorateBackup,
  emptyHistory,
  ensureBackupRelease,
  findBackup,
  githubApi,
  githubToken,
  githubUploadConfigured,
  loadHistory,
  migrateLegacyBackupDir,
  pgConnectionInfo,
  releaseRunLock,
  runBackup,
  runPgTool,
  runScheduledBackupIfDue,
  scheduleStatus,
  saveHistory,
  startBackupScheduler,
  timestampSlug,
  uploadBackupToGithub,
  validateDumpFile,
  isBackupInProgress,
};
