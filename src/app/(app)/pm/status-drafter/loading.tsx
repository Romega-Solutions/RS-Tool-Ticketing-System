import { LeadToolLoadingShell } from '@/components/lead-tool-header';

export default function Loading() {
  return (
    <LeadToolLoadingShell
      eyebrow="Project Manager tool"
      title="AI Weekly Status Drafter"
      description="Every Friday at 4 PM, n8n collects weekly reports, timesheets, and attendance from Supabase. Groq drafts a stakeholder-ready summary in Romega's tone."
    />
  );
}
