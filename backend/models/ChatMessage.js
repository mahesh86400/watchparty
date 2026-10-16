
import mongoose from 'mongoose'

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    senderName: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 1000,
      trim: true,
    },
  },
  { timestamps: true }
)

chatMessageSchema.index({ roomId: 1, createdAt: -1 })

export default mongoose.models.ChatMessage ||
  mongoose.model('ChatMessage', chatMessageSchema)
