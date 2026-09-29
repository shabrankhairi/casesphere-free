'use strict'
const jwt = require('jsonwebtoken')
const { query } = require('../db/pool')

const SECRET = process.env.JWT_SECRET
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET must be set (min 32 chars)')

function signAccess(user) {
  return jwt.sign({ sub:user.id, email:user.email, role:user.role, name:user.name }, SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' })
}

function signRefresh(userId) {
  return jwt.sign({ sub:userId, type:'refresh' }, SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' })
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error:'Authentication required' })
  try {
    req.user = jwt.verify(h.slice(7), SECRET)
    next()
  } catch (e) {
    res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token', code: e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' })
  }
}

const RANK = { admin:4, senior_analyst:3, analyst:2, readonly:1 }

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error:'Not authenticated' })
    if (!roles.some(r => RANK[req.user.role] >= RANK[r]))
      return res.status(403).json({ error:'Insufficient permissions' })
    next()
  }
}

const requireAnalyst = requireRole('analyst')
const requireSenior  = requireRole('senior_analyst')
const requireAdmin   = requireRole('admin')

async function audit(req, action, entityType, entityId, details={}) {
  try {
    await query(
      `INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,details,ip_address) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [req.user?.sub, req.user?.email, action, entityType, String(entityId), JSON.stringify(details), req.ip]
    )
  } catch { /* non-critical */ }
}

module.exports = { signAccess, signRefresh, requireAuth, requireRole, requireAnalyst, requireSenior, requireAdmin, audit }
