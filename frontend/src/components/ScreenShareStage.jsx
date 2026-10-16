
import { useEffect, useRef, useState } from 'react'
import { MonitorUp } from 'lucide-react'

export default function ScreenShareStage({
  stream,
  sharerName,
  compact = false,
  onPlaybackError,
}) {
  const videoRef = useRef(null)
  const [trackInfo, setTrackInfo] = useState('Waiting for video track')

  useEffect(() => {
    const video = videoRef.current

    if (!video || !stream) {
      setTrackInfo('No stream received')
      return
    }

    let cancelled = false
    const tracks = stream.getVideoTracks()

    const updateStatus = () => {
      if (cancelled) return

      const currentTracks = stream.getVideoTracks()
      setTrackInfo(
        currentTracks.length === 0
          ? 'No video track'
          : currentTracks
              .map((track) => `${track.readyState}, muted=${track.muted}`)
              .join(' | ')
      )
    }

    video.srcObject = stream
    updateStatus()

    stream.getTracks().forEach((track) => {
      track.addEventListener('unmute', updateStatus)
      track.addEventListener('mute', updateStatus)
      track.addEventListener('ended', updateStatus)
    })

    video.play().catch((error) => {
      if (!cancelled) {
        console.error('Screen-share playback failed:', error)
        onPlaybackError?.(error)
      }
    })

    return () => {
      cancelled = true

      stream.getTracks().forEach((track) => {
        track.removeEventListener('unmute', updateStatus)
        track.removeEventListener('mute', updateStatus)
        track.removeEventListener('ended', updateStatus)
      })

      if (video.srcObject === stream) video.srcObject = null
    }
  }, [stream, onPlaybackError])

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

        <div className="absolute left-3 top-3 rounded-lg bg-black/80 px-3 py-2 text-xs text-white">
          <div className="flex items-center gap-2">
            <MonitorUp size={14} />
            {sharerName} is sharing their screen
          </div>
          <div className="mt-1">{trackInfo}</div>
        </div>
      </div>
    </section>
  )
}
