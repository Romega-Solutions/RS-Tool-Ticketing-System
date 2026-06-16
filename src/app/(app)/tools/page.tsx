import type { ComponentType } from 'react';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import {
  emailSignatureAccess,
  canAccessCertificateCreator,
  canAccessDevTools,
  type SignatureAccess,
} from '@/lib/rbac';
import { Mail, Network, Award, ExternalLink } from 'lucide-react';
import { OrgChartCredentials } from './org-chart-credentials';

export const metadata = { title: 'Tools · Romega Portal' };

// Shared read-only Org Chart logins, keyed by the same access tier used for
// Email Signature (admin role → Admin, HR team → editor, else → visitor).
const ORG_CHART_CREDS: Record<SignatureAccess, { username: string; password: string }> = {
  admin:   { username: 'Admin',   password: 'RomegaSoln67' },
  editor:  { username: 'editor',  password: 'RomegaSoln67' },
  visitor: { username: 'visitor', password: 'HelloRomega321' },
};

// lucide-react dropped brand icons, so the dev-tool logos are inlined as the
// official monochrome brand marks (fill = currentColor, 24×24 viewBox).
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
function VercelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.608l12 20.784H0z" />
    </svg>
  );
}
function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 00-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.092-1.376 3.092-3.068v-2.97H8.148z" />
    </svg>
  );
}

interface ToolTileData {
  id: string;
  name: string;
  description: string;
  href: string | null; // null ⇒ URL not configured yet
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  badge?: string;
}

const SIG_LABEL: Record<SignatureAccess, string> = {
  admin: 'Admin access',
  editor: 'Editor access',
  visitor: 'Visitor access',
};

// Append the signature permission level the deployed Email Signature app reads.
function withAccess(url: string, access: SignatureAccess): string {
  return `${url}${url.includes('?') ? '&' : '?'}access=${access}`;
}

function ToolTile({ tool }: { tool: ToolTileData }) {
  const Icon = tool.icon;
  const configured = !!tool.href;

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tool.iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        {configured && (
          <ExternalLink className="h-4 w-4 text-(--rs-neutral-grey-300) group-hover:text-(--rs-primary-500) transition-colors" aria-hidden />
        )}
      </div>
      <div className="mt-3">
        <h3 className="font-serif text-base font-bold text-(--rs-neutral-grey-900)">{tool.name}</h3>
        <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">{tool.description}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {tool.badge && (
          <span className="inline-flex items-center rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-primary-700)">
            {tool.badge}
          </span>
        )}
        {!configured && (
          <span className="inline-flex items-center rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-[11px] font-medium text-(--rs-neutral-grey-500)">
            Not configured
          </span>
        )}
      </div>
    </>
  );

  const base = 'group block rounded-2xl border bg-white p-5 transition-colors';

  if (!configured) {
    return (
      <div className={`${base} border-(--rs-neutral-grey-200) opacity-70`} aria-disabled title="URL not configured yet">
        {inner}
      </div>
    );
  }

  return (
    <a
      href={tool.href!}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${tool.name} (opens in a new tab)`}
      className={`${base} border-(--rs-neutral-grey-200) hover:border-(--rs-primary-300) hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) focus-visible:border-(--rs-primary-300)`}
    >
      {inner}
    </a>
  );
}

function OrgChartCard({
  tool, creds, badge,
}: {
  tool: ToolTileData;
  creds: { username: string; password: string };
  badge: string;
}) {
  const Icon = tool.icon;
  const configured = !!tool.href;

  return (
    <div className="flex flex-col rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-5">
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tool.iconClass}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="inline-flex items-center rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[11px] font-semibold text-(--rs-primary-700)">
          {badge}
        </span>
      </div>
      <div className="mt-3">
        <h3 className="font-serif text-base font-bold text-(--rs-neutral-grey-900)">{tool.name}</h3>
        <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">{tool.description}</p>
      </div>

      {configured ? (
        <>
          <OrgChartCredentials username={creds.username} password={creds.password} />
          <div className="mt-4">
            <a
              href={tool.href!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Org Chart (opens in a new tab)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-(--rs-primary-500) px-3 py-1.5 text-sm font-medium text-white hover:bg-(--rs-primary-600) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
            >
              Open Org Chart <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      ) : (
        <div className="mt-3">
          <span className="inline-flex items-center rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-[11px] font-medium text-(--rs-neutral-grey-500)">
            Not configured
          </span>
        </div>
      )}
    </div>
  );
}

export default async function ToolsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const { role, team } = session;

  const sigAccess = emailSignatureAccess(role, team);
  const orgCreds  = ORG_CHART_CREDS[sigAccess]; // Org Chart shares the same tier model
  const sigUrl  = process.env.TOOL_EMAIL_SIGNATURE_URL || '';
  const orgUrl  = process.env.TOOL_ORG_CHART_URL || '';
  const certUrl = process.env.TOOL_CERTIFICATE_CREATOR_URL || '';

  const apps: ToolTileData[] = [
    {
      id: 'email-signature',
      name: 'Email Signature',
      description: 'Generate your branded Romega email signature.',
      href: sigUrl ? withAccess(sigUrl, sigAccess) : null,
      icon: Mail,
      iconClass: 'bg-(--rs-primary-50) text-(--rs-primary-600)',
      badge: SIG_LABEL[sigAccess],
    },
    {
      id: 'org-chart',
      name: 'Org Chart',
      description: 'Browse the Romega org chart. Log in with the credentials below.',
      href: orgUrl || null,
      icon: Network,
      iconClass: 'bg-(--rs-accent-50) text-(--rs-accent-600)',
    },
  ];

  if (canAccessCertificateCreator(role, team)) {
    apps.push({
      id: 'certificate-creator',
      name: 'Certificate Creator',
      description: 'Create and issue Romega certificates.',
      href: certUrl || null,
      icon: Award,
      iconClass: 'bg-emerald-50 text-emerald-600',
      badge: 'HR only',
    });
  }

  const showDevTools = canAccessDevTools(role);
  const devTools: ToolTileData[] = [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Source code repositories.',
      href: process.env.DEV_TOOL_GITHUB_URL || null,
      icon: GithubIcon,
      iconClass: 'bg-(--rs-neutral-grey-900) text-white',
    },
    {
      id: 'vercel',
      name: 'Vercel',
      description: 'Deployments & hosting.',
      href: process.env.DEV_TOOL_VERCEL_URL || null,
      icon: VercelIcon,
      iconClass: 'bg-(--rs-neutral-grey-900) text-white',
    },
    {
      id: 'figma',
      name: 'Figma',
      description: 'Design files & prototypes.',
      href: process.env.DEV_TOOL_FIGMA_URL || null,
      icon: FigmaIcon,
      iconClass: 'bg-pink-50 text-pink-600',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Tools</h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
          Launch the other Romega apps. Access depends on your role and team.
        </p>
      </div>

      <section>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-400)">Romega apps</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map(tool =>
            tool.id === 'org-chart'
              ? <OrgChartCard key={tool.id} tool={tool} creds={orgCreds} badge={SIG_LABEL[sigAccess]} />
              : <ToolTile key={tool.id} tool={tool} />,
          )}
        </div>
      </section>

      {showDevTools && (
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-400)">
            Development tools
          </h2>
          <p className="mt-1 text-xs text-(--rs-neutral-grey-400)">
            Tech-team workspace links. Visible to admins.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {devTools.map(tool => <ToolTile key={tool.id} tool={tool} />)}
          </div>
        </section>
      )}
    </div>
  );
}
