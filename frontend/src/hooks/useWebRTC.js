import { useCallback, useEffect, useRef, useState } from 'react'
import { socket } from '../services/socket'

function queuePeerOperation(peer, operation) {
  peer.signalQueue = peer.signalQueue
    .then(operation)
    .catch((error) => {
      console.error(`WebRTC signaling error for ${peer.userId}:`, error)
    })
}

async function applyPendingCandidates(peer) {
  for (const candidate of peer.pendingCandidates.splice(0)) {
    try {
      await peer.connection.addIceCandidate(candidate)
    } catch (error) {
      console.error(`Could not apply ICE candidate from ${peer.userId}:`, error)
    }
  }
}

export function useWebRTC({ roomId, userId, participants, localStream, localScreenStream }) {
  const [remoteCameraStreams, setRemoteCameraStreams] = useState({})
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({})
  const [connectionError, setConnectionError] = useState('')
  const [connectionVersion, setConnectionVersion] = useState(0)
  const peersRef = useRef(new Map())
  const localStreamRef = useRef(localStream)
  const localScreenStreamRef = useRef(localScreenStream)

  useEffect(() => {
    localStreamRef.current = localStream
    localScreenStreamRef.current = localScreenStream
  }, [localScreenStream, localStream])

  const updateRemoteStream = useCallback((peerId, kind, stream) => {
    const setStreams = kind === 'screen' ? setRemoteScreenStreams : setRemoteCameraStreams
    setStreams((current) => {
      if (!stream) {
        if (!current[peerId]) return current
        const next = { ...current }
        delete next[peerId]
        return next
      }
      return { ...current, [peerId]: stream }
    })
  }, [])

  const closePeer = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId)
    if (!peer) return

    peer.connection.onicecandidate = null
    peer.connection.ontrack = null
    peer.connection.onconnectionstatechange = null
    peer.connection.oniceconnectionstatechange = null
    for (const { track, type, listener } of peer.remoteTrackHandlers) {
      track.removeEventListener(type, listener)
    }
    peer.connection.close()
    peersRef.current.delete(peerId)
    updateRemoteStream(peerId, 'camera', null)
    updateRemoteStream(peerId, 'screen', null)
  }, [updateRemoteStream])

  const ensurePeer = useCallback(
    (peerId) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const connection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      const stream = localStreamRef.current
      const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === 'live')
      const cameraSender = videoTrack
        ? connection.addTrack(videoTrack, stream)
        : connection.addTransceiver('video', { direction: 'sendrecv' }).sender
      const screenStream = localScreenStreamRef.current
      const screenTrack = screenStream?.getVideoTracks().find((track) => track.readyState === 'live')
      const screenTransceiver = screenTrack
        ? connection.addTransceiver(screenTrack, { streams: [screenStream] })
        : connection.addTransceiver('video', { direction: 'sendrecv' })

      const peer = {
        userId: peerId,
        connection,
        cameraSender,
        screenSender: screenTransceiver.sender,
        screenTransceiver,
        pendingCandidates: [],
        signalQueue: Promise.resolve(),
        offerStarted: false,
        remoteTrackHandlers: [],
      }
      peersRef.current.set(peerId, peer)

      connection.onicecandidate = ({ candidate }) => {
        if (candidate && socket.connected) {
          socket.emit('webrtc-ice-candidate', {
            roomId,
            targetUserId: peerId,
            candidate: candidate.toJSON(),
          })
        }
      }

      connection.ontrack = (event) => {
        const kind = event.transceiver === peer.screenTransceiver ? 'screen' : 'camera'
        const remoteStream = event.streams[0] || new MediaStream([event.track])
        const showRemoteStream = () => {
          if (peersRef.current.get(peerId) === peer) {
            updateRemoteStream(peerId, kind, remoteStream)
          }
        }
        const hideRemoteStream = () => {
          updateRemoteStream(peerId, kind, null)
        }
        for (const type of ['mute', 'unmute', 'ended']) {
          const listener = type === 'unmute' ? showRemoteStream : hideRemoteStream
          event.track.addEventListener(type, listener)
          peer.remoteTrackHandlers.push({ track: event.track, type, listener })
        }
        showRemoteStream()
      }

      const logConnectionState = () => {
        console.info(
          `[WebRTC ${peerId}] connectionState=${connection.connectionState}, iceConnectionState=${connection.iceConnectionState}`
        )
        if (connection.connectionState === 'failed' || connection.iceConnectionState === 'failed') {
          setConnectionError(`Video connection to participant ${peerId} failed.`)
        } else if (connection.connectionState === 'connected') {
          setConnectionError('')
        }
      }
      connection.onconnectionstatechange = logConnectionState
      connection.oniceconnectionstatechange = logConnectionState

      return peer
    },
    [roomId, updateRemoteStream]
  )

  useEffect(() => {
    for (const peer of peersRef.current.values()) {
      const cameraTrack =
        localStream?.getVideoTracks().find((item) => item.readyState === 'live') || null
      const screenTrack =
        localScreenStream?.getVideoTracks().find((item) => item.readyState === 'live') || null
      peer.trackUpdate = (peer.trackUpdate || Promise.resolve())
        .then(() => Promise.all([
          peer.cameraSender.replaceTrack(cameraTrack),
          peer.screenSender.replaceTrack(screenTrack),
        ]))
        .catch((error) => {
          console.error(`Could not update local media tracks for ${peer.userId}:`, error)
          setConnectionError(`Could not update the media sent to participant ${peer.userId}.`)
        })
    }
  }, [localScreenStream, localStream])

  useEffect(() => {
    if (!roomId || !userId) return undefined

    const handleOffer = ({ fromUserId, description } = {}) => {
      if (!fromUserId || fromUserId === userId || description?.type !== 'offer') return
      const peer = ensurePeer(fromUserId)

      queuePeerOperation(peer, async () => {
        if (peer.connection.signalingState !== 'stable') {
          console.warn(`Ignoring unexpected offer from ${fromUserId}`)
          return
        }

        await peer.connection.setRemoteDescription(description)
        await applyPendingCandidates(peer)
        const answer = await peer.connection.createAnswer()
        await peer.connection.setLocalDescription(answer)
        if (socket.connected && peer.connection.localDescription) {
          socket.emit('webrtc-answer', {
            roomId,
            targetUserId: fromUserId,
            description: peer.connection.localDescription,
          })
        }
      })
    }

    const handleAnswer = ({ fromUserId, description } = {}) => {
      if (!fromUserId || fromUserId === userId || description?.type !== 'answer') return
      const peer = peersRef.current.get(fromUserId)
      if (!peer) {
        console.warn(`Received an answer from unknown participant ${fromUserId}`)
        return
      }

      queuePeerOperation(peer, async () => {
        if (peer.connection.signalingState !== 'have-local-offer') {
          console.warn(`Ignoring unexpected answer from ${fromUserId}`)
          return
        }
        await peer.connection.setRemoteDescription(description)
        await applyPendingCandidates(peer)
      })
    }

    const handleIceCandidate = ({ fromUserId, candidate } = {}) => {
      if (!fromUserId || fromUserId === userId || !candidate) return
      const peer = ensurePeer(fromUserId)

      queuePeerOperation(peer, async () => {
        if (!peer.connection.remoteDescription) {
          peer.pendingCandidates.push(candidate)
          return
        }
        try {
          await peer.connection.addIceCandidate(candidate)
        } catch (error) {
          console.error(`Could not apply ICE candidate from ${fromUserId}:`, error)
        }
      })
    }

    const closeAllPeers = (clearStreams = true) => {
      for (const peer of peersRef.current.values()) {
        for (const { track, type, listener } of peer.remoteTrackHandlers) {
          track.removeEventListener(type, listener)
        }
        peer.connection.close()
      }
      peersRef.current.clear()
      if (clearStreams) {
        setRemoteCameraStreams({})
        setRemoteScreenStreams({})
      }
    }

    const handleDisconnect = () => {
      closeAllPeers()
      setConnectionVersion((version) => version + 1)
    }
    const handleConnect = () => setConnectionVersion((version) => version + 1)

    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)

    return () => {
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIceCandidate)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
      closeAllPeers(false)
    }
  }, [ensurePeer, roomId, userId])

  const participantIds = participants
    .map((participant) => String(participant.userId))
    .filter((participantId) => participantId && participantId !== String(userId))
    .sort()
    .join(',')

  useEffect(() => {
    if (!roomId || !userId) return
    const remoteIds = participantIds ? participantIds.split(',') : []
    const activePeers = new Set(remoteIds)

    for (const peerId of peersRef.current.keys()) {
      if (!activePeers.has(peerId)) closePeer(peerId)
    }

    for (const peerId of remoteIds) {
      const peer = ensurePeer(peerId)
      if (String(userId) < peerId && !peer.offerStarted) {
        peer.offerStarted = true
        queuePeerOperation(peer, async () => {
          if (peer.connection.signalingState !== 'stable') return
          const offer = await peer.connection.createOffer()
          await peer.connection.setLocalDescription(offer)
          if (socket.connected && peer.connection.localDescription) {
            socket.emit('webrtc-offer', {
              roomId,
              targetUserId: peerId,
              description: peer.connection.localDescription,
            })
          }
        })
      }
    }
  }, [closePeer, connectionVersion, ensurePeer, participantIds, roomId, userId])

  return { remoteCameraStreams, remoteScreenStreams, connectionError }
}
