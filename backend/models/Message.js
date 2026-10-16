import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { timestamps: true }
)

// Fast lookup of the latest messages in a room
messageSchema.index({ roomId: 1, createdAt: -1 })

export default mongoose.model('Message', messageSchema)