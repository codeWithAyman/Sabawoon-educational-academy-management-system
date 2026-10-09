require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);

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
