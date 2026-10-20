/* Read-only diagnostics: FKs and usage counts for subjects / subject_books. */
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

  out.subjects = await rows("SELECT id, name, code FROM subjects ORDER BY id");
  out.subjectBooks = await rows("SELECT id, subject_id, name FROM subject_books ORDER BY id");
  out.classSlots = await rows(`
    SELECT id, subject_id, is_active, start_time, end_time FROM class_slots ORDER BY id
  `);

  out.subjectUsage = await rows(`
    SELECT s.id, s.name,
      (SELECT count(*) FROM class_slots cs WHERE cs.subject_id = s.id) AS slots_total,
      (SELECT count(*) FROM class_slots cs WHERE cs.subject_id = s.id AND cs.is_active) AS slots_active,
      (SELECT count(*) FROM class_slot_books csb
         JOIN class_slots cs ON cs.id = csb.class_slot_id
         WHERE cs.subject_id = s.id) AS slot_books
    FROM subjects s ORDER BY s.id
  `);

  out.bookUsage = await rows(`
    SELECT sb.id, sb.name, sb.subject_id,
      (SELECT count(*) FROM class_slot_books b WHERE b.book_id = sb.id) AS attached,
      (SELECT count(*) FROM class_slot_books b
         JOIN class_slots cs ON cs.id = b.class_slot_id
         WHERE b.book_id = sb.id AND cs.is_active) AS attached_active
    FROM subject_books sb ORDER BY sb.id
  `);

  out.fks = await rows(`
    SELECT c.conname,
           t.relname AS table_name,
           f.relname AS ref_table,
           c.confdeltype
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class f ON f.oid = c.confrelid
    WHERE c.contype='f'
      AND (t.relname IN ('class_slots','class_slot_books','marks','exams','student_enrollments','inventory_items')
           OR f.relname IN ('subjects','subject_books'))
    ORDER BY t.relname, c.conname
  `);

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch((e) => { console.error("DIAG FAILED:", e.message); process.exit(1); });
