'use client';

import { useState, useTransition } from 'react';
import {
  GraduationCap, Plus, UserPlus2, Mail, Building2, Upload, ShieldCheck, AlertCircle,
  ChevronDown,
} from 'lucide-react';

// Inline style applied to every <option> so colored parent selects (e.g. the
// status pill) don't bleed background/foreground into the dropdown list.
const OPTION_STYLE: React.CSSProperties = { backgroundColor: '#ffffff', color: '#0f172a' };

function SelectShell({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${error ? 'text-red-400' : 'text-(--rs-neutral-grey-400)'}`} />
    </div>
  );
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  createOnboarder,
  addReference,
  addEmploymentVerification,
  uploadDocument,
} from './actions';
import type { OnboardingLeadOption } from '@/lib/onboarding-lead';

const DOC_KINDS = [
  { value: 'sow',                     label: 'SOW (Statement of Work)' },
  { value: 'w8',                      label: 'W-8 form' },
  { value: 'nda',                     label: 'NDA' },
  { value: 'contract',                label: 'Contract' },
  { value: 'gov_id',                  label: 'Government ID' },
  { value: 'nbi',                     label: 'NBI clearance' },
  { value: 'reference_response',      label: 'Reference response (PDF)' },
  { value: 'employment_verification', label: 'Employment verification (PDF)' },
  { value: 'other',                   label: 'Other' },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Create onboarder (top-bar button on /onboarders list)
// ─────────────────────────────────────────────────────────────────────────────

type FieldErrors = Partial<Record<
  'fullName' | 'personalEmail' | 'onboarderType' | 'team' | 'startDate', string
>>;

function validateCreate(fd: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const name  = String(fd.get('fullName') ?? '').trim();
  const email = String(fd.get('personalEmail') ?? '').trim();
  const type  = String(fd.get('onboarderType') ?? '');
  const team  = String(fd.get('team') ?? '').trim();
  const start = String(fd.get('startDate') ?? '').trim();

  if (!name || name.length < 2) {
    errors.fullName = 'Full name is required (min 2 characters)';
  }
  if (!email) {
    errors.personalEmail = 'Personal email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.personalEmail = 'Enter a valid email address';
  }
  if (type !== 'contractor' && type !== 'intern') {
    errors.onboarderType = 'Pick contractor or intern';
  }
  if (!team) {
    errors.team = 'Department is required';
  }
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    errors.startDate = 'Use the date picker (YYYY-MM-DD)';
  }
  return errors;
}

export function CreateOnboarderForm({
  departments,
  leads,
  globalLead,
}: {
  departments: string[];
  leads: OnboardingLeadOption[];
  globalLead: OnboardingLeadOption | null;
}) {
  const [open, setOpen]      = useState(false);
  const [isPending, start]   = useTransition();
  const [error, setError]    = useState<string | null>(null);
  const [fieldErrors, setFE] = useState<FieldErrors>({});

  async function onSubmit(formData: FormData) {
    setError(null);
    const errs = validateCreate(formData);
    setFE(errs);
    if (Object.keys(errs).length > 0) return;

    start(async () => {
      try {
        await createOnboarder(formData);   // redirects to /onboarders/[id]
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create onboarder');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setFE({}); setError(null); } }}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <UserPlus2 className="w-4 h-4" /> New onboarder
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-primary-50) text-(--rs-primary-700) text-[10px] font-bold uppercase tracking-wider mb-1">
            <GraduationCap className="w-3 h-3" /> Internal onboarding
          </div>
          <DialogTitle>Start a new onboarding record</DialogTitle>
          <DialogDescription>
            Creates the record at stage <strong>Offer signed</strong>. The HRBP still
            sends the SOW out-of-band — mark it sent on the detail page once done.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field id="fullName"      label="Full name *"      required placeholder="Juan Dela Cruz" error={fieldErrors.fullName} />
            <Field id="personalEmail" label="Personal email *" required type="email" placeholder="juan@example.com" error={fieldErrors.personalEmail} />
            <Field id="phone"         label="Phone"            placeholder="+63 917 555 1234" />

            <div className="space-y-1.5">
              <Label htmlFor="onboarderType" className="text-(--rs-neutral-grey-700) font-medium">Type *</Label>
              <SelectShell error={!!fieldErrors.onboarderType}>
                <select
                  id="onboarderType"
                  name="onboarderType"
                  defaultValue="contractor"
                  className={`appearance-none flex h-11 w-full rounded-xl border bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer ${fieldErrors.onboarderType ? 'border-red-300 focus:border-red-400' : 'border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300)'}`}
                >
                  <option value="contractor" style={OPTION_STYLE}>Independent contractor</option>
                  <option value="intern"     style={OPTION_STYLE}>Intern</option>
                </select>
              </SelectShell>
              {fieldErrors.onboarderType && <FieldError text={fieldErrors.onboarderType} />}
            </div>

            <Field id="roleTitle" label="Role title" placeholder="Frontend Engineer" />

            <div className="space-y-1.5">
              <Label className="text-(--rs-neutral-grey-700) font-medium">Onboarding lead</Label>
              <div className="flex h-11 items-center rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 text-sm font-medium text-(--rs-neutral-grey-800)">
                {globalLead?.name ?? 'Not configured — use Setup & workflows'}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team" className="text-(--rs-neutral-grey-700) font-medium">Department *</Label>
              <SelectShell error={!!fieldErrors.team}>
                <select
                  id="team"
                  name="team"
                  required
                  defaultValue=""
                  className={`appearance-none flex h-11 w-full rounded-xl border bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer ${fieldErrors.team ? 'border-red-300 focus:border-red-400' : 'border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300)'}`}
                >
                  <option value="" disabled style={OPTION_STYLE}>— Select department —</option>
                  {departments.map(d => (
                    <option key={d} value={d} style={OPTION_STYLE}>{d}</option>
                  ))}
                </select>
              </SelectShell>
              {fieldErrors.team && <FieldError text={fieldErrors.team} />}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="directSupervisorId" className="text-(--rs-neutral-grey-700) font-medium">Direct supervisor</Label>
              <SelectShell>
                <select
                  id="directSupervisorId"
                  name="directSupervisorId"
                  defaultValue=""
                  className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                >
                  <option value="" style={OPTION_STYLE}>No direct supervisor yet</option>
                  {leads.map(lead => <option key={lead.id} value={lead.id} style={OPTION_STYLE}>{lead.name}</option>)}
                </select>
              </SelectShell>
            </div>
            <Field id="startDate"        label="Start date"        type="date" error={fieldErrors.startDate} />
          </div>

          {error && <ErrorBox text={error} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}
              className="h-11 px-6 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)">
              Discard
            </Button>
            <Button type="submit" disabled={isPending || !globalLead}
              className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) shadow-lg shadow-(--rs-primary-100) gap-2 transition-all active:scale-[0.98]">
              {isPending
                ? <Spinner label="Creating…" />
                : <><Plus className="w-4 h-4" /> Create onboarder</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add reference (BG check tab)
// ─────────────────────────────────────────────────────────────────────────────

export function AddReferenceForm({ onboarderId }: { onboarderId: number }) {
  const [open, setOpen]    = useState(false);
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await addReference(onboarderId, formData);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add reference');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" className="gap-2 rounded-xl border-(--rs-neutral-grey-200)">
          <Mail className="w-4 h-4" /> Add reference
        </Button>
      } />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add character reference</DialogTitle>
          <DialogDescription>
            SOP §3 — 3 references required. Sending the request email is a separate
            step you click after the row is added.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field id="refereeName"    label="Referee name *" required placeholder="Maria Cruz" />
            <Field id="email"          label="Email *"        required type="email" placeholder="maria@previous-co.com" />
            <Field id="refereeRole"    label="Role"           placeholder="Engineering Manager" />
            <Field id="refereeCompany" label="Company"        placeholder="Previous Co Ltd" />
            <Field id="relationship"   label="Relationship"   placeholder="Direct manager" />
            <Field id="datesWorked"    label="Dates worked"   placeholder="Jan 2023 – Mar 2026" />
            <Field id="mobile"         label="Mobile"         placeholder="+63 917 555 1234" />
            <Field id="bestTime"       label="Best time to contact" placeholder="Weekdays 9am–5pm PHT" />
          </div>

          {error && <ErrorBox text={error} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}
              className="h-11 px-6 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}
              className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) gap-2">
              {isPending ? <Spinner label="Adding…" /> : <><Plus className="w-4 h-4" /> Add reference</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add employment verification (BG check tab)
// ─────────────────────────────────────────────────────────────────────────────

export function AddVerificationForm({ onboarderId }: { onboarderId: number }) {
  const [open, setOpen]    = useState(false);
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await addEmploymentVerification(onboarderId, formData);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add verification');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" className="gap-2 rounded-xl border-(--rs-neutral-grey-200)">
          <Building2 className="w-4 h-4" /> Add verification
        </Button>
      } />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add employment verification</DialogTitle>
          <DialogDescription>
            SOP §4 — official HR contact at a previous employer for factual verification.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field id="company"       label="Company *" required placeholder="Previous Co Ltd" />
            <Field id="hrEmail"       label="HR email *" required type="email" placeholder="hr@previous-co.com" />
            <Field id="hrContactName" label="HR contact name" placeholder="HR Department" />
            <Field id="hrPhone"       label="HR phone" placeholder="+63 2 8123 4567" />
            <Field id="bestTime"      label="Best time to contact" placeholder="Weekdays 9am–5pm PHT" />
          </div>

          {error && <ErrorBox text={error} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}
              className="h-11 px-6 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}
              className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) gap-2">
              {isPending ? <Spinner label="Adding…" /> : <><Plus className="w-4 h-4" /> Add verification</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload document (Documents tab)
// ─────────────────────────────────────────────────────────────────────────────

export function UploadDocumentForm({ onboarderId }: { onboarderId: number }) {
  const [open, setOpen]    = useState(false);
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    start(async () => {
      try {
        await uploadDocument(onboarderId, formData);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button className="gap-2 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700)">
          <Upload className="w-4 h-4" /> Upload document
        </Button>
      } />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="inline-flex items-center gap-2 w-fit px-2.5 py-1 rounded-full bg-(--rs-accent-50) text-(--rs-accent-700) text-[10px] font-bold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-3 h-3" /> Private storage
          </div>
          <DialogTitle>Upload onboarder document</DialogTitle>
          <DialogDescription>
            Stored in a private Supabase bucket — only accessible via signed URLs from this app.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kind" className="text-(--rs-neutral-grey-700) font-medium">Document type *</Label>
              <SelectShell>
                <select
                  id="kind"
                  name="kind"
                  required
                  defaultValue=""
                  className="appearance-none flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white pl-3 pr-9 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) cursor-pointer"
                >
                  <option value="" disabled style={OPTION_STYLE}>— Select a type —</option>
                  {DOC_KINDS.map(k => (
                    <option key={k.value} value={k.value} style={OPTION_STYLE}>{k.label}</option>
                  ))}
                </select>
              </SelectShell>
            </div>

            <Field id="label" label="Label (optional)" placeholder="e.g. SSS ID front" />

            <div className="space-y-1.5">
              <Label htmlFor="file" className="text-(--rs-neutral-grey-700) font-medium">File *</Label>
              <input
                id="file"
                name="file"
                type="file"
                required
                className="flex w-full rounded-xl border border-dashed border-(--rs-neutral-grey-300) bg-(--rs-neutral-grey-50) px-4 py-3 text-sm text-(--rs-neutral-grey-700) file:mr-3 file:rounded-md file:border-0 file:bg-(--rs-primary-600) file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-(--rs-primary-700)"
              />
              <p className="text-xs text-(--rs-neutral-grey-500)">Max 25 MB. PDFs and images recommended.</p>
            </div>
          </div>

          {error && <ErrorBox text={error} />}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}
              className="h-11 px-6 rounded-xl border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50)">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}
              className="h-11 px-8 rounded-xl bg-(--rs-primary-600) hover:bg-(--rs-primary-700) gap-2">
              {isPending ? <Spinner label="Uploading…" /> : <><Upload className="w-4 h-4" /> Upload</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  id, label, type = 'text', required, placeholder, error,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
}) {
  const errored = !!error;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-(--rs-neutral-grey-700) font-medium">{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        required={required}
        placeholder={placeholder}
        aria-invalid={errored || undefined}
        className={`h-11 rounded-xl focus:ring-4 focus:ring-(--rs-primary-100) ${errored ? 'border-red-300 focus:border-red-400' : 'border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300)'}`}
      />
      {errored && <FieldError text={error!} />}
    </div>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1 text-[11px] text-red-600 leading-snug" role="alert">
      <AlertCircle className="w-3 h-3 shrink-0" />
      {text}
    </p>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      {label}
    </span>
  );
}
