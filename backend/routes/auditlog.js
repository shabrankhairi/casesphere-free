'use strict';
const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireSenior } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireSenior);

// GET /api/audit
router.get('/', async (req, res) => {
  const { entity_type, limit = 50, offset = 0 } = req.query;
  let sql = `SELECT al.*, u.name AS user_name FROM audit_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1`;
  const params = [];
  let i = 1;
  if (entity_type) { sql += ` AND al.entity_type = $${i++}`; params.push(entity_type); }
  sql += ` ORDER BY al.created_at DESC LIMIT $${i++} OFFSET $${i}`;
  params.push(Math.min(parseInt(limit) || 50, 200), parseInt(offset) || 0);
  const { rows } = await query(sql, params);
  res.json(rows);
});

module.exports = router;
