const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { query } = require("../db/pool");
const { authRequired } = require("../middleware/auth");
const { asyncH } = require("../utils/helpers");

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
}

function getValidationErrors(req) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return errors.array();
  }

  return null;
}

// LOGIN
router.post(
  "/login",
  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email address is required"),
  body("password")
    .isLength({ min: 4 })
    .withMessage("Password must be at least 4 characters"),
  asyncH(async (req, res) => {
    const errors = getValidationErrors(req);

    if (errors) {
      return res.status(400).json({
        error: "Invalid input",
        code: "VALIDATION_ERROR",
        details: errors,
      });
    }

    const { email, password } = req.body;

    const result = await query(
      `SELECT
         id,
         email,
         password_hash,
         role,
         full_name,
         phone,
         is_active
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND is_active = TRUE`,
      [email],
    );

    if (!result.rows.length) {
      return res.status(401).json({
        error: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    const user = result.rows[0];

    const passwordCorrect = await bcrypt.compare(password, user.password_hash);

    if (!passwordCorrect) {
      return res.status(401).json({
        error: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    const token = makeToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.full_name,
        phone: user.phone,
      },
    });
  }),
);

// REGISTER DISABLED
router.post(
  "/register",
  asyncH(async (req, res) => {
    return res.status(403).json({
      error:
        "Public registration is disabled. An administrator must create accounts.",
      code: "REGISTRATION_DISABLED",
    });
  }),
);

// CURRENT USER
router.get(
  "/me",
  authRequired,
  asyncH(async (req, res) => {
    const result = await query(
      `SELECT
         id,
         email,
         role,
         full_name,
         phone,
         is_active,
         created_at,
         updated_at
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  }),
);

// UPDATE PROFILE
router.put(
  "/me",
  authRequired,
  body("full_name")
    .trim()
    .isLength({ min: 2, max: 150 })
    .withMessage("Full name must be between 2 and 150 characters"),
  body("phone")
    .optional({ values: "null" })
    .trim()
    .isLength({ max: 30 })
    .withMessage("Phone number must be 30 characters or fewer"),
  asyncH(async (req, res) => {
    const errors = getValidationErrors(req);

    if (errors) {
      return res.status(400).json({
        error: "Invalid profile information",
        code: "VALIDATION_ERROR",
        details: errors,
      });
    }

    const fullName = req.body.full_name.trim();

    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;

    const result = await query(
      `UPDATE users
       SET
         full_name = $1,
         phone = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING
         id,
         email,
         role,
         full_name,
         phone,
         is_active,
         created_at,
         updated_at`,
      [fullName, phone, req.user.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    const user = result.rows[0];

    // Issue a fresh token so the JWT's stored name stays synchronized.
    const token = makeToken(user);

    return res.json({
      ok: true,
      token,
      user,
    });
  }),
);

// CHANGE PASSWORD
router.post(
  "/change-password",
  authRequired,
  body("current_password")
    .isString()
    .isLength({ min: 1 })
    .withMessage("Current password is required"),
  body("new_password")
    .isString()
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
  asyncH(async (req, res) => {
    const errors = getValidationErrors(req);

    if (errors) {
      return res.status(400).json({
        error: "Invalid password information",
        code: "VALIDATION_ERROR",
        details: errors,
      });
    }

    const { current_password, new_password } = req.body;

    const result = await query(
      `SELECT password_hash
       FROM users
       WHERE id = $1`,
      [req.user.id],
    );

    if (!result.rows.length) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    const currentPasswordCorrect = await bcrypt.compare(
      current_password,
      result.rows[0].password_hash,
    );

    if (!currentPasswordCorrect) {
      return res.status(400).json({
        error: "Current password incorrect",
        code: "CURRENT_PASSWORD_INCORRECT",
      });
    }

    const samePassword = await bcrypt.compare(
      new_password,
      result.rows[0].password_hash,
    );

    if (samePassword) {
      return res.status(400).json({
        error: "New password must be different from the current password",
        code: "PASSWORD_UNCHANGED",
      });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);

    await query(
      `UPDATE users
       SET
         password_hash = $1,
         updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, req.user.id],
    );

    return res.json({
      ok: true,
      message: "Password changed successfully",
    });
  }),
);

module.exports = router;
