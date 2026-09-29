'use strict'
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { query, pool } = require('./pool')

async function seed() {
  const { rows } = await query(`SELECT COUNT(*) AS n FROM users`)
  if (parseInt(rows[0].n) > 0) {
    console.log(`[seed] Already seeded (${rows[0].n} users) — skipping.`)
    await pool.end(); return
  }

  console.log('[seed] Seeding database...')
  const h = p => bcrypt.hashSync(p, 12)

  const users = await query(`
    INSERT INTO users (email,name,password_hash,role,color,bg) VALUES
      ('admin@casesphere.local',   'Admin User',  $1,'admin',          '#A32D2D','#FCEBEB'),
      ('rahman@casesphere.local',  'A. Rahman',   $2,'senior_analyst', '#185FA5','#E6F1FB'),
      ('santoso@casesphere.local', 'B. Santoso',  $3,'analyst',        '#3B6D11','#EAF3DE'),
      ('lim@casesphere.local',     'D. Lim',      $4,'readonly',       '#534AB7','#EEEDFE')
    RETURNING id, email
  `, [h('Admin@1234!'), h('Rahman@1234!'), h('Santoso@1234!'), h('Lim@1234!')])

  const u = {}
  users.rows.forEach(r => { u[r.email.split('@')[0]] = r.id })
  console.log(`[seed]   ${users.rows.length} users`)

  const cases = [
    { id:'C-001', title:'Ransomware infection — finance server', desc:'Ransomware detected on FIN-SRV-03 after a phishing email. Encrypted files across shared drives. C2 traffic to known TOR exit nodes.', sev:'Critical', status:'In Progress', tlp:'RED', assignee:u.rahman, by:u.admin, tags:['ransomware','finance'], mitre:[['T1566','Phishing'],['T1486','Data Encrypted for Impact'],['T1071','Application Layer Protocol']], tasks:[{t:'Isolate affected systems',d:true},{t:'Identify ransomware variant',d:true},{t:'Assess backup integrity',d:false},{t:'Notify stakeholders',d:false}], obs:[{type:'Hash',val:'a3f1b2c4d5e6f789012345',ioc:true},{type:'IP',val:'185.220.101.45',ioc:true},{type:'Domain',val:'secure-decrypt-now.onion',ioc:true}], tl:[{e:'Case opened'},{e:'Network isolation applied'},{e:'Variant identified: LockBit 3.0'}] },
    { id:'C-002', title:'Phishing campaign targeting HR', desc:'Mass phishing campaign impersonating the HR portal. 14 emails delivered before domain was blocked.', sev:'High', status:'Open', tlp:'AMBER', assignee:u.santoso, by:u.santoso, tags:['phishing','hr'], mitre:[['T1566','Phishing'],['T1078','Valid Accounts']], tasks:[{t:'Block sender domain',d:true},{t:'Pull affected mailboxes',d:false},{t:'Check clicked links',d:false}], obs:[{type:'Domain',val:'hr-portal-login.xyz',ioc:true},{type:'URL',val:'http://hr-portal-login.xyz/oauth',ioc:true}], tl:[{e:'Phishing email reported'},{e:'Domain blocked at gateway'}] },
    { id:'C-003', title:'Lateral movement — internal network', desc:'Pass-the-hash lateral movement detected from WS-0044 to 3 additional hosts.', sev:'High', status:'In Progress', tlp:'AMBER', assignee:u.rahman, by:u.rahman, tags:['lateral-movement','AD'], mitre:[['T1021','Remote Services'],['T1003','OS Credential Dumping']], tasks:[{t:'Trace source account',d:true},{t:'Review DC logs',d:false},{t:'Reset compromised credentials',d:false}], obs:[{type:'IP',val:'10.0.12.44',ioc:false},{type:'Hash',val:'d41d8cd98f00b204e9800998',ioc:true}], tl:[{e:'Anomalous SMB traffic detected'},{e:'SIEM alert: pass-the-hash pattern'}] },
    { id:'C-004', title:'Data exfiltration attempt — S3 bucket', desc:'AWS GuardDuty flagged bulk S3 GetObject from CI/CD IAM key. Possible supply chain compromise.', sev:'Critical', status:'Open', tlp:'RED', assignee:null, by:u.admin, tags:['exfiltration','cloud'], mitre:[['T1041','Exfiltration Over C2'],['T1078','Valid Accounts']], tasks:[{t:'Identify exfiltrated data scope',d:false},{t:'Revoke exposed IAM keys',d:false}], obs:[{type:'IP',val:'203.0.113.77',ioc:true},{type:'Domain',val:'exfil.burpcollab.net',ioc:true}], tl:[{e:'GuardDuty alert: bulk S3 GetObject'}] },
    { id:'C-005', title:'Brute force on VPN gateway', desc:'1,200 brute force attempts against AnyConnect VPN from 4 source IPs targeting 30 accounts.', sev:'Medium', status:'Open', tlp:'GREEN', assignee:u.santoso, by:u.santoso, tags:['brute-force','vpn'], mitre:[['T1110','Brute Force']], tasks:[{t:'Block source IPs',d:true},{t:'Review MFA enforcement',d:false}], obs:[{type:'IP',val:'91.108.4.22',ioc:true},{type:'IP',val:'45.33.32.156',ioc:true}], tl:[{e:'1,200 failed VPN login attempts'},{e:'Top IPs blocked'}] },
    { id:'C-006', title:'Malware on endpoint — marketing team', desc:'Adware detected via freeware download. No lateral movement or data exfiltration observed.', sev:'Low', status:'Resolved', tlp:'GREEN', assignee:u.santoso, by:u.santoso, tags:['malware','endpoint'], mitre:[['T1059','Command & Scripting Interpreter']], tasks:[{t:'Quarantine endpoint',d:true},{t:'Run full AV scan',d:true},{t:'Re-image if required',d:true}], obs:[{type:'Hash',val:'098f6bcd4621d373cade4e83',ioc:false}], tl:[{e:'AV alert on MKT-WS-12'},{e:'Endpoint quarantined'},{e:'Re-imaged and returned to user'}] },
  ]

  for (const c of cases) {
    await query(`INSERT INTO cases(id,title,description,severity,status,tlp,assignee_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.id,c.title,c.desc,c.sev,c.status,c.tlp,c.assignee,c.by])
    for (const tag of c.tags) await query(`INSERT INTO case_tags VALUES($1,$2)`, [c.id,tag])
    for (const [t,n] of c.mitre) await query(`INSERT INTO case_mitre VALUES($1,$2,$3)`, [c.id,t,n])
    for (const t of c.tasks) await query(`INSERT INTO tasks(case_id,title,done,created_by) VALUES($1,$2,$3,$4)`, [c.id,t.t,t.d,c.by])
    for (const o of c.obs) await query(`INSERT INTO observables(case_id,type,value,is_ioc,created_by) VALUES($1,$2,$3,$4,$5)`, [c.id,o.type,o.val,o.ioc,c.by])
    for (const e of c.tl) await query(`INSERT INTO timeline(case_id,event,user_id) VALUES($1,$2,$3)`, [c.id,e.e,c.by])
  }
  console.log(`[seed]   ${cases.length} cases`)

  await query(`INSERT INTO siem_alerts(id,title,severity,source,raw) VALUES
    ('A-001','Port scan detected from 198.51.100.22','Medium','Snort IDS','SRC=198.51.100.22 DST=10.0.0.0/8 FLAGS=SYN'),
    ('A-002','Outbound DNS to flagged domain resolv-update.ru','High','Splunk SIEM','dns.query="resolv-update.ru" src=10.0.5.33'),
    ('A-003','Multiple failed SSH logins — root account','High','Elastic SIEM','ssh_failed user=root count=87 src=45.33.99.11'),
    ('A-004','Large data transfer to external IP','Critical','Darktrace','src=10.0.12.88 dst=203.0.113.99 bytes_out=2.4GB')
  `)
  console.log(`[seed]   4 SIEM alerts`)

  await query(`SELECT setval('case_id_seq', 10)`)
  console.log('[seed] Complete!\n')
  console.log('  admin@casesphere.local   / Admin@1234!')
  console.log('  rahman@casesphere.local  / Rahman@1234!')
  console.log('  santoso@casesphere.local / Santoso@1234!\n')
  await pool.end()
}

seed().catch(err => { console.error(err); process.exit(1) })

// Export untuk dipakai oleh entrypoint.js (binary mode)
module.exports = { seed }
