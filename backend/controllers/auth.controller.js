import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { asyncHandler, httpError } from '../utils/helpers.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email }
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  // typeof checks also block objects like {"$gt": ""} (NoSQL injection)
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'Name, email and password are required.')
  }

  const cleanName = name.trim()
  const cleanEmail = email.trim().toLowerCase()

  if (cleanName.length < 2 || cleanName.length > 40) {
    throw httpError(400, 'Name must be 2 to 40 characters.')
  }
  if (!EMAIL_RE.test(cleanEmail)) {
    throw httpError(400, 'Please enter a valid email address.')
  }
  // bcrypt only uses the first 72 characters, so we cap the length
  if (password.length < 8 || password.length > 72) {
    throw httpError(400, 'Password must be 8 to 72 characters.')
  }

  if (await User.findOne({ email: cleanEmail })) {
    throw httpError(409, 'An account with that email already exists.')
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await User.create({ name: cleanName, email: cleanEmail, password: hashed })

  res.status(201).json({ token: signToken(user._id), user: publicUser(user) })
})

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(400, 'Email and password are required.')
  }

  // password has select:false in the model, so we ask for it explicitly here
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password')

  // Same message for "no such user" and "wrong password" so attackers can't tell which
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw httpError(401, 'Invalid email or password.')
  }

  res.json({ token: signToken(user._id), user: publicUser(user) })
})

export const me = asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) })
})