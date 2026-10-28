import { describe, expect, it } from 'vitest';
import {
  EMAIL_FONT_STACK,
  fmtDuration,
  fmtManilaDateTime,
  fmtShiftDate,
  renderTimeEditEmail,
  type TimeEditEmailData,
  type TimeEditEmailKind,
} from '@/lib/time-edit-email-template';

const KINDS: TimeEditEmailKind[] = [
  'received', 'supervisor_approved', 'approved', 'declined_admin', 'declined_supervisor',
];

// Fri Oct 9, 2026 11:00 PM to Sat Oct 10, 2026 2:00 AM Manila, corrected to 2:30 AM.
const base = (over: Partial<TimeEditEmailData> = {}): TimeEditEmailData => ({
  kind: 'received',
  baseUrl: 'https://portal.example.test',
  requesterName: 'Maria Santos',
  shiftDate: '2026-10-09',
  currentClockIn: '2026-10-09T15:00:00.000Z',
  currentClockOut: '2026-10-09T18:00:00.000Z',
  requestedClockIn: null,
  requestedClockOut: '2026-10-09T18:30:00.000Z',
  reason: 'I stayed on a client call until 2:30 AM and clocked out late.',
  documentName: 'client-call-invite.png',
  filedAt: '2026-10-10T01:41:00.000Z',
  waitingFor: 'supervisor',
  supervisorName: 'Jose Ramirez',
  deciderName: 'Jose Ramirez',
  note: 'Confirmed.',
  supervisorCopied: true,
  ...over,
});

const all = () => KINDS.map(kind => renderTimeEditEmail(base({ kind })));

describe('fonts', () => {
  it('uses the exact Poppins stack', () => {
    expect(EMAIL_FONT_STACK).toBe("'Poppins', Arial, Helvetica, sans-serif");
  });

  it('never mentions Aptos or Segoe in any part of any email', () => {
    for (const kind of KINDS) {
      for (const over of [{}, { documentName: null, note: null, supervisorCopied: false, waitingFor: 'admin' as const }]) {
        const r = renderTimeEditEmail(base({ kind, ...over }));
        for (const part of [r.subject, r.preheader, r.html, r.text]) {
          expect(part).not.toMatch(/aptos/i);
          expect(part).not.toMatch(/segoe/i);
        }
      }
    }
  });

  it('puts the stack in every font-family declaration and no other family', () => {
    for (const r of all()) {
      const decls = r.html.match(/font-family:[^;"]*/g) ?? [];
      expect(decls.length).toBeGreaterThan(5);
      for (const d of decls) expect(d).toBe(`font-family:${EMAIL_FONT_STACK}`);
      expect(r.html).not.toMatch(/Source Sans|Merriweather|Georgia|Times/);
    }
  });
});

describe('subjects and headings', () => {
  it('has the five subjects', () => {
    expect(all().map(r => r.subject)).toEqual([
      'We received your time correction request',
      'Your supervisor approved your request',
      'Your time correction was approved',
      'Your time correction was declined by an admin',
      'Your time correction was declined by your supervisor',
    ]);
  });
});

describe('layout and links', () => {
  it('uses the hosted portal logo and no embedded image data', () => {
    for (const r of all()) {
      expect(r.html).toContain('src="https://portal.example.test/images/rs-logo.png"');
      expect(r.html).toContain('alt="Romega Solutions"');
      expect(r.html).not.toContain('data:image');
    }
  });

  it('links the button to the requester page, not a request deep link', () => {
    for (const r of all()) {
      expect(r.html).toContain('href="https://portal.example.test/my-time"');
      expect(r.html).not.toContain('?request=');
      expect(r.html).not.toContain('&file=');
      expect(r.text).toContain('https://portal.example.test/my-time');
    }
  });

  it('has a preheader, a mobile rule and no fixed-width text boxes', () => {
    for (const r of all()) {
      expect(r.html).toContain('display:none;max-height:0');
      expect(r.html).toContain('@media only screen and (max-width:440px)');
      expect(r.html).toContain('max-width:600px');
      expect(r.html).not.toMatch(/<td[^>]*width="(?!130"|4"|100%")\d+"/);
    }
  });

  it('shows the supporting file name with a portal link, not a file link', () => {
    const r = renderTimeEditEmail(base());
    expect(r.html).toContain('client-call-invite.png');
    expect(r.html).toContain('Open it in the portal');
    expect(r.text).toContain('client-call-invite.png (open it in the portal)');
    const none = renderTimeEditEmail(base({ documentName: null }));
    expect(none.html).not.toContain('Supporting file');
    expect(none.text).not.toContain('Supporting file');
  });
});

describe('wording per email', () => {
  it('A says waiting for supervisor and names the supervisor', () => {
    const r = renderTimeEditEmail(base());
    expect(r.html).toContain('Waiting for supervisor approval');
    expect(r.text).toContain('Supervisor:');
    expect(r.text).toContain('Jose Ramirez');
  });

  it('A uses the admin wording when the request starts at the admin step', () => {
    const r = renderTimeEditEmail(base({ waitingFor: 'admin', supervisorName: null, supervisorCopied: false }));
    expect(r.html).toContain('Waiting for admin approval');
    expect(r.html).not.toContain('Waiting for supervisor approval');
    expect(r.text).not.toContain('Supervisor:');
    expect(r.text).not.toContain('Your supervisor is copied');
    expect(r.html).not.toContain('Your supervisor is copied');
  });

  it('A omits the supervisor row when the lead is an admin who decides', () => {
    const r = renderTimeEditEmail(base({ waitingFor: 'admin', supervisorName: 'Admin Lead' }));
    expect(r.text).not.toContain('Supervisor:');
  });

  it('B shows who approved, the note and waiting for admin', () => {
    const r = renderTimeEditEmail(base({ kind: 'supervisor_approved', note: 'She was on the call.' }));
    expect(r.html).toContain('Waiting for admin approval');
    expect(r.text).toContain('Approved by:     Jose Ramirez, supervisor');
    expect(r.text).toContain('Supervisor note: "She was on the call."');
  });

  it('C is approved, names the admin and the admin note, and links the timesheet', () => {
    const r = renderTimeEditEmail(base({ kind: 'approved', deciderName: 'Admin Reyes', note: 'Matches the calendar.' }));
    expect(r.html).toContain('>Approved<');
    expect(r.text).toContain('Approved by:     Admin Reyes, admin');
    expect(r.text).toContain('Admin note:      "Matches the calendar."');
    expect(r.text).toContain('View my timesheet: ');
  });

  it('D and E are declined with the reason block and who declined', () => {
    const d = renderTimeEditEmail(base({ kind: 'declined_admin', deciderName: 'Admin Reyes', note: 'No record for 2:30 AM.' }));
    expect(d.html).toContain('>Declined<');
    expect(d.html).toContain('Reason &middot; Admin');
    expect(d.text).toContain('Declined by:     Admin Reyes, admin');
    expect(d.text).toContain('Reason:          "No record for 2:30 AM."');
    const e = renderTimeEditEmail(base({ kind: 'declined_supervisor', note: 'I was not on that call.' }));
    expect(e.html).toContain('Reason &middot; Supervisor');
    expect(e.text).toContain('Declined by:     Jose Ramirez, supervisor');
  });

  it('copies the supervisor line only when a supervisor is copied', () => {
    expect(renderTimeEditEmail(base({ supervisorCopied: true })).text).toContain('Your supervisor is copied.');
    expect(renderTimeEditEmail(base({ supervisorCopied: false })).text).not.toContain('Your supervisor is copied.');
  });
});

describe('times', () => {
  it('shows original and requested with a changed tag only on the changed side', () => {
    const r = renderTimeEditEmail(base());
    expect(r.text).toContain('Original:        Clock in  Fri, Oct 9, 2026, 11:00 PM | Clock out Sat, Oct 10, 2026, 2:00 AM | Total 3 h 00 min');
    expect(r.text).toContain(
      'Requested:       Clock in  Fri, Oct 9, 2026, 11:00 PM (no change) | Clock out Sat, Oct 10, 2026, 2:30 AM (CHANGED) | Total 3 h 30 min',
    );
    expect(r.text).toContain('All dates and times are Manila time (UTC+8).');
    expect(r.html).toContain('Changed');
    expect(r.html).toContain('No change');
    expect(r.html).toContain('3 h 30 min');
  });

  it('does not tag a requested time equal to the current one as changed', () => {
    const r = renderTimeEditEmail(base({ requestedClockIn: '2026-10-09T15:00:00.000Z', requestedClockOut: '2026-10-09T18:00:00.000Z' }));
    expect(r.text).not.toContain('(CHANGED)');
  });

  it('handles an open session without a clock-out', () => {
    const r = renderTimeEditEmail(base({ currentClockOut: null, requestedClockOut: null }));
    expect(r.text).toContain('Clock out Not recorded');
    expect(r.text).toContain('Total Not available');
  });

  it('formats Manila dates the same way whatever the server zone is', () => {
    expect(fmtManilaDateTime(new Date('2026-10-10T01:41:00.000Z'))).toBe('Sat, Oct 10, 2026, 9:41 AM');
    expect(fmtManilaDateTime(new Date('2026-12-31T16:00:00.000Z'))).toBe('Fri, Jan 1, 2027, 12:00 AM');
    expect(fmtManilaDateTime(new Date('2026-10-09T04:00:00.000Z'))).toBe('Fri, Oct 9, 2026, 12:00 PM');
    expect(fmtShiftDate('2026-10-09')).toBe('Fri, Oct 9, 2026');
    expect(fmtShiftDate('garbage')).toBe('garbage');
    expect(fmtDuration(3 * 3600 + 30 * 60)).toBe('3 h 30 min');
    expect(fmtDuration(59 * 60)).toBe('0 h 59 min');
  });

  it('reads the database timestamp text for the filed time', () => {
    const r = renderTimeEditEmail(base({ filedAt: '2026-10-10 01:41:00.123456+00' }));
    expect(r.text).toContain('Filed:           Sat, Oct 10, 2026, 9:41 AM');
  });
});

describe('escaping and plain text', () => {
  const hostile = '<script>alert(1)</script> "quoted" & \'single\'';
  it('escapes names, reasons, notes and file names', () => {
    for (const kind of KINDS) {
      const r = renderTimeEditEmail(base({
        kind, requesterName: hostile, reason: hostile, note: hostile,
        documentName: hostile, deciderName: hostile, supervisorName: hostile,
      }));
      expect(r.html).not.toContain('<script>');
      expect(r.html).toContain('&lt;script&gt;');
    }
  });

  it('keeps line breaks in notes', () => {
    const r = renderTimeEditEmail(base({ kind: 'declined_admin', note: 'line one\nline two' }));
    expect(r.html).toContain('line one<br>line two');
  });

  it('carries the same facts in the plain-text twin', () => {
    for (const kind of KINDS) {
      const r = renderTimeEditEmail(base({ kind, note: 'A note.' }));
      expect(r.text).toContain('Maria Santos');
      expect(r.text).toContain('Fri, Oct 9, 2026');
      expect(r.text).toContain('Clock in');
      expect(r.text).toContain('Romega Solutions');
      expect(r.text).toContain('Please do not reply to this automated message.');
      expect(r.text).not.toMatch(/<[a-z/][^>]*>/i);
    }
  });
});
