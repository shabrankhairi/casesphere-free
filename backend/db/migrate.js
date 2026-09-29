'use strict'
require('dotenv').config()
const { query, pool } = require('./pool')

async function migrate() {
  console.log('[migrate] Running migrations...')

  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`)
  await query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`)

  await query(`CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)

  const ran = (await query(`SELECT name FROM migrations`)).rows.map(r => r.name)

  const steps = [
    ['001_users', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='user_role') THEN
          CREATE TYPE user_role AS ENUM ('admin','senior_analyst','analyst','readonly');
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role user_role NOT NULL DEFAULT 'analyst',
        color TEXT NOT NULL DEFAULT '#185FA5',
        bg TEXT NOT NULL DEFAULT '#E6F1FB',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `],
    ['002_cases', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='case_severity') THEN
          CREATE TYPE case_severity AS ENUM ('Critical','High','Medium','Low');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='case_status') THEN
          CREATE TYPE case_status AS ENUM ('Open','In Progress','Resolved','Closed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='case_tlp') THEN
          CREATE TYPE case_tlp AS ENUM ('RED','AMBER','GREEN');
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        severity case_severity NOT NULL DEFAULT 'Medium',
        status case_status NOT NULL DEFAULT 'Open',
        tlp case_tlp NOT NULL DEFAULT 'AMBER',
        assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS case_tags (
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (case_id, tag)
      );
      CREATE TABLE IF NOT EXISTS case_mitre (
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        technique TEXT NOT NULL, name TEXT NOT NULL,
        PRIMARY KEY (case_id, technique)
      );
      CREATE SEQUENCE IF NOT EXISTS case_id_seq START 1;
    `],
    ['003_tasks', `
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE,
        assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `],
    ['004_observables', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='obs_type') THEN
          CREATE TYPE obs_type AS ENUM ('IP','Domain','Hash','URL','Email','Filename','Other');
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS observables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        type obs_type NOT NULL,
        value TEXT NOT NULL,
        is_ioc BOOLEAN NOT NULL DEFAULT FALSE,
        description TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `],
    ['005_timeline_audit', `
      CREATE TABLE IF NOT EXISTS timeline (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_email TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details JSONB,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_timeline_case ON timeline(case_id, created_at DESC);
    `],
    ['006_siem', `
      CREATE TABLE IF NOT EXISTS siem_alerts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        severity case_severity NOT NULL DEFAULT 'Medium',
        source TEXT NOT NULL,
        raw TEXT NOT NULL DEFAULT '',
        promoted BOOLEAN NOT NULL DEFAULT FALSE,
        case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `],
    ['007_ai', `
      CREATE TABLE IF NOT EXISTS ai_analysis (
        case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `],
['008_comments', `
  CREATE TABLE IF NOT EXISTS comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id    TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_comments_case ON comments(case_id, created_at DESC);
`],
	['009_attachments', `
  CREATE TABLE IF NOT EXISTS attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mimetype    TEXT NOT NULL,
    size        INTEGER NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_case ON attachments(case_id, created_at DESC);
`],
['010_sla', `
  CREATE TABLE IF NOT EXISTS sla_tracking (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    severity            TEXT NOT NULL,
    
    -- Time to Respond (TTR) — dari created sampai status berubah dari Open
    ttr_deadline        TIMESTAMPTZ,
    ttr_met_at          TIMESTAMPTZ,
    ttr_breached        BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Time for Recommendation (TFR) — dari created sampai Closed/Resolved
    tfr_deadline        TIMESTAMPTZ,
    tfr_met_at          TIMESTAMPTZ,
    tfr_breached        BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_case ON sla_tracking(case_id);
  CREATE INDEX IF NOT EXISTS idx_sla_breached ON sla_tracking(ttr_breached, tfr_breached);
`],
['011_api_keys', `
  CREATE TABLE IF NOT EXISTS api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    key_preview  TEXT NOT NULL,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    use_count    INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
`],
['012_organizations', `
  CREATE TABLE IF NOT EXISTS organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Tambah org ke users
  ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

  -- Tambah org ke cases
  ALTER TABLE cases ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

  -- Tambah org ke siem_alerts
  ALTER TABLE siem_alerts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

  -- Tambah org ke api_keys
  ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

  -- Index
  CREATE INDEX IF NOT EXISTS idx_cases_org      ON cases(org_id);
  CREATE INDEX IF NOT EXISTS idx_siem_alerts_org ON siem_alerts(org_id);
  CREATE INDEX IF NOT EXISTS idx_users_org       ON users(org_id);

  -- Insert default organization
  INSERT INTO organizations (name, slug, description)
  VALUES ('Default Organization', 'default', 'Default organization for existing data')
  ON CONFLICT (slug) DO NOTHING;

  -- Assign semua data existing ke default org
  UPDATE users        SET org_id = (SELECT id FROM organizations WHERE slug='default') WHERE org_id IS NULL;
  UPDATE cases        SET org_id = (SELECT id FROM organizations WHERE slug='default') WHERE org_id IS NULL;
  UPDATE siem_alerts  SET org_id = (SELECT id FROM organizations WHERE slug='default') WHERE org_id IS NULL;
`],
['014_mfa', `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT;
`],
  ]

  for (const [name, sql] of steps) {
    if (ran.includes(name)) { console.log(`[migrate] skip: ${name}`); continue }
    try {
      await query('BEGIN')
      await query(sql)
      await query(`INSERT INTO migrations(name) VALUES($1)`, [name])
      await query('COMMIT')
      console.log(`[migrate] done: ${name}`)
    } catch (err) {
      await query('ROLLBACK')
      console.error(`[migrate] FAIL: ${name} — ${err.message}`)
      throw err
    }
  }
  console.log('[migrate] All migrations complete.\n')
  await pool.end()
}

migrate().catch(err => { console.error(err); process.exit(1) })

// Export untuk dipakai oleh entrypoint.js (binary mode)
module.exports = { migrate }
