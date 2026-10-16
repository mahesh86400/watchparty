import mongoose from 'mongoose'
import crypto from 'crypto'

const roomSchema = new mongoose.Schema(
  {
    // Short public ID used in the invite link, e.g. /room/a1b2c3d4e5
    roomId: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(5).toString('hex'),
    },
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      minlength: 3,
      maxlength: 40,
    },
    // The creator. Set once on the server and never changed, so rejoining can't transfer ownership.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    participantLimit: {
      type: Number,
      default: 8,
      min: 2,
      max: 8,
    },
    videoUrl: { type: String, default: '' },
    videoTitle: { type: String, default: 'Shared video', maxlength: 100 },

    // When true, only the owner can play, pause and seek
    playbackLocked: { type: Boolean, default: false },

    // Room is deleted automatically by MongoDB after this time (see index below)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  },
  { timestamps: true }
)

// TTL index: MongoDB removes the document once expiresAt has passed
roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model('Room', roomSchema)