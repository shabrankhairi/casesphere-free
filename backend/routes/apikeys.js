'use strict';
const express = require('express');
const crypto  = require('crypto');
const { query } = require('../db/pool');
const { requireAuth, requireAdmin, audit } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/apikeys — list semua key milik user
router.get('/', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { rows } = await query(`
    SELECT ak.id, ak.name, ak.key_preview, ak.is_active,
           ak.use_count, ak.last_used_at, ak.expires_at, ak.created_at,
           u.name AS owner_name, u.email AS owner_email
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    ${isAdmin ? '' : 'WHERE ak.user_id = $1'}
    ORDER BY ak.created_at DESC
  `, isAdmin ? [] : [req.user.sub]);
  res.json(rows);
});

// POST /api/apikeys — buat API key baru
router.post('/', async (req, res) => {
  const { name, expires_in_days } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  // Generate key
  const userOrg = await query(`SELECT org_id FROM users WHERE id=$1`, [req.user.sub])
  const orgId   = userOrg.rows[0]?.org_id || null
  const rawKey   = 'bb_' + crypto.randomBytes(32).toString('hex');
  const keyHash  = crypto.createHash('sha256').update(rawKey).digest('hex');
  const preview  = rawKey.slice(0, 8) + '...' + rawKey.slice(-4);
  const expiresAt = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000)
    : null;

  const { rows } = await query(`
    INSERT INTO api_keys (name, key_hash, key_preview, user_id, expires_at, org_id)
  VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, key_preview, created_at
`, [name, keyHash, preview, req.user.sub, expiresAt, orgId]);

  await audit(req, 'APIKEY_CREATE', 'api_key', rows[0].id, { name });

  // Return raw key SEKALI SAJA — tidak bisa dilihat lagi
  res.status(201).json({
    ...rows[0],
    key: rawKey,
    warning: 'Save this key now — it will not be shown again!',
  });
});

// DELETE /api/apikeys/:id — revoke key
router.delete('/:id', async (req, res) => {
  const { rows } = await query(`SELECT * FROM api_keys WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  await query(`DELETE FROM api_keys WHERE id = $1`, [req.params.id]);
  await audit(req, 'APIKEY_REVOKE', 'api_key', req.params.id, { name: rows[0].name });
  res.json({ deleted: req.params.id });
});

// PATCH /api/apikeys/:id/toggle — enable/disable
router.patch('/:id/toggle', requireAdmin, async (req, res) => {
  const { rows } = await query(`
    UPDATE api_keys SET is_active = NOT is_active WHERE id = $1 RETURNING *
  `, [req.params.id]);
  res.json(rows[0]);
});

module.exports = router;
