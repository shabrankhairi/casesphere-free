'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { query } = require('../db/pool');
const { requireAuth, requireAnalyst, audit } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Upload directory
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname)
    const name = Date.now() + '-' + Math.random().toString(36).slice(2) + ext
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    // Allowed types
    const allowed = [
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf',
      'text/plain','text/csv',
      'application/json',
      'application/zip','application/x-zip-compressed',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4','video/webm',
      'application/octet-stream',
    ]
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('File type not allowed: ' + file.mimetype))
    }
  },
})

// GET /api/cases/:id/attachments
router.get('/:caseId/attachments', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, u.name AS uploaded_by_name
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.case_id = $1
      ORDER BY a.created_at DESC
    `, [req.params.caseId])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/cases/:id/attachments
router.post('/:caseId/attachments', requireAnalyst, upload.array('files', 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' })

  try {
    const saved = []
    for (const file of req.files) {
      const { rows } = await query(`
        INSERT INTO attachments (case_id, filename, original_name, mimetype, size, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `, [req.params.caseId, file.filename, file.originalname, file.mimetype, file.size, req.user.sub])

      saved.push(rows[0])

      // Add to timeline
      await query(`
        INSERT INTO timeline (case_id, event, user_id)
        VALUES ($1, $2, $3)
      `, [req.params.caseId, `Evidence uploaded: ${file.originalname} (${formatSize(file.size)})`, req.user.sub])
    }

    await audit(req, 'ATTACHMENT_UPLOAD', 'case', req.params.caseId, {
      files: req.files.map(f => f.originalname)
    })

    res.status(201).json(saved)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/cases/:id/attachments/:attachId/download
router.get('/:caseId/attachments/:attachId/download', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM attachments WHERE id = $1 AND case_id = $2
    `, [req.params.attachId, req.params.caseId])

    if (!rows[0]) return res.status(404).json({ error: 'Attachment not found' })

    const filePath = path.join(UPLOAD_DIR, rows[0].filename)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })

    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].original_name}"`)
    res.setHeader('Content-Type', rows[0].mimetype)
    res.sendFile(filePath)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/cases/:id/attachments/:attachId
router.delete('/:caseId/attachments/:attachId', requireAnalyst, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM attachments WHERE id = $1 AND case_id = $2
    `, [req.params.attachId, req.params.caseId])

    if (!rows[0]) return res.status(404).json({ error: 'Attachment not found' })

    // Hanya bisa hapus milik sendiri atau admin
    if (rows[0].uploaded_by !== req.user.sub && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Can only delete your own attachments' })
    }

    // Hapus file dari disk
    const filePath = path.join(UPLOAD_DIR, rows[0].filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    // Hapus dari database
    await query(`DELETE FROM attachments WHERE id = $1`, [req.params.attachId])

    await audit(req, 'ATTACHMENT_DELETE', 'case', req.params.caseId, {
      filename: rows[0].original_name
    })

    res.json({ deleted: req.params.attachId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

function formatSize(bytes) {
  if (bytes < 1024)        return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

module.exports = { router, formatSize }
