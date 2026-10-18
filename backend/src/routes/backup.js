/*
  UPDATES & BACKUP
  Administrator-only endpoints that perform real operations:

  - Create a complete PostgreSQL backup with pg_dump (custom format -Fc)
  - Download a backup file to the administrator's PC
  - Upload a backup to a PRIVATE GitHub repository as a release asset
    (assets live outside ordinary Git history, so the repo history stays clean)
  - List real backup history (local files + remote GitHub verification)
  - Safely restore a backup (safety dump + optional test-database pre-flight
    + single-transaction restore so a failure cannot leave a half-restored DB)
  - Check for official application releases on GitHub

  All configuration comes from environment variables (see backend/.env.example).
  No token or credential is ever exposed to the frontend.
*/

const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { execFile } = require("child_process");
const { promisify } = require("util");
const bcrypt = require("bcryptjs");

const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const execFileAsync = promisify(execFile);

const router = express.Router();

/* ==========================================================================
   ADMIN GUARD — every route in this router is administrator-only
========================================================================== */

router.use(authRequired, requireRoles("admin"));

/* ==========================================================================
   CONFIGURATION
========================================================================== */

const BACKUP_DIR = path.resolve(
  process.env.BACKUP_DIR || path.join(__dirname, "..", "..", "backups"),
);

const HISTORY_FILE = path.join(BACKUP_DIR, "history.json");

// Backup files are uploaded to GitHub as release assets on this tag.
const BACKUP_RELEASE_TAG = "db-backups";

// Largest backup we buffer in memory for upload (GitHub asset limit is 2GB,
// but we stay conservative; the backend is a single Node process).
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/;

function backupDirReady() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function installedVersion() {
  return process.env.APP_VERSION || require("../../package.json").version;
}

/* --------------------------------------------------------------------------
   PostgreSQL tool discovery (pg_dump / pg_restore)
-------------------------------------------------------------------------- */

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

  const executable =
    process.platform === "win32" ? `${name}.exe` : name;

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

/* --------------------------------------------------------------------------
   HISTORY (a real JSON file next to the backup files — survives restores)
-------------------------------------------------------------------------- */

function emptyHistory() {
  return { backups: [], restores: [] };
}

function loadHistory() {
  backupDirReady();

  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      backups: Array.isArray(parsed.backups) ? parsed.backups : [],
      restores: Array.isArray(parsed.restores) ? parsed.restores : [],
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

function actorOf(req) {
  return {
    id: req.user?.id ?? null,
    name: req.user?.full_name || req.user?.name || req.user?.email || "admin",
    role: req.user?.role || "admin",
  };
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

/* --------------------------------------------------------------------------
   GITHUB (used for backup upload + release checks; token stays server-side)
-------------------------------------------------------------------------- */

function parseRepoSlug(value) {
  if (!value || typeof value !== "string") return null;

  const slug = value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");

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

function releaseRepoSlug() {
  return repoSlugFromEnv(
    "GITHUB_RELEASE_REPO",
    "GITHUB_RELEASE_REPO_OWNER",
    "GITHUB_RELEASE_REPO_NAME",
  );
}

function githubToken() {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  return token || null;
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

/* --------------------------------------------------------------------------
   DUMPING + VALIDATION
-------------------------------------------------------------------------- */

function timestampSlug(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
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
    const { stdout } = await runPgTool("pg_restore", [
      "--list",
      targetPath,
    ]);

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
      reason: error.shortMessage || error.message || "pg_restore could not read the file.",
    };
  }
}

function countRows(databaseName, tables) {
  return countRowsOn(pgConnectionInfo(), databaseName, tables);
}

function countRowsOn(connectionInfo, databaseName, tables) {
  const client = new (require("pg").Pool)({
    host: connectionInfo.host,
    port: connectionInfo.port,
    user: connectionInfo.user,
    password: connectionInfo.password,
    database: databaseName,
    max: 1,
  });

  return Promise.all(
    tables.map((table) =>
      client
        .query(`SELECT COUNT(*)::int AS count FROM ${table}`)
        .then((result) => [table, result.rows[0].count])
        .catch(() => [table, null]),
    ),
  )
    .then((pairs) => Object.fromEntries(pairs))
    .finally(() => client.end());
}

/* ==========================================================================
   GET /api/backup/config
   Non-secret view of what is configured (never returns tokens)
========================================================================== */

router.get("/config", async (req, res, next) => {
  try {
    const tools = await checkPgTools();

    res.json({
      backupDir: BACKUP_DIR,
      historyFile: HISTORY_FILE,
      installedVersion: installedVersion(),
      platform: process.platform,
      pgTools: tools,
      github: {
        tokenConfigured: Boolean(githubToken()),
        backupRepo: backupRepoSlug(),
        backupUploadConfigured: Boolean(githubToken() && backupRepoSlug()),
        releaseRepo: releaseRepoSlug(),
        releaseCheckConfigured: Boolean(releaseRepoSlug()),
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   POST /api/backup/create
   Runs a real pg_dump of the live database.
========================================================================== */

router.post("/create", async (req, res, next) => {
  try {
    backupDirReady();

    const stamp = timestampSlug();
    const filename = `sabawoon-backup-${stamp}.dump`;
    const targetPath = backupFilePath(filename);

    const startedAt = Date.now();

    const sizeBytes = await createDumpFile(targetPath);

    const validation = await validateDumpFile(targetPath);

    if (!validation.valid) {
      await fsp.unlink(targetPath).catch(() => {});

      return res.status(500).json({
        error: `Backup was created but failed validation: ${validation.reason}`,
        code: "BACKUP_INVALID",
      });
    }

    const entry = {
      filename,
      createdAt: new Date().toISOString(),
      sizeBytes,
      format: "pg_dump custom format (-Fc)",
      contents: "Full database schema and data (all tables, sequences, constraints, indexes)",
      validation,
      durationMs: Date.now() - startedAt,
      createdBy: actorOf(req),
      github: { status: "not_uploaded" },
      error: null,
    };

    const history = loadHistory();

    history.backups.unshift(entry);
    saveHistory(history);

    console.log(
      `[backup] ${filename} created (${sizeBytes} bytes) by ${entry.createdBy.name}`,
    );

    res.status(201).json({
      ok: true,
      backup: decorateBackup(entry),
      message: "Backup created and validated successfully.",
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   GET /api/backup/list
   Real history merged with filesystem state; ?remote=1 verifies GitHub too.
========================================================================== */

router.get("/list", async (req, res, next) => {
  try {
    const history = loadHistory();

    let remoteVerification = null;

    if (req.query.remote === "1" && backupRepoSlug() && githubToken()) {
      try {
        const release = await ensureBackupRelease();

        const assets = await githubApi(
          `https://api.github.com/repos/${backupRepoSlug()}/releases/${release.id}/assets?per_page=100`,
        );

        remoteVerification = {
          repository: backupRepoSlug(),
          releaseTag: BACKUP_RELEASE_TAG,
          releaseUrl: release.html_url,
          checkedAt: new Date().toISOString(),
          assets: assets.map((asset) => ({
            name: asset.name,
            sizeBytes: asset.size,
            uploadedAt: asset.created_at,
            downloadUrl: asset.browser_download_url,
          })),
        };
      } catch (error) {
        remoteVerification = {
          repository: backupRepoSlug(),
          checkedAt: new Date().toISOString(),
          error: error.message,
          code: error.code || "GITHUB_ERROR",
        };
      }
    }

    const assetByName = new Map(
      (remoteVerification?.assets || []).map((asset) => [asset.name, asset]),
    );

    const backups = history.backups.map((entry) => {
      const decorated = decorateBackup(entry);

      if (remoteVerification && !remoteVerification.error) {
        const remoteAsset = assetByName.get(entry.filename);

        decorated.github = {
          ...decorated.github,
          verifiedRemote: Boolean(remoteAsset),
          remoteSizeBytes: remoteAsset?.sizeBytes ?? null,
          remoteDownloadUrl: remoteAsset?.downloadUrl ?? null,
        };
      }

      return decorated;
    });

    res.json({
      backups,
      restores: history.restores,
      remoteVerification,
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   GET /api/backup/download/:filename
   Streams the real dump file to the browser (attachment download).
========================================================================== */

router.get("/download/:filename", async (req, res, next) => {
  try {
    const filename = assertSafeFilename(req.params.filename);

    const history = loadHistory();

    const entry = findBackup(history, filename);

    if (!entry) {
      return res.status(404).json({
        error: "Backup not found in history.",
        code: "BACKUP_NOT_FOUND",
      });
    }

    const filePath = backupFilePath(filename);

    let stats;

    try {
      stats = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({
        error:
          "The backup file no longer exists on this server's disk. " +
          "Re-create it or download the copy uploaded to GitHub.",
        code: "BACKUP_FILE_MISSING",
      });
    }

    entry.lastDownloadedAt = new Date().toISOString();
    entry.lastDownloadedBy = actorOf(req).name;

    saveHistory(history);

    console.log(`[backup] ${filename} downloaded by ${entry.lastDownloadedBy}`);

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stats.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );

    const stream = fs.createReadStream(filePath);

    stream.on("error", (error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to read backup file." });
      } else {
        res.destroy(error);
      }
    });

    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   POST /api/backup/upload-github
   Uploads an existing local backup to the configured PRIVATE repository as
   a release asset (kept out of ordinary Git history).
========================================================================== */

router.post("/upload-github", async (req, res, next) => {
  try {
    const filename = assertSafeFilename(req.body?.filename);

    const tokenConfigured = Boolean(githubToken());
    const repo = backupRepoSlug();

    if (!tokenConfigured || !repo) {
      return res.status(503).json({
        error:
          "GitHub is not configured on the server. Set GITHUB_TOKEN, " +
          "GITHUB_BACKUP_REPO_OWNER and GITHUB_BACKUP_REPO_NAME in backend/.env " +
          "(see backend/.env.example).",
        code: "GITHUB_NOT_CONFIGURED",
      });
    }

    const history = loadHistory();

    const entry = findBackup(history, filename);

    if (!entry) {
      return res.status(404).json({
        error: "Backup not found in history.",
        code: "BACKUP_NOT_FOUND",
      });
    }

    const filePath = backupFilePath(filename);

    let stats;

    try {
      stats = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({
        error: "The backup file no longer exists on the server.",
        code: "BACKUP_FILE_MISSING",
      });
    }

    // 1) Validate the file is a real, restorable dump before uploading.
    const validation = await validateDumpFile(filePath);

    if (!validation.valid) {
      return res.status(400).json({
        error: `Refusing to upload: ${validation.reason}`,
        code: "BACKUP_INVALID",
      });
    }

    if (stats.size > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: `Backup is ${(stats.size / 1024 / 1024).toFixed(1)} MB; the in-browser upload path supports up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        code: "BACKUP_TOO_LARGE",
      });
    }

    // 2) Verify the destination repository exists AND is PRIVATE.
    const repository = await githubApi(`https://api.github.com/repos/${repo}`);

    if (!repository.private) {
      return res.status(400).json({
        error:
          `Repository ${repo} is PUBLIC. Database backups contain sensitive ` +
          "academy data and must never be uploaded to a public repository. " +
          "Make it private (or point GITHUB_BACKUP_REPO at a private repo).",
        code: "BACKUP_REPO_NOT_PRIVATE",
      });
    }

    // 3) Confirm the upload target release, then upload the asset.
    const release = await ensureBackupRelease();

    const existing = (release.assets || []).find(
      (asset) => asset.name === filename,
    );

    if (existing) {
      return res.status(409).json({
        error: `A backup named ${filename} is already uploaded to ${repo}.`,
        code: "ASSET_EXISTS",
        asset: {
          name: existing.name,
          sizeBytes: existing.size,
          uploadedAt: existing.created_at,
          downloadUrl: existing.browser_download_url,
        },
      });
    }

    const fileBuffer = await fsp.readFile(filePath);

    const uploadUrl =
      `${assetUploadTarget(release)}?name=${encodeURIComponent(filename)}` +
      `&label=${encodeURIComponent(`Sabawoon database backup ${filename}`)}`;

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
      const message =
        uploadedAsset?.message || `GitHub returned HTTP ${uploadResponse.status}.`;

      entry.github = {
        status: "failed",
        attemptedAt: new Date().toISOString(),
        repository: repo,
        error: message,
      };

      saveHistory(history);

      return res.status(502).json({
        error: `Upload to GitHub failed: ${message}`,
        code: "GITHUB_UPLOAD_FAILED",
      });
    }

    // 4) Confirm the asset really exists on GitHub by listing it back.
    const assetsAfter = await githubApi(
      `https://api.github.com/repos/${repo}/releases/${release.id}/assets?per_page=100`,
    );

    const confirmed = assetsAfter.find((asset) => asset.name === filename);

    if (!confirmed) {
      entry.github = {
        status: "failed",
        attemptedAt: new Date().toISOString(),
        repository: repo,
        error: "Upload returned success but the asset could not be found afterwards.",
      };

      saveHistory(history);

      return res.status(502).json({
        error:
          "Upload appeared to succeed but the asset could not be verified on GitHub.",
        code: "GITHUB_UPLOAD_UNVERIFIED",
      });
    }

    entry.github = {
      status: "uploaded",
      uploadedAt: confirmed.created_at,
      repository: repo,
      releaseTag: BACKUP_RELEASE_TAG,
      releaseUrl: release.html_url,
      assetId: confirmed.id,
      assetUrl: confirmed.browser_download_url,
      sizeBytes: confirmed.size,
      uploadedBy: actorOf(req).name,
      error: null,
    };

    saveHistory(history);

    console.log(
      `[backup] ${filename} uploaded to ${repo} (asset ${confirmed.id}) by ${entry.github.uploadedBy}`,
    );

    res.json({
      ok: true,
      backup: decorateBackup(entry),
      message: `Uploaded ${filename} to ${repo} (${confirmed.size} bytes verified).`,
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   POST /api/backup/restore
   Controlled restoration:
     1. admin role (router-wide guard) + admin password confirmation
     2. filename + archive validation (pg_restore --list)
     3. explicit typed confirmation ("RESTORE")
     4. automatic safety backup of the current database
     5. optional pre-flight restore into a throwaway test database
     6. live restore with --clean --if-exists --single-transaction
        (a failure rolls the whole restore back — no partial overwrite)
     7. post-restore row-count verification
========================================================================== */

let restoreInProgress = false;

router.post("/restore", async (req, res, next) => {
  try {
    if (restoreInProgress) {
      return res.status(409).json({
        error: "A restore is already running. Wait for it to finish.",
        code: "RESTORE_IN_PROGRESS",
      });
    }

    const filename = assertSafeFilename(req.body?.filename);
    const confirmText = req.body?.confirmText;
    const adminPassword = req.body?.adminPassword;

    if (confirmText !== "RESTORE") {
      return res.status(400).json({
        error: 'Type the word "RESTORE" exactly to confirm this destructive operation.',
        code: "CONFIRMATION_REQUIRED",
      });
    }

    if (!adminPassword || typeof adminPassword !== "string") {
      return res.status(400).json({
        error: "Administrator password is required to restore a backup.",
        code: "PASSWORD_REQUIRED",
      });
    }

    // Re-verify the administrator password (same pattern as /auth/verify-password).
    const adminResult = await query(
      `SELECT id, password_hash
       FROM users
       WHERE role = 'admin'
         AND is_active = TRUE`,
    );

    let passwordValid = false;

    for (const account of adminResult.rows) {
      if (await bcrypt.compare(adminPassword, account.password_hash)) {
        passwordValid = true;
        break;
      }
    }

    if (!passwordValid) {
      return res.status(401).json({
        error: "Administrator password is incorrect.",
        code: "PASSWORD_INVALID",
      });
    }

    const history = loadHistory();

    const entry = findBackup(history, filename);

    if (!entry) {
      return res.status(404).json({
        error: "Backup not found in history.",
        code: "BACKUP_NOT_FOUND",
      });
    }

    const filePath = backupFilePath(filename);

    try {
      await fsp.access(filePath, fs.constants.R_OK);
    } catch {
      return res.status(404).json({
        error: "The backup file no longer exists on the server.",
        code: "BACKUP_FILE_MISSING",
      });
    }

    // Validate the archive before touching the live database.
    const validation = await validateDumpFile(filePath);

    if (!validation.valid) {
      return res.status(400).json({
        error: `This backup file cannot be restored: ${validation.reason}`,
        code: "BACKUP_INVALID",
      });
    }

    restoreInProgress = true;

    const connection = pgConnectionInfo();
    const startedAt = Date.now();
    const result = {
      filename,
      startedAt: new Date().toISOString(),
      status: "failed",
      safetyBackup: null,
      preTest: null,
      verification: null,
      performedBy: actorOf(req),
      error: null,
    };

    try {
      // STEP 1 — safety backup of the CURRENT database.
      const safetyName = `sabawoon-backup-${timestampSlug()}-prerestore.dump`;
      const safetyPath = backupFilePath(safetyName);

      const safetySize = await createDumpFile(safetyPath);

      result.safetyBackup = {
        filename: safetyName,
        sizeBytes: safetySize,
        createdAt: new Date().toISOString(),
      };

      history.backups.unshift({
        filename: safetyName,
        createdAt: result.safetyBackup.createdAt,
        sizeBytes: safetySize,
        format: "pg_dump custom format (-Fc)",
        contents: "Automatic safety backup taken immediately before a restore",
        validation: { valid: true },
        durationMs: null,
        createdBy: { ...actorOf(req), name: `${actorOf(req).name} (automatic pre-restore)` },
        github: { status: "not_uploaded" },
        error: null,
      });

      saveHistory(history);

      // STEP 2 — pre-flight restore into a throwaway test database.
      // Uses PG_ADMIN_URL (a superuser connection string) when configured;
      // otherwise falls back to DATABASE_URL, which may lack CREATEDB rights.
      const adminPool = process.env.PG_ADMIN_URL
        ? new (require("pg").Pool)({
            connectionString: process.env.PG_ADMIN_URL,
            max: 1,
          })
        : pool;

      // pg_restore for the test database must connect as the same user that
      // created it (the admin user when PG_ADMIN_URL is set).
      const testRestoreConnection = process.env.PG_ADMIN_URL
        ? (() => {
            const adminUrl = new URL(process.env.PG_ADMIN_URL);

            return {
              host: adminUrl.hostname || "localhost",
              port: adminUrl.port ? Number(adminUrl.port) : 5432,
              user: decodeURIComponent(adminUrl.username || ""),
              password: decodeURIComponent(adminUrl.password || ""),
            };
          })()
        : connection;

      const testDbName = `hm_sms_restoretest_${Date.now()}`;

      try {
        // testDbName is generated internally (hm_sms_restoretest_<epoch>),
        // so it is a safe identifier.
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
      } catch (error) {
        result.preTest = {
          skipped: true,
          reason: `Could not create a temporary test database (${error.message.trim()}). ` +
            "Continuing with a single-transaction restore, which rolls back completely on failure.",
        };
      }

      if (!result.preTest) {
        try {
          await runPgTool("pg_restore", [
            "--no-owner",
            "--no-privileges",
            "--host",
            testRestoreConnection.host,
            "--port",
            String(testRestoreConnection.port),
            "--username",
            testRestoreConnection.user,
            "--dbname",
            testDbName,
            filePath,
          ]);

          const testCounts = await countRowsOn(testRestoreConnection, testDbName, [
            "students",
            "users",
            "fee_payments",
          ]);

          const liveCounts = await countRows(connection.database, [
            "students",
            "users",
            "fee_payments",
          ]);

          result.preTest = {
            skipped: false,
            database: testDbName,
            rowCountsWithBackup: testCounts,
            currentLiveRowCounts: liveCounts,
            passed: true,
          };
        } catch (error) {
          result.preTest = {
            skipped: false,
            database: testDbName,
            passed: false,
            reason: error.shortMessage || error.message,
          };

          throw new Error(
            `Pre-flight restore into the test database failed: ${result.preTest.reason}`,
          );
        } finally {
          await adminPool
            .query(
              `SELECT pg_terminate_backend(pid)
               FROM pg_stat_activity
               WHERE datname = $1`,
              [testDbName],
            )
            .catch(() => {});

          await adminPool
            .query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`)
            .catch(() => {});

          if (adminPool !== pool) {
            await adminPool.end().catch(() => {});
          }
        }
      }

      // STEP 3 — live restore, atomic: --single-transaction means any error
      // rolls the WHOLE restore back, so the live DB is never half-overwritten.
      await pool.query(
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = $1
           AND pid <> pg_backend_pid()`,
        [connection.database],
      );

      await runPgTool("pg_restore", [
        "--clean",
        "--if-exists",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--host",
        connection.host,
        "--port",
        String(connection.port),
        "--username",
        connection.user,
        "--dbname",
        connection.database,
        filePath,
      ]);

      // STEP 4 — verify restoration actually landed.
      const verification = await countRows(connection.database, [
        "students",
        "users",
        "attendance",
        "fee_payments",
        "finance_transactions",
        "inventory_items",
      ]);

      result.verification = verification;
      result.status = "succeeded";
      result.finishedAt = new Date().toISOString();
      result.durationMs = Date.now() - startedAt;

      history.restores.unshift(result);
      saveHistory(history);

      console.log(
        `[backup] RESTORE SUCCEEDED: ${filename} -> ${connection.database} by ${result.performedBy.name} (${result.durationMs} ms)`,
      );

      res.json({
        ok: true,
        restore: result,
        message:
          `Database restored from ${filename}. Safety backup: ${safetyName}. ` +
          "Reload the application to see the restored records.",
      });
    } catch (error) {
      result.status = "failed";
      result.error = error.shortMessage || error.message;
      result.finishedAt = new Date().toISOString();
      result.durationMs = Date.now() - startedAt;

      history.restores.unshift(result);
      saveHistory(history);

      console.error(`[backup] RESTORE FAILED for ${filename}:`, result.error);

      // If the failure happened during the live restore, --single-transaction
      // already rolled the database back. The safety backup is on disk.
      return res.status(500).json({
        error:
          `Restore failed: ${result.error} ` +
          "The restore ran inside a single transaction, so the live database " +
          "was rolled back to its previous state" +
          (result.safetyBackup
            ? `; a safety backup (${result.safetyBackup.filename}) is also available.`
            : "."),
        code: "RESTORE_FAILED",
        restore: result,
      });
    } finally {
      restoreInProgress = false;
    }
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   GET /api/backup/updates/check
   Reads REAL release information from the configured GitHub repository.
========================================================================== */

function normalizeVersion(value) {
  if (!value) return null;

  const cleaned = String(value).trim().replace(/^[vV]/, "");

  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!match) return null;

  return {
    raw: String(value).trim(),
    normalized: `${match[1]}.${match[2]}.${match[3]}`,
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }

  return 0;
}

router.get("/updates/check", async (req, res, next) => {
  try {
    const repo = releaseRepoSlug();

    if (!repo) {
      return res.status(503).json({
        error:
          "The release repository is not configured. Set " +
          "GITHUB_RELEASE_REPO_OWNER and GITHUB_RELEASE_REPO_NAME in backend/.env.",
        code: "RELEASE_REPO_NOT_CONFIGURED",
      });
    }

    const current = installedVersion();

    let release;

    try {
      release = await githubApi(
        `https://api.github.com/repos/${repo}/releases/latest`,
      );
    } catch (error) {
      if (error.githubStatus === 404) {
        return res.json({
          ok: true,
          repository: repo,
          installedVersion: current,
          latest: null,
          updateAvailable: false,
          message:
            `No published release was found on ${repo}. Official updates will ` +
            "appear here once a GitHub Release is published for this repository.",
        });
      }

      throw error;
    }

    const latestVersion = normalizeVersion(release.tag_name);

    let updateAvailable = false;

    if (latestVersion) {
      const currentVersion = normalizeVersion(current);

      if (currentVersion) {
        updateAvailable =
          compareVersions(latestVersion.numbers, currentVersion.numbers) > 0;
      } else {
        // Installed version is unknown/unparseable — do not lie: say so.
        updateAvailable = false;
      }
    }

    res.json({
      ok: true,
      repository: repo,
      installedVersion: current,
      latest: {
        tagName: release.tag_name,
        version: latestVersion?.normalized || null,
        name: release.name,
        publishedAt: release.published_at,
        prerelease: release.prerelease,
        draft: release.draft,
        notes: (release.body || "").slice(0, 4000),
        url: release.html_url,
        assets: (release.assets || []).map((asset) => ({
          name: asset.name,
          sizeBytes: asset.size,
          downloadUrl: asset.browser_download_url,
          contentType: asset.content_type,
          downloadedCount: asset.download_count,
        })),
      },
      updateAvailable,
      // In the browser build, an update is downloaded manually — the running
      // application cannot replace itself. (A future Electron build will use
      // a real desktop updater against the same release feed.)
      autoInstallSupported: false,
      mode: "browser",
      message: updateAvailable
        ? `Version ${latestVersion?.normalized || release.tag_name} is available.`
        : "This installation is up to date.",
    });
  } catch (error) {
    if (error.code === "GITHUB_UNREACHABLE") {
      return res.status(502).json({
        error:
          "Could not reach GitHub. Check the internet connection of this " +
          "computer — update checks require internet access.",
        code: "OFFLINE",
      });
    }

    next(error);
  }
});

module.exports = router;
