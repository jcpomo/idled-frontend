'use client'
import TeamChatView from '@/components/TeamChatView'

export default function ChatPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 24, color: 'var(--text)' }}>
      <h1 style={{ fontWeight: 700, marginBottom: 16 }}>Chat de equipo</h1>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TeamChatView scope="global" />
      </div>
    </div>
  )
}
