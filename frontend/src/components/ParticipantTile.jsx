import { useEffect, useRef } from 'react'
import { MicOff, VideoOff, Crown } from 'lucide-react'

export default function ParticipantTile({ participant, localStream, remoteStream, onPreviewError }) {
  const { name, isOwner, isYou, micOn, camOn, speaking, color } = participant
  const videoRef = useRef(null)
  const stream = isYou ? localStream : remoteStream

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    let cancelled = false
    video.srcObject = stream

    video.play().catch((error) => {
      if (!cancelled) onPreviewError(error)
    })

    return () => {
      cancelled = true
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream, onPreviewError])

  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl border bg-ink-800 transition ${
        speaking ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-white/10'
      }`}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isYou}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <div
            className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br ${color} text-lg font-semibold text-white`}
          >
            {name[0].toUpperCase()}
          </div>
        </div>
      )}

      {isOwner && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-amber-300">
          <Crown size={11} /> Owner
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
        <span className="truncate text-xs font-medium">
          {name}
          {isYou && ' (You)'}
        </span>
        <span className="flex items-center gap-1">
          {!camOn && <VideoOff size={13} className="text-slate-300" aria-label="Camera off" />}
          {!micOn && <MicOff size={13} className="text-red-400" aria-label="Muted" />}
        </span>
      </div>
    </div>
  )
}