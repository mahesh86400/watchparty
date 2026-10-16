import 'dotenv/config'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { Server } from 'socket.io'

import { connectDB } from './config/db.js'
import { notFound, errorHandler } from './middleware/error.middleware.js'
import { socketAuthMiddleware } from './middleware/socket.middleware.js'
import { createLimiter } from './utils/rateLimit.js'
import {
  registerPlaybackHandlers,
  sendPlaybackSnapshot,
  freezeIfEmpty,
  startPlaybackCleanup,
} from './sockets/playback.socket.js'

import authRoutes from './routes/auth.routes.js'
import roomRoutes from './routes/room.routes.js'
import uploadRoutes from './routes/upload.routes.js'
import Room from './models/Room.js'
import ChatMessage from './models/ChatMessage.js'

const app = express()
const server = http.createServer(app)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 5000
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Add it to backend/.env')
  process.exit(1)
}

// ---------- Express ----------
// cross-origin policy lets the frontend (another port) play videos from /uploads
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: CLIENT_URL, credentials: true }))
app.use(express.json({ limit: '10kb' }))
app.use(morgan('dev'))

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }))

// Slows down password guessing. Only failed attempts count, and /me is not limited.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
})


//backend error from the render

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "WatchParty API is running",
  });
});

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
  res.json({
    success: true,
    message: 'WatchParty API is running',
    database: states[mongoose.connection.readyState],
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/uploads', uploadRoutes)

// Uploaded videos are served from here (supports seeking)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ---------- Socket.IO ----------
const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
})

io.use(socketAuthMiddleware)

const reply = (callback, data) => {
  if (typeof callback === 'function') callback(data)
}

// Sends the list of people currently in a room (one entry per user, even with two tabs)
async function updateParticipants(roomId) {
  try {
    const sockets = await io.in(roomId).fetchSockets()
    const participants = new Map()

    for (const member of sockets) {
      const userId = member.data.userId
      if (!userId) continue
      participants.set(userId, { userId, name: member.data.userName || 'Participant' })
    }

    io.to(roomId).emit('participants-update', {
      participants: Array.from(participants.values()),
      count: participants.size,
    })
  } catch (error) {
    console.error('Participant update error:', error.message)
  }
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} (${socket.data.userName})`)

  const chatAllowed = createLimiter(10, 10_000) // 10 messages per 10 seconds

  const relayWebRTCSignal = async (event, field, payload = {}) => {
    if (!payload || typeof payload !== 'object') payload = {}
    const roomId = socket.data.roomId
    const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId : ''
    const signal = payload[field]
    const validDescription =
      field !== 'description' ||
      (signal &&
        typeof signal.sdp === 'string' &&
        signal.type === (event === 'webrtc-offer' ? 'offer' : 'answer'))
    const validCandidate =
      field !== 'candidate' ||
      (signal && typeof signal === 'object' && typeof signal.candidate === 'string')

    if (
      !roomId ||
      !socket.rooms.has(roomId) ||
      payload.roomId !== roomId ||
      !targetUserId ||
      targetUserId === socket.data.userId ||
      !validDescription ||
      !validCandidate
    ) {
      console.warn(`Ignoring invalid ${event} from ${socket.id}`)
      return
    }

    try {
      const roomSockets = await io.in(roomId).fetchSockets()
      const recipient = roomSockets.find(
        (member) => member.id !== socket.id && member.data.userId === targetUserId
      )
      if (!recipient) {
        console.warn(`Ignoring ${event}: target ${targetUserId} is not in room ${roomId}`)
        return
      }

      recipient.emit(event, { fromUserId: socket.data.userId, [field]: signal })
    } catch (error) {
      console.error(`Could not relay ${event}:`, error.message)
    }
  }

  socket.on('webrtc-offer', (payload) => relayWebRTCSignal('webrtc-offer', 'description', payload))
  socket.on('webrtc-answer', (payload) => relayWebRTCSignal('webrtc-answer', 'description', payload))
  socket.on('webrtc-ice-candidate', (payload) =>
    relayWebRTCSignal('webrtc-ice-candidate', 'candidate', payload)
  )

  socket.on('join-room', async (payload = {}, callback) => {
    if (socket.data.joining) return reply(callback, { success: true, message: 'Already joining' })
    socket.data.joining = true

    try {
      const roomId = String(payload?.roomId || '').trim()
      if (!/^[a-f0-9]{10}$/.test(roomId)) {
        return reply(callback, { success: false, message: 'Room not found.' })
      }

      const room = await Room.findOne({ roomId }).select('participantLimit')
      if (!room) {
        return reply(callback, { success: false, message: 'Room not found or it has expired.' })
      }

      if (socket.data.roomId === roomId) {
        return reply(callback, { success: true, message: 'Already in room', roomId })
      }

      // Leave the previous room first
      if (socket.data.roomId) {
        const previousRoomId = socket.data.roomId
        socket.leave(previousRoomId)
        socket.data.roomId = null
        await updateParticipants(previousRoomId)
        freezeIfEmpty(io, previousRoomId)
      }

      // Participant limit (the same person in two tabs counts once)
      const existing = await io.in(roomId).fetchSockets()
      const unique = new Set(existing.map((m) => m.data.userId).filter(Boolean))
      unique.add(socket.data.userId)
      if (room.participantLimit && unique.size > room.participantLimit) {
        return reply(callback, { success: false, message: 'This room is full.' })
      }

      socket.join(roomId)
      socket.data.roomId = roomId

      const history = await ChatMessage.find({ roomId }).sort({ createdAt: -1 }).limit(50).lean()
      history.reverse()
      socket.emit('chat-history', {
        messages: history.map((m) => ({
          _id: String(m._id),
          roomId: m.roomId,
          senderId: String(m.senderId),
          senderName: m.senderName,
          text: m.text,
          createdAt: m.createdAt,
        })),
      })

      await updateParticipants(roomId)
      await sendPlaybackSnapshot(socket, roomId)

      reply(callback, { success: true, message: 'Joined room successfully', roomId })
      console.log(`${socket.data.userName} joined room ${roomId}`)
    } catch (error) {
      console.error('Join room error:', error.message)
      reply(callback, { success: false, message: 'Could not join room.' })
    } finally {
      socket.data.joining = false
    }
  })

  socket.on('send-chat-message', async (payload = {}, callback) => {
    try {
      const roomId = socket.data.roomId
      if (!roomId || !socket.rooms.has(roomId)) {
        return reply(callback, { success: false, message: 'Join a room before chatting.' })
      }
      if (!chatAllowed()) {
        return reply(callback, { success: false, message: 'You are sending messages too fast.' })
      }

      // Remove control characters, then trim. React escapes the text when showing it.
      const text =
        typeof payload?.text === 'string'
          ? payload.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
          : ''

      if (!text) return reply(callback, { success: false, message: 'Message cannot be empty.' })
      if (text.length > 500) {
        return reply(callback, { success: false, message: 'Message cannot exceed 500 characters.' })
      }

      const message = await ChatMessage.create({
        roomId,
        senderId: socket.data.userId,
        senderName: socket.data.userName,
        text,
      })

      const messageData = {
        _id: String(message._id),
        roomId: message.roomId,
        senderId: String(message.senderId),
        senderName: message.senderName,
        text: message.text,
        createdAt: message.createdAt,
      }

      io.to(roomId).emit('chat-message', messageData)
      reply(callback, { success: true, message: messageData })
    } catch (error) {
      console.error('Send chat error:', error.message)
      reply(callback, { success: false, message: 'Could not send message.' })
    }
  })

  socket.on('leave-room', async (payload, callback) => {
    const roomId = socket.data.roomId
    if (!roomId) return reply(callback, { success: true, message: 'Not in a room' })

    socket.leave(roomId)
    socket.data.roomId = null
    await updateParticipants(roomId)
    freezeIfEmpty(io, roomId)

    reply(callback, { success: true, message: 'Left room successfully' })
    console.log(`${socket.data.userName} left room ${roomId}`)
  })

  socket.on('disconnect', async (reason) => {
    const roomId = socket.data.roomId
    console.log(`Socket disconnected: ${socket.id} (${reason})`)
    if (roomId) {
      await updateParticipants(roomId)
      freezeIfEmpty(io, roomId)
    }
  })

  registerPlaybackHandlers(io, socket)
})

app.use(notFound)
app.use(errorHandler)

async function start() {
  try {
    await connectDB()
    startPlaybackCleanup(io)
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
      console.log('Socket.IO is ready')
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  }
}

start()