/*
  SCHEDULED BACKUP RUNNER

  Standalone entry point that performs the daily database backup without
  needing the application (or its HTTP server) to be open. It is executed:

    - by the Windows scheduled task "Sabawoon Academy Daily Backup"
      (registered automatically by the packaged Electron app), which runs:
        "<install>\Sabawoon Educational Academy.exe" --run-daily-backup
        → electron/main.cjs spawns THIS file with Electron's Node runtime
    - manually in development:  npm run backup:scheduled

  It only dumps, validates, and records the backup locally.
  It never touches existing records and exits non-zero on failure so Task
  Scheduler can show the outcome.

  Configuration comes from the same environment as the backend:
    - development:        backend/.env        (loaded below)
    - packaged desktop:   %APPDATA%\Sabawoon Educational Academy\config.env
      (the Electron main process passes these values in the environment).
*/

const path = require("path");

// Load backend/.env when running from the repository. In the packaged app
// the configuration arrives as environment variables from the Electron main
// process (config.env), and dotenv simply finds nothing to load.
require("dotenv").config({
  path: path.join(__dirname, "..", "..", ".env"),
});

if (!process.env.DATABASE_URL) {
  console.error(
    "[backup] DATABASE_URL is not configured — the scheduled backup cannot " +
      "run. Check the application's configuration file (backend/.env in " +
      "development, config.env in the installed application).",
  );

  process.exit(1);
}

const backupService = require("./backup-service");

(async () => {
  console.log(
    `[backup] Scheduled run started at ${new Date().toISOString()} ` +
      `(backup dir: ${backupService.BACKUP_DIR})`,
  );

  try {
    const result = await backupService.runScheduledBackupIfDue();

    if (result.skipped) {
      console.log("[backup] Everything is up to date — nothing to do.");
      process.exit(0);
    }

    console.log(
      `[backup] Created ${result.backup.filename} ` +
        `(${result.backup.currentSizeBytes ?? result.backup.sizeBytes} bytes). ` +
        "Stored locally only.",
    );

    process.exit(0);
  } catch (error) {
    console.error(`[backup] Scheduled backup FAILED: ${error.message}`);

    process.exit(1);
  }
})();
