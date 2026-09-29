'use strict';
const { createSLA } = require('../services/sla');
const express = require('express');
const { query, getClient } = require('../db/pool');
const { requireAuth, requireAnalyst, audit } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/siem
router.get('/', async (req, res) => {
  const { org_id } = req.query
  let sql = `SELECT sa.*, o.name AS org_name FROM siem_alerts sa LEFT JOIN organizations o ON sa.org_id=o.id WHERE sa.promoted=false`
  const params = []
  if (org_id) { sql += ` AND sa.org_id=$1`; params.push(org_id) }
  sql += ` ORDER BY sa.created_at DESC`
  const { rows } = await query(sql, params)
  res.json(rows)
})
//router.get('/', async (_req, res) => {
  //const { rows } = await query(`SELECT sa.*, o.name AS org_name, o.slug AS org_slug
  //FROM siem_alerts sa
  //LEFT JOIN organizations o ON sa.org_id = o.id
  //WHERE sa.promoted = false
  //ORDER BY sa.created_at DESC`);
  //res.json(rows);
//});

// POST /api/siem — ingest new alert
router.post('/', requireAnalyst, async (req, res) => {
  const { title, severity = 'Medium', source = 'Manual', raw = '', org_id } = req.body
  if (!title) return res.status(400).json({ error: 'title required' })

  // org dari body (switcher), fallback ke org user
  let orgId = org_id || null
  if (!orgId) {
    const userOrg = await query(`SELECT org_id FROM users WHERE id=$1`, [req.user.sub])
    orgId = userOrg.rows[0]?.org_id || null
  }

  const { rows: cnt } = await query(`SELECT COUNT(*)+1 AS n FROM siem_alerts`)
  const id = 'A-' + String(parseInt(cnt[0].n)).padStart(3, '0')

  const { rows } = await query(
  `INSERT INTO siem_alerts (id, title, severity, source, raw, org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
  [id, title, severity, source, raw, orgId]
)
  res.status(201).json(rows[0])
})

// POST /api/siem/:id/promote — create case from alert
router.post('/:id/promote', requireAnalyst, async (req, res) => {
  const alert = (await query(`SELECT * FROM siem_alerts WHERE id = $1`, [req.params.id])).rows[0];
  if (!alert)         return res.status(404).json({ error: 'Alert not found' });
  if (alert.promoted) return res.status(409).json({ error: 'Alert already promoted' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const seq    = await client.query(`SELECT nextval('case_id_seq') AS n`);
    const caseId = 'C-' + String(seq.rows[0].n).padStart(3, '0');
    const tag    = alert.source.toLowerCase().replace(/\s+/g, '-');

     await client.query(
      `INSERT INTO cases (id, title, description, severity, status, tlp, created_by, org_id) VALUES ($1,$2,$3,$4,'Open','AMBER',$5,$6)`,
      [caseId, alert.title, `Ingested from ${alert.source}. Raw: ${alert.raw}`, alert.severity, req.user.sub, alert.org_id]
    );
    await client.query(`INSERT INTO case_tags VALUES ($1,'siem'), ($1,$2)`, [caseId, tag]);
    await client.query(
      `INSERT INTO tasks (case_id, title, created_by) VALUES ($1,'Triage and confirm alert',$2), ($1,'Identify affected assets',$2)`,
      [caseId, req.user.sub]
    );
    await client.query(
      `INSERT INTO timeline (case_id, event, user_id) VALUES ($1,$2,$3), ($1,'Case created from SIEM alert',$3)`,
      [caseId, `Alert ingested from ${alert.source}: ${alert.title}`, req.user.sub]
    );
    await client.query(`UPDATE siem_alerts SET promoted = true, case_id = $1 WHERE id = $2`, [caseId, alert.id]);
    await client.query('COMMIT');
    await createSLA(caseId, alert.severity, new Date());
    await audit(req, 'SIEM_PROMOTE', 'siem_alert', alert.id, { case_id: caseId });
    res.status(201).json({ case_id: caseId, alert_id: alert.id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

// MARKER_1721336667
