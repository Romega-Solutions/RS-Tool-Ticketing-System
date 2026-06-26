'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ShieldCheck, UserCheck, LayoutDashboard } from 'lucide-react';
import { GoogleIcon } from '@/components/google-icon';

// Interactive, keyboard-accessible "how you sign in" stepper for the public
// /guide page. Reflects the Google-ONLY flow (no username/password, no email
// confirmation step). Implemented as an ARIA tablist: click or arrow-key
// between steps; only the active panel renders so its entrance animation
// replays on switch (disabled under prefers-reduced-motion).

type Step = {
  label: string;
  icon: ReactNode;
  heading: string;
  body: ReactNode;
};

const STEPS: Step[] = [
  {
    label: 'Sign in',
    icon: <GoogleIcon className="h-4 w-4" />,
    heading: 'Continue with Google',
    body: (
      <div className="space-y-3">
        <p>
          On the sign-in page, click <strong className="font-semibold text-(--rs-neutral-grey-800)">Continue with Google</strong> and
          choose your Romega Google account. There&apos;s no password to create or remember.
        </p>
        <div className="max-w-xs rounded-xl border border-(--color-border) bg-white p-3">
          <div className="flex items-center justify-center gap-3 rounded-lg border border-(--color-border) bg-white py-2.5 text-sm font-medium text-(--rs-neutral-grey-800) shadow-sm">
            <GoogleIcon className="h-4 w-4" /> Continue with Google
          </div>
          <p className="mt-2 text-center text-[11px] text-(--rs-neutral-grey-400)">This is the button you&apos;ll click.</p>
        </div>
      </div>
    ),
  },
  {
    label: 'Team list',
    icon: <ShieldCheck className="h-4 w-4 text-(--rs-primary-600)" />,
    heading: 'Your email needs to be on the team list',
    body: (
      <div className="space-y-2">
        <p>
          Access is limited to people your team has added. Your Google email has to be on the list — added by an admin,
          or already present in the Romega Org Chart.
        </p>
        <p>
          Not listed yet? Ask an admin to add you. They can even send you a{' '}
          <strong className="font-semibold text-(--rs-neutral-grey-800)">one-click setup email</strong> with everything you need to get in.
        </p>
      </div>
    ),
  },
  {
    label: 'Profile',
    icon: <UserCheck className="h-4 w-4 text-(--rs-primary-600)" />,
    heading: 'Set up your profile',
    body: (
      <p>
        The first time you sign in, confirm your role, department, and job title. If an admin pre-added you, these are
        already filled in — just review and continue.
      </p>
    ),
  },
  {
    label: 'Start',
    icon: <LayoutDashboard className="h-4 w-4 text-(--rs-primary-600)" />,
    heading: 'Start working',
    body: (
      <p>
        That&apos;s it — you land on your dashboard with your tasks, attendance, weekly reports, and the tools your role
        can access.
      </p>
    ),
  },
];

export function SignupStepper() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (active + 1) % STEPS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (active - 1 + STEPS.length) % STEPS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = STEPS.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const panel = STEPS[active];

  return (
    <div>
      <div
        role="tablist"
        aria-label="How to sign in"
        onKeyDown={onKeyDown}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {STEPS.map((s, i) => {
          const selected = i === active;
          return (
            <button
              key={s.label}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${i}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) ${
                selected
                  ? 'border-(--rs-primary-300) bg-(--rs-primary-50)'
                  : 'border-(--color-border) bg-white hover:bg-(--rs-neutral-grey-50)'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200 ${
                  selected ? 'bg-(--rs-primary-500) text-white' : 'bg-(--rs-primary-50) text-(--rs-primary-600)'
                }`}
              >
                {i + 1}
              </span>
              <span className="truncate text-sm font-bold text-(--rs-neutral-grey-900)">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div
        key={active}
        role="tabpanel"
        id={`${baseId}-panel-${active}`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className="mt-4 animate-auth-enter rounded-xl border border-(--color-border) bg-(--rs-neutral-grey-50) p-5 motion-reduce:animate-none"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--color-border) bg-white">
            {panel.icon}
          </span>
          <h3 className="text-sm font-bold text-(--rs-neutral-grey-900)">{panel.heading}</h3>
        </div>
        <div className="max-w-3xl text-sm leading-relaxed text-(--rs-neutral-grey-600)">{panel.body}</div>
      </div>
    </div>
  );
}
