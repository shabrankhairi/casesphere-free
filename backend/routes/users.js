'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');
const { query } = require('../db/pool');
const { requireAuth, requireAdmin, requireSenior, audit } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/users
router.get('/', requireSenior, async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT u.id, u.email, u.name, u.role, u.color, u.bg, u.is_active, u.last_login_at, u.created_at,
        COUNT(c.id) FILTER (WHERE TRUE) AS total_cases,
        COUNT(c.id) FILTER (WHERE c.status IN ('Open','In Progress')) AS active_cases
      FROM users u
      LEFT JOIN cases c ON c.assignee_id = u.id
      GROUP BY u.id ORDER BY u.name
    `);
    for (const u of rows) {
      u.recent_cases = (await query(
        `SELECT id, title, severity, status FROM cases WHERE assignee_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [u.id]
      )).rows;
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  if (req.user.sub !== req.params.id && !['senior_analyst','admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows } = await query(
    `SELECT id, email, name, role, color, bg, is_active, last_login_at FROM users WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// POST /api/users
router.post('/', requireAdmin, async (req, res) => {
  const { email, name, password, role = 'analyst', color = '#185FA5', bg = '#E6F1FB' } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'email, name, password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query(
      `INSERT INTO users (email, name, password_hash, role, color, bg) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, name, role`,
      [email.toLowerCase().trim(), name, hash, role, color, bg]
    );
    await audit(req, 'USER_CREATE', 'user', rows[0].id, { email, role });
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/users/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, role, is_active } = req.body;
  if (name      !== undefined) await query(`UPDATE users SET name=$1, updated_at=NOW() WHERE id=$2`,      [name, req.params.id]);
  if (role      !== undefined) await query(`UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2`,      [role, req.params.id]);
  if (is_active !== undefined) await query(`UPDATE users SET is_active=$1, updated_at=NOW() WHERE id=$2`, [is_active, req.params.id]);
  await audit(req, 'USER_UPDATE', 'user', req.params.id, req.body);
  const { rows } = await query(`SELECT id, email, name, role, color, bg, is_active FROM users WHERE id = $1`, [req.params.id]);
  res.json(rows[0]);
});

module.exports = router;
