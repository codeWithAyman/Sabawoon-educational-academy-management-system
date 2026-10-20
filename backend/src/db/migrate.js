require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);

    /*
      Idempotent, additive migrations that older installations may
      have missed. Each file is safe to run repeatedly and never
      deletes or rewrites existing rows.
    */
    const additiveMigrations = [
      'migrate-2026-10-04-class-type.sql',
      'migrate-2026-10-05-report-history.sql',
      'migrate-2026-10-20-subject-archive-safe.sql',
      'migrate-2026-10-21-mark-history.sql',
    ];

    for (const migration of additiveMigrations) {
      const migrationSql = fs.readFileSync(
        path.join(__dirname, migration),
        'utf8',
      );
      await pool.query(migrationSql);
    }

    const inventorySql = fs.readFileSync(
      path.join(__dirname, 'migrate-2026-10-06-inventory.sql'),
      'utf8',
    );
    await pool.query(inventorySql);

    const financeSettlementSql = fs.readFileSync(
      path.resolve(__dirname, '../../backend/finance_settlements.sql'),
      'utf8',
    );
    await pool.query(financeSettlementSql);

    const teacherShareHistorySql = fs.readFileSync(
      path.join(__dirname, 'migrate-2026-10-06-teacher-share-history.sql'),
      'utf8',
    );
    await pool.query(teacherShareHistorySql);
    console.log('Migration completed.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
