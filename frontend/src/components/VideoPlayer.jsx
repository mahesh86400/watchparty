import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize2,
  Maximize2,
  PictureInPicture2,
  Loader2,
  AlertTriangle,
  Lock,
} from 'lucide-react'

// 75 -> "1:15", 3700 -> "1:01:40"
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`
}

const MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'compact', label: 'Compact' },
]

export default function VideoPlayer({
  src,
  title,
  mode,
  onModeChange,
  playback, // latest state from the server (or null)
  locked,
  canControl, // can this user play, pause and seek right now?
  isOwner,
  currentUserId,
  onControl, // (type, position) => Promise
  onToggleLock,
  requestSync,
}) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const latestRef = useRef(null) // newest playback state, for use inside callbacks

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scrubTime, setScrubTime] = useState(null) // set while dragging the seek bar
  const [needsClick, setNeedsClick] = useState(false) // browser blocked autoplay
  const [notice, setNotice] = useState('')

  const isMini = mode === 'minimized'
  const playing = Boolean(playback?.playing)
  const pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled

  // Make the video match the server's state
  const applyState = useCallback((state) => {
    const v = videoRef.current
    if (!v || !state) return
    if (v.readyState < 1) return // metadata not loaded yet, we apply again when it is

    const drift = Math.abs(v.currentTime - state.position)

    if (state.playing) {
      if (drift > 0.5) v.currentTime = state.position
      if (v.paused) {
        v.play()
          .then(() => setNeedsClick(false))
          .catch(() => setNeedsClick(true)) // autoplay blocked until the user clicks
      }
    } else {
      setNeedsClick(false)
      if (!v.paused) v.pause()
      if (drift > 0.1) v.currentTime = state.position
    }
  }, [])

  // A new state arrived from the server
  useEffect(() => {
    latestRef.current = playback
    applyState(playback)
  }, [playback, applyState])

  // Short message like "Aarav skipped to 12:30"
  useEffect(() => {
    if (!playback || playback.snapshot || !playback.action || playback.byId === currentUserId) return
    const verbs = {
      play: 'pressed play',
      pause: 'paused',
      seek: `skipped to ${formatTime(playback.position)}`,
      lock: 'locked playback',
      unlock: 'unlocked playback',
    }
    if (!verbs[playback.action]) return
    setNotice(`${playback.by} ${verbs[playback.action]}`)
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [playback, currentUserId])

  // Every 5 seconds while playing, compare with the server and correct drift gently
  useEffect(() => {
    if (!playing || !requestSync) return
    const timer = setInterval(async () => {
      const v = videoRef.current
      if (!v || v.paused || v.seeking || v.readyState < 3) return
      try {
        const result = await requestSync()
        if (!result || !result.state.playing) return
        const expected = result.state.position + result.rtt / 2000
        const drift = v.currentTime - expected

        if (Math.abs(drift) > 1.5) {
          v.currentTime = expected // far off: one jump
        } else if (Math.abs(drift) > 0.3) {
          v.playbackRate = drift > 0 ? 0.95 : 1.05 // slightly off: nudge the speed
          setTimeout(() => {
            if (videoRef.current) videoRef.current.playbackRate = 1
          }, 2000)
        } else {
          v.playbackRate = 1
        }
      } catch {
        // ignore: we try again in 5 seconds
      }
    }, 5000)
    return () => {
      clearInterval(timer)
      if (videoRef.current) videoRef.current.playbackRate = 1
    }
  }, [playing, requestSync])

  // Keep "isFullscreen" in sync with the browser
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- Actions ----
  const joinPlayback = () => applyState(latestRef.current)

  const togglePlay = () => {
    if (needsClick) {
      joinPlayback()
      return
    }
    const v = videoRef.current
    if (!canControl || error || !v) return
    onControl(playing ? 'pause' : 'play', v.currentTime).catch(() => {})
  }

  const commitSeek = () => {
    if (scrubTime === null) return
    const target = scrubTime
    setScrubTime(null)
    const v = videoRef.current
    if (!canControl || !v) return
    v.currentTime = target // show it immediately
    onControl('seek', target).catch(() => applyState(latestRef.current)) // undo if rejected
  }

  const handleVolume = (e) => {
    const v = videoRef.current
    const value = Number(e.target.value)
    v.volume = value
    v.muted = value === 0
  }

  const toggleMute = () => {
    const v = videoRef.current
    v.muted = !v.muted
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      containerRef.current?.requestFullscreen().catch(() => {})
    }
  }

  // Native Picture-in-Picture: a floating window OUTSIDE the page.
  // Different from our "minimized" mode, which stays inside the page.
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current.requestPictureInPicture()
      }
    } catch {
      alert('Picture-in-Picture is not available for this video.')
    }
  }

  // ---- Wrapper size depends on the mode ----
  let sizeClass = 'w-full max-w-[1400px]'
  if (mode === 'compact') sizeClass = 'w-full max-w-[480px]'
  if (isMini) sizeClass = 'fixed bottom-4 left-4 z-40 w-72 shadow-2xl ring-1 ring-indigo-400/50'
  if (isFullscreen) sizeClass = 'fixed inset-0 z-50 rounded-none'

  return (
    <div
      ref={containerRef}
      className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black transition-[max-width] duration-300 ${sizeClass}`}
    >
      {/* Header: title, lock and mode buttons (hidden in mini and fullscreen) */}
      {!isMini && !isFullscreen && (
        <div className="flex items-center justify-between gap-2 bg-ink-900 px-4 py-2 text-sm">
          <span className="truncate font-medium">{title}</span>
          <div className="flex shrink-0 items-center gap-2">
            {isOwner ? (
              <button
                onClick={onToggleLock}
                title={locked ? 'Let everyone control playback' : 'Only you can control playback'}
                className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition ${
                  locked
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <Lock size={12} /> {locked ? 'Locked · Unlock' : 'Lock playback'}
              </button>
            ) : (
              locked && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                  <Lock size={12} /> Locked by owner
                </span>
              )
            )}
            <div className="flex overflow-hidden rounded-lg border border-white/10" role="group" aria-label="Player size">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onModeChange(m.id)}
                  aria-pressed={mode === m.id}
                  className={`px-2.5 py-1 text-xs transition ${
                    mode === m.id ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <button
                onClick={() => onModeChange('minimized')}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/5"
                title="Minimize player"
              >
                <Minimize2 size={12} /> Minimize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The ONE video element. Never unmounted, so time and play state survive mode changes. */}
      <div className={`relative bg-black ${isFullscreen ? 'min-h-0 flex-1' : 'aspect-video'}`}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          onClick={togglePlay}
          className={`h-full w-full object-contain ${canControl ? 'cursor-pointer' : 'cursor-default'}`}
          onLoadedMetadata={(e) => {
            setDuration(e.target.duration)
            applyState(latestRef.current) // late joiner: jump to the current moment
          }}
          onLoadedData={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onPlaying={() => setLoading(false)}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onVolumeChange={(e) => {
            setVolume(e.target.volume)
            setMuted(e.target.muted)
          }}
          onEnded={() => {
            // Only the owner's player reports the end, so we don't send one message per viewer
            if (isOwner && playing) onControl('pause', videoRef.current.currentTime).catch(() => {})
          }}
          onError={() => {
            setLoading(false)
            setError(true)
          }}
        />

        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="animate-spin text-indigo-300" size={isMini ? 24 : 36} />
          </div>
        )}

        {needsClick && playing && !error && (
          <button
            onClick={joinPlayback}
            className="absolute inset-0 grid place-items-center bg-black/60"
            aria-label="Click to join playback"
          >
            <span className="flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400">
              <Play size={16} /> Click to join playback
            </span>
          </button>
        )}

        {notice && !isMini && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-slate-100">
            {notice}
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900 p-2 text-center">
            <div>
              <AlertTriangle className="mx-auto mb-1 text-amber-400" size={isMini ? 20 : 32} />
              <p className="text-sm text-slate-300">This video couldn't be loaded.</p>
              {!isMini && <p className="text-xs text-slate-500">Check the URL or try a different source.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center gap-2 bg-ink-900 px-3 py-2">
        <button
          onClick={togglePlay}
          disabled={!canControl && !needsClick}
          aria-label={playing ? 'Pause' : 'Play'}
          title={!canControl && !needsClick ? 'Playback is locked' : playing ? 'Pause' : 'Play'}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-500 transition hover:bg-indigo-400 disabled:opacity-40"
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        {!isMini && (
          <span className="w-12 shrink-0 text-xs tabular-nums text-slate-300">
            {formatTime(scrubTime ?? currentTime)}
          </span>
        )}

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={scrubTime ?? currentTime}
          onChange={(e) => setScrubTime(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          disabled={!duration || !canControl}
          aria-label="Seek"
          title={canControl ? 'Seek' : 'Playback is locked'}
          className="min-w-0 flex-1 accent-indigo-400 disabled:opacity-40"
        />

        {!isMini && (
          <>
            <span className="w-12 shrink-0 text-xs tabular-nums text-slate-400">{formatTime(duration)}</span>

            <div className="hidden items-center gap-1 sm:flex">
              <button onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="rounded p-1 hover:bg-white/10">
                {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolume}
                aria-label="Volume"
                className="w-20 accent-indigo-400"
              />
            </div>

            {pipSupported && (
              <button onClick={togglePiP} aria-label="Picture in picture" title="Picture in picture" className="rounded p-1 hover:bg-white/10">
                <PictureInPicture2 size={17} />
              </button>
            )}
            <button onClick={toggleFullscreen} aria-label="Fullscreen" title="Fullscreen" className="rounded p-1 hover:bg-white/10">
              <Maximize size={17} />
            </button>
          </>
        )}

        {isMini && (
          <button
            onClick={() => onModeChange('normal')}
            aria-label="Restore player"
            title="Restore player"
            className="rounded p-1 hover:bg-white/10"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}