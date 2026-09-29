'use strict'
const express   = require('express')
const bcrypt    = require('bcryptjs')
const crypto    = require('crypto')
const jwt       = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { query } = require('../db/pool')
const { signAccess, signRefresh, requireAuth, audit } = require('../middleware/auth')
const router    = express.Router()

const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20'),
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
})

// POST /api/auth/login — direct login, no MFA
router.post('/login', authLimit, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const { rows } = await query(
      `SELECT id,email,name,role,password_hash,is_active,color,bg FROM users WHERE email=$1`,
      [email.toLowerCase().trim()]
    )
    const user = rows[0]
    const hash = user ? user.password_hash : '$2a$12$invalidhashpadding000000000000000000000000000000000000'
    const valid = await bcrypt.compare(password, hash)

    if (!user || !user.is_active || !valid) {
      console.log(`[auth] Failed login: ${email} from ${req.ip}`)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const accessToken  = signAccess(user)
    const refreshToken = signRefresh(user.id)
    const tokenHash    = crypto.createHash('sha256').update(refreshToken).digest('hex')

    await query(
      `INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,
      [user.id, tokenHash]
    )
    await query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [user.id])
    await audit(req, 'LOGIN_SUCCESS', 'user', user.id, { email })

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    console.log(`[auth] Login OK: ${user.email} (${user.role})`)
    res.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, color: user.color, bg: user.bg },
    })
  } catch (err) {
    console.error('[auth] Login error:', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const rt = req.cookies?.refresh_token
  if (!rt) return res.status(401).json({ error: 'No refresh token' })
  try {
    const payload = jwt.verify(rt, process.env.JWT_SECRET)
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' })

    const tokenHash = crypto.createHash('sha256').update(rt).digest('hex')
    const { rows } = await query(
      `SELECT rt.user_id,u.email,u.name,u.role,u.color,u.bg,u.is_active
       FROM refresh_tokens rt JOIN users u ON rt.user_id=u.id
       WHERE rt.token_hash=$1 AND rt.expires_at>NOW()`,
      [tokenHash]
    )
    if (!rows[0] || !rows[0].is_active) return res.status(401).json({ error: 'Invalid or expired refresh token' })

    const u = rows[0]
    const newToken = signAccess({ id: u.user_id, email: u.email, name: u.name, role: u.role })
    res.json({ accessToken: newToken })
  } catch { res.status(401).json({ error: 'Invalid refresh token' }) }
})

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const rt = req.cookies?.refresh_token
  if (rt) {
    const h = crypto.createHash('sha256').update(rt).digest('hex')
    await query(`DELETE FROM refresh_tokens WHERE token_hash=$1`, [h])
  }
  await query(`DELETE FROM refresh_tokens WHERE user_id=$1 AND expires_at<NOW()`, [req.user.sub])
  res.clearCookie('refresh_token')
  res.json({ message: 'Logged out' })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id,email,name,role,color,bg,last_login_at FROM users WHERE id=$1`,
    [req.user.sub]
  )
  if (!rows[0]) return res.status(404).json({ error: 'User not found' })
  res.json(rows[0])
})

// PATCH /api/auth/password
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  const { rows } = await query(`SELECT password_hash FROM users WHERE id=$1`, [req.user.sub])
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
  if (!valid) return res.status(400).json({ error: 'Current password incorrect' })
  const hash = await bcrypt.hash(newPassword, 12)
  await query(`UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2`, [hash, req.user.sub])
  await query(`DELETE FROM refresh_tokens WHERE user_id=$1`, [req.user.sub])
  res.clearCookie('refresh_token')
  res.json({ message: 'Password updated. Please login again.' })
})

module.exports = router
