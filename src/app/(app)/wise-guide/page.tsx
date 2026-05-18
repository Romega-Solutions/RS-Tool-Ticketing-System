import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import {
  Globe, Building2, KeyRound, Server, Send, ShieldCheck,
  Users, ArrowRightLeft, Wallet, ListChecks, LifeBuoy, ExternalLink,
} from 'lucide-react';

const CORE_FUNCTIONS = [
  { icon: Send, title: 'Send money', desc: 'Quotes → recipients → transfers → funding (payout / remittance).' },
  { icon: Wallet, title: 'Manage balances', desc: 'Multi-currency accounts; hold, transfer, and convert balances.' },
  { icon: ListChecks, title: 'Issue cards', desc: 'Physical and digital card issuing and management.' },
  { icon: ArrowRightLeft, title: 'Receive money', desc: 'Inbound SWIFT payments; local collection without intl. fees.' },
];

const MODELS = [
  {
    name: 'Embedded',
    who: 'Regulated FIs / fintechs offering Wise inside their own UI.',
    ownership: "Partner's customers each have a linked Wise account.",
    transfer: 'Standard transfers',
  },
  {
    name: 'Enterprise',
    who: 'Large businesses moving their own funds (payroll, vendors).',
    ownership: 'Single partner-owned Wise business account.',
    transfer: 'Standard transfers — POST /v1/transfers',
  },
  {
    name: 'Correspondent',
    who: 'Regulated FIs processing cross-border payments for customers.',
    ownership: 'Partner holds the account; customers are originators with no Wise account.',
    transfer: 'Third-party transfers — POST /v2/profiles/{profileId}/third-party-transfers',
  },
];

const TOKENS = [
  { name: 'Client credentials token', use: 'Application-level — unauthenticated quotes, application webhooks.', scope: 'App' },
  { name: 'User access token', use: 'Profile-level — create recipients, submit transfers, track status.', scope: 'Profile' },
  { name: 'Refresh token', use: 'Obtain new user access tokens without re-authenticating the user.', scope: '—' },
];

const SECURITY = [
  'Never expose credentials/tokens in client-side code, logs, or URLs.',
  'Store credentials in a secrets manager.',
  'Keep separate sandbox and production credentials.',
  'Encrypt refresh tokens at rest.',
  'Rotate client secrets periodically.',
  'Request minimal required scopes.',
  'Revoke credentials immediately on breach.',
];

const ENVIRONMENTS = [
  { env: 'Sandbox', purpose: 'Build & test without affecting production. Non-live but realistic rates.', url: 'https://api.wise-sandbox.com/oauth/token' },
  { env: 'Production', purpose: 'Live, real-money requests. Final deployment stage.', url: 'https://api.wise.com/oauth/token' },
];

const FLOW = [
  { step: '0', label: 'Unauthenticated quote', endpoint: 'POST /v3/quotes', note: 'Optional, display only' },
  { step: '1', label: 'Authenticated quote', endpoint: 'POST /v3/profiles/{profileId}/quotes', note: '→ quoteId' },
  { step: '2', label: 'Recipient', endpoint: 'POST /v1/accounts', note: '→ recipientId' },
  { step: '3', label: 'Transfer', endpoint: 'POST /v1/transfers', note: 'Correspondent: /v2/.../third-party-transfers' },
  { step: '4', label: 'Fund transfer', endpoint: 'POST /v3/profiles/{profileId}/transfers/{transferId}/payments', note: 'Initiates payment' },
];

const SOURCES = [
  { label: 'Guides portal', href: 'https://docs.wise.com/guides' },
  { label: 'Send Money flow', href: 'https://docs.wise.com/api-docs/guides/send-money' },
  { label: 'Quotes', href: 'https://docs.wise.com/guides/product/send-money/quotes' },
  { label: 'Recipients', href: 'https://docs.wise.com/guides/product/send-money/recipients' },
  { label: 'Transfers', href: 'https://docs.wise.com/guides/product/send-money/transfers' },
  { label: 'Auth & security', href: 'https://docs.wise.com/guides/developer/auth-and-security' },
  { label: 'Sandbox & production', href: 'https://docs.wise.com/guides/developer/sandbox-and-production' },
];

const CARD = 'rounded-2xl border border-(--color-border) bg-white p-6 shadow-[var(--shadow-elevated)]';
const H2 = 'text-lg font-serif font-bold text-(--rs-neutral-grey-900)';
const CODE = 'font-mono text-[12px] text-(--rs-primary-700) bg-(--rs-primary-50) px-1.5 py-0.5 rounded';

export default async function WiseGuidePage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Wise Integration Guide</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          Reference for integrating with the Wise Platform API — auth, environments, and the send-money flow.
          Read-only; mirrors <span className={CODE}>docs/wise-platform-api.md</span>.
        </p>
      </div>

      {/* Overview */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-(--rs-primary-500)" />
          <h2 className={H2}>What Wise Platform Is</h2>
        </div>
        <p className="text-sm text-(--rs-neutral-grey-600) leading-relaxed mb-5">
          Wise Platform&apos;s API lets banks, FIs, and enterprises embed international transfers, card
          issuing, multi-currency accounts, and incoming-payment collection into their own products.
          Integration requires a direct partnership with Wise — no self-serve signup. Partner accounts
          are scoped to specific functions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CORE_FUNCTIONS.map(f => (
            <div key={f.title} className="flex items-start gap-3 p-4 rounded-xl border border-(--color-border)">
              <div className="w-9 h-9 rounded-lg bg-(--rs-primary-50) flex items-center justify-center shrink-0">
                <f.icon className="w-4 h-4 text-(--rs-primary-500)" />
              </div>
              <div>
                <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{f.title}</p>
                <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Integration models */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-(--rs-accent-500)" />
          <h2 className={H2}>Integration Models</h2>
        </div>
        <div className="space-y-3">
          {MODELS.map(m => (
            <div key={m.name} className="rounded-xl border border-(--color-border) p-4">
              <p className="text-sm font-bold text-(--rs-accent-600)">{m.name}</p>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div><dt className="font-semibold text-(--rs-neutral-grey-500)">For whom</dt><dd className="text-(--rs-neutral-grey-700) mt-0.5">{m.who}</dd></div>
                <div><dt className="font-semibold text-(--rs-neutral-grey-500)">Account ownership</dt><dd className="text-(--rs-neutral-grey-700) mt-0.5">{m.ownership}</dd></div>
                <div><dt className="font-semibold text-(--rs-neutral-grey-500)">Transfer endpoint</dt><dd className="text-(--rs-neutral-grey-700) mt-0.5">{m.transfer}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* Auth */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-(--rs-primary-500)" />
          <h2 className={H2}>Authentication &amp; Security</h2>
        </div>
        <p className="text-sm text-(--rs-neutral-grey-600) leading-relaxed mb-4">
          OAuth 2.0 for all partner accounts. Wise provides a Client ID, Client secret, Developer Hub
          access, and a registered redirect URL. All grant types use{' '}
          <span className={CODE}>POST /oauth/token</span> with HTTP Basic auth (client_id : client_secret).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {TOKENS.map(t => (
            <div key={t.name} className="rounded-xl border border-(--color-border) p-4">
              <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{t.name}</p>
              <p className="text-xs text-(--rs-neutral-grey-500) mt-1 leading-relaxed">{t.use}</p>
              <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-widest text-(--rs-primary-500)">{t.scope}</span>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-(--rs-neutral-grey-400) mb-2">Mandatory practices</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {SECURITY.map(s => (
            <li key={s} className="text-xs text-(--rs-neutral-grey-600) flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* Environments */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-5 h-5 text-(--rs-neutral-grey-600)" />
          <h2 className={H2}>Environments</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ENVIRONMENTS.map(e => (
            <div key={e.env} className="rounded-xl border border-(--color-border) p-4">
              <p className="text-sm font-bold text-(--rs-neutral-grey-900)">{e.env}</p>
              <p className="text-xs text-(--rs-neutral-grey-500) mt-1 leading-relaxed">{e.purpose}</p>
              <p className="mt-2"><span className={CODE}>{e.url}</span></p>
            </div>
          ))}
        </div>
        <p className="text-xs text-(--rs-neutral-grey-500) mt-3 leading-relaxed">
          mTLS sandbox base: <span className={CODE}>https://api-mtls.wise-sandbox.com</span>. Sandbox caveats:
          the <span className={CODE}>FLOATING</span> quote rateType cannot be tested; full recipient bank
          validation only happens in Production.
        </p>
      </section>

      {/* Send money flow */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-(--rs-primary-500)" />
          <h2 className={H2}>Send Money — Core Flow</h2>
        </div>
        <p className="text-sm text-(--rs-neutral-grey-600) leading-relaxed mb-4">
          Four logical stages (step 0 is an optional display-only quote). Before step 3, update the quote
          with the recipient so fees, delivery estimate, and payout network are accurate.
        </p>
        <ol className="space-y-2">
          {FLOW.map(s => (
            <li key={s.step} className="flex items-start gap-3 rounded-xl border border-(--color-border) p-3">
              <span className="w-6 h-6 rounded-full bg-(--rs-primary-500) text-white text-xs font-bold flex items-center justify-center shrink-0">{s.step}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">{s.label}</p>
                <p className="mt-1"><span className={CODE}>{s.endpoint}</span></p>
                <p className="text-xs text-(--rs-neutral-grey-400) mt-1">{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-(--rs-neutral-grey-600) leading-relaxed">
          <div className="rounded-xl border border-(--color-border) p-4">
            <p className="font-bold text-(--rs-neutral-grey-900) mb-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Quotes</p>
            Mid-market rate locks on the authenticated quote, valid ~30 min. Unauthenticated quotes
            (no profileId) are display-only and cannot create transfers.
          </div>
          <div className="rounded-xl border border-(--color-border) p-4">
            <p className="font-bold text-(--rs-neutral-grey-900) mb-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Recipients</p>
            Account Requirements Dynamic Forms are a must — required fields vary by currency/route.
            Validation is immediate; verification (CNY, EUR/SEPA, IDR, INR, KRW) confirms the account.
          </div>
          <div className="rounded-xl border border-(--color-border) p-4">
            <p className="font-bold text-(--rs-neutral-grey-900) mb-1 flex items-center gap-1.5"><ArrowRightLeft className="w-3.5 h-3.5" /> Transfers</p>
            Validate transfer requirements (dynamic, per currency/region) first. Three creation types;
            unavailable types return 403.
          </div>
          <div className="rounded-xl border border-(--color-border) p-4">
            <p className="font-bold text-(--rs-neutral-grey-900) mb-1 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Funding</p>
            The payments endpoint initiates the actual money movement. All requests require the
            initiating account&apos;s profileId.
          </div>
        </div>
      </section>

      {/* KYC + support */}
      <section className={CARD}>
        <div className="flex items-center gap-2 mb-4">
          <LifeBuoy className="w-5 h-5 text-(--rs-accent-500)" />
          <h2 className={H2}>KYC &amp; Support</h2>
        </div>
        <p className="text-sm text-(--rs-neutral-grey-600) leading-relaxed">
          Partners are verified by Wise during contracting/onboarding. A partner&apos;s customers must be
          verified before Wise processes transactions for them — either Wise-performed or
          partner-performed KYC, decided with the implementation team. Wise provides technical support
          for API issues and an Enterprise support team for operational assistance.
        </p>
      </section>

      {/* Sources */}
      <section className={CARD}>
        <h2 className={`${H2} mb-3`}>Sources</h2>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(s => (
            <a
              key={s.href}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-(--rs-primary-600) hover:text-(--rs-primary-700) border border-(--rs-primary-200) bg-(--rs-primary-50) hover:bg-(--rs-primary-100) rounded-lg px-3 py-1.5 transition-colors"
            >
              {s.label}
              <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
