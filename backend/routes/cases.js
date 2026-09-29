'use strict'
const { createSLA, updateSLA } = require('../services/sla');
const express = require('express')
const { query, getClient } = require('../db/pool')
const { requireAuth, requireAnalyst, requireSenior, requireAdmin, audit } = require('../middleware/auth')
const router = express.Router()
router.use(requireAuth)

async function hydrateCase(id) {
  const { rows } = await query(
    `SELECT c.*, u.name AS assignee_name, u.color AS assignee_color, u.bg AS assignee_bg, cb.name AS created_by_name, o.name AS org_name, o.slug AS org_slug FROM cases c LEFT JOIN users u ON c.assignee_id=u.id LEFT JOIN users cb ON c.created_by=cb.id LEFT JOIN organizations o ON c.org_id=o.id WHERE c.id=$1`,
    [id]
  );
  if (!rows[0]) return null;
  const c = rows[0];
  const [tags, mitre, tasks, obs, tl] = await Promise.all([
    query(`SELECT tag FROM case_tags WHERE case_id=$1 ORDER BY tag`, [id]),
    query(`SELECT technique,name FROM case_mitre WHERE case_id=$1`, [id]),
    query(`SELECT t.*,u.name AS assigned_to_name FROM tasks t LEFT JOIN users u ON t.assigned_to=u.id WHERE t.case_id=$1 ORDER BY t.created_at`, [id]),
    query(`SELECT o.*,u.name AS added_by FROM observables o LEFT JOIN users u ON o.created_by=u.id WHERE o.case_id=$1 ORDER BY o.created_at`, [id]),
    query(`SELECT tl.*,u.name AS user_name FROM timeline tl LEFT JOIN users u ON tl.user_id=u.id WHERE tl.case_id=$1 ORDER BY tl.created_at DESC`, [id]),
  ]);
  c.tags        = tags.rows.map(r => r.tag);
  c.mitre       = mitre.rows;
  c.tasks       = tasks.rows;
  c.observables = obs.rows;
  c.timeline    = tl.rows;
  return c;
}

async function addTl(caseId,event,userId) {
  await query(`INSERT INTO timeline(case_id,event,user_id) VALUES($1,$2,$3)`, [caseId,event,userId||null])
}

router.get('/meta/stats', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store')
    const { period = 'week', org_id } = req.query
    const orgFilter = org_id ? ` AND org_id='${org_id}'` : ''

    const intervalMap = {
      day:   '1 day',
      week:  '7 days',
      month: '1 month',
      year:  '1 year',
    }
    const interval = intervalMap[period] || '7 days'

    const [current, previous, totals, activity, siem, bySeverity, byStatus] = await Promise.all([
      // Current period
      query(`SELECT
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${interval}') AS new_cases,
  COUNT(*) FILTER (WHERE status='Open' AND created_at >= NOW() - INTERVAL '${interval}') AS new_open,
  COUNT(*) FILTER (WHERE status='Resolved' AND updated_at >= NOW() - INTERVAL '${interval}') AS new_resolved,
  COUNT(*) FILTER (WHERE severity='Critical' AND created_at >= NOW() - INTERVAL '${interval}') AS new_critical
  FROM cases WHERE 1=1${orgFilter}`),

      // Previous period (untuk perbandingan)
      query(`SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${interval}' * 2 AND created_at < NOW() - INTERVAL '${interval}') AS prev_cases,
        COUNT(*) FILTER (WHERE status='Open' AND created_at >= NOW() - INTERVAL '${interval}' * 2 AND created_at < NOW() - INTERVAL '${interval}') AS prev_open,
        COUNT(*) FILTER (WHERE status='Resolved' AND updated_at >= NOW() - INTERVAL '${interval}' * 2 AND updated_at < NOW() - INTERVAL '${interval}') AS prev_resolved,
        COUNT(*) FILTER (WHERE severity='Critical' AND created_at >= NOW() - INTERVAL '${interval}' * 2 AND created_at < NOW() - INTERVAL '${interval}') AS prev_critical
        FROM cases WHERE 1=1${orgFilter}`),

      // Total all time
      query(`SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='Open') AS open,
        COUNT(*) FILTER (WHERE status='In Progress') AS progress,
        COUNT(*) FILTER (WHERE status='Resolved') AS resolved,
        COUNT(*) FILTER (WHERE status='Closed') AS closed,
        COUNT(*) FILTER (WHERE severity='Critical') AS critical,
        COUNT(*) FILTER (WHERE severity='High') AS high,
        COUNT(*) FILTER (WHERE severity='Medium') AS medium,
        COUNT(*) FILTER (WHERE severity='Low') AS low
        FROM cases WHERE 1=1${orgFilter}`),

      // Activity feed
      query(`SELECT tl.event, tl.created_at, tl.case_id, u.name AS user_name
       FROM timeline tl
       LEFT JOIN users u ON tl.user_id=u.id
       LEFT JOIN cases c ON tl.case_id=c.id
       WHERE 1=1${orgFilter.replace('org_id','c.org_id')}
       ORDER BY tl.created_at DESC LIMIT 10`),

      // SIEM pending
      query(`SELECT COUNT(*) AS n FROM siem_alerts WHERE promoted=false${orgFilter}`),

      // Cases per severity per hari (trend chart)
      query(`SELECT
  DATE_TRUNC('day', created_at) AS date,
  severity,
  COUNT(*) AS count
  FROM cases
  WHERE created_at >= NOW() - INTERVAL '${interval}'${orgFilter}
  GROUP BY DATE_TRUNC('day', created_at), severity
  ORDER BY date ASC`),

      // Cases by status per hari
      query(`SELECT
  DATE_TRUNC('day', created_at) AS date,
  severity,
  COUNT(*) AS count
  FROM cases
  WHERE created_at >= NOW() - INTERVAL '${interval}'${orgFilter}
  GROUP BY DATE_TRUNC('day', created_at), severity
  ORDER BY date ASC`),
    ])

    // Hitung persentase perubahan
    const calcChange = (curr, prev) => {
      const c = parseInt(curr) || 0
      const p = parseInt(prev) || 0
      if (p === 0) return c > 0 ? 100 : 0
      return Math.round(((c - p) / p) * 100)
    }

    const cur = current.rows[0]
    const prv = previous.rows[0]

    res.json({
      // Totals
      ...totals.rows[0],
      siemPending: parseInt(siem.rows[0].n),

      // Current period stats
      period,
      periodStats: {
        newCases:    parseInt(cur.new_cases)    || 0,
        newOpen:     parseInt(cur.new_open)     || 0,
        newResolved: parseInt(cur.new_resolved) || 0,
        newCritical: parseInt(cur.new_critical) || 0,
      },

      // Change vs previous period
      changes: {
        cases:    calcChange(cur.new_cases,    prv.prev_cases),
        open:     calcChange(cur.new_open,     prv.prev_open),
        resolved: calcChange(cur.new_resolved, prv.prev_resolved),
        critical: calcChange(cur.new_critical, prv.prev_critical),
      },

      // Chart data
      trendBySeverity: bySeverity.rows,
      trendByStatus:   byStatus.rows,

      // Activity
      activity: activity.rows,
    })
  } catch (err) {
    console.error('Stats error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/meta/mitre', async (_,res) => {
  const { rows } = await query(`SELECT technique,name,COUNT(*) AS case_count,ARRAY_AGG(case_id) AS case_ids FROM case_mitre GROUP BY technique,name ORDER BY case_count DESC`)
  res.json(rows)
})

router.get('/', async (req,res) => {
  const { status,severity,assignee,q,org_id } = req.query
  let sql=`SELECT c.*,u.name AS assignee_name,u.color AS assignee_color,u.bg AS assignee_bg,o.name AS org_name,o.slug AS org_slug,ARRAY(SELECT tag FROM case_tags WHERE case_id=c.id) AS tags,ARRAY(SELECT json_build_object('technique',technique,'name',name) FROM case_mitre WHERE case_id=c.id) AS mitre FROM cases c LEFT JOIN users u ON c.assignee_id=u.id LEFT JOIN organizations o ON c.org_id=o.id WHERE 1=1`
  const p=[]; let i=1
  if (status)   { sql+=` AND c.status=$${i++}`;      p.push(status) }
  if (severity) { sql+=` AND c.severity=$${i++}`;    p.push(severity) }
  if (assignee) { sql+=` AND c.assignee_id=$${i++}`; p.push(assignee) }
  if (q)        { sql+=` AND (c.title ILIKE $${i} OR c.id ILIKE $${i})`; p.push(`%${q}%`); i++ }
  if (org_id)   { sql+=` AND c.org_id=$${i++}`;      p.push(org_id) }
  sql+=` ORDER BY c.created_at DESC`
  const { rows } = await query(sql,p)
  res.json(rows)
})

router.get('/:id', async (req,res) => {
  const c = await hydrateCase(req.params.id)
  if (!c) return res.status(404).json({ error:'Case not found' })
  res.json(c)
})

router.post('/', requireAnalyst, async (req,res) => {
  const { title,description='',severity='Medium',tlp='AMBER',assignee_id,tags=[],mitre=[] } = req.body
  if (!title) return res.status(400).json({ error:'Title required' })
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const seq = await client.query(`SELECT nextval('case_id_seq') AS n`)
    const id = 'C-'+String(seq.rows[0].n).padStart(3,'0')
    const userOrg = await query(`SELECT org_id FROM users WHERE id=$1`, [req.user.sub])
    const orgId   = userOrg.rows[0]?.org_id || null
    await client.query(`
  INSERT INTO cases (id,title,description,severity,status,tlp,assignee_id,created_by,org_id)
  VALUES ($1,$2,$3,$4,'Open',$5,$6,$7,$8)
`, [id, title, description, severity, tlp, assignee_id||null, req.user.sub, orgId])
    await client.query(`INSERT INTO cases(id,title,description,severity,status,tlp,assignee_id,created_by) VALUES($1,$2,$3,$4,'Open',$5,$6,$7)`,
      [id,title,description,severity,tlp,assignee_id||null,req.user.sub])
    for (const tag of tags) await client.query(`INSERT INTO case_tags VALUES($1,$2)`, [id,tag])
    for (const m of mitre)  await client.query(`INSERT INTO case_mitre VALUES($1,$2,$3)`, [id,m.technique,m.name])
    await client.query(`INSERT INTO tasks(case_id,title,created_by) VALUES($1,'Initial triage',$2),($1,'Identify affected scope',$2)`, [id,req.user.sub])
    await client.query(`INSERT INTO timeline(case_id,event,user_id) VALUES($1,'Case created',$2)`, [id,req.user.sub])
    await client.query('COMMIT')
    await createSLA(id, severity, new Date());
    await audit(req,'CASE_CREATE','case',id,{title,severity})
    res.status(201).json(await hydrateCase(id))
  } catch(err) { await client.query('ROLLBACK'); res.status(500).json({ error:err.message }) }
  finally { client.release() }
})

router.patch('/:id', requireAnalyst, async (req,res) => {
  const { id } = req.params
  const { rows } = await query(`SELECT * FROM cases WHERE id=$1`, [id])
  if (!rows[0]) return res.status(404).json({ error:'Not found' })
  const { title,description,severity,status,tlp,assignee_id } = req.body
  const changes=[]
  if (title!==undefined)       { await query(`UPDATE cases SET title=$1,updated_at=NOW() WHERE id=$2`,[title,id]);            changes.push('Title updated') }
  if (description!==undefined) { await query(`UPDATE cases SET description=$1,updated_at=NOW() WHERE id=$2`,[description,id]); changes.push('Description updated') }
  if (severity!==undefined)    { await query(`UPDATE cases SET severity=$1,updated_at=NOW() WHERE id=$2`,[severity,id]);       changes.push(`Severity → ${severity}`) }
  if (status!==undefined)      { await query(`UPDATE cases SET status=$1,updated_at=NOW() WHERE id=$2`,[status,id]);		changes.push(`Status → ${status}`);
  await updateSLA(id, status, new Date());
  }
  if (tlp!==undefined)         { await query(`UPDATE cases SET tlp=$1,updated_at=NOW() WHERE id=$2`,[tlp,id]);                changes.push(`TLP → ${tlp}`) }
  if ('assignee_id' in req.body) {
    await query(`UPDATE cases SET assignee_id=$1,updated_at=NOW() WHERE id=$2`, [assignee_id||null,id])
    const a = assignee_id ? (await query(`SELECT name FROM users WHERE id=$1`,[assignee_id])).rows[0] : null
    changes.push(`Assigned to ${a?a.name:'Unassigned'}`)
  }
  for (const e of changes) await addTl(id,e,req.user.sub)
  await audit(req,'CASE_UPDATE','case',id,req.body)
  res.json(await hydrateCase(id))
})

router.delete('/:id', requireAdmin, async (req,res) => {
  const { rowCount } = await query(`DELETE FROM cases WHERE id=$1`, [req.params.id])
  if (!rowCount) return res.status(404).json({ error:'Not found' })
  await audit(req,'CASE_DELETE','case',req.params.id,{})
  res.json({ deleted:req.params.id })
})

router.post('/:id/mitre', requireAnalyst, async (req,res) => {
  const { technique,name } = req.body
  if (!technique||!name) return res.status(400).json({ error:'technique and name required' })
  await query(`INSERT INTO case_mitre VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [req.params.id,technique,name])
  await addTl(req.params.id,`MITRE ${technique} (${name}) tagged`,req.user.sub)
  res.json({ case_id:req.params.id,technique,name })
})

router.delete('/:id/mitre/:technique', requireSenior, async (req,res) => {
  await query(`DELETE FROM case_mitre WHERE case_id=$1 AND technique=$2`, [req.params.id,req.params.technique])
  await addTl(req.params.id,`MITRE ${req.params.technique} removed`,req.user.sub)
  res.json({ deleted:req.params.technique })
})

router.post('/:id/tasks', requireAnalyst, async (req,res) => {
  const { title } = req.body
  if (!title) return res.status(400).json({ error:'title required' })
  const { rows } = await query(`INSERT INTO tasks(case_id,title,created_by) VALUES($1,$2,$3) RETURNING *`, [req.params.id,title,req.user.sub])
  res.status(201).json(rows[0])
})

router.patch('/:id/tasks/:tid', requireAnalyst, async (req,res) => {
  const { rows } = await query(`SELECT * FROM tasks WHERE id=$1 AND case_id=$2`, [req.params.tid,req.params.id])
  if (!rows[0]) return res.status(404).json({ error:'Task not found' })
  const { done,title } = req.body
  if (done!==undefined) { await query(`UPDATE tasks SET done=$1,updated_at=NOW() WHERE id=$2`,[done,req.params.tid]); await addTl(req.params.id,`Task "${rows[0].title}" marked ${done?'done':'pending'}`,req.user.sub) }
  if (title!==undefined) await query(`UPDATE tasks SET title=$1,updated_at=NOW() WHERE id=$2`,[title,req.params.tid])
  const updated = await query(`SELECT * FROM tasks WHERE id=$1`, [req.params.tid])
  res.json(updated.rows[0])
})

router.delete('/:id/tasks/:tid', requireAnalyst, async (req,res) => {
  await query(`DELETE FROM tasks WHERE id=$1 AND case_id=$2`, [req.params.tid,req.params.id])
  res.json({ deleted:req.params.tid })
})

router.post('/:id/observables', requireAnalyst, async (req,res) => {
  const { type,value,is_ioc=false,description='' } = req.body
  if (!type||!value) return res.status(400).json({ error:'type and value required' })
  const { rows } = await query(`INSERT INTO observables(case_id,type,value,is_ioc,description,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id,type,value,is_ioc,description,req.user.sub])
  await addTl(req.params.id,`Observable added: ${type} ${value}${is_ioc?' [IOC]':''}`,req.user.sub)
  res.status(201).json(rows[0])
})

router.delete('/:id/observables/:oid', requireSenior, async (req,res) => {
  await query(`DELETE FROM observables WHERE id=$1 AND case_id=$2`, [req.params.oid,req.params.id])
  res.json({ deleted:req.params.oid })
})

router.post('/:id/timeline', requireAnalyst, async (req,res) => {
  const { event } = req.body
  if (!event) return res.status(400).json({ error:'event required' })
  const { rows } = await query(`INSERT INTO timeline(case_id,event,user_id) VALUES($1,$2,$3) RETURNING *`, [req.params.id,event,req.user.sub])
  res.status(201).json(rows[0])
})
// ── Comments ─────────────────────────────────────────────────
router.get('/:id/comments', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT c.*, u.name AS user_name, u.color AS user_color, u.bg AS user_bg
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.case_id = $1
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/comments', requireAnalyst, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  try {
    const { rows } = await query(`
      INSERT INTO comments (case_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [req.params.id, req.user.sub, content.trim()]);
    await query(`
      INSERT INTO timeline (case_id, event, user_id)
      VALUES ($1, $2, $3)
    `, [req.params.id, `Comment added by ${req.user.name || req.user.email}`, req.user.sub]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/comments/:cid', requireAnalyst, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM comments WHERE id = $1`, [req.params.cid]);
    if (!rows[0]) return res.status(404).json({ error: 'Comment not found' });
    // Hanya bisa hapus comment sendiri, kecuali admin
    if (rows[0].user_id !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only delete your own comments' });
    }
    await query(`DELETE FROM comments WHERE id = $1`, [req.params.cid]);
    res.json({ deleted: req.params.cid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router
