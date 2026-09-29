'use strict';
const express  = require('express');
const crypto   = require('crypto');
const { query, getClient } = require('../db/pool');
const { createSLA }        = require('../services/sla');

const router = express.Router();

// ── API Key middleware ────────────────────────────────────────
// Support 3 cara auth:
// 1. Header: X-API-Key: xxx
// 2. Header: Authorization: ApiKey xxx
// 3. Query:  ?api_key=xxx

async function requireApiKey(req, res, next) {
  const key =
    req.headers['x-api-key'] ||
    req.headers['authorization']?.replace(/^ApiKey\s+/i, '') ||
    req.query.api_key;

  if (!key) {
    return res.status(401).json({
      error:   'API key required',
      hint:    'Provide via X-API-Key header, Authorization: ApiKey <key>, or ?api_key=<key>',
    });
  }

  // Hash key untuk compare
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const { rows } = await query(`
    SELECT ak.*, u.id AS user_id, u.email, u.role, u.name
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.key_hash = $1
      AND ak.is_active = TRUE
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
  `, [keyHash]);

  if (!rows[0]) {
    return res.status(401).json({ error: 'Invalid or expired API key' });
  }

  // Update last used
  await query(`UPDATE api_keys SET last_used_at = NOW(), use_count = use_count + 1 WHERE id = $1`, [rows[0].id]);

  req.apiKey = rows[0];
  req.user   = {
    sub:   rows[0].user_id,
    email: rows[0].email,
    role:  rows[0].role,
    name:  rows[0].name,
  };
  next();
}

// ── Normalize alert dari berbagai format SIEM ─────────────────
function normalizeAlert(body, source) {
  // Auto-detect format
  const fmt = detectFormat(body);

  switch (fmt) {
    case 'splunk':     return normalizeSplunk(body, source);
    case 'elastic':    return normalizeElastic(body, source);
    case 'qradar':     return normalizeQRadar(body, source);
    case 'sentinel':   return normalizeSentinel(body, source);
    case 'wazuh':      return normalizeWazuh(body, source);
    case 'darktrace':  return normalizeDarktrace(body, source);
    case 'cef':        return normalizeCEF(body, source);
    case 'leef':       return normalizeLEEF(body, source);
    default:           return normalizeGeneric(body, source);
  }
}

function detectFormat(body) {
  // Splunk
  if (body.result || body.search_name || body.sid)             return 'splunk';
  // Elastic
  if (body.hits || body._source || body.kibana?.alert)         return 'elastic';
  // QRadar
  if (body.offenseId || body.offense_id || body.qid)          return 'qradar';
  // Microsoft Sentinel
  if (body.WorkspaceId || body.AlertName || body.SystemAlertId) return 'sentinel';
  // Wazuh
  if (body.rule?.id || body.agent?.name || body.manager?.name) return 'wazuh';
  // Darktrace
  if (body.pbid || body.model?.name || body.device?.hostname)  return 'darktrace';
  // CEF format
  if (typeof body === 'string' && body.startsWith('CEF:'))     return 'cef';
  // LEEF format
  if (typeof body === 'string' && body.startsWith('LEEF:'))    return 'leef';
  return 'generic';
}

function mapSeverity(value) {
  const v = String(value).toLowerCase();
  if (['critical','5','p1','crit','emergency'].includes(v))    return 'Critical';
  if (['high','4','p2','error'].includes(v))                   return 'High';
  if (['medium','3','p3','warning','warn'].includes(v))        return 'Medium';
  if (['low','2','1','p4','p5','info','informational'].includes(v)) return 'Low';
  const n = parseInt(v);
  if (!isNaN(n)) {
    if (n >= 9)  return 'Critical';
    if (n >= 7)  return 'High';
    if (n >= 4)  return 'Medium';
    return 'Low';
  }
  return 'Medium';
}

// Splunk
function normalizeSplunk(body, source) {
  const result = body.result || body;
  return {
    title:    body.search_name || result.alert_name || result.title || 'Splunk Alert',
    severity: mapSeverity(result.severity || result.urgency || body.severity || 'medium'),
    source:   source || 'Splunk',
    raw:      JSON.stringify(result).slice(0, 1000),
    meta: {
      search_name: body.search_name,
      sid:         body.sid,
      host:        result.host,
      source_ip:   result.src_ip || result.src,
      dest_ip:     result.dest_ip || result.dest,
      user:        result.user,
    },
  };
}

// Elastic SIEM
function normalizeElastic(body, source) {
  const alert  = body.kibana?.alert || body._source || body;
  const rule   = alert['kibana.alert.rule.name'] || alert.rule?.name || alert.signal?.rule?.name || '';
  return {
    title:    rule || alert.message || alert.title || 'Elastic SIEM Alert',
    severity: mapSeverity(
      alert['kibana.alert.severity'] ||
      alert.severity ||
      alert.signal?.rule?.severity ||
      'medium'
    ),
    source:   source || 'Elastic SIEM',
    raw:      JSON.stringify(alert).slice(0, 1000),
    meta: {
      rule_id:   alert['kibana.alert.rule.uuid'] || alert.rule?.id,
      host:      alert['host.name'] || alert.host?.name,
      source_ip: alert['source.ip'] || alert.source?.ip,
      dest_ip:   alert['destination.ip'] || alert.destination?.ip,
      user:      alert['user.name'] || alert.user?.name,
    },
  };
}

// Microsoft Sentinel
function normalizeSentinel(body, source) {
  return {
    title:    body.AlertName || body.DisplayName || 'Microsoft Sentinel Alert',
    severity: mapSeverity(body.Severity || body.AlertSeverity || 'medium'),
    source:   source || 'Microsoft Sentinel',
    raw:      JSON.stringify(body).slice(0, 1000),
    meta: {
      alert_id:    body.SystemAlertId || body.AlertId,
      workspace:   body.WorkspaceId,
      tactics:     body.Tactics,
      techniques:  body.Techniques,
      entities:    body.Entities,
    },
  };
}

// IBM QRadar
function normalizeQRadar(body, source) {
  return {
    title:    body.description || body.offense_name || 'QRadar Offense',
    severity: mapSeverity(body.severity || body.magnitude || 'medium'),
    source:   source || 'IBM QRadar',
    raw:      JSON.stringify(body).slice(0, 1000),
    meta: {
      offense_id:  body.offenseId || body.offense_id,
      category:    body.categories?.[0],
      source_ip:   body.source_address_ids?.[0] || body.source_ip,
      dest_ip:     body.destination_address_ids?.[0],
      event_count: body.event_count,
    },
  };
}

// Wazuh
function normalizeWazuh(body, source) {
  const rule = body.rule || {};
  return {
    title:    rule.description || body.full_log?.slice(0, 100) || 'Wazuh Alert',
    severity: mapSeverity(rule.level || 'medium'),
    source:   source || 'Wazuh',
    raw:      JSON.stringify(body).slice(0, 1000),
    meta: {
      rule_id:   rule.id,
      rule_level: rule.level,
      agent:     body.agent?.name,
      agent_ip:  body.agent?.ip,
      mitre:     rule.mitre?.id,
    },
  };
}

// Darktrace
function normalizeDarktrace(body, source) {
  return {
    title:    body.model?.name || body.summary || 'Darktrace Alert',
    severity: mapSeverity(body.score >= 0.8 ? 'critical' : body.score >= 0.6 ? 'high' : body.score >= 0.4 ? 'medium' : 'low'),
    source:   source || 'Darktrace',
    raw:      JSON.stringify(body).slice(0, 1000),
    meta: {
      pbid:     body.pbid,
      score:    body.score,
      device:   body.device?.hostname || body.device?.ip,
      category: body.model?.tags?.[0],
    },
  };
}

// CEF (Common Event Format)
function normalizeCEF(body, source) {
  const line   = typeof body === 'string' ? body : body.message || '';
  const parts  = line.split('|');
  const ext    = {};
  if (parts[7]) {
    parts[7].split(' ').forEach(p => {
      const [k, ...v] = p.split('=');
      if (k) ext[k] = v.join('=');
    });
  }
  return {
    title:    parts[5] || 'CEF Alert',
    severity: mapSeverity(ext.severity || parts[6] || 'medium'),
    source:   source || parts[1] || 'CEF Source',
    raw:      line.slice(0, 1000),
    meta: {
      device_vendor:  parts[1],
      device_product: parts[2],
      device_version: parts[3],
      signature_id:   parts[4],
      source_ip:      ext.src,
      dest_ip:        ext.dst,
      user:           ext.duser || ext.suser,
    },
  };
}

// LEEF (Log Event Extended Format)
function normalizeLEEF(body, source) {
  const line = typeof body === 'string' ? body : body.message || '';
  const ext  = {};
  const extPart = line.split('\t');
  extPart.forEach(p => {
    const [k, ...v] = p.split('=');
    if (k) ext[k.trim()] = v.join('=').trim();
  });
  return {
    title:    ext.cat || ext.devEventName || 'LEEF Alert',
    severity: mapSeverity(ext.severity || ext.sev || 'medium'),
    source:   source || 'LEEF Source',
    raw:      line.slice(0, 1000),
    meta: {
      source_ip: ext.src,
      dest_ip:   ext.dst,
      user:      ext.usrName,
    },
  };
}

// Generic / Custom
function normalizeGeneric(body, source) {
  return {
    title:    body.title    || body.name       || body.alert_name  ||
              body.message  || body.description || body.summary    || 'Security Alert',
    severity: mapSeverity(
      body.severity || body.priority || body.level ||
      body.risk     || body.urgency  || 'medium'
    ),
    source:   source || body.source || body.vendor || body.product || 'SIEM',
    raw:      JSON.stringify(body).slice(0, 1000),
    meta:     {
      source_ip: body.src_ip || body.source_ip || body.src,
      dest_ip:   body.dst_ip || body.dest_ip   || body.dst,
      user:      body.user   || body.username  || body.account,
      host:      body.host   || body.hostname  || body.device,
    },
  };
}

// ── Extract observables dari alert ────────────────────────────
function extractObservables(meta, raw) {
  const obs = [];
  const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // IP addresses
  const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const ips = [...new Set(rawStr.match(ipRegex) || [])].filter(ip =>
    !ip.startsWith('127.') && !ip.startsWith('0.')
  );
  ips.slice(0, 5).forEach(ip => obs.push({ type: 'IP', value: ip, is_ioc: false }));

  // Domain
  const domainRegex = /\b([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;
  const domains = [...new Set(rawStr.match(domainRegex) || [])].filter(d =>
    !d.endsWith('.local') && !d.endsWith('.internal') && d.includes('.')
  );
  domains.slice(0, 3).forEach(d => obs.push({ type: 'Domain', value: d, is_ioc: false }));

  // Hash MD5/SHA
  const hashRegex = /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g;
  const hashes = [...new Set(rawStr.match(hashRegex) || [])];
  hashes.slice(0, 3).forEach(h => obs.push({ type: 'Hash', value: h, is_ioc: false }));

  return obs;
}

// ── Suggest MITRE techniques ──────────────────────────────────
function suggestMITRE(title, raw) {
  const text = (title + ' ' + raw).toLowerCase();
  const suggestions = [];

  const rules = [
    { keywords: ['phish','spearphish','email','attachment'],  technique: 'T1566', name: 'Phishing' },
    { keywords: ['brute','password spray','login fail'],       technique: 'T1110', name: 'Brute Force' },
    { keywords: ['lateral','smb','pass the hash','wmi'],       technique: 'T1021', name: 'Remote Services' },
    { keywords: ['powershell','cmd','script','exec'],          technique: 'T1059', name: 'Command & Scripting' },
    { keywords: ['dns tunnel','c2','command and control','beacon'], technique: 'T1071', name: 'Application Layer Protocol' },
    { keywords: ['exfil','upload','transfer','data out'],      technique: 'T1041', name: 'Exfiltration Over C2' },
    { keywords: ['ransomware','encrypt','locked','ransom'],    technique: 'T1486', name: 'Data Encrypted for Impact' },
    { keywords: ['privilege','uac','admin','escalat'],         technique: 'T1068', name: 'Exploitation for Privilege Escalation' },
    { keywords: ['credential','lsass','mimikatz','dump'],      technique: 'T1003', name: 'OS Credential Dumping' },
    { keywords: ['persist','autorun','startup','registry'],    technique: 'T1547', name: 'Boot or Logon Autostart' },
    { keywords: ['scan','nmap','recon','enumerat'],            technique: 'T1046', name: 'Network Service Discovery' },
    { keywords: ['inject','dll','process hollow'],             technique: 'T1055', name: 'Process Injection' },
  ];

  rules.forEach(rule => {
    if (rule.keywords.some(kw => text.includes(kw))) {
      suggestions.push({ technique: rule.technique, name: rule.name });
    }
  });

  return suggestions.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// ── POST /api/ingest — main ingestion endpoint ─────────────────
router.post('/', requireApiKey, async (req, res) => {
  try {
    const source     = req.headers['x-siem-source'] || req.query.source || null;
    const userOrg = await query(`SELECT org_id FROM users WHERE id=$1`, [req.user.sub])
    const orgId   = userOrg.rows[0]?.org_id || null
    const autoPromote = req.headers['x-auto-promote'] === 'true' || req.query.auto_promote === 'true';
    const dryRun     = req.query.dry_run === 'true';

    // Support single alert or batch (array)
    const payloads = Array.isArray(req.body) ? req.body : [req.body];
    if (payloads.length > 50) {
      return res.status(400).json({ error: 'Max 50 alerts per batch' });
    }

    const results = [];

    for (const payload of payloads) {
      // Normalize
      const normalized = normalizeAlert(payload, source);
      const observables = extractObservables(normalized.meta, normalized.raw);
      const mitreSuggestions = suggestMITRE(normalized.title, normalized.raw);

      if (dryRun) {
        results.push({
          dry_run: true,
          normalized,
          observables,
          mitre_suggestions: mitreSuggestions,
        });
        continue;
      }

      // Save as SIEM alert
      const { rows: cnt } = await query(`SELECT COUNT(*)+1 AS n FROM siem_alerts`);
      const alertId = 'A-' + String(parseInt(cnt[0].n)).padStart(3, '0');

      await query(`
       INSERT INTO siem_alerts (id, title, severity, source, raw, org_id)
  VALUES ($1, $2, $3, $4, $5, $6)
`, [alertId, normalized.title, normalized.severity, normalized.source, normalized.raw, orgId]);

      let caseId = null;

      // Auto-promote to case if requested
      if (autoPromote) {
        const client = await getClient();
        try {
          await client.query('BEGIN');
          const seq = await client.query(`SELECT nextval('case_id_seq') AS n`);
          caseId = 'C-' + String(seq.rows[0].n).padStart(3, '0');
          const tag = normalized.source.toLowerCase().replace(/\s+/g, '-');

          await client.query(`
            INSERT INTO cases (id,title,description,severity,status,tlp,created_by,org_id)
  VALUES ($1,$2,$3,$4,'Open','AMBER',$5,$6)
`, [caseId, normalized.title, `Auto-ingested from ${normalized.source}.\n\nRaw: ${normalized.raw}`, normalized.severity, req.user.sub, orgId]);

          await client.query(`INSERT INTO case_tags VALUES ($1,'siem'),($1,$2)`, [caseId, tag]);

          // Default tasks
          const tasks = [
            'Triage and verify alert',
            'Identify affected assets',
            'Contain threat',
          ];
          for (const t of tasks) {
            await client.query(`INSERT INTO tasks (case_id,title,created_by) VALUES ($1,$2,$3)`, [caseId, t, req.user.sub]);
          }

          // Auto-add observables
          for (const obs of observables) {
            await client.query(`
              INSERT INTO observables (case_id,type,value,is_ioc,created_by)
              VALUES ($1,$2,$3,$4,$5)
            `, [caseId, obs.type, obs.value, obs.is_ioc, req.user.sub]);
          }

          // Auto-tag MITRE
          for (const m of mitreSuggestions) {
            await client.query(`
              INSERT INTO case_mitre (case_id,technique,name)
              VALUES ($1,$2,$3) ON CONFLICT DO NOTHING
            `, [caseId, m.technique, m.name]);
          }

          // Timeline
          await client.query(`
            INSERT INTO timeline (case_id,event,user_id)
            VALUES ($1,$2,$3),($1,'Case auto-created from SIEM integration',$3)
          `, [caseId, `Alert ingested from ${normalized.source}: ${normalized.title}`, req.user.sub]);

          await client.query(`UPDATE siem_alerts SET promoted=true,case_id=$1 WHERE id=$2`, [caseId, alertId]);
          await client.query('COMMIT');

          // Create SLA
          await createSLA(caseId, normalized.severity, new Date());

        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      results.push({
        alert_id:          alertId,
        case_id:           caseId,
        title:             normalized.title,
        severity:          normalized.severity,
        source:            normalized.source,
        auto_promoted:     autoPromote,
        observables_found: observables.length,
        mitre_suggested:   mitreSuggestions,
      });
    }

    res.status(201).json({
      success:     true,
      processed:   results.length,
      results,
    });

  } catch (err) {
    console.error('Ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ingest/batch — explicit batch endpoint ───────────
router.post('/batch', requireApiKey, async (req, res) => {
  req.body = req.body.alerts || req.body;
  return router.handle(Object.assign(req, { url: '/ingest', path: '/ingest' }), res);
});

// ── GET /api/ingest/health — check API is alive ────────────────
router.get('/health', requireApiKey, async (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), version: '1.0' });
});

// ── GET /api/ingest/schema — return expected format ────────────
router.get('/schema', requireApiKey, (_req, res) => {
  res.json({
    description:       'Case Sphere SIEM Integration API',
    version:           '1.0',
    supported_formats: ['splunk','elastic','qradar','sentinel','wazuh','darktrace','cef','leef','generic'],
    endpoints: {
      ingest:  'POST /api/ingest',
      batch:   'POST /api/ingest/batch',
      health:  'GET  /api/ingest/health',
      schema:  'GET  /api/ingest/schema',
    },
    headers: {
      'X-API-Key':       'required — your API key',
      'X-SIEM-Source':   'optional — override source name (e.g. Splunk, QRadar)',
      'X-Auto-Promote':  'optional — set true to auto-create case from alert',
    },
    query_params: {
      dry_run:      'true/false — preview normalization without saving',
      auto_promote: 'true/false — auto-create case',
      source:       'override source name',
    },
    generic_format: {
      title:       'string — alert title (required)',
      severity:    'string — critical/high/medium/low or 1-10',
      source:      'string — source system name',
      description: 'string — detailed description',
      raw:         'string — raw log',
      src_ip:      'string — source IP',
      dst_ip:      'string — destination IP',
      user:        'string — username',
      host:        'string — hostname',
    },
  });
});

module.exports = router;
