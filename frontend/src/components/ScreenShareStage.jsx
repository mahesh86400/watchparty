import { useEffect, useRef } from 'react'
import { MonitorUp } from 'lucide-react'

export default function ScreenShareStage({ stream, sharerName, compact = false, onPlaybackError }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    let cancelled = false
    video.srcObject = stream
    video.play().catch((error) => {
      if (!cancelled) onPlaybackError(error)
    })

    return () => {
      cancelled = true
      if (video.srcObject === stream) video.srcObject = null
    }
  }, [onPlaybackError, stream])

  return (
    <section
      aria-label={`${sharerName} screen share`}
      className={`min-w-0 overflow-hidden border border-white/10 bg-black ${
        compact ? 'rounded-xl' : 'rounded-2xl'
      }`}
    >
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className={`absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 ${
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        }`}>
          <MonitorUp size={compact ? 14 : 16} className="shrink-0 text-indigo-300" />
          <span>{sharerName} is sharing their screen</span>
        </div>
      </div>
    </section>
  )
}
