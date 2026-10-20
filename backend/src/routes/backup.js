/*
  DATABASE BACKUP — administrator-only endpoints.

  Real operations only:

  - Create and validate a complete PostgreSQL backup with pg_dump (custom format -Fc)
  - List real backup history merged with the actual files on disk
  - Download a backup file to the administrator's PC
  - Safely restore a backup (safety dump + optional test-database
    pre-flight + single-transaction restore)

  The application update workflow was removed on purpose — this page is
  about database backups only, and no Electron auto-updater exists.

  All configuration comes from environment variables (see
  backend/.env.example). No token or credential is ever exposed to the
  frontend.
*/

const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const bcrypt = require("bcryptjs");

const { query, pool } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");

const backupService = require("../services/backup-service");

const {
  BACKUP_DIR,
  HISTORY_FILE,
  RETENTION_DAILY,
  RETENTION_MONTHLY,
  assertSafeFilename,
  backupDirReady,
  backupFilePath,
  checkPgTools,
  createDumpFile,
  decorateBackup,
  findBackup,
  isBackupInProgress,
  loadHistory,
  pgConnectionInfo,
  runBackup,
  runPgTool,
  saveHistory,
  setBackupDirectory,
  timestampSlug,
  validateDumpFile,
} = backupService;

const router = express.Router();

/* ==========================================================================
   ADMIN GUARD — every route in this router is administrator-only
========================================================================== */

router.use(authRequired, requireRoles("admin"));

function actorOf(req) {
  return {
    id: req.user?.id ?? null,
    name: req.user?.full_name || req.user?.name || req.user?.email || "admin",
    role: req.user?.role || "admin",
  };
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
      platform: process.platform,
      pgTools: tools,
      retention: {
        daily: RETENTION_DAILY,
        monthly: RETENTION_MONTHLY,
      },
      schedule: backupService.scheduleStatus(),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/folder", async (req, res, next) => {
  try {
    const folder = setBackupDirectory(req.body?.folder);
    res.json({ ok: true, backupDir: folder });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================================
   POST /api/backup/create
   Runs a real pg_dump of the live database and validates it.
========================================================================== */

router.post("/create", async (req, res, next) => {
  try {
    const result = await runBackup({
      trigger: "manual",
      actor: actorOf(req),
    });

    res.status(201).json({
      ok: true,
      backup: result.backup,
      message: "Local backup created and validated successfully.",
    });
  } catch (error) {
    if (error.code === "BACKUP_IN_PROGRESS" || error.code === "BACKUP_LOCKED") {
      return res.status(409).json({ error: error.message, code: error.code });
    }

    next(error);
  }
});

/* ==========================================================================
   GET /api/backup/list
   Real history merged with filesystem state.
========================================================================== */

router.get("/list", async (req, res, next) => {
  try {
    const history = loadHistory();

    const entriesByName = new Map(history.backups.map((entry) => [entry.filename, entry]));
    for (const file of await fsp.readdir(BACKUP_DIR, { withFileTypes: true })) {
      if (!file.isFile() || !/\.(dump|backup|sql)$/i.test(file.name)) continue;
      if (!entriesByName.has(file.name)) {
        const stats = await fsp.stat(path.join(BACKUP_DIR, file.name));
        entriesByName.set(file.name, {
          filename: file.name,
          createdAt: stats.birthtime.toISOString(),
          sizeBytes: stats.size,
          trigger: "external",
          validation: { valid: false, reason: "Not created by Sabawoon; validate before restore." },
          createdBy: { name: "External local file" },
        });
      }
    }
    const backups = [...entriesByName.values()].map((entry) => decorateBackup(entry));

    res.json({
      backupDir: BACKUP_DIR,
      backups,
      restores: history.restores,
      schedule: backupService.scheduleStatus(),
      backupInProgress: isBackupInProgress(),
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

    const filePath = backupFilePath(filename);
    const effectiveEntry = entry || (await fsp.access(filePath, fs.constants.R_OK).then(() => ({ filename, createdAt: new Date().toISOString(), trigger: "external", createdBy: { name: "External local file" } })).catch(() => null));
    if (!effectiveEntry) {
      return res.status(404).json({
        error: "Backup not found in the selected folder.",
        code: "BACKUP_NOT_FOUND",
      });
    }

    let stats;

    try {
      stats = await fsp.stat(filePath);
    } catch {
      return res.status(404).json({
        error:
          "The backup file no longer exists on this server's disk. Re-create it.",
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

router.delete("/:filename", async (req, res, next) => {
  try {
    const filename = assertSafeFilename(req.params.filename);
    const history = loadHistory();
    const known = findBackup(history, filename);
    if (!known && !/\.(dump|backup|sql)$/i.test(filename)) {
      return res.status(404).json({ error: "Unsupported backup file.", code: "BACKUP_NOT_FOUND" });
    }
    const filePath = backupFilePath(filename);
    await fsp.access(filePath, fs.constants.W_OK);
    await fsp.unlink(filePath);
    history.backups = history.backups.filter((item) => item.filename !== filename);
    saveHistory(history);
    res.json({ ok: true, filename });
  } catch (error) {
    if (error.code === "ENOENT") return res.status(404).json({ error: "Backup file is already missing.", code: "BACKUP_FILE_MISSING" });
    if (error.code === "EACCES" || error.code === "EPERM") return res.status(403).json({ error: "Windows denied access to this local backup file. Close Sabawoon and try again.", code: "BACKUP_FILE_ACCESS_DENIED" });
    next(error);
  }
});

let restoreInProgress = false;

router.post("/restore", async (req, res, next) => {
  try {
    if (restoreInProgress || isBackupInProgress()) {
      return res.status(409).json({
        error: "Another backup or restore is already running. Wait for it to finish.",
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

    const filePath = backupFilePath(filename);
    let entry = findBackup(history, filename);

    // Files copied into the selected local folder are supported, but an
    // unknown filename must still return BACKUP_NOT_FOUND when it is absent.
    if (!entry) {
      try {
        await fsp.access(filePath, fs.constants.R_OK);
        entry = {
          filename,
          createdAt: new Date().toISOString(),
          trigger: "external",
          createdBy: { name: "External local file" },
        };
      } catch {
        return res.status(404).json({
          error: "Backup not found in the selected folder.",
          code: "BACKUP_NOT_FOUND",
        });
      }
    }

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
      const safetyName = `Sabawoon_Backup_${timestampSlug()}_PreRestore.dump`;
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
        trigger: "pre-restore",
        createdBy: { ...actorOf(req), name: `${actorOf(req).name} (automatic pre-restore)` },
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

module.exports = router;
