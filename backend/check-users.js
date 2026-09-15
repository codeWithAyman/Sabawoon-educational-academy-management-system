require("dotenv").config();

const { query } = require("./src/db/pool");

async function checkUsers() {
  try {
    const result = await query(`
      SELECT id, email, role, full_name, is_active
      FROM users
      ORDER BY id
    `);

    console.log("");
    console.log("========================================");
    console.log("           USERS IN DATABASE");
    console.log("========================================");
    console.log("");

    if (result.rows.length === 0) {
      console.log("There are NO users in the database.");
    } else {
      console.table(result.rows);
    }

    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("FAILED TO READ USERS");
    console.error("----------------------------------------");
    console.error(error.message);
    console.error("");

    process.exit(1);
  }
}

checkUsers();
