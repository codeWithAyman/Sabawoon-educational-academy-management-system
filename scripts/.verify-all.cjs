/*
  DISPOSABLE-TEST ONLY — never writes to the live academy database.

  What this harness does:
    1. Starts a THROWAWAY PostgreSQL cluster in %TEMP% (superuser trust,
       loopback only). The live server is used for ONE read-only
       `pg_dump --schema-only` so the test database has the exact
       production structure.
    2. Runs backend/src/db/migrate.js against that database — proving every
       migration is idempotent on a production-shaped database (the real
       upgrade path for the installer).
    3. Boots the real backend (current code) against the throwaway DB and
       verifies over HTTP:
          §3   backup mechanics (create / validate / history / config)
          §3.4 automatic catch-up backup on backend startup + the
               standalone scheduled runner (run-scheduled-backup.cjs),
               including its "already up to date" skip and missed-day
               catch-up
          §5   restore safety: confirmation + password guards, corrupt
               dump rejection, full restore with pre-flight test DB,
               safety backup and post-restore verification
          §7   default class types appear when the table is empty
          §8   subject/book deletion: active classes protected,
               archived classes survive
          §11  report history keeps real scores + snapshots after the
               class is archived and its subject deleted
    4. Stops everything and deletes the throwaway cluster + directory.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const SCRATCH = path.join(os.tmpdir(), `sabawoon-verify-${Date.now()}`);
const DATA_DIR = path.join(SCRATCH, "data");
const PG_PORT = 5509;
const API_PORT = 5491;
const BACKUP_DIR = path.join(SCRATCH, "backups");
const BACKUP_DIR_2 = path.join(SCRATCH, "backups2");
// Use a unique disposable database name so an interrupted prior run cannot
// prevent a later verification run. The cleanup block still removes it.
const API_DB = `hm_sms_verify_${Date.now()}`;

const ADMIN_PW = "Verify-Admin-123!";

require(path.join(ROOT, "backend", "node_modules", "dotenv")).config({
  path: path.join(ROOT, "backend", ".env"),
});

const bcrypt = require(path.join(ROOT, "backend", "node_modules", "bcryptjs"));
const { Client } = require(path.join(ROOT, "backend", "node_modules", "pg"));

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || ROOT,
      env: opts.env || process.env,
      stdio: opts.stdio || ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ code: -1, out, err: `${err}\nTIMEOUT after ${opts.timeoutMs || 60000}ms` });
    }, opts.timeoutMs || 60000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

function liveParams() {
  const u = new URL(process.env.DATABASE_URL);
  return {
    host: u.hostname || "localhost",
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username || ""),
    password: decodeURIComponent(u.password || ""),
    database: (u.pathname || "/").replace(/^\//, ""),
  };
}

const SCRATCH_URL = `postgresql://postgres@127.0.0.1:${PG_PORT}/postgres`;
const API_DB_URL = `postgresql://postgres@127.0.0.1:${PG_PORT}/${API_DB}`;

async function adminQuery(sql, params) {
  const c = new Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", database: "postgres" });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
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

async function api(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${API_PORT}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

let backendChild = null;

async function main() {
  fs.mkdirSync(SCRATCH, { recursive: true });

  console.log(`[verify] scratch cluster in ${SCRATCH}`);

  // ---- 1. throwaway cluster ------------------------------------------------
  const init = await run(
    path.join(PG_BIN, "initdb.exe"),
    ["-D", DATA_DIR, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"],
    { timeoutMs: 120000 },
  );
  if (init.code !== 0) {
    throw new Error(`initdb failed: ${init.err || init.out}`);
  }

  const pgCtl = path.join(PG_BIN, "pg_ctl.exe");
  spawn(pgCtl, ["-D", DATA_DIR, "-o", `-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=`, "-l", path.join(SCRATCH, "server.log"), "-w", "-t", "30", "start"], {
    cwd: SCRATCH,
    stdio: "ignore",
    windowsHide: true,
  });

  // wait for TCP readiness
  let up = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const c = new Client({ host: "127.0.0.1", port: PG_PORT, user: "postgres", database: "postgres" });
      await c.connect();
      await c.query("SELECT 1");
      await c.end();
      up = true;
      break;
    } catch {
      await sleep(500);
    }
  }
  record("throwaway PostgreSQL cluster started", up, `port ${PG_PORT}`);
  if (!up) throw new Error("scratch cluster did not start");

  try {
    // ---- 2. production-shaped schema (read-only dump of live structure) ----
    const live = liveParams();
    const dumpFile = path.join(SCRATCH, "live-schema.sql");
    const dump = spawnSync(
      path.join(PG_BIN, "pg_dump.exe"),
      ["--schema-only", "--no-owner", "--no-privileges", "-h", live.host, "-p", String(live.port), "-U", live.user, "-d", live.database, "-f", dumpFile],
      { env: { ...process.env, PGPASSWORD: live.password }, windowsHide: true, encoding: "utf8", timeout: 120000 },
    );
    record("live schema dumped (read-only, no data)", dump.status === 0, (dump.stderr || "").trim().split("\n")[0] || "");

    await adminQuery(`CREATE DATABASE "${API_DB}"`);
    const restored = spawnSync(
      path.join(PG_BIN, "psql.exe"),
      ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-d", API_DB, "-v", "ON_ERROR_STOP=1", "-f", dumpFile],
      { windowsHide: true, encoding: "utf8", timeout: 120000 },
    );
    record("production structure restored into throwaway DB", restored.status === 0, (restored.stderr || "").trim().split("\n").slice(-1)[0] || "");

    // ---- 3. migrations on a production-shaped DB (real upgrade path) -------
    const migrate = await run(
      process.execPath,
      [path.join(ROOT, "backend", "src", "db", "migrate.js")],
      {
        cwd: path.join(ROOT, "backend"),
        env: { ...process.env, DATABASE_URL: API_DB_URL },
        timeoutMs: 120000,
      },
    );
    record("npm-style migrations idempotent on production shape", migrate.code === 0, migrate.code === 0 ? "schema + 3 additive + inventory" : (migrate.err || migrate.out).slice(-300));

    // FK for archived-class safety must be SET NULL after migration
    const fk = await apiDbQuery(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'class_slots'::regclass AND confrelid = 'subjects'::regclass AND contype = 'f'
      LIMIT 1`);
    record("class_slots.subject_id is ON DELETE SET NULL", fk.rows[0]?.confdeltype === "n");

    // ---- 4. boot the real backend against the throwaway DB ----------------
    const childEnv = {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(API_PORT),
      DATABASE_URL: API_DB_URL,
      JWT_SECRET: "verify-jwt-secret",
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
    };
    delete childEnv.GITHUB_RELEASE_REPO_OWNER;
    delete childEnv.GITHUB_RELEASE_REPO_NAME;

    backendChild = spawn(process.execPath, [path.join(ROOT, "backend", "src", "server.js")], {
      cwd: path.join(ROOT, "backend"),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let backendLog = "";
    backendChild.stdout.on("data", (d) => (backendLog += d));
    backendChild.stderr.on("data", (d) => (backendLog += d));

    const healthy = await waitForHealth(45000);
    record("backend (current code) booted on throwaway DB", healthy);
    if (!healthy) throw new Error(`backend did not become healthy:\n${backendLog}`);

    // ---- §3.4 automatic catch-up on startup -------------------------------
    // No history exists yet, so today's scheduled backup is overdue and the
    // backend must create it by itself ~15 s after startup.
    let autoBackup = null;
    for (let i = 0; i < 12; i += 1) {
      try {
        const h = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "history.json"), "utf8"));
        autoBackup = (h.backups || []).find((b) => b.trigger === "automatic") || null;
        if (autoBackup) break;
      } catch { /* not written yet */ }
      await sleep(5000);
    }
    record(
      "§3.4 backend caught up the missed daily backup by itself",
      Boolean(autoBackup),
      autoBackup?.filename || "no automatic backup after 60 s",
    );

    // ---- 5. seed minimal academy data -------------------------------------
    const hash = await bcrypt.hash(ADMIN_PW, 10);
    await apiDbQuery(
      `INSERT INTO users (email, password_hash, role, full_name, is_active) VALUES ($1,$2,'admin','Verify Admin', TRUE)`,
      ["verify-admin@test.local", hash],
    );
    const teacher = await apiDbQuery(
      `INSERT INTO users (email, password_hash, role, full_name, is_active) VALUES ('verify-teacher@test.local',$1,'teacher','Verify Teacher', TRUE) RETURNING id`,
      [hash],
    );
    const teacherUserId = teacher.rows[0].id;
    // production joins teachers ON t.id = cs.teacher_id — mirror that shape,
    // adapting to whichever optional columns this installation has.
    const teacherCols = await apiDbQuery(
      `SELECT column_name FROM information_schema.columns WHERE table_name='teachers' AND table_schema=current_schema()`,
    );
    const teacherColSet = new Set(teacherCols.rows.map((r) => r.column_name));
    const seedCols = { id: teacherUserId, employee_id: "VT-1" };
    if (teacherColSet.has("user_id")) seedCols.user_id = teacherUserId;
    if (teacherColSet.has("full_name")) seedCols.full_name = "Verify Teacher";
    const seedColNames = Object.keys(seedCols);
    await apiDbQuery(
      `INSERT INTO teachers (${seedColNames.join(",")}) VALUES (${seedColNames.map((_, i) => `$${i + 1}`).join(",")})`,
      seedColNames.map((c) => seedCols[c]),
    );

    const subject = await apiDbQuery(
      `INSERT INTO subjects (name, code) VALUES ('VerifySubject','VS-1') RETURNING id`,
    );
    const subjectId = subject.rows[0].id;

    const book = await apiDbQuery(
      `INSERT INTO subject_books (subject_id, name) VALUES ($1,'Verify Level One') RETURNING id`,
      [subjectId],
    );
    const bookId = book.rows[0].id;

    // ---- 6. §7 default class types ----------------------------------------
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: "verify-admin@test.local", password: ADMIN_PW },
    });
    record("admin login works", login.status === 200 && Boolean(login.data?.token));
    const token = login.data?.token;

    const types = await api("/api/classes/types", { token });
    const typeNames = (types.data || []).map((t) => t.name);
    record(
      "§7 default class types restored on empty table",
      ["Male", "Female", "Kids", "Mixed"].every((n) => typeNames.includes(n)),
      typeNames.join(", "),
    );
    const maleTypeId = (types.data || []).find((t) => t.name === "Male")?.id;

    const slotCols = await apiDbQuery(
      `SELECT column_name FROM information_schema.columns WHERE table_name='class_slots' AND table_schema=current_schema()`,
    );
    const slotColSet = new Set(slotCols.rows.map((r) => r.column_name));
    const slotSeed = { subject_id: subjectId, teacher_id: teacherUserId, start_time: "10:00", end_time: "11:00" };
    if (slotColSet.has("days")) slotSeed.days = "Sat";
    if (slotColSet.has("room")) slotSeed.room = "R1";
    if (slotColSet.has("academic_year")) slotSeed.academic_year = "2026";
    if (slotColSet.has("class_type_id")) slotSeed.class_type_id = maleTypeId;
    if (slotColSet.has("level")) slotSeed.level = "Verify Level One";
    if (slotColSet.has("is_active")) slotSeed.is_active = true;
    const slotColNames = Object.keys(slotSeed);
    const slot = await apiDbQuery(
      `INSERT INTO class_slots (${slotColNames.join(",")}) VALUES (${slotColNames.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
      slotColNames.map((c) => slotSeed[c]),
    );
    const slotId = slot.rows[0].id;
    await apiDbQuery(`INSERT INTO class_slot_books (class_slot_id, book_id) VALUES ($1,$2)`, [slotId, bookId]);

    const st1 = await apiDbQuery(
      `INSERT INTO students (full_name, roll_number, guardian_name) VALUES ('Verify Student One','V-001','Guardian One') RETURNING id`,
    );
    const st2 = await apiDbQuery(
      `INSERT INTO students (full_name, roll_number, guardian_name) VALUES ('Verify Student Two','V-002','Guardian Two') RETURNING id`,
    );
    await apiDbQuery(`INSERT INTO student_enrollments (student_id, class_slot_id) VALUES ($1,$2)`, [st1.rows[0].id, slotId]);

    // ---- 7. §8 deletion protection ----------------------------------------
    const delActive = await api(`/api/classes/subjects/${subjectId}`, { method: "DELETE", token });
    record(
      "§8 subject used by ACTIVE class is protected",
      delActive.status === 409 && delActive.data?.code === "SUBJECT_IN_USE",
      delActive.data?.error,
    );

    const delBookActive = await api(`/api/classes/books/${bookId}`, { method: "DELETE", token });
    record(
      "§8 book/level used by ACTIVE class is protected",
      delBookActive.status === 409 && delBookActive.data?.code === "BOOK_IN_USE",
      delBookActive.data?.error,
    );

    // ---- 8. §11 report history --------------------------------------------
    const exam = await api("/api/marks/assessments", {
      method: "POST",
      token,
      body: {
        name: "Verify Exam",
        class_slot_id: Number(slotId),
        exam_date: "2026-10-01",
        total_marks: 100,
        is_published: true,
      },
    });
    record("§11 assessment created with snapshots", exam.status === 201 && Boolean(exam.data?.subject_name_snapshot), `snap=${exam.data?.subject_name_snapshot}`);
    const examId = exam.data?.id;

    await apiDbQuery(`INSERT INTO marks (student_id, exam_id, marks_obtained) VALUES ($1,$2,85)`, [st1.rows[0].id, examId]);
    await apiDbQuery(`INSERT INTO marks (student_id, exam_id, marks_obtained) VALUES ($1,$2,95)`, [st2.rows[0].id, examId]);

    // archive the class, remove its level + subject — history must survive
    await apiDbQuery(`UPDATE class_slots SET is_active = FALSE WHERE id = $1`, [slotId]);

    const delBookArchived = await api(`/api/classes/books/${bookId}`, { method: "DELETE", token });
    record("§8 book/level removable once only archived classes use it", delBookArchived.status === 200, JSON.stringify(delBookArchived.data));

    const delSubject = await api(`/api/classes/subjects/${subjectId}`, { method: "DELETE", token });
    record("§8 subject removable once only archived classes use it", delSubject.status === 200, JSON.stringify(delSubject.data));

    const archivedSlot = await apiDbQuery(`SELECT is_active, subject_id FROM class_slots WHERE id = $1`, [slotId]);
    record(
      "§8 archived class survives subject deletion (subject detached)",
      archivedSlot.rows.length === 1 && archivedSlot.rows[0].is_active === false && archivedSlot.rows[0].subject_id === null,
    );

    const history = await api("/api/marks/assessments/history", { token });
    const row = (history.data || []).find((r) => Number(r.id) === Number(examId));
    record(
      "§11 history shows real saved scores after class archived + subject deleted",
      Boolean(row) && Number(row?.average_mark) === 90 && Number(row?.highest_mark) === 95 && Number(row?.lowest_mark) === 85,
      row ? `avg=${row.average_mark} high=${row.highest_mark} low=${row.lowest_mark} state=${row.class_state}` : "row missing",
    );
    record(
      "§11 history keeps subject/teacher snapshots",
      Boolean(row) && row?.subject_name === "VerifySubject" && row?.teacher_name === "Verify Teacher",
      `subject=${row?.subject_name} teacher=${row?.teacher_name}`,
    );

    const scores = await api(`/api/marks/assessments/${examId}/scores`, { token });
    const scoreValues = (scores.data?.students || []).map((s) => Number(s.marks_obtained));
    record(
      "§11 per-student scores still readable",
      scores.status === 200 && scoreValues.includes(85) && scoreValues.includes(95),
      JSON.stringify(scoreValues),
    );

    // ---- 9. §3 backup create + config -------------------------------------
    const config = await api("/api/backup/config", { token });
    record(
      "§3 backup config reports real pg tools + retention",
      config.status === 200 && config.data?.pgTools?.pg_dump?.available === true && config.data?.retention?.daily === 30 && config.data?.retention?.monthly === 12,
      `status=${config.status} ${JSON.stringify(config.data).slice(0, 220)}`,
    );

    const created = await api("/api/backup/create", { method: "POST", token });
    const backupFile = created.data?.backup?.filename;
    const backupPath = backupFile ? path.join(BACKUP_DIR, backupFile) : "";
    record(
      "§3 manual backup created + validated (real pg_dump)",
      created.status === 201 && created.data?.backup?.validation?.valid === true && fs.existsSync(backupPath) && fs.statSync(backupPath).size > 0,
      `${backupFile} (${created.data?.backup?.currentSizeBytes ?? created.data?.backup?.sizeBytes} bytes)`,
    );
    record(
      "§3 GitHub result reported separately (unconfigured → skipped)",
      !Object.prototype.hasOwnProperty.call(created.data || {}, "github"),
      "no remote backup result is returned",
    );
    record(
      "§3 timestamped filename format",
      /^Sabawoon_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.dump$/.test(backupFile || ""),
      backupFile,
    );

    const list = await api("/api/backup/list", { token });
    record(
      "§3 history lists the real file with local status",
      list.status === 200 && (list.data?.backups || []).some((b) => b.filename === backupFile && b.fileExists !== false),
      `${(list.data?.backups || []).length} entries`,
    );

    // ---- 10. §5 restore safety --------------------------------------------
    await apiDbQuery(`INSERT INTO subjects (name, code) VALUES ('RestoreMarker','RM-1')`);

    const badConfirm = await api("/api/backup/restore", {
      method: "POST", token,
      body: { filename: backupFile, confirmText: "restore", adminPassword: ADMIN_PW },
    });
    record("§5 restore refuses without exact confirmation", badConfirm.status === 400 && badConfirm.data?.code === "CONFIRMATION_REQUIRED");

    const badPassword = await api("/api/backup/restore", {
      method: "POST", token,
      body: { filename: backupFile, confirmText: "RESTORE", adminPassword: "wrong-password" },
    });
    record("§5 restore re-verifies the admin password", badPassword.status === 401 && badPassword.data?.code === "PASSWORD_INVALID");

    const missing = await api("/api/backup/restore", {
      method: "POST", token,
      body: { filename: "Sabawoon_Backup_1999-01-01_00-00-00.dump", confirmText: "RESTORE", adminPassword: ADMIN_PW },
    });
    record("§5 restore refuses unknown backups", missing.status === 404 && missing.data?.code === "BACKUP_NOT_FOUND");

    // corrupt dump must be rejected BEFORE touching the database
    const corruptName = "Sabawoon_Backup_2000-01-01_00-00-00.dump";
    fs.writeFileSync(path.join(BACKUP_DIR, corruptName), "this is not a postgres dump");
    const historyJson = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "history.json"), "utf8"));
    historyJson.backups.unshift({ filename: corruptName, createdAt: new Date(Date.now() - 3600e3).toISOString(), sizeBytes: 28, format: "pg_dump custom format (-Fc)", validation: { valid: true }, github: { status: "not_uploaded" } });
    fs.writeFileSync(path.join(BACKUP_DIR, "history.json"), JSON.stringify(historyJson, null, 2));

    const corrupt = await api("/api/backup/restore", {
      method: "POST", token,
      body: { filename: corruptName, confirmText: "RESTORE", adminPassword: ADMIN_PW },
    });
    const markerAfterCorrupt = await apiDbQuery(`SELECT 1 FROM subjects WHERE name='RestoreMarker'`);
    record(
      "§5 corrupt dump rejected before any restore",
      corrupt.status === 400 && corrupt.data?.code === "BACKUP_INVALID" && markerAfterCorrupt.rows.length === 1,
      corrupt.data?.error,
    );

    const restoreResult = await api("/api/backup/restore", {
      method: "POST", token,
      body: { filename: backupFile, confirmText: "RESTORE", adminPassword: ADMIN_PW },
    });
    record(
      "§5 full restore succeeded (pre-flight test DB + single transaction)",
      restoreResult.status === 200 && restoreResult.data?.restore?.status === "succeeded" && restoreResult.data?.restore?.preTest?.passed === true,
      `preTest=${JSON.stringify(restoreResult.data?.restore?.preTest?.rowCountsWithBackup || {})}`,
    );
    const markerAfter = await apiDbQuery(`SELECT 1 FROM subjects WHERE name='RestoreMarker'`);
    record("§5 database actually rolled back to the backup state", markerAfter.rows.length === 0);
    const safety = restoreResult.data?.restore?.safetyBackup;
    record(
      "§5 automatic pre-restore safety backup exists on disk",
      Boolean(safety) && fs.existsSync(path.join(BACKUP_DIR, safety.filename)),
      safety?.filename,
    );
    const listAfter = await api("/api/backup/list", { token });
    record(
      "§5 restore recorded in history",
      (listAfter.data?.restores || []).some((r) => r.filename === backupFile && r.status === "succeeded"),
    );

    // ---- 12. §3.4 standalone scheduled runner -----------------------------
    const runnerEnv = {
      ...process.env,
      DATABASE_URL: API_DB_URL,
      BACKUP_DIR: BACKUP_DIR_2,
      PG_BIN_DIR: PG_BIN,
      GITHUB_TOKEN: "",
      GITHUB_BACKUP_REPO: "",
      GITHUB_BACKUP_REPO_OWNER: "",
      GITHUB_BACKUP_REPO_NAME: "",
    };
    const run1 = await run(process.execPath, [path.join(ROOT, "backend", "src", "services", "run-scheduled-backup.cjs")], {
      cwd: path.join(ROOT, "backend"), env: runnerEnv, timeoutMs: 120000,
    });
    const run1Files = fs.existsSync(BACKUP_DIR_2) ? fs.readdirSync(BACKUP_DIR_2).filter((f) => f.endsWith(".dump")) : [];
    record("§3.4 scheduled runner creates a backup standalone", run1.code === 0 && run1Files.length === 1, run1Files[0] || run1.err.slice(-200));

    const run2 = await run(process.execPath, [path.join(ROOT, "backend", "src", "services", "run-scheduled-backup.cjs")], {
      cwd: path.join(ROOT, "backend"), env: runnerEnv, timeoutMs: 60000,
    });
    record(
      "§3.4 second run skips (no duplicate backups)",
      run2.code === 0 && /up to date/i.test(run2.out),
      run2.out.trim().split("\n").slice(-1)[0],
    );

    // missed-day catch-up: pretend the last backup is 3 days old
    const h2path = path.join(BACKUP_DIR_2, "history.json");
    const h2 = JSON.parse(fs.readFileSync(h2path, "utf8"));
    h2.backups[0].createdAt = new Date(Date.now() - 3 * 24 * 3600e3).toISOString();
    fs.writeFileSync(h2path, JSON.stringify(h2, null, 2));
    const run3 = await run(process.execPath, [path.join(ROOT, "backend", "src", "services", "run-scheduled-backup.cjs")], {
      cwd: path.join(ROOT, "backend"), env: runnerEnv, timeoutMs: 120000,
    });
    const run3Files = fs.readdirSync(BACKUP_DIR_2).filter((f) => f.endsWith(".dump"));
    record("§3.4 missed-day catch-up creates a new backup", run3.code === 0 && run3Files.length === 2, `${run3Files.length} files`);

    // ---- 13. §3 existing backup mechanics suite ---------------------------
    const suite = await run(process.execPath, [path.join(ROOT, "scripts", ".backup-test.cjs")], {
      env: { ...process.env, DATABASE_URL_LIVE: SCRATCH_URL, PG_ADMIN_URL: SCRATCH_URL, PG_BIN_DIR: PG_BIN },
      timeoutMs: 240000,
    });
    record("§3 backup suite (dump/restore round-trip, retention, lock)", suite.code === 0, (suite.out.trim().split("\n").slice(-2)[0] || suite.err.slice(-200)));
  } finally {
    // ---- cleanup -----------------------------------------------------------
    if (backendChild) {
      try { backendChild.kill(); } catch {}
      await sleep(1000);
    }
    try {
      spawnSync(pgCtl, ["-D", DATA_DIR, "-m", "immediate", "-w", "-t", "15", "stop"], { windowsHide: true, timeout: 30000 });
    } catch {}
    try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("VERIFY CRASH:", error);

  // Best-effort cleanup so a crash never leaves a stray cluster behind.
  try {
    spawnSync(
      path.join(PG_BIN, "pg_ctl.exe"),
      ["-D", DATA_DIR, "-m", "immediate", "-w", "-t", "15", "stop"],
      { windowsHide: true, timeout: 30000 },
    );
  } catch {}
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}

  process.exit(1);
});
