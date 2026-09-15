const express = require('express');
const { query } = require('../db/pool');
const { authRequired, requireRoles } = require('../middleware/auth');
const { asyncH } = require('../utils/helpers');
const router = express.Router();

router.get('/', authRequired, asyncH(async (req, res) => {
  const role = req.user.role;
  let where = `WHERE (n.target_role='all' OR n.target_role=$1)`;
  const params = [role];
  if (role === 'student') {
    const s = await query('SELECT class_id FROM students WHERE user_id=$1', [req.user.id]);
    const cid = s.rows[0]?.class_id;
    if (cid) {
      params.push(cid);
      where = `WHERE (n.target_role='all' OR n.target_role='student') AND (n.target_class_id IS NULL OR n.target_class_id=$${params.length})`;
      params[0] = role;
    }
  }
  const r = await query(`
    SELECT n.*, u.full_name AS author_name, c.name AS target_class_name
    FROM notices n
    LEFT JOIN users u ON u.id=n.created_by
    LEFT JOIN classes c ON c.id=n.target_class_id
    ${where}
    ORDER BY n.created_at DESC LIMIT 200`, params);
  res.json(r.rows);
}));

router.post('/', authRequired, requireRoles('admin', 'teacher', 'staff'), asyncH(async (req, res) => {
  const { title, description, priority, target_role, target_class_id } = req.body;
  const r = await query(`INSERT INTO notices (title, description, priority, target_role, target_class_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, description, priority || 'normal', target_role || 'all', target_class_id || null, req.user.id]);
  res.status(201).json(r.rows[0]);
}));

router.put('/:id', authRequired, requireRoles('admin', 'teacher', 'staff'), asyncH(async (req, res) => {
  const { title, description, priority, target_role, target_class_id } = req.body;
  await query(`UPDATE notices SET title=COALESCE($1, title), description=COALESCE($2, description), priority=COALESCE($3, priority), target_role=COALESCE($4, target_role), target_class_id=$5 WHERE id=$6`,
    [title, description, priority, target_role, target_class_id || null, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/:id', authRequired, requireRoles('admin', 'teacher', 'staff'), asyncH(async (req, res) => {
  await query('DELETE FROM notices WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
