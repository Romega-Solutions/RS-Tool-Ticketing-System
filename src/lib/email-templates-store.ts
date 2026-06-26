// Supabase-backed persistence for the editable email templates. Kept separate
// from the pure render module (src/lib/email-templates.ts) so the latter stays
// client-safe for the send dialog's live preview. Server-only — imports the
// service-role admin client. Write payloads validated by supabase-write-columns.
import { createAdminClient } from '@/lib/supabase/admin';
import { ACCOUNT_SETUP_KEY, DEFAULT_ACCOUNT_SETUP, type EmailTemplate } from '@/lib/email-templates';

// The saved "account setup" default, falling back to the built-in copy when the
// row is missing (fresh DB / pre-migration) or the lookup fails.
export async function getAccountSetupTemplate(): Promise<EmailTemplate> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('email_templates')
      .select('subject, body, updated_at, updated_by')
      .eq('key', ACCOUNT_SETUP_KEY)
      .maybeSingle();
    if (data?.subject && data?.body) {
      return {
        subject: data.subject,
        body: data.body,
        updatedAt: data.updated_at ?? null,
        updatedBy: data.updated_by ?? null,
      };
    }
  } catch {
    /* fall through to the built-in default */
  }
  return { ...DEFAULT_ACCOUNT_SETUP, updatedAt: null, updatedBy: null };
}

export async function saveAccountSetupTemplate(input: {
  subject: string;
  body: string;
  updatedBy: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('email_templates').upsert(
    {
      key: ACCOUNT_SETUP_KEY,
      subject: input.subject,
      body: input.body,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy,
    },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
}
