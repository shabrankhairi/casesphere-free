'use strict';
const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, requireSenior } = require('../middleware/auth');
const { checkBreaches, getSLAStatus } = require('../services/sla');

const router = express.Router();
router.use(requireAuth);

// GET /api/sla — semua kasus dengan SLA info
router.get('/', async (req, res) => {
  try {
    await checkBreaches();

    const { filter = 'all' } = req.query;
    let whereClause = '';
    if (filter === 'breached')  whereClause = 'AND (s.ttr_breached = TRUE OR s.tfr_breached = TRUE)';
    if (filter === 'at_risk')   whereClause = `AND s.ttr_met_at IS NULL AND s.ttr_deadline > NOW() AND s.ttr_deadline < NOW() + INTERVAL '30 minutes'`;
    if (filter === 'active')    whereClause = `AND c.status NOT IN ('Resolved','Closed')`;

    const { rows } = await query(`
      SELECT
        c.id, c.title, c.severity, c.status, c.created_at,
        u.name AS assignee_name, u.color AS assignee_color, u.bg AS assignee_bg,
        s.ttr_deadline, s.ttr_met_at, s.ttr_breached,
        s.tfr_deadline, s.tfr_met_at, s.tfr_breached,
        s.created_at AS sla_created_at,
        s.severity AS sla_severity
      FROM cases c
      LEFT JOIN sla_tracking s ON s.case_id = c.id
      LEFT JOIN users u ON c.assignee_id = u.id
      WHERE s.id IS NOT NULL ${whereClause}
      ORDER BY
        (s.ttr_breached OR s.tfr_breached) DESC,
        s.ttr_deadline ASC
    `);

    const now = new Date();
    const result = rows.map(row => ({
      ...row,
      sla: getSLAStatus(row, now),
    }));

    // Summary stats
    const stats = {
      total:    result.length,
      breached: result.filter(r => r.ttr_breached || r.tfr_breached).length,
      at_risk:  result.filter(r => r.sla?.ttr.status === 'warning' || r.sla?.tfr.status === 'warning').length,
      met:      result.filter(r => r.sla?.ttr.status === 'met' && r.sla?.tfr.status === 'met').length,
      active:   result.filter(r => !['Resolved','Closed'].includes(r.status)).length,
    };

    res.json({ cases: result, stats });
  } catch (err) {
    console.error('SLA error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sla/:caseId — SLA detail untuk satu case
router.get('/:caseId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM sla_tracking WHERE case_id = $1
    `, [req.params.caseId]);

    if (!rows[0]) return res.status(404).json({ error: 'No SLA tracking for this case' });
    res.json({ ...rows[0], sla: getSLAStatus(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
