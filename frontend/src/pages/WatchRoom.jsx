import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clapperboard, Users, UserPlus, Settings, AlertTriangle } from 'lucide-react'
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

// Same name always gets the same colour
function colorFor(name = '') {
  let sum = 0
  for (const ch of name) sum += ch.charCodeAt(0)
  return COLORS[sum % COLORS.length]
}

export default function WatchRoom() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const [room, setRoom] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [controlError, setControlError] = useState('')

  const [media, setMedia] = useState({ micOn: true, camOn: true })
  const [localStream, setLocalStream] = useState(null)
  const localStreamRef = useRef(null)
  const cameraRequestRef = useRef(0)
  const [localScreenStream, setLocalScreenStream] = useState(null)
  const [screenShareStarting, setScreenShareStarting] = useState(false)
  const localScreenStreamRef = useRef(null)
  const screenShareStartingRef = useRef(false)
  const screenShareRequestRef = useRef(0)
  const [layout, setLayout] = useState('side') // 'side' | 'grid'
  const [playerMode, setPlayerMode] = useState('normal') // 'normal' | 'compact' | 'minimized'
  const [inviteOpen, setInviteOpen] = useState(false)

  // Real-time connection: members, chat, playback
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
  const { remoteCameraStreams, remoteScreenStreams, connectionError } = useWebRTC({
    roomId,
    userId: user.id,
    participants: members,
    localStream,
    localScreenStream,
  })
  const remoteScreenSharer = members.find((member) => remoteScreenStreams[member.userId])
  const activeScreenShare = localScreenStream
    ? { stream: localScreenStream, name: `${user.name} (You)` }
    : remoteScreenSharer
      ? { stream: remoteScreenStreams[remoteScreenSharer.userId], name: remoteScreenSharer.name }
      : null
  const hasActiveScreenShare = Boolean(activeScreenShare)
  const [screenShareView, setScreenShareView] = useState(null)
  const currentShareView =
    activeScreenShare && screenShareView?.stream === activeScreenShare.stream ? screenShareView : null
  const screenShareMovieMain = Boolean(
    currentShareView && currentShareView.mode !== 'minimized'
  )
  const visiblePlayerMode = hasActiveScreenShare
    ? currentShareView?.mode || 'minimized'
    : playerMode

  // Load the room details from the server
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
      .catch((err) => {
        if (cancelled) return
        if (err.status === 401) {
          logout() // token expired: ProtectedRoute will send us to Login
          return
        }
        setErrorMsg(err.message)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = useCallback(async () => {
    const requestId = ++cameraRequestRef.current

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable in this browser or page context.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const videoTracks = stream.getVideoTracks().filter((track) => track.readyState === 'live')
      if (videoTracks.length === 0) {
        stream.getTracks().forEach((track) => track.stop())
        throw new Error('No live camera video track was returned.')
      }

      videoTracks.forEach((track) => {
        track.enabled = true
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      setMedia((current) => ({ ...current, camOn: true }))
      setControlError('')
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return

      console.error('Camera access failed:', error)
      localStreamRef.current = null
      setLocalStream(null)
      setMedia((current) => ({ ...current, camOn: false }))
      setControlError(
        error.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera access for this site in Chrome and try again.'
          : error.message || 'Could not access the camera.'
      )
    }
  }, [])

  const stopScreenShare = useCallback((stopCapture = true) => {
    screenShareRequestRef.current += 1
    screenShareStartingRef.current = false
    const stream = localScreenStreamRef.current
    if (!stream) return

    localScreenStreamRef.current = null
    for (const track of stream.getTracks()) {
      track.onended = null
      if (stopCapture && track.readyState === 'live') track.stop()
    }
    setLocalScreenStream(null)
    setScreenShareStarting(false)
  }, [])

  const startScreenShare = useCallback(async () => {
    if (localScreenStreamRef.current || screenShareStartingRef.current) return
    screenShareStartingRef.current = true
    const requestId = ++screenShareRequestRef.current
    setScreenShareStarting(true)

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported by this browser or page context.')
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      if (requestId !== screenShareRequestRef.current) {
        stream.getTracks().forEach((item) => item.stop())
        return
      }
      const track = stream.getVideoTracks().find((item) => item.readyState === 'live')
      if (!track) {
        stream.getTracks().forEach((item) => item.stop())
        throw new Error('The selected screen did not provide a live video track.')
      }

      localScreenStreamRef.current = stream
      track.onended = () => stopScreenShare(false)
      setLocalScreenStream(stream)
      setControlError('')
    } catch (error) {
      if (requestId !== screenShareRequestRef.current) return
      console.error('Screen sharing failed:', error)
      setControlError(
        error.name === 'NotAllowedError'
          ? 'Screen sharing was cancelled or permission was denied.'
          : error.name === 'NotFoundError'
            ? 'No screen, window, or browser tab is available to share.'
            : error.message || 'Could not start screen sharing.'
      )
    } finally {
      if (requestId === screenShareRequestRef.current) {
        screenShareStartingRef.current = false
        setScreenShareStarting(false)
      }
    }
  }, [stopScreenShare])

  useEffect(() => {
    if (status !== 'ready') return

    const cameraTimer = window.setTimeout(() => void startCamera(), 0)
    return () => {
      window.clearTimeout(cameraTimer)
      cameraRequestRef.current += 1
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
      stopScreenShare()
    }
  }, [roomId, status, startCamera, stopScreenShare])

  const handleToggleCamera = () => {
    if (media.camOn) {
      cameraRequestRef.current += 1
      localStreamRef.current?.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
      setLocalStream(null)
      setMedia((current) => ({ ...current, camOn: false }))
      return
    }

    void startCamera()
  }

  const handlePreviewError = useCallback((error) => {
    console.error('Video preview playback failed:', error)
    setControlError('A local or remote video preview could not be played.')
  }, [])

  const handleToggleScreenShare = () => {
    if (localScreenStreamRef.current) stopScreenShare()
    else void startScreenShare()
  }

  const handlePlayerModeChange = (mode) => {
    if (activeScreenShare) {
      setScreenShareView({ stream: activeScreenShare.stream, mode })
    } else {
      setPlayerMode(mode)
    }
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
          <AlertTriangle className="mx-auto mb-3 text-amber-400" size={36} />
          <h1 className="text-xl font-semibold">Can't open this room</h1>
          <p className="mt-2 text-sm text-slate-400">{errorMsg}</p>
          <Link to="/" className="mt-5 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  // ---- Playback permissions (the server enforces these too) ----
  const locked = playback ? playback.locked : room.playbackLocked
  const canControl = connected && (!locked || room.isOwner)

  const flashError = (message) => {
    setControlError(message)
    setTimeout(() => setControlError(''), 4000)
  }

  const handleControl = (type, position) =>
    sendPlaybackAction(type, position).catch((err) => {
      flashError(err.message)
      throw err
    })

  const handleToggleLock = () => {
    setPlaybackLocked(!locked).catch((err) => flashError(err.message))
  }

  // ---- Participants ----
  const memberList = members.length > 0 ? members : [{ userId: user.id, name: user.name }]
  const participants = memberList.map((m) => {
    const isYou = m.userId === user.id
    return {
      id: m.userId,
      name: m.name,
      isOwner: m.userId === room.owner.id,
      isYou,
      micOn: isYou ? media.micOn : true,
      camOn: isYou ? media.camOn : Boolean(remoteCameraStreams[m.userId]),
      speaking: false,
      color: colorFor(m.name),
    }
  })
  const me = participants.find((p) => p.isYou) || participants[0]

  // When the player shrinks, give the participants the extra space
  const showGridInMain = layout === 'grid' || playerMode !== 'normal'

  const toggleMine = (key) => setMedia((m) => ({ ...m, [key]: !m[key] }))

  const handleLeave = () => {
    if (window.confirm('Leave this room?')) navigate('/')
  }

  const banner = socketError || controlError || connectionError

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/5 bg-ink-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" aria-label="WatchParty home" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500">
            <Clapperboard size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{room.name}</h1>
            <p className="text-xs text-slate-500">Hosted by {room.owner.name} · Room {room.roomId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full bg-ink-800 px-3 py-1.5 text-xs sm:flex">
            <Users size={14} /> {participants.length}/{room.participantLimit}
          </span>
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-medium hover:bg-indigo-400"
          >
            <UserPlus size={15} /> Invite
          </button>
          <button aria-label="Room settings" className="rounded-lg p-2 text-slate-300 hover:bg-white/5">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {banner && (
        <div role="alert" className="flex items-center gap-2 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          <AlertTriangle size={15} /> {banner}
        </div>
      )}

      {/* Body */}
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
            micOn={me.micOn}
            camOn={me.camOn}
            layout={layout}
            screenSharing={Boolean(localScreenStream)}
            screenShareStarting={screenShareStarting}
            onToggleMic={() => toggleMine('micOn')}
            onToggleCam={handleToggleCamera}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleLayout={() => setLayout((l) => (l === 'side' ? 'grid' : 'side'))}
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