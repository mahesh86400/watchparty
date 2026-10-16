import ParticipantTile from './ParticipantTile'

export default function ParticipantGrid({ participants, layout, localStream, remoteStreams, onPreviewError }) {
  // "side" = compact 2-column panel, "grid" = bigger responsive grid
  const cols =
    layout === 'grid'
      ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
      : 'grid-cols-2'

  return (
    <div className={`grid gap-2 ${cols}`}>
      {participants.map((p) => (
        <ParticipantTile
          key={p.id}
          participant={p}
          localStream={p.isYou ? localStream : null}
          remoteStream={p.isYou ? null : remoteStreams?.[p.id]}
          onPreviewError={onPreviewError}
        />
      ))}
    </div>
  )
}