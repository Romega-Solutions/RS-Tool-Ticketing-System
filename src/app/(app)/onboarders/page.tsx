import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  GraduationCap, ShieldCheck, CalendarCheck, Workflow, AlertCircle,
  ArrowRight, UserPlus2, Briefcase, Mail, Clock, Settings2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { APP_DEPARTMENTS } from '@/lib/orgchart';
import {
  ALLOWED_STATUSES,
  ALLOWED_TYPES,
  type OnboarderStatus,
  type OnboarderType,
} from './constants';
import { STATUS_LABEL, STATUS_COLOR } from './onboarder-row';
import { CreateOnboarderForm } from './onboarder-forms';
import { OnboarderFilterBar } from './onboarder-filter-bar';

// ─── Stage groupings (3 happy lanes + 1 terminal lane) ──────────────────────

const LANES: { id: string; title: string; hint: string; statuses: OnboarderStatus[] }[] = [
  {
    id: 'lane-prep',
    title: 'Pre-employment',
    hint:  'SOW → background check → pre-onboarding',
    statuses: ['offer_signed', 'background_check', 'pre_onboarding'],
  },
  {
    id: 'lane-active',
    title: 'Active onboarding',
    hint:  'Day 1 → 30-day → 90-day',
    statuses: ['day_one', 'thirty_day', 'ninety_day'],
  },
  {
    id: 'lane-final',
    title: 'Resolved',
    hint:  'Regularized + terminal-fail states',
    statuses: ['regularized', 'failed_probation', 'withdrew'],
  },
];

type Row = {
  id:                number;
  full_name:         string;
  personal_email:    string;
  onboarder_type:    string;
  role_title:        string | null;
  team:              string | null;
  direct_supervisor: string | null;
  status:            string;
  start_date:        string | null;
  sow_signed_at:     string | null;
  created_at:        string;
};

const TYPE_LABEL: Record<OnboarderType, string> = {
  contractor: 'Contractor',
  intern:     'Intern',
};

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

function formatDateShort(iso: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

type PageProps = {
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !canAccessLeadTool('onboarding', session.role, session.team)) {
    redirect('/dashboard');
  }

  const { q = '', status = 'all', type = 'all' } = await searchParams;
  const query = q.trim().toLowerCase();
  const statusFilter = (ALLOWED_STATUSES as readonly string[]).includes(status) ? status : 'all';
  const typeFilter   = (ALLOWED_TYPES    as readonly string[]).includes(type)   ? type   : 'all';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, onboarder_type, role_title, team, direct_supervisor, status, start_date, sow_signed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  const errorMsg = error?.message;
  const tableMissing = isTableMissing(errorMsg);
  const unexpectedError = error && !tableMissing ? errorMsg : null;

  const rows: Row[] = (data as Row[] | null) ?? [];
  const filtered = rows.filter(r => {
    const matchesQ = !query || [
      r.full_name, r.personal_email,
      r.role_title ?? '', r.team ?? '', r.direct_supervisor ?? '',
    ].some(v => v.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesType   = typeFilter   === 'all' || r.onboarder_type === typeFilter;
    return matchesQ && matchesStatus && matchesType;
  });

  // Stat counts
  const TERMINAL = new Set(['regularized', 'failed_probation', 'withdrew']);
  const activeCount = rows.filter(r => !TERMINAL.has(r.status)).length;
  const bgCount     = rows.filter(r => r.status === 'background_check').length;

  const monday = startOfWeek(new Date());
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6); sunday.setHours(23,59,59,999);
  const day1Count = rows.filter(r => {
    if (r.status !== 'day_one' || !r.start_date) return false;
    const d = new Date(r.start_date);
    return d >= monday && d <= sunday;
  }).length;

  const workflowEnvKeys = [
    'N8N_BG_CHECK_INITIATE_URL',
    'N8N_REFERENCE_REQUEST_URL',
    'N8N_EMPLOYMENT_VERIFICATION_URL',
    'N8N_ONBOARDING_WELCOME_URL',
  ];
  const configuredCount = workflowEnvKeys.filter(k => process.env[k]?.trim()).length;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="People ops"
        title="Internal Onboarding"
        description="Move new Romega hires from offer-signed to regularized — SOW, background checks, gov IDs, welcome emails, Day-1 setup, 30/90-day reviews. Separate from the ATS (which tracks candidates being placed at clients)."
        action={
          !tableMissing && !unexpectedError ? (
            <div className="flex flex-wrap items-start justify-end gap-2">
              <Link
                href="/onboarders/setup"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-(--rs-neutral-grey-200) bg-white px-4 text-sm font-semibold text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) transition-colors"
              >
                <Settings2 className="w-4 h-4" /> Setup & workflows
              </Link>
              <CreateOnboarderForm departments={[...APP_DEPARTMENTS]} />
            </div>
          ) : null
        }
      />

      {tableMissing && <SetupRequiredCard />}
      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load onboarders</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<GraduationCap className="w-4 h-4" />} label="Active onboarders" value={String(activeCount)} hint="not yet resolved" />
            <StatCard icon={<ShieldCheck   className="w-4 h-4" />} label="Awaiting BG check" value={String(bgCount)}     hint="background_check stage" />
            <StatCard icon={<CalendarCheck className="w-4 h-4" />} label="Day-1 this week"   value={String(day1Count)}   hint="starting Mon–Sun" />
            <StatCard icon={<Workflow      className="w-4 h-4" />} label="Workflows configured" value={`${configuredCount} / ${workflowEnvKeys.length}`} hint="n8n MVP webhooks" accent />
          </div>

          {/* Filter bar */}
          <Card>
            <CardContent className="p-0">
              <OnboarderFilterBar
                q={q}
                statusFilter={statusFilter}
                typeFilter={typeFilter}
                totalShown={filtered.length}
                totalAll={rows.length}
              />

              {rows.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="p-4 lg:p-6">
                  <Kanban rows={filtered} />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Kanban ─────────────────────────────────────────────────────────────────

function Kanban({ rows }: { rows: Row[] }) {
  const byStatus = new Map<OnboarderStatus, Row[]>();
  for (const s of ALLOWED_STATUSES) byStatus.set(s, []);
  for (const r of rows) {
    const list = byStatus.get(r.status as OnboarderStatus);
    if (list) list.push(r);
  }
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {LANES.map(lane => {
        const laneRows = lane.statuses.flatMap(s => byStatus.get(s) ?? []);
        return (
          <div key={lane.id} className="rounded-2xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/40 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <h3 className="font-serif text-sm font-bold text-(--rs-neutral-grey-900)">{lane.title}</h3>
                <p className="text-[11px] text-(--rs-neutral-grey-500)">{lane.hint}</p>
              </div>
              <span className="rounded-full bg-white border border-(--rs-neutral-grey-200) px-2 py-0.5 text-[11px] font-semibold text-(--rs-neutral-grey-700)">
                {laneRows.length}
              </span>
            </div>

            <div className="space-y-3">
              {lane.statuses.map(s => (
                <StageColumn key={s} status={s} rows={byStatus.get(s) ?? []} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageColumn({ status, rows }: { status: OnboarderStatus; rows: Row[] }) {
  const label = STATUS_LABEL[status];
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[status]}`}>
          {label}
        </span>
        <span className="text-[10px] text-(--rs-neutral-grey-400)">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-(--rs-neutral-grey-200) bg-white/40 px-3 py-3 text-[11px] text-(--rs-neutral-grey-400)">
          No one here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => <Card_ key={r.id} row={r} />)}
        </ul>
      )}
    </div>
  );
}

function Card_({ row }: { row: Row }) {
  const typeLabel = TYPE_LABEL[row.onboarder_type as OnboarderType] ?? row.onboarder_type;
  return (
    <li>
      <Link
        href={`/onboarders/${row.id}`}
        className="group block rounded-xl border border-(--rs-neutral-grey-200) bg-white p-3 transition-all hover:border-(--rs-primary-300) hover:shadow-sm cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-(--rs-neutral-grey-900) group-hover:text-(--rs-primary-700)">
              {row.full_name}
            </p>
            {row.role_title && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-(--rs-neutral-grey-600)">
                <Briefcase className="w-3 h-3 shrink-0" /> {row.role_title}
                {row.team && <span className="text-(--rs-neutral-grey-300)">·</span>}
                {row.team && <span className="truncate">{row.team}</span>}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-md bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-[10px] font-semibold text-(--rs-neutral-grey-700)">
            {typeLabel}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-(--rs-neutral-grey-500)">
          <span className="flex items-center gap-1 truncate">
            <Mail className="w-3 h-3 shrink-0" /> {row.personal_email}
          </span>
          {row.start_date && (
            <span className="flex items-center gap-1 whitespace-nowrap text-(--rs-primary-700)">
              <Clock className="w-3 h-3" /> {formatDateShort(row.start_date)}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1 text-[10px] text-(--rs-neutral-grey-400)">
          <ArrowRight className="w-2.5 h-2.5" />
          Open record
        </div>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-20 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
        <UserPlus2 className="w-6 h-6 text-(--rs-primary-500)" />
      </div>
      <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No onboarders yet</p>
      <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-md mx-auto">
        Click <strong>New onboarder</strong> above to start a record. The HRBP keeps the SOW out-of-band — the app picks up from offer-signed.
      </p>
    </div>
  );
}

function SetupRequiredCard() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-(--rs-accent-50) p-2 text-(--rs-accent-700)">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">onboarders</code> table
              hasn&apos;t been created yet. Run this in the Supabase SQL Editor:
            </p>
            <ol className="mt-3 list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1.5 leading-relaxed">
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-onboarders-tables.sql</code></li>
            </ol>
            <p className="mt-3 text-sm text-(--rs-neutral-grey-600)">
              See <Link href="/onboarders/setup" className="text-(--rs-primary-700) hover:underline">Setup &amp; workflows</Link> for the full MVP setup checklist.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
