export const mockRoom = {
  id: 'demo-room',
  name: 'Friday Movie Night',
  limit: 8,
  videoUrl:
   'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
  videoTitle: 'Big Buck Bunny',
}

export const mockParticipants = [
  { id: '1', name: 'Mahesh', isOwner: true, isYou: true, micOn: true, camOn: true, speaking: true, color: 'from-indigo-500 to-violet-500' },
  { id: '2', name: 'Aarav', isOwner: false, isYou: false, micOn: true, camOn: true, speaking: false, color: 'from-sky-500 to-indigo-500' },
  { id: '3', name: 'Priya', isOwner: false, isYou: false, micOn: false, camOn: true, speaking: false, color: 'from-fuchsia-500 to-violet-500' },
  { id: '4', name: 'Rohan', isOwner: false, isYou: false, micOn: true, camOn: false, speaking: false, color: 'from-emerald-500 to-teal-500' },
  { id: '5', name: 'Sneha', isOwner: false, isYou: false, micOn: false, camOn: false, speaking: false, color: 'from-amber-500 to-rose-500' },
]

export const mockMessages = [
  { id: 'm1', sender: 'Aarav', text: 'Is everyone here?', time: '8:01 PM' },
  { id: 'm2', sender: 'Priya', text: 'Yep, grabbing popcorn 🍿', time: '8:02 PM' },
  { id: 'm3', sender: 'Mahesh', text: 'Starting in a minute!', time: '8:02 PM' },
]