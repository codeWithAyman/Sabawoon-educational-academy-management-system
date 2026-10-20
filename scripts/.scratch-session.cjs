/*
  DISPOSABLE UI TEST SESSION — never touches the live academy database.

  Creates a throwaway PostgreSQL cluster (production schema via a
  read-only pg_dump of the live structure), seeds a minimal ACTIVE academy
  (admin, teacher, subject, ACTIVE class slot, student + enrollment), then
  runs the real backend on port 5479. The dev Electron app is pointed at
  this backend with SABAWOON_PORT=5479 so the §9 dialog tests can walk the
  full Add-Student -> class slot -> PasswordConfirmModal flow with real
  click focus and typing.

  The session HOLDS everything alive until <scratch>/STOP exists, then
  tears the cluster down and deletes the scratch directory. Run it as a
  BACKGROUND process; poll http://127.0.0.1:5479/api/health for readiness.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const SCRATCH = path.join(os.tmpdir(), `sabawoon-ui-${Date.now()}`);
const DATA_DIR = path.join(SCRATCH, "data");
const PG_PORT = 5499;
const API_PORT = 5479;
const API_DB = "hm_sms_ui";
const BACKUP_DIR = path.join(SCRATCH, "backups");
const STOP_FILE = path.join(SCRATCH, "STOP");
const READY_FILE = path.join(SCRATCH, "READY");

require(path.join(ROOT, "backend", "node_modules", "dotenv")).config({
  path: path.join(ROOT, "backend", ".env"),
});
const bcrypt = require(path.join(ROOT, "backend", "node_modules", "bcryptjs"));
const { Client } = require(path.join(ROOT, "backend", "node_modules", "pg"));

const API_DB_URL = `postgresql://postgres@127.0.0.1:${PG_PORT}/${API_DB}`;

function log(msg) {
  console.log(`[ui-session] ${msg}`);
}

async function apiDbQuery(sql, params) {
  const c = new Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", database: API_DB });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  log(`scratch in ${SCRATCH}`);

  // ---- 1. throwaway cluster ------------------------------------------------
  const init = spawnSync(
    path.join(PG_BIN, "initdb.exe"),
    ["-D", DATA_DIR, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"],
    { encoding: "utf8" },
  );
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr}`);

  const pgCtl = path.join(PG_BIN, "pg_ctl.exe");
  // pg_ctl -w does not return reliably when its stdout is a pipe on this
  // machine, so start it detached and wait for TCP readiness instead.
  spawn(pgCtl, ["-D", DATA_DIR, "-o", `-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=`, "-l", path.join(SCRATCH, "server.log"), "-w", "-t", "30", "start"], {
    stdio: "ignore",
    windowsHide: true,
  });
  let clusterUp = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const probe = new Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", database: "postgres" });
      await probe.connect();
      await probe.query("SELECT 1");
      await probe.end();
      clusterUp = true;
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!clusterUp) throw new Error("scratch cluster did not become reachable");

  // ---- 2. production-shaped schema (read-only live dump) -------------------
  const u = new URL(process.env.DATABASE_URL);
  const dumpFile = path.join(SCRATCH, "live-schema.sql");
  const dump = spawnSync(
    path.join(PG_BIN, "pg_dump.exe"),
    [
      "--schema-only", "--no-owner", "--no-privileges",
      "-h", u.hostname || "localhost",
      "-p", u.port || "5432",
      "-U", decodeURIComponent(u.username || ""),
      "-d", (u.pathname || "/").replace(/^\//, ""),
      "-f", dumpFile,
    ],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password || "") }, encoding: "utf8" },
  );
  if (dump.status !== 0) throw new Error(`pg_dump failed: ${dump.stderr}`);

  const admin = new Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", database: "postgres" });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${API_DB}"`);
  await admin.end();

  const restored = spawnSync(
    path.join(PG_BIN, "psql.exe"),
    ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-d", API_DB, "-v", "ON_ERROR_STOP=1", "-f", dumpFile],
    { encoding: "utf8" },
  );
  if (restored.status !== 0) throw new Error(`psql restore failed: ${restored.stderr}`);

  // Apply the shipped migrations so the schema matches the real upgrade path.
  const migrate = spawnSync(process.execPath, [path.join(ROOT, "backend", "src", "db", "migrate.js")], {
    cwd: path.join(ROOT, "backend"),
    env: { ...process.env, DATABASE_URL: API_DB_URL },
    encoding: "utf8",
  });
  if (migrate.status !== 0) throw new Error(`migrate failed: ${migrate.stderr || migrate.stdout}`);
  log("schema ready (production shape + migrations)");

  // ---- 3. seed a minimal ACTIVE academy ------------------------------------
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await apiDbQuery(
    `INSERT INTO users (email, password_hash, role, full_name, is_active)
     VALUES ($1, $2, 'admin', 'Scratch Admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE`,
    [process.env.ADMIN_EMAIL, hash],
  );
  const adminUser = await apiDbQuery(`SELECT id FROM users WHERE email = $1`, [process.env.ADMIN_EMAIL]);
  const adminId = adminUser.rows[0].id;

  const teacher = await apiDbQuery(
    `INSERT INTO users (email, password_hash, role, full_name, is_active)
     VALUES ('scratch-teacher@test.local', $1, 'teacher', 'Scratch Teacher', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [hash],
  );
  const teacherId = teacher.rows[0].id;
  // class_slots.teacher_id references TEACHERS(id) on this database — seed a
  // teachers row matching the teacher user's id, adapting to available columns.
  const teacherCols = await apiDbQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_name='teachers' AND table_schema=current_schema()`,
  );
  if (teacherCols.rows.length) {
    const colSet = new Set(teacherCols.rows.map((r) => r.column_name));
    const tSeed = { id: teacherId, employee_id: "SC-1" };
    if (colSet.has("user_id")) tSeed.user_id = teacherId;
    if (colSet.has("full_name")) tSeed.full_name = "Scratch Teacher";
    const tNames = Object.keys(tSeed);
    await apiDbQuery(
      `INSERT INTO teachers (${tNames.join(",")})
       VALUES (${tNames.map((_, i) => `$${i + 1}`).join(",")})
       ON CONFLICT (id) DO NOTHING`,
      tNames.map((c) => tSeed[c]),
    );
  }

  const subject = await apiDbQuery(
    `INSERT INTO subjects (name, code) VALUES ('UI Subject', 'UI-1')
     ON CONFLICT (name) DO UPDATE SET code = EXCLUDED.code RETURNING id`,
  );
  const subjectId = subject.rows[0].id;

  const book = await apiDbQuery(
    `INSERT INTO subject_books (subject_id, name) VALUES ($1, 'UI Level One')
     ON CONFLICT (subject_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [subjectId],
  );
  const bookId = book.rows[0].id;

  const types = await apiDbQuery(`SELECT id FROM class_types WHERE name = 'Male'`);
  const maleTypeId = types.rows[0]?.id ?? null;

  const slotCols = await apiDbQuery(
    `SELECT column_name FROM information_schema.columns WHERE table_name='class_slots' AND table_schema=current_schema()`,
  );
  const slotColSet = new Set(slotCols.rows.map((r) => r.column_name));
  const slotSeed = { subject_id: subjectId, teacher_id: teacherId, start_time: "10:00", end_time: "11:00" };
  if (slotColSet.has("days")) slotSeed.days = "Sat";
  if (slotColSet.has("room")) slotSeed.room = "R1";
  if (slotColSet.has("academic_year")) slotSeed.academic_year = "2026";
  if (slotColSet.has("class_type_id")) slotSeed.class_type_id = maleTypeId;
  if (slotColSet.has("level")) slotSeed.level = "UI Level One";
  if (slotColSet.has("is_active")) slotSeed.is_active = true;
  const slotColNames = Object.keys(slotSeed);
  const slot = await apiDbQuery(
    `INSERT INTO class_slots (${slotColNames.join(",")})
     VALUES (${slotColNames.map((_, i) => `$${i + 1}`).join(",")})
     ON CONFLICT DO NOTHING
     RETURNING id`,
    slotColNames.map((c) => slotSeed[c]),
  );
  const slotId = slot.rows[0]?.id ?? (await apiDbQuery(`SELECT id FROM class_slots WHERE subject_id = $1 LIMIT 1`, [subjectId])).rows[0].id;
  await apiDbQuery(
    `INSERT INTO class_slot_books (class_slot_id, book_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [slotId, bookId],
  );

  // Active student + enrollment so the Edit flow works too.
  const st = await apiDbQuery(
    `INSERT INTO students (full_name, roll_number, guardian_name, is_active)
     VALUES ('UI Student', 'UI-001', 'UI Guardian', TRUE)
     ON CONFLICT (roll_number) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = TRUE
     RETURNING id`,
  );
  await apiDbQuery(
    `INSERT INTO student_enrollments (student_id, class_slot_id, is_active)
     VALUES ($1, $2, TRUE) ON CONFLICT (student_id, class_slot_id) DO UPDATE SET is_active = TRUE`,
    [st.rows[0].id, slotId],
  );
  log("seeded active academy (admin, teacher, subject, active slot, student)");

  // ---- 4. real backend on port 5479 ---------------------------------------
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(API_PORT),
    DATABASE_URL: API_DB_URL,
    JWT_SECRET: "scratch-ui-jwt-secret",
    JWT_EXPIRES_IN: "1h",
    UPLOAD_DIR: path.join(SCRATCH, "uploads"),
    BACKUP_DIR,
    PG_BIN_DIR: PG_BIN,
    APP_VERSION: "1.0.3-test",
    CORS_ORIGIN: "",
    GITHUB_TOKEN: "",
    GITHUB_BACKUP_REPO: "",
    GITHUB_BACKUP_REPO_OWNER: "",
    GITHUB_BACKUP_REPO_NAME: "",
    SABAWOON_BACKUP_TASK: "off",
  };
  delete childEnv.GITHUB_RELEASE_REPO_OWNER;
  delete childEnv.GITHUB_RELEASE_REPO_NAME;

  const backend = spawn(process.execPath, [path.join(ROOT, "backend", "src", "server.js")], {
    cwd: path.join(ROOT, "backend"),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let backendLog = "";
  backend.stdout.on("data", (d) => (backendLog += d));
  backend.stderr.on("data", (d) => (backendLog += d));

  let healthy = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
      if (res.ok) { healthy = true; break; }
    } catch { /* not up yet */ }
    await sleep(500);
  }
  if (!healthy) throw new Error(`backend on ${API_PORT} never became healthy:\n${backendLog}`);

  log(`backend ready on http://127.0.0.1:${API_PORT}`);
  fs.writeFileSync(READY_FILE, JSON.stringify({ port: API_PORT, scratch: SCRATCH }));

  // ---- 5. hold until STOP --------------------------------------------------
  while (!fs.existsSync(STOP_FILE)) {
    if (backend.exitCode !== null) {
      log(`backend exited early (${backend.exitCode}):\n${backendLog.slice(-800)}`);
      break;
    }
    await sleep(1500);
  }

  log("stop requested — tearing down");
  try { backend.kill(); } catch {}
  await sleep(800);
  try {
    spawnSync(pgCtl, ["-D", DATA_DIR, "-m", "immediate", "-w", "-t", "15", "stop"], { encoding: "utf8" });
  } catch {}
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
  log("cleaned up");
}

main().catch((error) => {
  console.error("[ui-session] CRASH:", error);
  try {
    spawnSync(path.join(PG_BIN, "pg_ctl.exe"), ["-D", DATA_DIR, "-m", "immediate", "-w", "-t", "15", "stop"], { encoding: "utf8" });
  } catch {}
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
