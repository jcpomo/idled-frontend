import Board from '@/components/kanban/Board'
import TeamPanel from '@/components/kanban/TeamPanel'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TeamPanel projectId={params.id} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Board projectId={params.id} />
      </div>
    </div>
  )
}
