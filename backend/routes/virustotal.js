'use strict';
const express = require('express');
const fetch   = require('node-fetch');
const { requireAuth, requireAnalyst } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VT_KEY = process.env.VIRUSTOTAL_API_KEY;
const VT_URL = 'https://www.virustotal.com/api/v3';

// Tentukan endpoint berdasarkan tipe observable
function getEndpoint(type, value) {
  switch (type) {
    case 'IP':     return `${VT_URL}/ip_addresses/${value}`
    case 'Domain': return `${VT_URL}/domains/${value}`
    case 'URL':    return `${VT_URL}/urls/${Buffer.from(value).toString('base64url')}`
    case 'Hash':   return `${VT_URL}/files/${value}`
    default:       return null
  }
}

// GET /api/virustotal/check?type=IP&value=1.2.3.4
router.get('/check', requireAnalyst, async (req, res) => {
  const { type, value } = req.query

  if (!type || !value) {
    return res.status(400).json({ error: 'type and value required' })
  }

  if (!VT_KEY) {
    return res.status(503).json({ error: 'VIRUSTOTAL_API_KEY not configured' })
  }

  // Hanya support tipe ini
  const supported = ['IP', 'Domain', 'Hash', 'URL']
  if (!supported.includes(type)) {
    return res.status(400).json({ error: `Type ${type} not supported. Supported: ${supported.join(', ')}` })
  }

  const endpoint = getEndpoint(type, value)
  if (!endpoint) {
    return res.status(400).json({ error: 'Cannot determine VirusTotal endpoint' })
  }

  try {
    const resp = await fetch(endpoint, {
      headers: { 'x-apikey': VT_KEY }
    })

    if (resp.status === 404) {
      return res.json({
        found:       false,
        type,
        value,
        message:     'Not found in VirusTotal database'
      })
    }

    if (resp.status === 429) {
      return res.status(429).json({ error: 'VirusTotal rate limit exceeded. Try again later.' })
    }

    if (!resp.ok) {
      const err = await resp.json()
      return res.status(resp.status).json({ error: err.error?.message || 'VirusTotal API error' })
    }

    const data  = await resp.json()
    const attrs = data.data?.attributes || {}
    const stats = attrs.last_analysis_stats || {}

    // Hitung skor
    const malicious  = stats.malicious  || 0
    const suspicious = stats.suspicious || 0
    const harmless   = stats.harmless   || 0
    const undetected = stats.undetected || 0
    const total      = malicious + suspicious + harmless + undetected

    // Tentukan verdict
    let verdict = 'clean'
    let score   = 0
    if (total > 0) {
      score = Math.round(((malicious + suspicious) / total) * 100)
    }
    if (malicious > 0)        verdict = 'malicious'
    else if (suspicious > 0)  verdict = 'suspicious'
    else if (total === 0)     verdict = 'unknown'

    // Build result
    const result = {
      found:      true,
      type,
      value,
      verdict,
      score,
      stats: {
        malicious,
        suspicious,
        harmless,
        undetected,
        total,
      },
      reputation:   attrs.reputation || 0,
      tags:         attrs.tags || [],
      last_analysis: attrs.last_analysis_date
        ? new Date(attrs.last_analysis_date * 1000).toISOString()
        : null,
      vt_link: `https://www.virustotal.com/gui/${
        type === 'IP'     ? 'ip-address' :
        type === 'Domain' ? 'domain'     :
        type === 'Hash'   ? 'file'       : 'url'
      }/${value}`,
    }

    // Tambahan info per tipe
    if (type === 'IP') {
      result.country  = attrs.country || null
      result.asn      = attrs.asn || null
      result.as_owner = attrs.as_owner || null
    }
    if (type === 'Domain') {
      result.registrar    = attrs.registrar || null
      result.creation_date = attrs.creation_date
        ? new Date(attrs.creation_date * 1000).toISOString().slice(0, 10)
        : null
    }

    res.json(result)
  } catch (err) {
    console.error('VirusTotal error:', err.message)
    res.status(500).json({ error: 'Failed to reach VirusTotal: ' + err.message })
  }
})

module.exports = router;
