'use strict'
const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB       || 'casesphere',
  user:     process.env.POSTGRES_USER     || 'casesphere',
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', err => console.error('[DB] Pool error:', err.message))

async function query(text, params) {
  try {
    return await pool.query(text, params)
  } catch (err) {
    console.error('[DB] Query error:', err.message, '|', text.slice(0, 80))
    throw err
  }
}

async function getClient() { return pool.connect() }

module.exports = { query, getClient, pool }
