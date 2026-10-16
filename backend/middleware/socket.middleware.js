import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Please sign in first.'))

    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload.id) return next(new Error('Invalid token. Please sign in again.'))

    const user = await User.findById(payload.id).select('name')
    if (!user) return next(new Error('This account no longer exists.'))

    // Identity comes from the verified token and the database, never from the client
    socket.userId = String(user._id)
    socket.data.userId = String(user._id)
    socket.data.userName = user.name
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('Your session has expired. Please sign in again.'))
    }
    next(new Error('Invalid token. Please sign in again.'))
  }
}