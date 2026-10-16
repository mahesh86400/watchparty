import { Router } from 'express'
import { createRoom, getRoom } from '../controllers/room.controller.js'
import { protect } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/', protect, createRoom)
router.get('/:roomId', protect, getRoom)

export default router