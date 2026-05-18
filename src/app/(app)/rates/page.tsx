import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { RatesClient, type RateUser } from '@/components/rates-client';

export default async function RatesPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, name, role, team, hourly_rate_usd, is_active')
    .order('name');

  const users: RateUser[] = (data ?? []).map((u: Record<string, unknown>) => ({
    id:            u.id as number,
    name:          u.name as string,
    role:          u.role as string,
    team:          (u.team as string | null) ?? null,
    hourlyRateUsd: u.hourly_rate_usd == null ? null : Number(u.hourly_rate_usd),
    isActive:      Boolean(u.is_active),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Rates &amp; Currency</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          Live USD&nbsp;→&nbsp;PHP exchange rate and every team member&apos;s hourly rate converted to pesos.
        </p>
      </div>

      <RatesClient users={users} />
    </div>
  );
}
