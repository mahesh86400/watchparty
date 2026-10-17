
import { useCallback, useEffect, useRef, useState } from 'react'
import { socket } from '../services/socket'

function queuePeerOperation(peer, operation) {
  peer.signalQueue = peer.signalQueue
    .then(operation)
    .catch((error) => {
      console.error(`[WebRTC ${peer.userId}] Signaling error:`, error)
    })

  return peer.signalQueue
}

async function applyPendingCandidates(peer) {
  if (!peer.connection.remoteDescription) return

  for (const candidate of peer.pendingCandidates.splice(0)) {
    try {
      await peer.connection.addIceCandidate(candidate)
    } catch (error) {
      console.error(
        `[WebRTC ${peer.userId}] ICE candidate error:`,
        error
      )
    }
  }
}

function getLiveTrack(stream, kind) {
  return (
    stream?.getTracks().find(
      (track) =>
        track.kind === kind && track.readyState === 'live'
    ) || null
  )
}

// Synchronize local camera, microphone, and screen tracks.
function syncPeerTracks(peer, cameraStream, screenStream) {
  const cameraTrack = getLiveTrack(cameraStream, 'video')
  const audioTrack = getLiveTrack(cameraStream, 'audio')
  const screenTrack = getLiveTrack(screenStream, 'video')

  console.info(
    `[WebRTC ${peer.userId}] Sending media:`,
    JSON.stringify({
      cameraTrack: cameraTrack?.readyState ?? 'missing',
      audioTrack: audioTrack?.readyState ?? 'missing',
      screenTrack: screenTrack?.readyState ?? 'missing',
      screenTrackId: screenTrack?.id ?? 'missing',
      connectionState: peer.connection.connectionState,
      signalingState: peer.connection.signalingState,
      screenMid: peer.screenTransceiver.mid,
    })
  )

  peer.trackUpdate = (peer.trackUpdate || Promise.resolve())
    .then(async () => {
      if (peer.connection.signalingState === 'closed') return

      await Promise.all([
        peer.cameraSender.replaceTrack(cameraTrack),
        peer.audioSender.replaceTrack(audioTrack),
        peer.screenSender.replaceTrack(screenTrack),
      ])

      console.info(
        `[WebRTC ${peer.userId}] Tracks attached:`,
        JSON.stringify({
          cameraTrack: peer.cameraSender.track?.id ?? 'missing',
          audioTrack: peer.audioSender.track?.id ?? 'missing',
          outgoingScreenTrack: peer.screenSender.track?.id ?? 'missing',
          screenTrackState:
            peer.screenSender.track?.readyState ?? 'missing',
          screenTrackEnabled: peer.screenSender.track?.enabled ?? false,
          screenMid: peer.screenTransceiver.mid,
          signalingState: peer.connection.signalingState,
        })
      )
    })
    .catch((error) => {
      console.error(
        `[WebRTC ${peer.userId}] Track update failed:`,
        error
      )
    })

  return peer.trackUpdate
}

export function useWebRTC({
  roomId,
  userId,
  participants = [],
  localStream,
  localScreenStream,
}) {
  const [remoteCameraStreams, setRemoteCameraStreams] = useState({})
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({})
  const [remoteAudioStreams, setRemoteAudioStreams] = useState({})
  const [connectionError, setConnectionError] = useState('')
  const [connectionVersion, setConnectionVersion] = useState(0)

  const peersRef = useRef(new Map())
  const localStreamRef = useRef(localStream)
  const localScreenStreamRef = useRef(localScreenStream)

  useEffect(() => {
    localStreamRef.current = localStream
    localScreenStreamRef.current = localScreenStream

    for (const peer of peersRef.current.values()) {
      void syncPeerTracks(peer, localStream, localScreenStream)
    }
  }, [localStream, localScreenStream])

  const updateRemoteStream = useCallback((peerId, kind, stream) => {
    const setters = {
      camera: setRemoteCameraStreams,
      screen: setRemoteScreenStreams,
      audio: setRemoteAudioStreams,
    }

    const setter = setters[kind]
    if (!setter) return

    setter((current) => {
      if (!stream) {
        if (!(peerId in current)) return current

        const next = { ...current }
        delete next[peerId]
        return next
      }

      if (current[peerId] === stream) return current

      return { ...current, [peerId]: stream }
    })
  }, [])

  const closePeer = useCallback(
    (peerId) => {
      const peer = peersRef.current.get(peerId)
      if (!peer) return

      peersRef.current.delete(peerId)

      peer.connection.onicecandidate = null
      peer.connection.ontrack = null
      peer.connection.onconnectionstatechange = null
      peer.connection.oniceconnectionstatechange = null

      for (const { track, type, listener } of peer.remoteTrackHandlers) {
        track.removeEventListener(type, listener)
      }

      peer.connection.close()

      updateRemoteStream(peerId, 'camera', null)
      updateRemoteStream(peerId, 'screen', null)
      updateRemoteStream(peerId, 'audio', null)

      console.info(`[WebRTC ${peerId}] Peer connection closed`)
    },
    [updateRemoteStream]
  )

  const ensurePeer = useCallback(
    (peerId) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      console.info(`[WebRTC ${peerId}] Creating peer connection`)

      const connection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      })

      const initialCameraTrack = getLiveTrack(
        localStreamRef.current,
        'video'
      )

      const cameraSender = initialCameraTrack
        ? connection.addTrack(
            initialCameraTrack,
            localStreamRef.current
          )
        : connection.addTransceiver('video', {
            direction: 'sendrecv',
          }).sender

      const audioSender = connection.addTransceiver('audio', {
        direction: 'sendrecv',
      }).sender

      const initialScreenTrack = getLiveTrack(
        localScreenStreamRef.current,
        'video'
      )

      const screenTransceiver = initialScreenTrack
        ? connection.addTransceiver(initialScreenTrack, {
            streams: [localScreenStreamRef.current],
          })
        : connection.addTransceiver('video', {
            direction: 'sendrecv',
          })

      const peer = {
        userId: peerId,
        connection,
        cameraSender,
        audioSender,
        screenSender: screenTransceiver.sender,
        screenTransceiver,
        pendingCandidates: [],
        signalQueue: Promise.resolve(),
        trackUpdate: Promise.resolve(),
        offerStarted: false,
        remoteTrackHandlers: [],
      }

      peersRef.current.set(peerId, peer)

      void syncPeerTracks(
        peer,
        localStreamRef.current,
        localScreenStreamRef.current
      )

      connection.onicecandidate = ({ candidate }) => {
        if (!candidate || !socket.connected) return

        socket.emit('webrtc-ice-candidate', {
          roomId,
          targetUserId: peerId,
          candidate: candidate.toJSON(),
        })
      }

      connection.ontrack = (event) => {
        if (peersRef.current.get(peerId) !== peer) return

        let kind

        if (event.track.kind === 'audio') {
          kind = 'audio'
        } else if (event.transceiver === peer.screenTransceiver) {
          kind = 'screen'
        } else {
          kind = 'camera'
        }

        const remoteStream =
          kind === 'audio'
            ? new MediaStream([event.track])
            : event.streams?.[0] ||
              new MediaStream([event.track])

        const showStream = () => {
          if (peersRef.current.get(peerId) !== peer) return
          updateRemoteStream(peerId, kind, remoteStream)
        }

        const hideStream = () => {
          if (peersRef.current.get(peerId) !== peer) return
          updateRemoteStream(peerId, kind, null)
        }

        const onMute = () => {
          console.info(`[WebRTC ${peerId}] ${kind} track muted`)
        }

        const onUnmute = () => {
          showStream()
          console.info(`[WebRTC ${peerId}] ${kind} track unmuted`)
        }

        const onEnded = () => {
          hideStream()
          console.info(`[WebRTC ${peerId}] ${kind} track ended`)
        }

        for (const [type, listener] of [
          ['mute', onMute],
          ['unmute', onUnmute],
          ['ended', onEnded],
        ]) {
          event.track.addEventListener(type, listener)
          peer.remoteTrackHandlers.push({
            track: event.track,
            type,
            listener,
          })
        }

        showStream()

        // Print actual values instead of a collapsed console Object.
        console.info(
          `[WebRTC ${peerId}] Received ${kind} track:`,
          JSON.stringify({
            trackKind: event.track.kind,
            trackId: event.track.id,
            readyState: event.track.readyState,
            muted: event.track.muted,
            transceiverMid: event.transceiver.mid,
            screenTransceiverMid: peer.screenTransceiver.mid,
            isScreenTransceiver:
              event.transceiver === peer.screenTransceiver,
            transceiverDirection: event.transceiver.direction,
            currentDirection: event.transceiver.currentDirection,
            streamCount: event.streams?.length ?? 0,
            streamIds: event.streams?.map((stream) => stream.id) ?? [],
          })
        )
      }

      const logConnectionState = () => {
        console.info(
          `[WebRTC ${peerId}] connectionState=${connection.connectionState}, iceConnectionState=${connection.iceConnectionState}, signalingState=${connection.signalingState}`
        )

        if (
          connection.connectionState === 'failed' ||
          connection.iceConnectionState === 'failed'
        ) {
          setConnectionError(
            `Connection to participant ${peerId} failed.`
          )
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

  // Listen for offers, answers, and ICE candidates.
  useEffect(() => {
    if (!roomId || !userId) return undefined

    const handleOffer = ({ fromUserId, description } = {}) => {
      if (
        !fromUserId ||
        String(fromUserId) === String(userId) ||
        description?.type !== 'offer'
      ) {
        return
      }

      console.info(
        `[WebRTC ${fromUserId}] Received offer`,
        JSON.stringify({
          type: description.type,
          hasSdp: Boolean(description.sdp),
        })
      )

      const peer = ensurePeer(String(fromUserId))

      queuePeerOperation(peer, async () => {
        if (peer.connection.signalingState !== 'stable') {
          console.warn(
            `[WebRTC ${fromUserId}] Ignoring unexpected offer`
          )
          return
        }

        await peer.connection.setRemoteDescription(description)
        await applyPendingCandidates(peer)

        await syncPeerTracks(
          peer,
          localStreamRef.current,
          localScreenStreamRef.current
        )

        const answer = await peer.connection.createAnswer()
        await peer.connection.setLocalDescription(answer)

        if (socket.connected && peer.connection.localDescription) {
          socket.emit('webrtc-answer', {
            roomId,
            targetUserId: fromUserId,
            description: peer.connection.localDescription,
          })

          console.info(`[WebRTC ${fromUserId}] Sent answer`)
        }
      })
    }

    const handleAnswer = ({ fromUserId, description } = {}) => {
      if (
        !fromUserId ||
        String(fromUserId) === String(userId) ||
        description?.type !== 'answer'
      ) {
        return
      }

      const peer = peersRef.current.get(String(fromUserId))
      if (!peer) {
        console.warn(
          `[WebRTC ${fromUserId}] Answer received without a peer`
        )
        return
      }

      queuePeerOperation(peer, async () => {
        if (peer.connection.signalingState !== 'have-local-offer') {
          console.warn(
            `[WebRTC ${fromUserId}] Ignoring unexpected answer`,
            peer.connection.signalingState
          )
          return
        }

        await peer.connection.setRemoteDescription(description)
        await applyPendingCandidates(peer)

        console.info(`[WebRTC ${fromUserId}] Answer applied`)
      })
    }

    const handleIceCandidate = ({ fromUserId, candidate } = {}) => {
      if (
        !fromUserId ||
        String(fromUserId) === String(userId) ||
        !candidate
      ) {
        return
      }

      const peer = ensurePeer(String(fromUserId))

      queuePeerOperation(peer, async () => {
        if (!peer.connection.remoteDescription) {
          peer.pendingCandidates.push(candidate)
          return
        }

        try {
          await peer.connection.addIceCandidate(candidate)
        } catch (error) {
          console.error(
            `[WebRTC ${fromUserId}] ICE candidate error:`,
            error
          )
        }
      })
    }

    const closeAllPeers = () => {
      for (const peerId of [...peersRef.current.keys()]) {
        closePeer(peerId)
      }

      setRemoteCameraStreams({})
      setRemoteScreenStreams({})
      setRemoteAudioStreams({})
    }

    const handleDisconnect = () => {
      closeAllPeers()
      setConnectionVersion((version) => version + 1)
    }

    const handleConnect = () => {
      setConnectionVersion((version) => version + 1)
    }

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

      closeAllPeers()
    }
  }, [closePeer, ensurePeer, roomId, userId])

  // Maintain one peer connection per other participant.
  const participantIds = participants
    .map((participant) => String(participant.userId))
    .filter(
      (id) => id && id !== String(userId) && id !== 'undefined'
    )
    .sort()
    .join(',')

  useEffect(() => {
    if (!roomId || !userId) return

    const remoteIds = participantIds
      ? participantIds.split(',')
      : []

    const activePeers = new Set(remoteIds)

    for (const peerId of [...peersRef.current.keys()]) {
      if (!activePeers.has(peerId)) {
        closePeer(peerId)
      }
    }

    for (const peerId of remoteIds) {
      const peer = ensurePeer(peerId)

      if (String(userId) < peerId && !peer.offerStarted) {
        peer.offerStarted = true

        queuePeerOperation(peer, async () => {
          if (peer.connection.signalingState !== 'stable') return

          await syncPeerTracks(
            peer,
            localStreamRef.current,
            localScreenStreamRef.current
          )

          const offer = await peer.connection.createOffer()
          await peer.connection.setLocalDescription(offer)

          if (socket.connected && peer.connection.localDescription) {
            socket.emit('webrtc-offer', {
              roomId,
              targetUserId: peerId,
              description: peer.connection.localDescription,
            })

            console.info(`[WebRTC ${peerId}] Sent offer`)
          }
        })
      }
    }
  }, [
    closePeer,
    connectionVersion,
    ensurePeer,
    participantIds,
    roomId,
    userId,
  ])

  return {
    remoteCameraStreams,
    remoteScreenStreams,
    remoteAudioStreams,
    connectionError,
  }
}
