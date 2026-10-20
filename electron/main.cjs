/*
  SABAWOON ACADEMY — Electron main process

  Wraps the EXISTING application with the minimum possible changes:

  - Starts the existing Express backend (backend/src/server.js) as a child
    process and waits for /api/health before loading the frontend.
  - If a backend is ALREADY running on the port (e.g. started manually, or as
    a Windows service), it is reused — never a duplicate instance — and it is
    never killed on exit. Only a backend this app spawned is shut down.
  - Loads the same frontend the backend serves (relative /api URLs keep
    working unchanged), so the tablet/LAN access strategy is untouched.
  - contextIsolation: true, nodeIntegration: false — no Node access in the
    renderer.

  Configuration (packaged app):
  - The backend reads %APPDATA%\Sabawoon Educational Academy\config.env
    (DATABASE_URL, JWT_SECRET, ...) — the same keys as backend/.env. No .env
    file is ever packaged into the installer. Uploads and backup files are
    also written under the user-data directory, never inside the install
    folder.
  - resources\backend (code + its node_modules) and resources\frontend\dist
    are real files copied at install time; the backend serves the frontend
    exactly as it does in development.
*/

const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");
const http = require("http");

/* ==========================================================================
   CONSTANTS
========================================================================== */

const APP_TITLE = "Sabawoon Educational Academy Management System";

const PORT = (() => {
  const parsed = parseInt(process.env.SABAWOON_PORT || "5478", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5478;
})();

const BACKEND_URL = `http://127.0.0.1:${PORT}`;

let backendProcess = null;
let ownedBackend = false; // true only if WE spawned it
let shuttingDown = false;
let mainWindow = null;
let backendLogTail = [];

/* ==========================================================================
   PATHS
========================================================================== */

function backendDir() {
  // Development: the repo's backend/ directory. Packaged: the backend (with
  // its own node_modules) is copied to <install>\resources\backend as real
  // files — the plain-Node child process runs from there, never from source.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }

  return path.join(__dirname, "..", "backend");
}

function serverScriptPath() {
  // electron/backend-runner.cjs starts the unmodified backend and exits it
  // if this Electron process dies, so no orphan backend can hold the port.
  // Packaged: electron/ lives unpacked on real disk (app.asar.unpacked) so
  // the Node child can load it — normalize the path just in case.
  const scriptDir =
    app.isPackaged && !__dirname.includes("app.asar.unpacked")
      ? __dirname.replace("app.asar", "app.asar.unpacked")
      : __dirname;

  return path.join(scriptDir, "backend-runner.cjs");
}

function devIconPath() {
  return path.join(__dirname, "..", "frontend", "src", "assets", "sabawoon-logo.png");
}

/* ==========================================================================
   USER CONFIG (packaged) — %APPDATA%\Sabawoon Educational Academy\config.env
========================================================================== */

function userConfigPath() {
  return path.join(app.getPath("userData"), "config.env");
}

function loadUserConfig() {
  const file = userConfigPath();
  const config = {};

  if (!fs.existsSync(file)) {
    return config;
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    config[key] = value;
  }

  return config;
}

function persistBackupFolder(folder) {
  const file = userConfigPath();
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => !/^BACKUP_DIR=/i.test(line));
  lines.push(`BACKUP_DIR=${folder}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.filter(Boolean).join("\n")}\n`, "utf8");
}

/* ==========================================================================
   BACKEND LIFECYCLE
========================================================================== */

function probeBackend(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(`${BACKEND_URL}/api/health`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await probeBackend()) {
      return true;
    }

    // If the backend we spawned has already died, stop waiting.
    if (ownedBackend && backendProcess && backendProcess.exitCode !== null) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

/*
   BACKUP DIRECTORY (packaged)

   Backups must live OUTSIDE the installation folder so they survive
   updates and reinstalls: %APPDATA%\Sabawoon Educational Academy\backups.
   The user can still override it with BACKUP_DIR in config.env.
*/

function backupDirPath() {
  return path.join(app.getPath("userData"), "backups");
}

function backupEnv(userConfig) {
  if (!app.isPackaged) {
    return {}; // development: backend/.env decides (default backend/backups)
  }

  return {
    BACKUP_DIR: userConfig.BACKUP_DIR || backupDirPath(),
    // Used by the backend to relocate backups from old installs.
    SABAWOON_BACKEND_DIR: backendDir(),
  };
}

function startBackend() {
  const script = serverScriptPath();

  if (!fs.existsSync(script)) {
    throw new Error(
      `Backend entry point not found: ${script}\n` +
        "The application files may be incomplete or damaged.",
    );
  }

  const userConfig = loadUserConfig();
  const packaged = app.isPackaged;

  const env = {
    ...process.env,
    ...userConfig, // user config wins over inherited env
    ...backupEnv(userConfig),
    PORT: String(PORT),
    // Watchdog: the runner shuts the backend down if this process dies.
    SABAWOON_PARENT_PID: String(process.pid),
    // Where the backend code lives (packaged: resources\backend).
    SABAWOON_BACKEND_DIR: backendDir(),
    // Use Electron's bundled Node runtime — no separate Node.js installation
    // is required by the installed application.
    ELECTRON_RUN_AS_NODE: "1",
  };

  const options = {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // Development: backend/.env is loaded by dotenv from this directory.
    // Packaged: the user-data directory holds uploads/ and backups/ and is
    // the only writable location (the install directory may be read-only).
    cwd: packaged ? app.getPath("userData") : backendDir(),
  };

  backendLogTail = [];
  backendProcess = spawn(process.execPath, [script], options);
  ownedBackend = true;

  const keepTail = (chunk) => {
    const text = chunk.toString();
    backendLogTail.push(text);
    backendLogTail = backendLogTail.slice(-40);
    process.stdout.write(`[backend] ${text}`);
  };

  backendProcess.stdout.on("data", keepTail);
  backendProcess.stderr.on("data", keepTail);

  backendProcess.on("error", (error) => {
    backendProcess = null;

    if (!shuttingDown) {
      dialog.showErrorBox(
        `${APP_TITLE} — backend error`,
        `Could not start the backend process:\n\n${error.message}`,
      );
      app.quit();
    }
  });

  backendProcess.on("exit", (code, signal) => {
    backendProcess = null;

    if (!shuttingDown) {
      dialog.showErrorBox(
        `${APP_TITLE} — backend stopped`,
        `The backend process exited unexpectedly (code ${code}${
          signal ? `, signal ${signal}` : ""
        }).\n\nRecent backend output:\n\n${backendLogTail.join("").slice(-2000) ||
          "(no output)"}\n\n` +
          "Common causes: PostgreSQL is not running, the database URL is " +
          `wrong, or the port ${PORT} is already used by another program.\n\n` +
          `Configuration file: ${userConfigPath()}`,
      );

      app.quit();
    }
  });
}

function stopBackend() {
  // Only ever stop a backend process this application spawned. A backend the
  // user runs themselves (service, PM2, terminal) is left untouched.
  if (ownedBackend && backendProcess && backendProcess.exitCode === null) {
    try {
      backendProcess.kill();
    } catch (error) {
      console.error("Failed to stop backend process:", error);
    }
  }

  backendProcess = null;
}

/* ==========================================================================
   RENDERER
========================================================================== */

function resolveRendererUrl() {
  // Development with hot reload: point ELECTRON_RENDERER_URL at the Vite dev
  // server (http://localhost:5173). Everything else loads the production
  // frontend served by the backend itself.
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL;
  }

  return BACKEND_URL;
}

function createWindow() {
  const iconPath = devIconPath();

  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0b0d10",
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Links that would open a new window (target="_blank", e.g. GitHub release
  // links on the Updates & Backup page) open in the default browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  // Keep navigation inside the application. External links go to the browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = new Set([BACKEND_URL, resolveRendererUrl()]);

    if (!allowed.has(url.replace(/\/$/, ""))) {
      event.preventDefault();

      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(resolveRendererUrl());
}

/* ==========================================================================
   SCHEDULED DAILY BACKUP MODE ("--run-daily-backup")

   Invoked by the Windows scheduled task "Sabawoon Academy Daily Backup"
   while the application is CLOSED. It runs the standalone backup runner
   with Electron's Node runtime (no separate Node.js installation needed),
   prints the result and exits with its exit code. No window is shown and
   no backend HTTP server is started, so it never conflicts with a running
   application — the backup service's run lock keeps jobs from overlapping.
========================================================================== */

function runScheduledBackupAndExit() {
  const runner = path.join(backendDir(), "src", "services", "run-scheduled-backup.cjs");

  if (!fs.existsSync(runner)) {
    console.error(`[electron] Backup runner not found: ${runner}`);
    app.exit(1);
    return;
  }

  const userConfig = loadUserConfig();

  const child = spawn(process.execPath, [runner], {
    env: {
      ...process.env,
      ...userConfig,
      ...backupEnv(userConfig),
      // Run this Electron binary as plain Node.js.
      ELECTRON_RUN_AS_NODE: "1",
    },
    cwd: app.isPackaged ? app.getPath("userData") : backendDir(),
    windowsHide: true,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`[electron] Could not run the scheduled backup: ${error.message}`);
    app.exit(1);
  });

  child.on("exit", (code) => {
    app.exit(Number.isInteger(code) ? code : 1);
  });
}

/* ==========================================================================
   WINDOWS SCHEDULED TASK (daily backups while the app is closed)

   Registered for the current user, every day at BACKUP_DAILY_AT (default
   04:00). The task name is fixed and created with /F (overwrite), so tasks
   can never accumulate or duplicate. Registration is best-effort: failures
   are logged and the in-application scheduler still runs daily backups
   whenever the app is open.
========================================================================== */

const BACKUP_TASK_NAME = "Sabawoon Academy Daily Backup";

function registerDailyBackupTask() {
  if (!app.isPackaged || process.platform !== "win32") return;

  if ((process.env.SABAWOON_BACKUP_TASK || "").trim() === "off") return;

  const userConfig = loadUserConfig();

  const raw = (userConfig.BACKUP_DAILY_AT || process.env.BACKUP_DAILY_AT || "04:00").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  const time = match
    ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`
    : "04:00";

  const exe = process.execPath;
  const trigger = `"${exe}" --run-daily-backup`;

  execFile(
    "schtasks",
    ["/Create", "/SC", "DAILY", "/ST", time, "/TN", BACKUP_TASK_NAME, "/TR", trigger, "/F"],
    { windowsHide: true },
    (error) => {
      if (error) {
        console.error(
          `[electron] Could not register the daily backup task: ${error.message}. ` +
            "Backups still run automatically whenever the application is open.",
        );
        return;
      }

      console.log(
        `[electron] Daily backup task registered: "${BACKUP_TASK_NAME}" runs every day at ${time}.`,
      );
    },
  );
}

/* ==========================================================================
   APP LIFECYCLE
========================================================================== */

ipcMain.handle("backup:choose-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose Sabawoon backup folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled) return null;
  persistBackupFolder(result.filePaths[0]);
  return result.filePaths[0];
});

ipcMain.handle("backup:open-folder", async (_event, folder) => {
  if (typeof folder !== "string" || !path.isAbsolute(folder)) throw new Error("Invalid backup folder.");
  const result = await shell.openPath(folder);
  if (result) throw new Error(result);
  return true;
});

ipcMain.handle("app:get-info", () => ({
  appVersion: app.getVersion(),
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  platform: process.platform,
  backendPort: PORT,
  backendUrl: BACKEND_URL,
  packaged: app.isPackaged,
  userDataPath: app.getPath("userData"),
  configPath: userConfigPath(),
}));

async function bootstrap() {
  // Scheduled backup mode: run the backup and exit. Never takes the
  // single-instance lock, so it works alongside an open application.
  if (process.argv.includes("--run-daily-backup")) {
    await app.whenReady();
    runScheduledBackupAndExit();
    return;
  }

  // Single instance: a second launch focuses the existing window instead of
  // starting a second backend or window.
  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.focus();
    }
  });

  await app.whenReady();

  // Keep the Windows scheduled task in sync with the configured time.
  registerDailyBackupTask();

  try {
    if (await probeBackend()) {
      // A backend is already running (user-managed). Reuse it; never kill it.
      console.log(`[electron] Reusing existing backend at ${BACKEND_URL}`);
    } else {
      console.log("[electron] Starting backend…");
      startBackend();

      const ready = await waitForBackend();

      if (!ready) {
        dialog.showErrorBox(
          `${APP_TITLE} — backend did not start`,
          `The backend did not become ready at ${BACKEND_URL} in time.\n\n` +
            `Recent backend output:\n\n${backendLogTail.join("").slice(-2000) ||
              "(no output)"}\n\n` +
            "Check that PostgreSQL is running and that the configuration " +
            `file exists:\n${userConfigPath()}\n\n` +
            "Required keys: DATABASE_URL, JWT_SECRET (same keys as " +
            "backend/.env).",
        );

        app.quit();
        return;
      }
    }

    await createWindow();
  } catch (error) {
    dialog.showErrorBox(`${APP_TITLE} — startup failed`, error.message || String(error));
    app.quit();
  }
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  shuttingDown = true;
  stopBackend();
});

bootstrap();
