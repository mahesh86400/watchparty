import { io } from 'socket.io-client'
import { getToken } from './api'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  // A function, so the latest token is read on every (re)connect
  auth: (callback) => callback({ token: getToken() }),
})