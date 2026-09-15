require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = parseInt(process.env.PORT || "5478");

// Ensure upload dirs
const upDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
["assignments", "submissions", "avatars"].forEach((d) => {
  const p = path.join(upDir, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.set("trust proxy", 1);
app.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
);
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Basic rate limit on auth
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
app.use("/api/auth/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// Static uploads
app.use("/uploads", express.static(upDir));

// Health
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() }),
);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/students", require("./routes/students"));
app.use("/api/classes", require("./routes/classes"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/marks", require("./routes/marks"));
app.use("/api/fees", require("./routes/fees"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/timetable", require("./routes/timetable"));
app.use("/api/dashboard", require("./routes/dashboard"));

// Serve frontend build
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ error: err.message || "Internal server error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`H_M SMS server listening on port ${PORT}`);
});
