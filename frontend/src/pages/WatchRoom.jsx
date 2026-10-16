
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Clapperboard,
  Users,
  UserPlus,
  Settings,
  AlertTriangle,
} from 'lucide-react'

import VideoPlayer from '../components/VideoPlayer'
import ParticipantGrid from '../components/ParticipantGrid'
import ChatPanel from '../components/ChatPanel'
import RoomControls from '../components/RoomControls'
import ScreenShareStage from '../components/ScreenShareStage'
import InviteModal from '../components/InviteModal'

import { useAuth } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import { api } from '../services/api'
import { mockRoom } from '../data/mockData'

const COLORS = [
  'from-indigo-500 to-violet-500',
  'from-sky-500 to-indigo-500',
  'from-fuchsia-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-rose-500',
]

function colorFor(name = '') {
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return COLORS[sum % COLORS.length]
}

// Plays the audio received from one remote participant.
function RemoteAudioPlayer({ stream }) {
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !stream) return

    audio.srcObject = stream

    audio.play().catch((error) => {
      console.warn(
        'Remote audio autoplay was blocked. Interact with the page to enable audio.',
        error
      )
    })

    return () => {
      if (audio.srcObject === stream) {
        audio.pause()
        audio.srcObject = null
      }
    }
  }, [stream])

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      className="hidden"
    />
  )
}

export default function WatchRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [room, setRoom] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [controlError, setControlError] = useState('')

  const [media, setMedia] = useState({
    micOn: true,
    camOn: true,
  })

  const mediaRef = useRef(media)

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  const [localStream, setLocalStream] = useState(null)
  const localStreamRef = useRef(null)
  const cameraRequestRef = useRef(0)

  const [localScreenStream, setLocalScreenStream] = useState(null)
  const localScreenStreamRef = useRef(null)
  const [screenShareStarting, setScreenShareStarting] = useState(false)
  const screenShareStartingRef = useRef(false)
  const screenShareRequestRef = useRef(0)

  const [layout, setLayout] = useState('side')
  const [playerMode, setPlayerMode] = useState('normal')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [screenShareView, setScreenShareView] = useState(null)

  const {
    connected,
    participants: members,
    messages,
    socketError,
    playback,
    sendMessage,
    sendPlaybackAction,
    setPlaybackLocked,
    requestPlaybackSync,
  } = useSocket(roomId)

  const {
    remoteCameraStreams,
    remoteScreenStreams,
    remoteAudioStreams,
    connectionError,
  } = useWebRTC({
    roomId,
    userId: user.id,
    participants: members,
    localStream,
    localScreenStream,
  })

  const remoteScreenSharer = members.find(
    (member) => remoteScreenStreams[member.userId]
  )

  const activeScreenShare = localScreenStream
    ? {
        stream: localScreenStream,
        name: `${user.name} (You)`,
      }
    : remoteScreenSharer
      ? {
          stream: remoteScreenStreams[remoteScreenSharer.userId],
          name: remoteScreenSharer.name,
        }
      : null

  const hasActiveScreenShare = Boolean(activeScreenShare)

  const currentShareView =
    activeScreenShare &&
    screenShareView?.stream === activeScreenShare.stream
      ? screenShareView
      : null

  const screenShareMovieMain = Boolean(
    currentShareView && currentShareView.mode !== 'minimized'
  )

  const visiblePlayerMode = hasActiveScreenShare
    ? currentShareView?.mode || 'minimized'
    : playerMode

  // Load room details.
  useEffect(() => {
    let cancelled = false

    setStatus('loading')

    api
      .getRoom(roomId)
      .then((data) => {
        if (cancelled) return

        setRoom(data.room)
        setStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return

        if (error.status === 401) {
          logout()
          return
        }

        setErrorMsg(error.message || 'Could not load this room.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [roomId, logout])

  // Capture camera and microphone together.
  const startCamera = useCallback(async () => {
    const requestId = ++cameraRequestRef.current

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera and microphone access are unavailable in this browser.'
        )
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const videoTracks = stream.getVideoTracks()
      const audioTracks = stream.getAudioTracks()

      if (videoTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error('No camera video track was provided.')
      }

      videoTracks.forEach((track) => {
        track.enabled = true
      })

      audioTracks.forEach((track) => {
        track.enabled = mediaRef.current.micOn
      })

      // Stop old tracks only after the new stream is ready.
      const previousStream = localStreamRef.current

      localStreamRef.current = stream
      setLocalStream(stream)

      previousStream?.getTracks().forEach((track) => {
        if (track.readyState === 'live') track.stop()
      })

      setMedia((current) => ({
        ...current,
        camOn: true,
      }))

      setControlError('')
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return

      console.error('Camera/microphone access failed:', error)

      setMedia((current) => ({
        ...current,
        camOn: false,
      }))

      setControlError(
        error.name === 'NotAllowedError'
          ? 'Allow camera and microphone permissions in your browser settings, then try again.'
          : error.message || 'Could not access camera or microphone.'
      )
    }
  }, [])

  // Start sharing the screen.
  const startScreenShare = useCallback(async () => {
    if (
      localScreenStreamRef.current ||
      screenShareStartingRef.current
    ) {
      return
    }

    screenShareStartingRef.current = true
    const requestId = ++screenShareRequestRef.current

    setScreenShareStarting(true)

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error(
          'Screen sharing is unavailable in this browser or page context.'
        )
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })

      if (requestId !== screenShareRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const track = stream.getVideoTracks().find(
        (item) => item.readyState === 'live'
      )

      if (!track) {
        stream.getTracks().forEach((item) => item.stop())
        throw new Error('No live screen-sharing video track was returned.')
      }

      localScreenStreamRef.current = stream

      track.onended = () => {
        stopScreenShare(false)
      }

      setLocalScreenStream(stream)
      setControlError('')
    } catch (error) {
      if (requestId !== screenShareRequestRef.current) return

      console.error('Screen sharing failed:', error)

      setControlError(
        error.name === 'NotAllowedError'
          ? 'Screen sharing was cancelled or permission was denied.'
          : error.message || 'Could not start screen sharing.'
      )
    } finally {
      if (requestId === screenShareRequestRef.current) {
        screenShareStartingRef.current = false
        setScreenShareStarting(false)
      }
    }
  }, [])

  const stopScreenShare = useCallback((stopCapture = true) => {
    screenShareRequestRef.current += 1
    screenShareStartingRef.current = false

    const stream = localScreenStreamRef.current

    localScreenStreamRef.current = null
    setLocalScreenStream(null)
    setScreenShareStarting(false)

    if (!stream) return

    stream.getTracks().forEach((track) => {
      track.onended = null

      if (stopCapture && track.readyState === 'live') {
        track.stop()
      }
    })
  }, [])

  // Start media when the room is ready; clean it up when leaving.
  useEffect(() => {
    if (status !== 'ready') return undefined

    const timer = window.setTimeout(() => {
      void startCamera()
    }, 0)

    return () => {
      window.clearTimeout(timer)

      cameraRequestRef.current += 1

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop()
      })

      localStreamRef.current = null
      setLocalStream(null)

      stopScreenShare()
    }
  }, [roomId, status, startCamera, stopScreenShare])

  // Real camera toggle: disable only the video tracks.
  const handleToggleCamera = () => {
    const nextCamOn = !mediaRef.current.camOn

    const videoTracks = localStreamRef.current?.getVideoTracks() || []

    if (nextCamOn && videoTracks.length === 0) {
      void startCamera()
      return
    }

    videoTracks.forEach((track) => {
      track.enabled = nextCamOn
    })

    setMedia((current) => ({
      ...current,
      camOn: nextCamOn,
    }))
  }

  // Real microphone toggle: enable/disable the audio tracks.
  const handleToggleMic = async () => {
    let stream = localStreamRef.current

    let audioTrack = stream
      ?.getAudioTracks()
      .find((track) => track.readyState === 'live')

    // If microphone access was not available initially, request it now.
    if (!audioTrack) {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Microphone access is unavailable.')
        }

        const microphoneStream =
          await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          })

        const newAudioTracks = microphoneStream.getAudioTracks()

        if (newAudioTracks.length === 0) {
          microphoneStream.getTracks().forEach((track) => track.stop())
          throw new Error('No microphone audio track was returned.')
        }

        const combinedStream = new MediaStream([
          ...(stream?.getTracks() || []),
          ...newAudioTracks,
        ])

        stream = combinedStream
        audioTrack = newAudioTracks[0]

        localStreamRef.current = combinedStream
        setLocalStream(combinedStream)
      } catch (error) {
        console.error('Microphone access failed:', error)

        setControlError(
          error.name === 'NotAllowedError'
            ? 'Allow microphone access in your browser settings.'
            : error.message || 'Could not access the microphone.'
        )
        return
      }
    }

    const nextMicOn = !mediaRef.current.micOn

    audioTrack.enabled = nextMicOn

    setMedia((current) => ({
      ...current,
      micOn: nextMicOn,
    }))

    setControlError('')
  }

  const handlePreviewError = useCallback((error) => {
    console.error('Video preview playback failed:', error)
    setControlError('A video preview could not be played.')
  }, [])

  const handleToggleScreenShare = () => {
    if (localScreenStreamRef.current) {
      stopScreenShare()
    } else {
      void startScreenShare()
    }
  }

  const handlePlayerModeChange = (mode) => {
    if (activeScreenShare) {
      setScreenShareView({
        stream: activeScreenShare.stream,
        mode,
      })
    } else {
      setPlayerMode(mode)
    }
  }

  const flashError = (message) => {
    setControlError(message)
    window.setTimeout(() => setControlError(''), 4000)
  }

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="w-full max-w-3xl animate-pulse space-y-4">
          <div className="h-10 rounded-xl bg-ink-800" />
          <div className="aspect-video rounded-2xl bg-ink-800" />
          <div className="h-14 rounded-2xl bg-ink-800" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="grid min-h-screen place-items-center p-4 text-center">
        <div className="max-w-sm">
          <AlertTriangle
            className="mx-auto mb-3 text-amber-400"
            size={36}
          />
          <h1 className="text-xl font-semibold">
            Can't open this room
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {errorMsg}
          </p>
          <Link
            to="/"
            className="mt-5 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  const locked = playback ? playback.locked : room.playbackLocked
  const canControl = connected && (!locked || room.isOwner)

  const handleControl = (type, position) =>
    sendPlaybackAction(type, position).catch((error) => {
      flashError(error.message)
      throw error
    })

  const handleToggleLock = () => {
    setPlaybackLocked(!locked).catch((error) => {
      flashError(error.message)
    })
  }

  const memberList =
    members.length > 0
      ? members
      : [{ userId: user.id, name: user.name }]

  const participants = memberList.map((member) => {
    const isYou = String(member.userId) === String(user.id)

    return {
      id: member.userId,
      name: member.name,
      isOwner: String(member.userId) === String(room.owner.id),
      isYou,
      micOn: isYou
        ? media.micOn
        : Boolean(
            remoteAudioStreams[member.userId]?.getAudioTracks().some(
              (track) => track.readyState === 'live' && track.enabled
            )
          ),
      camOn: isYou
        ? media.camOn
        : Boolean(remoteCameraStreams[member.userId]),
      speaking: false,
      color: colorFor(member.name),
    }
  })

  const me = participants.find((participant) => participant.isYou)

  const showGridInMain =
    layout === 'grid' || playerMode !== 'normal'

  const handleLeave = () => {
    if (window.confirm('Leave this room?')) {
      navigate('/')
    }
  }

  const banner = socketError || controlError || connectionError

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      {/* Play incoming audio from all remote participants. */}
      {Object.entries(remoteAudioStreams).map(([peerId, stream]) => (
        <RemoteAudioPlayer key={peerId} stream={stream} />
      ))}

      <header className="flex items-center justify-between gap-3 border-b border-white/5 bg-ink-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            aria-label="WatchParty home"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500"
          >
            <Clapperboard size={18} />
          </Link>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {room.name}
            </h1>
            <p className="text-xs text-slate-500">
              Hosted by {room.owner.name} · Room {room.roomId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full bg-ink-800 px-3 py-1.5 text-xs sm:flex">
            <Users size={14} />
            {participants.length}/{room.participantLimit}
          </span>

          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium hover:bg-indigo-400"
          >
            <UserPlus size={15} /> Invite
          </button>

          <button
            aria-label="Room settings"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {banner && (
        <div
          role="alert"
          className="flex items-center gap-2 bg-red-500/10 px-4 py-2 text-sm text-red-300"
        >
          <AlertTriangle size={15} />
          {banner}
        </div>
      )}

      <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
          <div
            className={`grid min-w-0 gap-4 ${
              hasActiveScreenShare && screenShareMovieMain
                ? 'items-start lg:grid-cols-[minmax(0,1fr)_minmax(220px,360px)]'
                : 'grid-cols-1'
            }`}
          >
            <VideoPlayer
              src={room.videoUrl || mockRoom.videoUrl}
              title={room.videoUrl ? room.videoTitle : mockRoom.videoTitle}
              mode={visiblePlayerMode}
              onModeChange={handlePlayerModeChange}
              playback={playback}
              locked={locked}
              canControl={canControl}
              isOwner={room.isOwner}
              currentUserId={user.id}
              onControl={handleControl}
              onToggleLock={handleToggleLock}
              requestSync={requestPlaybackSync}
            />

            {activeScreenShare && (
              <ScreenShareStage
                stream={activeScreenShare.stream}
                sharerName={activeScreenShare.name}
                compact={screenShareMovieMain}
                onPlaybackError={handlePreviewError}
              />
            )}
          </div>

          <RoomControls
            micOn={me?.micOn ?? media.micOn}
            camOn={me?.camOn ?? media.camOn}
            layout={layout}
            screenSharing={Boolean(localScreenStream)}
            screenShareStarting={screenShareStarting}
            onToggleMic={handleToggleMic}
            onToggleCam={handleToggleCamera}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleLayout={() =>
              setLayout((current) =>
                current === 'side' ? 'grid' : 'side'
              )
            }
            onLeave={handleLeave}
          />

          {showGridInMain && (
            <ParticipantGrid
              participants={participants}
              layout="grid"
              localStream={localStream}
              remoteStreams={remoteCameraStreams}
              onPreviewError={handlePreviewError}
            />
          )}
        </div>

        <aside className="flex min-h-0 flex-col gap-4">
          {!showGridInMain && (
            <div className="max-h-[45vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 p-3">
              <ParticipantGrid
                participants={participants}
                layout="side"
                localStream={localStream}
                remoteStreams={remoteCameraStreams}
                onPreviewError={handlePreviewError}
              />
            </div>
          )}

          <div className="min-h-0 flex-1">
            <ChatPanel
              messages={messages}
              onSend={sendMessage}
              connected={connected}
              currentUserId={user.id}
            />
          </div>
        </aside>
      </main>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        link={`${window.location.origin}/room/${room.roomId}`}
      />
    </div>
  )
}
