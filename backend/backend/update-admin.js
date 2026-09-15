require("dotenv").config();

const bcrypt = require("bcryptjs");
const { query } = require("./src/db/pool");

const OLD_EMAIL = "Sabawoon.edu.academy1@gmail.com";
const NEW_EMAIL = "Sabawoon.edu.academy1@gmail.com";
const NEW_PASSWORD = "YOUR_NEW_PASSWORD_HERE";

async function updateAdmin() {
  try {
    console.log("");
    console.log("========================================");
    console.log("           UPDATE ADMIN ACCOUNT");
    console.log("========================================");
    console.log("");

    if (!NEW_PASSWORD || NEW_PASSWORD.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    const existing = await query(
      "SELECT id, email, role FROM users WHERE email=$1",
      [OLD_EMAIL],
    );

    if (!existing.rows.length) {
      throw new Error(`Admin account not found: ${OLD_EMAIL}`);
    }

    const admin = existing.rows[0];

    const emailCheck = await query(
      "SELECT id FROM users WHERE LOWER(email)=LOWER($1) AND id<>$2",
      [NEW_EMAIL, admin.id],
    );

    if (emailCheck.rows.length) {
      throw new Error(
        `The new email is already being used by another account.`,
      );
    }

    const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

    await query(
      `
      UPDATE users
      SET
        email=$1,
        password_hash=$2,
        updated_at=NOW()
      WHERE id=$3
      `,
      [NEW_EMAIL, passwordHash, admin.id],
    );

    console.log("Admin account updated successfully.");
    console.log("");
    console.log(`Email:    ${NEW_EMAIL}`);
    console.log(`Password: ${NEW_PASSWORD}`);
    console.log(`Role:     ${admin.role}`);
    console.log("");
    console.log("You can now log in with the new credentials.");
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("ADMIN UPDATE FAILED");
    console.error("----------------------------------------");
    console.error(error.message);
    console.error("");

    process.exit(1);
  }
}

updateAdmin();
