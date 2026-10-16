import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { asyncHandler, httpError } from '../utils/helpers.js'

// Put this before any route that needs a logged-in user
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) throw httpError(401, 'Please sign in first.')

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw httpError(401, 'Your session has expired. Please sign in again.')
    }
    throw httpError(401, 'Invalid token. Please sign in again.')
  }

  const user = await User.findById(payload.id)
  if (!user) throw httpError(401, 'This account no longer exists.')

  req.user = user
  next()
})