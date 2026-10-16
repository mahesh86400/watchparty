import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
// CHANGE THIS to match the login-check middleware used in room.routes.js
import { protect } from '../middleware/auth.middleware.js'

const router = express.Router()

const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + '.mp4'),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/mp4') cb(null, true)
    else cb(new Error('Only MP4 videos are allowed.'))
  },
})

router.post('/video', protect, (req, res) => {
  upload.single('video')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Video is too large (max 500 MB).' : err.message
      return res.status(400).json({ success: false, message })
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video uploaded.' })
    }

    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`
    res.json({ success: true, url: `${base}/uploads/${req.file.filename}` })
  })
})

export default router