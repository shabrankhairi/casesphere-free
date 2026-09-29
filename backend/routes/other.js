'use strict'
const express  = require('express')
const bcrypt   = require('bcryptjs')
const fetch    = require('node-fetch')
const { query, getClient } = require('../db/pool')
const { requireAuth, requireAnalyst, requireSenior, requireAdmin, audit } = require('../middleware/auth')

/* ══ Users ══════════════════════════════════════════════════ */
const usersRouter = express.Router()
usersRouter.use(requireAuth)

usersRouter.get('/', requireSenior, async (_,res) => {
  const { rows } = await query(`
    SELECT u.id,u.email,u.name,u.role,u.color,u.bg,u.is_active,u.last_login_at,
      COUNT(c.id) FILTER(WHERE TRUE) AS total_cases,
      COUNT(c.id) FILTER(WHERE c.status IN ('Open','In Progress')) AS active_cases
    FROM users u LEFT JOIN cases c ON c.assignee_id=u.id GROUP BY u.id ORDER BY u.name`)
  for (const u of rows) {
    u.recent_cases = (await query(`SELECT id,title,severity,status FROM cases WHERE assignee_id=$1 ORDER BY created_at DESC LIMIT 3`,[u.id])).rows
  }
  res.json(rows)
})

usersRouter.get('/:id', async (req,res) => {
  if (req.user.sub !== req.params.id && !['senior_analyst','admin'].includes(req.user.role))
    return res.status(403).json({ error:'Forbidden' })
  const { rows } = await query(`SELECT id,email,name,role,color,bg,is_active,last_login_at FROM users WHERE id=$1`, [req.params.id])
  if (!rows[0]) return res.status(404).json({ error:'Not found' })
  res.json(rows[0])
})

usersRouter.post('/', requireAdmin, async (req,res) => {
  const { email,name,password,role='analyst',color='#185FA5',bg='#E6F1FB' } = req.body
  if (!email||!name||!password) return res.status(400).json({ error:'email, name, password required' })
  if (password.length < 8) return res.status(400).json({ error:'Password min 8 characters' })
  const hash = await bcrypt.hash(password, 12)
  try {
    const { rows } = await query(`INSERT INTO users(email,name,password_hash,role,color,bg) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,name,role`,
      [email.toLowerCase(),name,hash,role,color,bg])
    await audit(req,'USER_CREATE','user',rows[0].id,{email,role})
    res.status(201).json(rows[0])
  } catch(e) {
    if (e.code==='23505') return res.status(409).json({ error:'Email already exists' })
    throw e
  }
})

usersRouter.patch('/:id', requireAdmin, async (req,res) => {
  const { name,role,is_active } = req.body
  if (name!==undefined)      await query(`UPDATE users SET name=$1,updated_at=NOW() WHERE id=$2`,[name,req.params.id])
  if (role!==undefined)      await query(`UPDATE users SET role=$1,updated_at=NOW() WHERE id=$2`,[role,req.params.id])
  if (is_active!==undefined) await query(`UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2`,[is_active,req.params.id])
  await audit(req,'USER_UPDATE','user',req.params.id,req.body)
  const { rows } = await query(`SELECT id,email,name,role,color,bg,is_active FROM users WHERE id=$1`,[req.params.id])
  res.json(rows[0])
})

/* ══ SIEM ════════════════════════════════════════════════════ */
const siemRouter = express.Router()
siemRouter.use(requireAuth)

siemRouter.get('/', async (_,res) => {
  const { rows } = await query(`SELECT * FROM siem_alerts WHERE promoted=false ORDER BY created_at DESC`)
  res.json(rows)
})

siemRouter.post('/', requireAnalyst, async (req,res) => {
  const { title,severity='Medium',source='Manual',raw='' } = req.body
  if (!title) return res.status(400).json({ error:'title required' })
  const { rows:cnt } = await query(`SELECT COUNT(*)+1 AS n FROM siem_alerts`)
  const id = 'A-'+String(+cnt[0].n).padStart(3,'0')
  const { rows } = await query(`INSERT INTO siem_alerts(id,title,severity,source,raw) VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,title,severity,source,raw])
  res.status(201).json(rows[0])
})

siemRouter.post('/:id/promote', requireAnalyst, async (req,res) => {
  const alert = (await query(`SELECT * FROM siem_alerts WHERE id=$1`,[req.params.id])).rows[0]
  if (!alert)         return res.status(404).json({ error:'Alert not found' })
  if (alert.promoted) return res.status(409).json({ error:'Already promoted' })
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const seq = await client.query(`SELECT nextval('case_id_seq') AS n`)
    const caseId = 'C-'+String(seq.rows[0].n).padStart(3,'0')
    const tag = alert.source.toLowerCase().replace(/\s+/g,'-')
    await client.query(`INSERT INTO cases(id,title,description,severity,status,tlp,created_by) VALUES($1,$2,$3,$4,'Open','AMBER',$5)`,
      [caseId,alert.title,`From ${alert.source}: ${alert.raw}`,alert.severity,req.user.sub])
    await client.query(`INSERT INTO case_tags VALUES($1,'siem'),($1,$2)`,[caseId,tag])
    await client.query(`INSERT INTO tasks(case_id,title,created_by) VALUES($1,'Triage alert',$2),($1,'Identify affected assets',$2)`,[caseId,req.user.sub])
    await client.query(`INSERT INTO timeline(case_id,event,user_id) VALUES($1,$2,$3),($1,'Case created from SIEM alert',$3)`,
      [caseId,`Alert from ${alert.source}: ${alert.title}`,req.user.sub])
    await client.query(`UPDATE siem_alerts SET promoted=true,case_id=$1 WHERE id=$2`,[caseId,alert.id])
    await client.query('COMMIT')
    await audit(req,'SIEM_PROMOTE','siem_alert',alert.id,{case_id:caseId})
    res.status(201).json({ case_id:caseId, alert_id:alert.id })
  } catch(err) { await client.query('ROLLBACK'); res.status(500).json({ error:err.message }) }
  finally { client.release() }
})

/* ══ AI ══════════════════════════════════════════════════════ */
const aiRouter = express.Router()
aiRouter.use(requireAuth)

aiRouter.post('/analyze/:caseId', async (req,res) => {
  const { caseId } = req.params
  const c = (await query(`SELECT * FROM cases WHERE id=$1`,[caseId])).rows[0]
  if (!c) return res.status(404).json({ error:'Case not found' })
  if (!process.env.ANTHROPIC_API_KEY?.startsWith('sk-'))
    return res.status(503).json({ error:'ANTHROPIC_API_KEY not configured in .env' })

  const [mitre,obs,done,pend] = await Promise.all([
    query(`SELECT technique,name FROM case_mitre WHERE case_id=$1`,[caseId]),
    query(`SELECT type,value,is_ioc FROM observables WHERE case_id=$1`,[caseId]),
    query(`SELECT title FROM tasks WHERE case_id=$1 AND done=true`,[caseId]),
    query(`SELECT title FROM tasks WHERE case_id=$1 AND done=false`,[caseId]),
  ])

  const prompt = `You are a senior SOC analyst. Analyze this security incident and write a concise 3-4 sentence summary:
1. Likely attack chain based on MITRE ATT&CK techniques
2. Current containment status from completed tasks
3. Top recommended next steps

Case: ${c.id} — ${c.title}
Severity: ${c.severity} | Status: ${c.status} | TLP: ${c.tlp}
Description: ${c.description}
MITRE: ${mitre.rows.map(m=>`${m.technique}(${m.name})`).join(', ')||'None'}
Observables: ${obs.rows.map(o=>`${o.type}:${o.value}${o.is_ioc?' [IOC]':''}`).join(', ')||'None'}
Done tasks: ${done.rows.map(t=>t.title).join(', ')||'None'}
Pending: ${pend.rows.map(t=>t.title).join(', ')||'All complete'}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1000, messages:[{role:'user',content:prompt}] }),
    })
    if (!resp.ok) { const e=await resp.json(); return res.status(resp.status).json({error:e.error?.message}) }
    const data    = await resp.json()
    const content = data.content?.[0]?.text || 'Analysis unavailable.'
    await query(`INSERT INTO ai_analysis(case_id,content) VALUES($1,$2) ON CONFLICT(case_id) DO UPDATE SET content=$2,created_at=NOW()`,[caseId,content])
    res.json({ case_id:caseId, content })
  } catch(err) { res.status(500).json({ error:'Failed to reach Anthropic: '+err.message }) }
})

aiRouter.get('/analyze/:caseId', async (req,res) => {
  const { rows } = await query(`SELECT * FROM ai_analysis WHERE case_id=$1`,[req.params.caseId])
  if (!rows[0]) return res.status(404).json({ error:'No cached analysis' })
  res.json(rows[0])
})

/* ══ Audit Log ════════════════════════════════════════════════ */
const auditRouter = express.Router()
auditRouter.use(requireAuth, requireSenior)

auditRouter.get('/', async (req,res) => {
  const { entity_type,limit=50,offset=0 } = req.query
  let sql=`SELECT al.*,u.name AS user_name FROM audit_log al LEFT JOIN users u ON al.user_id=u.id WHERE 1=1`
  const p=[]; let i=1
  if (entity_type) { sql+=` AND al.entity_type=$${i++}`; p.push(entity_type) }
  sql+=` ORDER BY al.created_at DESC LIMIT $${i++} OFFSET $${i}`
  p.push(Math.min(+limit||50,200), +offset||0)
  const { rows } = await query(sql,p)
  res.json(rows)
})

module.exports = { usersRouter, siemRouter, aiRouter, auditRouter }
