'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';

const ALLOWED_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
type Stage = typeof ALLOWED_STAGES[number];

function isStage(value: string): value is Stage {
  return (ALLOWED_STAGES as readonly string[]).includes(value);
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!hasToolAccess('sales', session.role, session.toolAccess)) {
    throw new Error('Not authorized');
  }
  return session;
}

export async function createLead(formData: FormData) {
  const session = await requireSession();

  const name    = String(formData.get('name')    ?? '').trim();
  const email   = String(formData.get('email')   ?? '').trim() || null;
  const company = String(formData.get('company') ?? '').trim() || null;
  const notes   = String(formData.get('notes')   ?? '').trim() || null;
  const valueRaw = String(formData.get('value')  ?? '0').replace(/[^\d]/g, '');
  const value   = valueRaw ? parseInt(valueRaw, 10) : 0;

  if (!name) throw new Error('Name is required');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('leads')
    .insert({ name, email, company, notes, value, stage: 'new', assigned_to: session.id });

  if (error) throw new Error(`Failed to create lead: ${error.message}`);

  revalidatePath('/sales/leads');
}

export async function updateLeadStage(id: number, stage: string) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (!isStage(stage)) throw new Error('Invalid stage');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('leads')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Failed to update lead: ${error.message}`);

  revalidatePath('/sales/leads');
}

export async function deleteLead(id: number) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { error } = await supabase.from('leads').delete().eq('id', id);

  if (error) throw new Error(`Failed to delete lead: ${error.message}`);

  revalidatePath('/sales/leads');
}

const DELETE_LEADS_CONFIRMATION = 'DELETE LEADS';

export async function deleteAllLeads(confirmation: string) {
  await requireSession();
  if (confirmation !== DELETE_LEADS_CONFIRMATION) {
    throw new Error(`Type ${DELETE_LEADS_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('leads').select('id');
  if (fetchError) throw new Error(`Failed to inspect leads: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('leads').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete leads: ${error.message}`);
  }

  revalidatePath('/sales/leads');
  return { ok: true as const, deleted: ids.length };
}
