require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = parseInt(process.env.PORT || "5478", 10);

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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  }),
);

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

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
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

app.use("/api/assignments", require("./routes/assignments"));

app.use("/api/timetable", require("./routes/timetable"));

app.use("/api/dashboard", require("./routes/dashboard"));

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sabawoon Academy server listening on port ${PORT}`);
});
