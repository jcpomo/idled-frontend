import Board from '@/components/kanban/Board'
import TeamPanel from '@/components/kanban/TeamPanel'
import TeamChatPanel from '@/components/kanban/TeamChatPanel'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TeamPanel projectId={params.id} />
        <TeamChatPanel projectId={params.id} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Board projectId={params.id} />
      </div>
    </div>
  )
}
