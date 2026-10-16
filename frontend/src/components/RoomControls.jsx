import { Mic, MicOff, Video, VideoOff, LayoutGrid, PanelRight, PhoneOff, MonitorUp } from 'lucide-react'

function ControlButton({ onClick, active = true, danger = false, label, children }) {
  const base = 'grid h-11 w-11 place-items-center rounded-full transition'
  const color = danger
    ? 'bg-red-500 hover:bg-red-400'
    : active
    ? 'bg-ink-700 hover:bg-ink-600'
    : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`${base} ${color}`}>
      {children}
    </button>
  )
}

export default function RoomControls({
  micOn,
  camOn,
  layout,
  screenSharing,
  screenShareStarting,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onToggleLayout,
  onLeave,
}) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-ink-900 px-4 py-3">
      <ControlButton onClick={onToggleMic} active={micOn} label={micOn ? 'Mute microphone' : 'Unmute microphone'}>
        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
      </ControlButton>
      <ControlButton onClick={onToggleCam} active={camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
        {camOn ? <Video size={18} /> : <VideoOff size={18} />}
      </ControlButton>
      <button
        onClick={onToggleScreenShare}
        disabled={screenShareStarting}
        aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
        title={screenSharing ? 'Stop sharing screen' : 'Share screen'}
        className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
          screenSharing ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-ink-700 hover:bg-ink-600'
        }`}
      >
        <MonitorUp size={18} />
        {screenShareStarting ? 'Starting…' : screenSharing ? 'Stop Sharing' : 'Share Screen'}
      </button>
      <ControlButton onClick={onToggleLayout} label="Switch participant layout">
        {layout === 'side' ? <LayoutGrid size={18} /> : <PanelRight size={18} />}
      </ControlButton>
      <ControlButton onClick={onLeave} danger label="Leave room">
        <PhoneOff size={18} />
      </ControlButton>
    </div>
  )
}