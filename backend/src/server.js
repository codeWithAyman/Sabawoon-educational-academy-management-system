require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const os = require("os");
const rateLimit = require("express-rate-limit");
const { query } = require("./db/pool");

const app = express();

const parsedPort = parseInt(process.env.PORT || "5478", 10);

/*
  Ignore nonsense PORT values (empty, 0, negative, non-numeric) so a
  stray environment variable can never make the server bind a random
  port that no phone, tablet or desktop shortcut knows about.
*/

const PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
    ? parsedPort
    : 5478;

/* ==========================================================================
   UPLOAD DIRECTORIES
========================================================================== */

const upDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");

["assignments", "submissions", "avatars"].forEach((directory) => {
  const directoryPath = path.join(upDir, directory);

  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
});

/* ==========================================================================
   BASIC SERVER CONFIG
========================================================================== */

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

/*
  CORS

  The production frontend is served by THIS SAME server (see FRONTEND
  BUILD below), so every browser request from a PC, phone or tablet is
  same-origin and needs no CORS headers at all.

  CORS stays disabled unless CORS_ORIGIN is set explicitly. Only set it
  when you deliberately host the frontend on a different origin during
  development (e.g. http://localhost:5173 pointing straight at the API).
  Never use "*" in production — it is not needed and weakens safety.
*/

const corsOrigin = process.env.CORS_ORIGIN;

if (corsOrigin) {
  app.use(cors({ origin: corsOrigin }));
}

app.use(
  express.json({
    limit: "5mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb",
  }),
);

/* ==========================================================================
   AUTH RATE LIMIT
========================================================================== */

app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
  }),
);

app.use(
  "/api/auth/register",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
  }),
);

/* ==========================================================================
   STATIC UPLOADS
========================================================================== */

app.use("/uploads", express.static(upDir));

/* ==========================================================================
   HEALTH CHECK
========================================================================== */

/*
  HEALTH CHECK

  Always answers 200 once the HTTP server is up so the desktop app does
  not start a duplicate backend; the "database" field reports PostgreSQL
  reachability for diagnostics.
*/

let lastDatabaseCheck = { at: 0, ok: false };

async function checkDatabase(force = false) {
  const now = Date.now();

  if (!force && now - lastDatabaseCheck.at < 5000) {
    return lastDatabaseCheck.ok;
  }

  try {
    await query("SELECT 1");
    lastDatabaseCheck = { at: now, ok: true };
  } catch {
    lastDatabaseCheck = { at: now, ok: false };
  }

  return lastDatabaseCheck.ok;
}

app.get("/api/health", async (req, res) => {
  const databaseOk = await checkDatabase();

  res.json({
    status: databaseOk ? "ok" : "degraded",
    database: databaseOk ? "connected" : "unreachable",
    time: new Date().toISOString(),
  });
});

/* ==========================================================================
   API ROUTES
========================================================================== */

app.use("/api/auth", require("./routes/auth"));

app.use("/api/users", require("./routes/users"));

app.use("/api/students", require("./routes/students"));

app.use("/api/classes", require("./routes/classes"));

app.use("/api/attendance", require("./routes/attendance"));

app.use("/api/marks", require("./routes/marks"));

app.use("/api/fees", require("./routes/fees"));

/*
  FINANCE
  Admin-only financial calculations and cash reconciliation.
*/
app.use("/api/finance", require("./routes/finance"));
app.use("/api/inventory", require("./routes/inventory"));

app.use("/api/assignments", require("./routes/assignments"));

app.use("/api/timetable", require("./routes/timetable"));

app.use("/api/dashboard", require("./routes/dashboard"));

/*
  UPDATES & BACKUP
  Administrator-only database backup / restore and GitHub release checks.
*/
app.use("/api/backup", require("./routes/backup"));

/* ==========================================================================
   FRONTEND BUILD
========================================================================== */

const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

/* ==========================================================================
   ERROR HANDLER
========================================================================== */

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

/* ==========================================================================
   START SERVER
========================================================================== */

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sabawoon Academy server listening on port ${PORT}`);

  /*
    Print the addresses this system can be opened from.
    Phones and tablets on the same Wi-Fi use the LAN address.
  */

  const lanUrls = [];

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        lanUrls.push(`http://${entry.address}:${PORT}`);
      }
    }
  }

  console.log(`Open on this PC: http://localhost:${PORT}`);

  if (lanUrls.length) {
    console.log(
      `Open on phones/tablets on the same Wi-Fi: ${lanUrls.join("  or  ")}`,
    );
  } else {
    console.log(
      "No LAN network detected — connect this PC to the Wi-Fi router to " +
        "allow phones and tablets to connect.",
    );
  }

  /*
    PostgreSQL check (informational only — the server keeps running so a
    briefly-starting database does not kill an otherwise healthy setup).
  */

  checkDatabase(true).then((databaseOk) => {
    if (!databaseOk) {
      console.error(
        "WARNING: cannot reach PostgreSQL. Check that the PostgreSQL " +
          "service is running and DATABASE_URL is correct. The server is " +
          "up, but login and data pages will fail until the database is " +
          "reachable.",
      );
    }
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Another copy of the Sabawoon ` +
        "backend (or a different program) is already running. Close it, " +
        "or set a different PORT in the configuration file, then try " +
        "again.",
    );
  } else {
    console.error(`Server failed to start: ${error.message}`);
  }

  process.exit(1);
});
