/* Read-only diagnostics against the configured database. Never writes. */
require("dotenv").config({ path: require("path").join(__dirname, "..", "backend", ".env") });
const { Pool } = require(require("path").join(__dirname, "..", "backend", "node_modules", "pg"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const rows = async (sql, params) => {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (e) {
    return { error: e.message };
  }
};

async function main() {
  const out = {};

  out.classTypes = await rows(
    "SELECT id, name, sort_order, is_active FROM class_types ORDER BY sort_order, id",
  );

  out.examSnapshotColumns = await rows(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='exams' AND column_name LIKE '%snapshot%'
    ORDER BY column_name
  `);

  out.examsColumns = await rows(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='exams'
    ORDER BY ordinal_position
  `);

  out.reportsFk = await rows(`
    SELECT conname, confdeltype FROM pg_constraint
    WHERE conrelid='exams'::regclass AND contype='f'
  `);

  out.reportLikeTables = await rows(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name LIKE '%report%' OR table_name LIKE '%exam%' OR table_name LIKE '%mark%')
    ORDER BY table_name
  `);

  out.counts = await rows(`
    SELECT
      (SELECT count(*) FROM exams) AS exams,
      (SELECT count(*) FROM class_slots) AS class_slots,
      (SELECT count(*) FROM subjects) AS subjects,
      (SELECT count(*) FROM students) AS students
  `);

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch((e) => { console.error("DIAG FAILED:", e.message); process.exit(1); });
