'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2, Save, AlertCircle, Briefcase, GraduationCap } from 'lucide-react';
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
import { updateCandidate, type CandidateEditPatch } from './actions';

type ExperienceRow   = CandidateEditPatch['experience'][number];
type EducationRow    = CandidateEditPatch['education'][number];

type Props = {
  id:         number;
  full_name:  string;
  email:      string | null;
  phone:      string | null;
  position:   string | null;
  education:  EducationRow[]  | null;
  experience: ExperienceRow[] | null;
};

const emptyExp = (): ExperienceRow => ({
  company: '', title: '', start_date: '', end_date: '', description: '',
});
const emptyEdu = (): EducationRow => ({
  institution: '', degree: '', field: '', graduation_year: '',
});

const inputClass =
  'h-10 rounded-lg border-(--rs-neutral-grey-200) focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)';

export function CandidateEditForm(props: Props) {
  const [open, setOpen]           = useState(false);
  const [fullName, setFullName]   = useState(props.full_name);
  const [email, setEmail]         = useState(props.email ?? '');
  const [phone, setPhone]         = useState(props.phone ?? '');
  const [position, setPosition]   = useState(props.position ?? '');
  const [experience, setExperience] = useState<ExperienceRow[]>(
    (props.experience && props.experience.length > 0) ? props.experience : [emptyExp()]
  );
  const [education, setEducation]   = useState<EducationRow[]>(
    (props.education && props.education.length > 0) ? props.education : [emptyEdu()]
  );
  const [isPending, start]        = useTransition();
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  function reset() {
    setFullName(props.full_name);
    setEmail(props.email ?? '');
    setPhone(props.phone ?? '');
    setPosition(props.position ?? '');
    setExperience((props.experience && props.experience.length > 0) ? props.experience : [emptyExp()]);
    setEducation((props.education && props.education.length > 0) ? props.education : [emptyEdu()]);
    setErrorMsg(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    setOpen(next);
  }

  function patchExp(i: number, key: keyof ExperienceRow, value: string) {
    setExperience(rows => rows.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  }
  function patchEdu(i: number, key: keyof EducationRow, value: string) {
    setEducation(rows => rows.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  }

  function submit() {
    setErrorMsg(null);
    start(async () => {
      try {
        await updateCandidate(props.id, {
          full_name:  fullName,
          email:      email.trim() || null,
          phone:      phone.trim() || null,
          position:   position.trim() || null,
          experience,
          education,
        });
        setOpen(false);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to update candidate');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
        <Pencil className="w-3.5 h-3.5" /> Edit
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit candidate</DialogTitle>
          <DialogDescription>
            Changes are logged in the candidate history. Names will be normalised to
            <strong> Proper Case</strong> and phone numbers reformatted on save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basics */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name *</Label>
              <Input id="edit-name" value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-position">Position applied for</Label>
              <Input id="edit-position" value={position} onChange={e => setPosition(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0917 555 1234" className={inputClass} />
              <p className="text-[10px] text-(--rs-neutral-grey-500)">
                PH: 09xx xxx xxxx · US: xxx xxx xxxx · auto-formatted on save.
              </p>
            </div>
          </section>

          {/* Experience */}
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-bold text-(--rs-neutral-grey-900) flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-(--rs-primary-600)" />
                Work experience
              </h3>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setExperience(rows => [...rows, emptyExp()])}
                className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </header>
            <div className="space-y-3">
              {experience.map((row, i) => (
                <div key={i} className="rounded-lg border border-(--rs-neutral-grey-200) p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
                      Role {i + 1}
                    </span>
                    {experience.length > 1 && (
                      <button type="button" aria-label="Remove role"
                        onClick={() => setExperience(rows => rows.filter((_, idx) => idx !== i))}
                        className="rounded p-1 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input placeholder="Job title" value={row.title ?? ''}
                      onChange={e => patchExp(i, 'title', e.target.value)} className={inputClass} />
                    <Input placeholder="Company" value={row.company ?? ''}
                      onChange={e => patchExp(i, 'company', e.target.value)} className={inputClass} />
                    <Input placeholder="Start date (e.g. Jan 2022)" value={row.start_date ?? ''}
                      onChange={e => patchExp(i, 'start_date', e.target.value)} className={inputClass} />
                    <Input placeholder="End date (or 'Present')" value={row.end_date ?? ''}
                      onChange={e => patchExp(i, 'end_date', e.target.value)} className={inputClass} />
                  </div>
                  <textarea placeholder="Responsibilities / accomplishments"
                    rows={3} value={row.description ?? ''}
                    onChange={e => patchExp(i, 'description', e.target.value)}
                    className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm placeholder:text-(--rs-neutral-grey-400) outline-none focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Education */}
          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="font-serif text-sm font-bold text-(--rs-neutral-grey-900) flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-(--rs-primary-600)" />
                Education
              </h3>
              <Button type="button" variant="outline" size="sm"
                onClick={() => setEducation(rows => [...rows, emptyEdu()])}
                className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </header>
            <div className="space-y-3">
              {education.map((row, i) => (
                <div key={i} className="rounded-lg border border-(--rs-neutral-grey-200) p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
                      Entry {i + 1}
                    </span>
                    {education.length > 1 && (
                      <button type="button" aria-label="Remove entry"
                        onClick={() => setEducation(rows => rows.filter((_, idx) => idx !== i))}
                        className="rounded p-1 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input placeholder="Institution" value={row.institution ?? ''}
                      onChange={e => patchEdu(i, 'institution', e.target.value)} className={inputClass} />
                    <Input placeholder="Degree" value={row.degree ?? ''}
                      onChange={e => patchEdu(i, 'degree', e.target.value)} className={inputClass} />
                    <Input placeholder="Field / major" value={row.field ?? ''}
                      onChange={e => patchEdu(i, 'field', e.target.value)} className={inputClass} />
                    <Input placeholder="Graduation year" value={row.graduation_year ?? ''}
                      onChange={e => patchEdu(i, 'graduation_year', e.target.value)} className={inputClass} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending} className="gap-2">
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
