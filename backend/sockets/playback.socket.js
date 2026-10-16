import Room from '../models/Room.js'
import { createLimiter } from '../utils/rateLimit.js'

const MAX_POSITION = 60 * 60 * 48 // sanity limit: 48 hours in seconds
const STATE_IDLE_MS = 6 * 60 * 60 * 1000 // forget empty rooms after 6 hours

// roomId -> { ownerId, locked, playing, position, updatedAt, revision, touchedAt }
const states = new Map()

async function ensureState(roomId) {
  let state = states.get(roomId)
  if (state) {
    state.touchedAt = Date.now()
    return state
  }

  const room = await Room.findOne({ roomId }).select('owner playbackLocked')
  if (!room) return null

  // Another request may have created it while we were waiting for the database
  state = states.get(roomId)
  if (state) return state

  state = {
    ownerId: String(room.owner),
    locked: Boolean(room.playbackLocked),
    playing: false,
    position: 0,
    updatedAt: Date.now(),
    revision: 1,
    touchedAt: Date.now(),
  }
  states.set(roomId, state)
  return state
}

// Where the video should be right now
function effectivePosition(state) {
  return state.playing ? state.position + (Date.now() - state.updatedAt) / 1000 : state.position
}

function snapshot(state, extra = {}) {
  return {
    revision: state.revision,
    playing: state.playing,
    position: effectivePosition(state),
    locked: state.locked,
    ...extra,
  }
}

function reply(callback, data) {
  if (typeof callback === 'function') callback(data)
}

// Sent to one socket right after it joins a room, so late joiners start at the current moment
export async function sendPlaybackSnapshot(socket, roomId) {
  const state = await ensureState(roomId)
  if (state) socket.emit('playback-state', snapshot(state, { snapshot: true, action: 'join' }))
}

// When the last person leaves a playing room, pause it where it was
export function freezeIfEmpty(io, roomId) {
  const state = states.get(roomId)
  if (!state || !state.playing) return
  const occupied = (io.sockets.adapter.rooms.get(roomId)?.size ?? 0) > 0
  if (occupied) return

  state.position = effectivePosition(state)
  state.playing = false
  state.updatedAt = Date.now()
  state.revision += 1
}

export function startPlaybackCleanup(io) {
  const timer = setInterval(() => {
    for (const [roomId, state] of states) {
      const occupied = (io.sockets.adapter.rooms.get(roomId)?.size ?? 0) > 0
      if (!occupied && Date.now() - state.touchedAt > STATE_IDLE_MS) states.delete(roomId)
    }
  }, 10 * 60 * 1000)
  timer.unref()
}

export function registerPlaybackHandlers(io, socket) {
  const allowed = createLimiter(30, 10_000)

  // The room this socket has really joined, or null
  const currentRoom = () => {
    const roomId = socket.data.roomId
    return roomId && socket.rooms.has(roomId) ? roomId : null
  }

  socket.on('playback-action', async (payload = {}, callback) => {
    const roomId = currentRoom()
    if (!roomId) return reply(callback, { success: false, message: 'Join a room first.' })
    if (!allowed()) return reply(callback, { success: false, message: 'You are doing that too fast.' })

    const { type, position } = payload || {}
    if (!['play', 'pause', 'seek'].includes(type)) {
      return reply(callback, { success: false, message: 'Unknown playback action.' })
    }
    if (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > MAX_POSITION) {
      return reply(callback, { success: false, message: 'Invalid playback position.' })
    }

    const state = await ensureState(roomId)
    if (!state || !socket.rooms.has(roomId)) {
      return reply(callback, { success: false, message: 'Room not found.' })
    }

    // The owner is decided by the server, never by anything the client sends
    const isOwner = state.ownerId === socket.data.userId
    if (state.locked && !isOwner) {
      return reply(callback, { success: false, message: 'Playback is locked by the room owner.' })
    }

    // No await below this line, so actions are applied in the order the server receives them
    if (type === 'play') state.playing = true
    if (type === 'pause') state.playing = false
    state.position = position
    state.updatedAt = Date.now()
    state.revision += 1

    io.to(roomId).emit(
      'playback-state',
      snapshot(state, { action: type, by: socket.data.userName, byId: socket.data.userId })
    )
    reply(callback, { success: true, revision: state.revision })
  })

  socket.on('playback-lock', async (payload = {}, callback) => {
    const roomId = currentRoom()
    if (!roomId) return reply(callback, { success: false, message: 'Join a room first.' })
    if (!allowed()) return reply(callback, { success: false, message: 'You are doing that too fast.' })
    if (typeof payload?.locked !== 'boolean') {
      return reply(callback, { success: false, message: 'Invalid request.' })
    }

    const state = await ensureState(roomId)
    if (!state || !socket.rooms.has(roomId)) {
      return reply(callback, { success: false, message: 'Room not found.' })
    }
    if (state.ownerId !== socket.data.userId) {
      return reply(callback, { success: false, message: 'Only the room owner can lock playback.' })
    }

    state.locked = payload.locked
    state.revision += 1
    io.to(roomId).emit(
      'playback-state',
      snapshot(state, {
        action: state.locked ? 'lock' : 'unlock',
        by: socket.data.userName,
        byId: socket.data.userId,
      })
    )
    reply(callback, { success: true })

    // Save the setting so it survives a server restart
    try {
      await Room.updateOne({ roomId }, { playbackLocked: state.locked })
    } catch (err) {
      console.error('Could not save lock setting:', err.message)
    }
  })

  // Clients ask for the current state every few seconds to correct drift
  socket.on('playback-sync', async (payload, callback) => {
    const roomId = currentRoom()
    if (!roomId) return reply(callback, { success: false, message: 'Join a room first.' })
    if (!allowed()) return reply(callback, { success: false, message: 'Too many requests.' })

    const state = await ensureState(roomId)
    if (!state) return reply(callback, { success: false, message: 'Room not found.' })
    reply(callback, { success: true, state: snapshot(state) })
  })
}