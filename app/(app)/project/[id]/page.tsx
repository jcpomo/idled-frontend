import Board from '@/components/kanban/Board'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <Board projectId={params.id} />
}
