import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import User from '../models/User.js'
import Room from '../models/Room.js'
import Message from '../models/Message.js'

await connectDB()

const user = await User.create({
  name: 'Test User',
  email: 'test@example.com',
  password: 'not-a-real-hash',
})

const room = await Room.create({
  name: 'Test Room',
  owner: user._id,
  participantLimit: 4,
})

await Message.create({
  roomId: room.roomId,
  sender: user._id,
  senderName: user.name,
  text: 'Hello!',
})

console.log('Room created with ID:', room.roomId)
console.log('Messages in room:', await Message.countDocuments({ roomId: room.roomId }))

// Clean up
await Message.deleteMany({ roomId: room.roomId })
await Room.deleteOne({ _id: room._id })
await User.deleteOne({ _id: user._id })
console.log('Test data removed. Models work!')

await mongoose.disconnect()