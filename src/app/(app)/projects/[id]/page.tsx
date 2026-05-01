export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Project: {resolvedParams.id.toUpperCase()}</h1>
      <p className="text-slate-600">This page will contain the Kanban board and List view for project {resolvedParams.id.toUpperCase()}. Drag-and-drop cards between statuses.</p>
    </div>
  );
}
