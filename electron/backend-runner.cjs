/*
  Backend launcher wrapper used ONLY by the Electron main process.

  It starts the existing backend exactly as-is (require of server.js) and
  adds one desktop-only safety: a watchdog that exits this process if the
  Electron parent process dies (crash, taskkill, reboot logout). Without it,
  a force-killed Electron window would leave an orphan backend holding the
  port. The backend source itself is not modified in any way.
*/

const path = require("path");

const parentPid = parseInt(process.env.SABAWOON_PARENT_PID || "", 10);

if (Number.isFinite(parentPid) && parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // probe only — throws if parent is gone
    } catch {
      console.error(
        `[backend-runner] Electron parent (PID ${parentPid}) is gone — shutting down backend.`,
      );
      process.exit(0);
    }
  }, 3000);
}

// Start the unmodified backend.
// The main process passes SABAWOON_BACKEND_DIR in the packaged app
// (<install>\resources\backend); in development we fall back to the repo's
// backend/ directory next to this file.
const backendDir =
  process.env.SABAWOON_BACKEND_DIR || path.join(__dirname, "..", "backend");

require(path.join(backendDir, "src", "server.js"));
