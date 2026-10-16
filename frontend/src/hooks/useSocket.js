import { useCallback, useEffect, useRef, useState } from 'react'
import { socket } from '../services/socket'

// Sends an event and waits for the server's answer (rejects on error or timeout)
function emitWithAck(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      reject(new Error('Not connected to the server'))
      return
    }
    socket.timeout(5000).emit(event, payload, (err, response) => {
      if (err) {
        reject(new Error('The server did not respond. Please try again.'))
        return
      }
      if (response?.success) resolve(response)
      else reject(new Error(response?.message || 'Something went wrong'))
    })
  })
}

export function useSocket(roomId) {
  const [connected, setConnected] = useState(false)
  const [participants, setParticipants] = useState([])
  const [messages, setMessages] = useState([])
  const [socketError, setSocketError] = useState('')
  const [playback, setPlayback] = useState(null)
  const revisionRef = useRef(0)

  // Snapshots (sent when we join) are always accepted. Other updates only if they are newer.
  const acceptPlayback = useCallback((state) => {
    if (!state.snapshot && state.revision <= revisionRef.current) return
    revisionRef.current = state.revision
    setPlayback(state)
  }, [])

  useEffect(() => {
    if (!roomId) return

    const handleConnect = () => {
      setConnected(true)
      setSocketError('')

      socket.emit('join-room', { roomId }, (response) => {
        if (!response?.success) {
          setSocketError(response?.message || 'Could not join room')
        }
      })
    }

    const handleDisconnect = () => {
      setConnected(false)
      setParticipants([])
    }

    const handleConnectError = (error) => {
      setConnected(false)
      setParticipants([])
      setSocketError(error.message || 'Connection failed')
    }

    const handleParticipants = (data) => setParticipants(data.participants || [])
    const handleChatHistory = (data) => setMessages(data.messages || [])

    const handleChatMessage = (message) => {
      setMessages((previous) => {
        if (previous.some((item) => item._id === message._id)) return previous
        return [...previous, message]
      })
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('participants-update', handleParticipants)
    socket.on('chat-history', handleChatHistory)
    socket.on('chat-message', handleChatMessage)
    socket.on('playback-state', acceptPlayback)

    if (!socket.connected) {
      socket.connect()
    } else {
      handleConnect()
    }

    return () => {
      socket.emit('leave-room')
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('participants-update', handleParticipants)
      socket.off('chat-history', handleChatHistory)
      socket.off('chat-message', handleChatMessage)
      socket.off('playback-state', acceptPlayback)
      setParticipants([])
      revisionRef.current = 0
      setPlayback(null)
    }
  }, [roomId, acceptPlayback])

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim()
    if (!trimmed) throw new Error('Message cannot be empty')
    const response = await emitWithAck('send-chat-message', { text: trimmed })
    return response.message
  }, [])

  const sendPlaybackAction = useCallback(
    (type, position) => emitWithAck('playback-action', { type, position }),
    []
  )

  const setPlaybackLocked = useCallback((locked) => emitWithAck('playback-lock', { locked }), [])

  // Asks the server where the video should be now. Returns null if we were out of date.
  const requestPlaybackSync = useCallback(async () => {
    const sentAt = performance.now()
    const response = await emitWithAck('playback-sync', {})
    const rtt = performance.now() - sentAt
    const state = response.state

    if (state.revision !== revisionRef.current) {
      // We missed an update, so take the newer state and let the player apply it
      acceptPlayback({ ...state, snapshot: true })
      return null
    }
    return { state, rtt }
  }, [acceptPlayback])

  return {
    connected,
    participants,
    messages,
    socketError,
    playback,
    sendMessage,
    sendPlaybackAction,
    setPlaybackLocked,
    requestPlaybackSync,
  }
}