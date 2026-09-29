'use strict'
require('dotenv').config()
const express     = require('express')
const path        = require('path')
const cors        = require('cors')
const helmet      = require('helmet')
const compression = require('compression')
const cookieParser= require('cookie-parser')
const morgan      = require('morgan')
const rateLimit   = require('express-rate-limit')
const integrationRouter = require('./routes/integration')
const apikeysRouter     = require('./routes/apikeys')

const authRouter     = require('./routes/auth')
const casesRouter = require('./routes/cases')
const usersRouter    = require('./routes/users')
const siemRouter     = require('./routes/siem')
const auditRouter    = require('./routes/auditlog')
const vtRouter = require('./routes/virustotal')
const { router: attachRouter } = require('./routes/attachments')
const slaRouter = require('./routes/sla')

const app  = express()
const PORT = process.env.PORT || 3000

app.set('trust proxy', 1)

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

const origins = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim())
app.use(cors({
  origin: origins.includes('*') ? '*' : origins,
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}))

app.use(compression())
app.use(express.json({ limit:'1mb' }))
app.use(cookieParser())
app.use(morgan('dev'))

app.use('/api/', rateLimit({
  windowMs: +process.env.RATE_LIMIT_WINDOW_MS || 900000,
  max:      +process.env.RATE_LIMIT_MAX        || 500,
  standardHeaders: true, legacyHeaders: false,
  message: { error:'Too many requests' },
}))

app.use('/api/ingest',  integrationRouter)
app.use('/api/apikeys', apikeysRouter)
app.use('/api/auth',  authRouter)
app.use('/api/cases', casesRouter)
app.use('/api/users', usersRouter)
app.use('/api/siem',  siemRouter)
app.use('/api/audit', auditRouter)
app.use('/api/virustotal', vtRouter)
app.use('/api/cases', attachRouter)
app.use('/api/sla', slaRouter)
app.get('/api/health', async (_,res) => {
  try {
    await require('./db/pool').query('SELECT 1')
    res.json({ status:'ok', db:'connected', ts:new Date().toISOString() })
  } catch { res.status(503).json({ status:'error', db:'disconnected' }) }
})

// Serve React build
const FRONTEND = path.join(__dirname, 'public')
app.use(express.static(FRONTEND, { maxAge:'1d', index:false }))
app.get('*', (_,res) => res.sendFile(path.join(FRONTEND,'index.html')))

app.use((err,_req,res,_next) => {
  console.error('[server] Error:', err.message)
  res.status(err.status||500).json({ error: process.env.NODE_ENV==='production' ? 'Internal server error' : err.message })
})

app.listen(PORT, () => {
  console.log(`\n🛡  Case Sphere v5 → http://localhost:${PORT}`)
  console.log(`   Health: http://localhost:${PORT}/api/health\n`)
})

process.on('SIGTERM', async () => {
  const { pool } = require('./db/pool')
  await pool.end()
  process.exit(0)
})
