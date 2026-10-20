/*
  DISPOSABLE-TEST ONLY — never touches the live academy database.

  Creates two uniquely named throwaway databases, runs the
  real backup service against the source, validates the dump, restores it
  into the destination, checks retention and due-time logic, then drops
  both databases.
*/
const path = require("path");
const fs = require("fs");
const { Client } = require(path.join(__dirname, "..", "backend", "node_modules", "pg"));

const LIVE_URL = process.env.DATABASE_URL_LIVE;
const RUN_ID = `${Date.now()}_${process.pid}`;
const TEST_SRC = `sabawoon_backup_test_src_${RUN_ID}`;
const TEST_DST = `sabawoon_backup_test_dst_${RUN_ID}`;
const TEST_DIR = fs.mkdtempSync(path.join(require("os").tmpdir(), "sabawoon-backup-test-"));

if (!LIVE_URL) throw new Error("DATABASE_URL_LIVE is required; refusing to use the default application database.");
const liveDatabase = new URL(LIVE_URL).pathname.replace(/^\//, "");
if (!liveDatabase || /^hm_sms$/i.test(liveDatabase) || /^sabawoon_academy$/i.test(liveDatabase)) {
  throw new Error(`Refusing to run against non-disposable database: ${liveDatabase || "unknown"}`);
}

function urlFor(dbName) {
  const url = new URL(LIVE_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function admin(dbName, sql) {
  const client = new Client({ connectionString: LIVE_URL });
  await client.connect();
  try {
    if (sql) return await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  // ---- setup disposable databases
  await admin(null, `DROP DATABASE IF EXISTS "${TEST_SRC}" WITH (FORCE)`);
  await admin(null, `DROP DATABASE IF EXISTS "${TEST_DST}" WITH (FORCE)`);
  await admin(null, `CREATE DATABASE "${TEST_SRC}"`);
  await admin(null, `CREATE DATABASE "${TEST_DST}"`);

  const src = new Client({ connectionString: urlFor(TEST_SRC) });
  await src.connect();
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "backend", "src", "db", "schema.sql"),
    "utf8",
  );
  await src.query(schema);
  // one marker row so we can prove data round-trips
  await src.query(
    "INSERT INTO subjects (name, code) VALUES ('BackupTestSubject', 'BT-1')",
  );
  await src.end();

  // ---- configure the service for isolation
  process.env.DATABASE_URL = urlFor(TEST_SRC);
  process.env.BACKUP_DIR = TEST_DIR;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_BACKUP_REPO;
  delete process.env.GITHUB_BACKUP_REPO_OWNER;
  delete process.env.GITHUB_BACKUP_REPO_NAME;

  fs.mkdirSync(process.env.BACKUP_DIR, { recursive: true });

  const service = require(path.join(
    __dirname, "..", "backend", "src", "services", "backup-service.js",
  ));

  // ---- 1. create a real backup
  const result = await service.runBackup({
    trigger: "test",
    actor: { id: null, name: "test", role: "system" },
  });

  const file = path.join(service.BACKUP_DIR, result.backup.filename);
  record("backup file created", fs.existsSync(file), result.backup.filename);
  record("backup validated", result.backup.validation?.valid === true,
    `${result.backup.validation?.tableDataEntries} table-data entries`);
  record("backup result is local-only", !Object.prototype.hasOwnProperty.call(result, "github"),
    "no remote backup result is returned");
  record("filename format", /^Sabawoon_Backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.dump$/.test(result.backup.filename),
    result.backup.filename);

  // ---- 2. restore the dump into the second disposable database
  await service.runPgTool("pg_restore", [
    "--no-owner", "--no-privileges",
    "--host", service.pgConnectionInfo().host,
    "--port", String(service.pgConnectionInfo().port),
    "--username", service.pgConnectionInfo().user,
    "--dbname", TEST_DST,
    file,
  ]);

  const dst = new Client({ connectionString: urlFor(TEST_DST) });
  await dst.connect();
  const marker = await dst.query("SELECT name FROM subjects WHERE name='BackupTestSubject'");
  const classTypes = await dst.query("SELECT count(*)::int AS n FROM class_types");
  await dst.end();
  record("restored dump contains data", marker.rows.length === 1);
  record("restored schema has class_types", classTypes.rows[0].n >= 4, `${classTypes.rows[0].n} rows`);

  // ---- 3. validation detects a broken file
  const bogus = path.join(service.BACKUP_DIR, "Sabawoon_Backup_2000-01-01_00-00-00.dump");
  fs.writeFileSync(bogus, "this is not a postgres dump");
  const badValidation = await service.validateDumpFile(bogus);
  record("validation rejects broken file", badValidation.valid === false, badValidation.reason);
  fs.unlinkSync(bogus);

  // ---- 4. retention keeps daily/monthly windows and the newest backup
  const history = service.loadHistory();
  const day = 24 * 60 * 60 * 1000;
  const oldEntries = [];
  // 40 backups spread 10 days apart — covers more than a full year, so the
  // 30-daily / 12-monthly windows must prune the oldest ones.
  for (let i = 1; i <= 40; i += 1) {
    const name = `Sabawoon_Backup_1900-01-${String(i).padStart(2, "0")}_10-00-00.dump`;
    const p = path.join(service.BACKUP_DIR, name);
    fs.writeFileSync(p, `x-${i}`);
    oldEntries.push({ filename: name, createdAt: new Date(Date.now() - i * 10 * day).toISOString() });
  }
  history.backups.push(...oldEntries);
  const removed = service.applyRetention(history, { log: false });
  record("retention removed old backups", removed.length > 0, `${removed.length} removed, ${history.backups.length} kept`);
  const keptNewest = history.backups.some((b) => b.filename === result.backup.filename);
  record("retention keeps the newest backup", keptNewest);
  const filesLeft = fs.readdirSync(service.BACKUP_DIR).filter((f) => f.endsWith(".dump"));
  record("kept files match history", filesLeft.length === history.backups.length,
    `${filesLeft.length} files / ${history.backups.length} history entries`);
  // never deletes down to zero
  record("retention never empties storage", history.backups.length >= 1);

  // ---- 5. due-time / catch-up logic
  const h2 = { backups: [], restores: [], lastScheduledResult: null };
  service.saveHistory(h2);
  record("first run is always due (no backups yet)", service.backupIsDue() === true);

  const upToDate = { ...h2, backups: [{ filename: "Sabawoon_Backup_2099-01-01_10-00-00.dump", createdAt: new Date().toISOString() }] };
  service.saveHistory(upToDate);
  record("not due right after a backup", service.backupIsDue() === false);

  const stale = { ...h2, backups: [{ filename: "Sabawoon_Backup_2000-01-01_10-00-00.dump", createdAt: new Date(Date.now() - 3 * day).toISOString() }] };
  service.saveHistory(stale);
  record("catch-up after missed days", service.backupIsDue() === true);

  // ---- 6. run lock prevents overlap
  const locked = service.acquireRunLock();
  record("run lock acquired", locked === true);
  const secondLock = service.acquireRunLock();
  record("second job blocked while lock held", secondLock === false);
  service.releaseRunLock();
  record("lock released", service.acquireRunLock() === true);
  service.releaseRunLock();

  // ---- 7. scheduled runner picks up a due backup end-to-end
  service.saveHistory(stale);
  const scheduled = await service.runScheduledBackupIfDue();
  record("scheduled run created a backup", scheduled.ok === true && !scheduled.skipped,
    scheduled.backup?.filename);
  const status = service.scheduleStatus();
  record("schedule status reports last backup", Boolean(status.lastBackupAt));

  // ---- cleanup
  for (const f of fs.readdirSync(service.BACKUP_DIR)) {
    try { fs.unlinkSync(path.join(service.BACKUP_DIR, f)); } catch {}
  }
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  await admin(null, `DROP DATABASE IF EXISTS "${TEST_SRC}" WITH (FORCE)`);
  await admin(null, `DROP DATABASE IF EXISTS "${TEST_DST}" WITH (FORCE)`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error("TEST CRASH:", e);
  try { await admin(null, `DROP DATABASE IF EXISTS "${TEST_SRC}" WITH (FORCE)`); } catch {}
  try { await admin(null, `DROP DATABASE IF EXISTS "${TEST_DST}" WITH (FORCE)`); } catch {}
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
