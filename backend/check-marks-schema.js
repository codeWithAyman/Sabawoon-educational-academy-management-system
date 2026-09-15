const { query } = require('./src/db/pool');

(async () => {
  for (const table of ['exams', 'marks']) {
    console.log(`--- ${table} ---`);

    const result = await query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [table]
    );

    console.table(result.rows);
  }

  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
