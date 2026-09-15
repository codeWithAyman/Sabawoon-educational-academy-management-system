const express = require("express");
const bcrypt = require("bcryptjs");

const { query } = require("../db/pool");
const { authRequired, requireRoles } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

/* =============================================================================
   ADMINISTRATOR PASSWORD VERIFICATION
============================================================================= */

async function verifyAdministratorPassword(req, password) {
  if (typeof password !== "string" || !password) {
    return false;
  }

  const adminId = Number(req.user?.id);

  if (!Number.isInteger(adminId) || adminId < 1) {
    return false;
  }

  const result = await query(
    `SELECT
       id,
       password_hash
     FROM users
     WHERE id = $1
       AND role = 'admin'
       AND is_active = TRUE
     LIMIT 1`,
    [adminId],
  );

  if (!result.rows.length) {
    return false;
  }

  return bcrypt.compare(password, result.rows[0].password_hash);
}

async function requireAdministratorPassword(req, res) {
  const adminPassword = req.body?.admin_password;

  const valid = await verifyAdministratorPassword(req, adminPassword);

  if (!valid) {
    res.status(403).json({
      error: "Administrator password is incorrect.",
      code: "INVALID_ADMIN_PASSWORD",
    });

    return false;
  }

  return true;
}

/* =============================================================================
   TEACHERS
   Teachers are records only.
   They do NOT have application accounts or passwords.
============================================================================= */

/* GET ALL TEACHERS */

router.get(
  "/teachers",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         id,
         full_name,
         email,
         phone
       FROM teachers
       ORDER BY id DESC`,
    );

    return res.json(result.rows);
  }),
);

/* GET ONE TEACHER */

router.get(
  "/teachers/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const result = await query(
      `SELECT
         id,
         full_name,
         email,
         phone
       FROM teachers
       WHERE id = $1`,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Teacher not found",
        code: "TEACHER_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* CREATE TEACHER */

router.post(
  "/teachers",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    const result = await query(
      `INSERT INTO teachers (
         full_name,
         email,
         phone
       )
       VALUES ($1, $2, $3)
       RETURNING
         id,
         full_name,
         email,
         phone`,
      [fullName, email || null, phone],
    );

    return res.status(201).json(result.rows[0]);
  }),
);

/* UPDATE TEACHER */

router.put(
  "/teachers/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    const result = await query(
      `UPDATE teachers
       SET
         full_name = $1,
         email = $2,
         phone = $3
       WHERE id = $4
       RETURNING
         id,
         full_name,
         email,
         phone`,
      [fullName, email || null, phone, id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Teacher not found",
        code: "TEACHER_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* DELETE TEACHER */

router.delete(
  "/teachers/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    try {
      const result = await query(
        `DELETE FROM teachers
         WHERE id = $1
         RETURNING id, full_name`,
        [id],
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Teacher not found",
          code: "TEACHER_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        message: "Teacher permanently deleted",
        user: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          error:
            "This teacher cannot be deleted because they are currently assigned to one or more class time slots.",
          code: "TEACHER_IN_USE",
        });
      }

      throw error;
    }
  }),
);

/* =============================================================================
   STAFF
   Staff are NOT application accounts.
   Their password/PIN is used only for sensitive-action verification.
============================================================================= */

/* GET ALL STAFF */

router.get(
  "/staff",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         id,
         full_name,
         email,
         phone,
         is_active
       FROM staff
       ORDER BY id DESC`,
    );

    return res.json(result.rows);
  }),
);

/* GET ONE STAFF MEMBER */

router.get(
  "/staff/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const result = await query(
      `SELECT
         id,
         full_name,
         email,
         phone,
         is_active
       FROM staff
       WHERE id = $1`,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Staff member not found",
        code: "STAFF_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* CREATE STAFF */

router.post(
  "/staff",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    if (!password) {
      return res.status(400).json({
        error: "Staff verification password/PIN is required",
        code: "PASSWORD_REQUIRED",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO staff (
         full_name,
         email,
         phone,
         password_hash,
         is_active
       )
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING
         id,
         full_name,
         email,
         phone,
         is_active`,
      [fullName, email || null, phone, passwordHash],
    );

    return res.status(201).json(result.rows[0]);
  }),
);

/* UPDATE STAFF */

router.put(
  "/staff/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    const isActive =
      typeof req.body.is_active === "boolean" ? req.body.is_active : true;

    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    /*
      Changing a Staff verification password/PIN
      requires the administrator's current password.
    */
    if (password) {
      const verified = await requireAdministratorPassword(req, res);

      if (!verified) return;
    }

    let result;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);

      result = await query(
        `UPDATE staff
         SET
           full_name = $1,
           email = $2,
           phone = $3,
           password_hash = $4,
           is_active = $5,
           updated_at = NOW()
         WHERE id = $6
         RETURNING
           id,
           full_name,
           email,
           phone,
           is_active`,
        [fullName, email || null, phone, passwordHash, isActive, id],
      );
    } else {
      result = await query(
        `UPDATE staff
         SET
           full_name = $1,
           email = $2,
           phone = $3,
           is_active = $4,
           updated_at = NOW()
         WHERE id = $5
         RETURNING
           id,
           full_name,
           email,
           phone,
           is_active`,
        [fullName, email || null, phone, isActive, id],
      );
    }

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Staff member not found",
        code: "STAFF_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* DELETE STAFF */

router.delete(
  "/staff/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const result = await query(
      `DELETE FROM staff
       WHERE id = $1
       RETURNING id, full_name`,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Staff member not found",
        code: "STAFF_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      message: "Staff member permanently deleted",
      user: result.rows[0],
    });
  }),
);

/* =============================================================================
   ATTENDANCE ACCOUNT
   Exactly ONE real login account.
============================================================================= */

/* GET ATTENDANCE ACCOUNT */

router.get(
  "/attendance",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         id,
         email,
         role,
         full_name,
         phone,
         is_active
       FROM users
       WHERE role = 'attendance'
       ORDER BY id ASC`,
    );

    return res.json(result.rows[0] || null);
  }),
);

/* GET ONE ATTENDANCE ACCOUNT */

router.get(
  "/attendance/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const result = await query(
      `SELECT
         id,
         email,
         role,
         full_name,
         phone,
         is_active
       FROM users
       WHERE id = $1
         AND role = 'attendance'`,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Attendance account not found",
        code: "ATTENDANCE_ACCOUNT_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* CREATE ATTENDANCE ACCOUNT */

router.post(
  "/attendance",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Email is required for the Attendance account",
        code: "EMAIL_REQUIRED",
      });
    }

    if (!password) {
      return res.status(400).json({
        error: "Password is required for the Attendance account",
        code: "PASSWORD_REQUIRED",
      });
    }

    const existing = await query(
      `SELECT id
       FROM users
       WHERE role = 'attendance'
       LIMIT 1`,
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: "An Attendance account already exists",
        code: "ATTENDANCE_ACCOUNT_EXISTS",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const result = await query(
        `INSERT INTO users (
           email,
           password_hash,
           role,
           full_name,
           phone,
           is_active
         )
         VALUES ($1, $2, 'attendance', $3, $4, TRUE)
         RETURNING
           id,
           email,
           role,
           full_name,
           phone,
           is_active`,
        [email, passwordHash, fullName, phone],
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error:
            "An Attendance account or account with this email already exists",
          code: "ACCOUNT_ALREADY_EXISTS",
        });
      }

      throw error;
    }
  }),
);

/* UPDATE ATTENDANCE ACCOUNT */

router.put(
  "/attendance/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const fullName =
      typeof req.body.full_name === "string" ? req.body.full_name.trim() : "";

    const email =
      typeof req.body.email === "string" ? req.body.email.trim() : "";

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    const isActive =
      typeof req.body.is_active === "boolean" ? req.body.is_active : true;

    const password =
      typeof req.body.password === "string" ? req.body.password : "";

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        error: "Full name must be between 2 and 150 characters",
        code: "INVALID_FULL_NAME",
      });
    }

    if (!email) {
      return res.status(400).json({
        error: "Email is required for the Attendance account",
        code: "EMAIL_REQUIRED",
      });
    }

    /*
      Changing the Attendance login password
      requires the administrator's current password.
    */
    if (password) {
      const verified = await requireAdministratorPassword(req, res);

      if (!verified) return;
    }

    let result;

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);

      result = await query(
        `UPDATE users
         SET
           email = $1,
           full_name = $2,
           phone = $3,
           password_hash = $4,
           is_active = $5
         WHERE id = $6
           AND role = 'attendance'
         RETURNING
           id,
           email,
           role,
           full_name,
           phone,
           is_active`,
        [email, fullName, phone, passwordHash, isActive, id],
      );
    } else {
      result = await query(
        `UPDATE users
         SET
           email = $1,
           full_name = $2,
           phone = $3,
           is_active = $4
         WHERE id = $5
           AND role = 'attendance'
         RETURNING
           id,
           email,
           role,
           full_name,
           phone,
           is_active`,
        [email, fullName, phone, isActive, id],
      );
    }

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Attendance account not found",
        code: "ATTENDANCE_ACCOUNT_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  }),
);

/* DELETE ATTENDANCE ACCOUNT */

router.delete(
  "/attendance/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    const result = await query(
      `DELETE FROM users
       WHERE id = $1
         AND role = 'attendance'
       RETURNING id, email, full_name`,
      [id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Attendance account not found",
        code: "ATTENDANCE_ACCOUNT_NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      message: "Attendance account permanently deleted",
      user: result.rows[0],
    });
  }),
);

/* =============================================================================
   GENERAL ADMIN VIEW
   No teacher/staff/attendance "user roles" are created here.
   These are simply the three management categories.
============================================================================= */

router.get(
  "/",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const role = String(req.query.role || "")
      .trim()
      .toLowerCase();

    if (role === "teacher") {
      const result = await query(
        `SELECT
           id,
           full_name,
           email,
           phone
         FROM teachers
         ORDER BY id DESC`,
      );

      return res.json({
        users: result.rows,
      });
    }

    if (role === "staff") {
      const result = await query(
        `SELECT
           id,
           full_name,
           email,
           phone,
           is_active
         FROM staff
         ORDER BY id DESC`,
      );

      return res.json({
        users: result.rows,
      });
    }

    if (role === "attendance") {
      const result = await query(
        `SELECT
           id,
           email,
           role,
           full_name,
           phone,
           is_active
         FROM users
         WHERE role = 'attendance'
         ORDER BY id ASC`,
      );

      return res.json({
        users: result.rows,
      });
    }

    const [teachers, staff, attendance] = await Promise.all([
      query(
        `SELECT
           id,
           full_name,
           email,
           phone
         FROM teachers
         ORDER BY id DESC`,
      ),

      query(
        `SELECT
           id,
           full_name,
           email,
           phone,
           is_active
         FROM staff
         ORDER BY id DESC`,
      ),

      query(
        `SELECT
           id,
           email,
           role,
           full_name,
           phone,
           is_active
         FROM users
         WHERE role = 'attendance'
         ORDER BY id ASC`,
      ),
    ]);

    return res.json({
      teachers: teachers.rows,
      staff: staff.rows,
      attendance: attendance.rows,
    });
  }),
);

/* =============================================================================
   GENERAL GET ONE
============================================================================= */

router.get(
  "/:id",
  authRequired,
  requireRoles("admin"),
  asyncH(async (req, res) => {
    const id = Number(req.params.id);

    const category = String(req.query.role || "")
      .trim()
      .toLowerCase();

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        error: "Invalid ID",
        code: "INVALID_ID",
      });
    }

    if (!["teacher", "staff", "attendance"].includes(category)) {
      return res.status(400).json({
        error: "A valid role is required",
        code: "INVALID_ROLE",
      });
    }

    let result;

    if (category === "teacher") {
      result = await query(
        `SELECT
           id,
           full_name,
           email,
           phone
         FROM teachers
         WHERE id = $1`,
        [id],
      );
    }

    if (category === "staff") {
      result = await query(
        `SELECT
           id,
           full_name,
           email,
           phone,
           is_active
         FROM staff
         WHERE id = $1`,
        [id],
      );
    }

    if (category === "attendance") {
      result = await query(
        `SELECT
           id,
           email,
           role,
           full_name,
           phone,
           is_active
         FROM users
         WHERE id = $1
           AND role = 'attendance'`,
        [id],
      );
    }

    if (!result.rows.length) {
      return res.status(404).json({
        error: "Record not found",
        code: "NOT_FOUND",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  }),
);

module.exports = router;
