import Room from '../models/Room.js'
import { asyncHandler, httpError } from '../utils/helpers.js'

// Accepts only real http(s) links, never javascript: or file: URLs
function cleanVideoUrl(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw httpError(400, 'Video URL is not valid.')
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw httpError(400, 'Video URL is not valid.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw httpError(400, 'Video URL must start with http:// or https://')
  }
  return url.toString()
}

// What the frontend is allowed to see. isOwner is computed here on the server.
function roomPayload(room, user) {
  return {
    roomId: room.roomId,
    name: room.name,
    participantLimit: room.participantLimit,
    videoUrl: room.videoUrl,
    videoTitle: room.videoTitle,
    playbackLocked: room.playbackLocked,
    expiresAt: room.expiresAt,
    owner: { id: room.owner._id ?? room.owner, name: room.owner.name },
    isOwner: String(room.owner._id ?? room.owner) === String(user._id),
  }
}

export const createRoom = asyncHandler(async (req, res) => {
  const { name, participantLimit, videoUrl, videoTitle } = req.body

  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 40) {
    throw httpError(400, 'Room name must be 3 to 40 characters.')
  }

  const limit = participantLimit === undefined ? 8 : Number(participantLimit)
  if (!Number.isInteger(limit) || limit < 2 || limit > 8) {
    throw httpError(400, 'Participant limit must be a whole number from 2 to 8.')
  }

  const room = await Room.create({
    name: name.trim(),
    participantLimit: limit,
    videoUrl: cleanVideoUrl(videoUrl),
    videoTitle: typeof videoTitle === 'string' && videoTitle.trim() ? videoTitle.trim().slice(0, 100) : undefined,
    owner: req.user._id, // always the logged-in user, never taken from the request body
  })

  await room.populate('owner', 'name')
  res.status(201).json({ room: roomPayload(room, req.user) })
})

export const getRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params
  if (!/^[a-f0-9]{10}$/.test(roomId)) throw httpError(404, 'Room not found.')

  const room = await Room.findOne({ roomId }).populate('owner', 'name')
  if (!room) throw httpError(404, 'Room not found or it has expired.')

  res.json({ room: roomPayload(room, req.user) })
})