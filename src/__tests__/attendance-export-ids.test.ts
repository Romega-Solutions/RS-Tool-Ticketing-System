import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_DEFAULTS,
  STILL_CLOCKED_IN,
  UNKNOWN_TIME,
  WISE_SHARED_NAME_MESSAGE,
  WISE_STILL_CLOCKED_IN_MESSAGE,
  WISE_UNCHECKED_MESSAGE,
  buildCustomRangeExport,
  buildTimesheetCsv,
  buildWiseCsv,
  duplicateNames,
  exportDateSuffix,
  isExcludedColumn,
  isOpenSession,
  memberLabels,
  monthDateRange,
  openSessionsNote,
  resolveCsvTemplate,
  wiseBlockReason,
  type CustomRangeApiSession,
  type CustomRangeApiUser,
  type ExportMember,
} from '@/lib/export-utils';

// Fake people only. Times are UTC in the data; the export shows Manila time (UTC+8).

const jane: CustomRangeApiUser = { id: 1, name: 'Test Person A', team: 'Team X', memberCode: 'TA01', hourlyRateUsd: 10 };
const bob: CustomRangeApiUser = { id: 2, name: 'Test Person B', team: 'Team X', memberCode: null, hourlyRateUsd: null };
const twinA: CustomRangeApiUser = { id: 3, name: 'Test Twin', team: 'Team X', memberCode: 'TT01', hourlyRateUsd: 10 };
const twinB: CustomRangeApiUser = { id: 4, name: 'Test Twin', team: 'Team Y', memberCode: null, hourlyRateUsd: 20 };

const sess = (userId: number, date: string, inAt: string, outAt: string | null): CustomRangeApiSession =>
  ({ userId, date, clockedInAt: inAt, clockedOutAt: outAt });

describe('matching by user id', () => {
  const sessions = [
    sess(3, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    sess(4, '2026-07-01', '2026-07-01T03:00:00Z', '2026-07-01T07:00:00Z'),
  ];
  const byDay = { '3:2026-07-01': 3600, '4:2026-07-01': 14400 };

  it('keeps two people with the same name apart: separate rows, hours, day logs and Wise amounts', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [twinA, twinB], byDay, sessions);

    expect(r.rows).toHaveLength(2);
    expect(r.rowUserIds).toEqual([3, 4]);
    expect(r.rows.map(x => x.period_total_hours)).toEqual(['1h 00m', '4h 00m']);
    expect(r.timesheet.rows.map(x => [x.id, x.periodSeconds])).toEqual([[3, 3600], [4, 14400]]);
    expect(r.wiseAmounts).toEqual({ 3: 10, 4: 80 });
    expect(r.dayLogs[3]['2026-07-01']).toBe('09:00 - 10:00');
    expect(r.dayLogs[4]['2026-07-01']).toBe('11:00 - 15:00');
  });

  it('matches day times by id, so a person whose name changed still gets their times', () => {
    const renamed = { ...jane, name: 'Test Person A-Renamed' };
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [renamed], { '1:2026-07-01': 3600 }, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    // The page may still hold the old name for this user; lookups use the id.
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - 10:00');
    expect(r.wiseAmounts[1]).toBe(10);
    expect(r.rows[0].member).toBe('Test Person A-Renamed');
  });

  it('a sibling with the same name never receives another person\'s sessions', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [twinA, twinB], { '3:2026-07-01': 3600 }, [
      sess(3, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    expect(r.dayLogs[4]).toEqual({});
  });

  describe('labels for people who share a name', () => {
    const members: ExportMember[] = [
      { userId: 3, name: 'Test Twin', memberCode: 'TT01' },
      { userId: 4, name: 'Test Twin', memberCode: null },
      { userId: 1, name: 'Test Person A', memberCode: 'TA01' },
    ];

    it('adds the member code, or #id without a code, only to the shared names', () => {
      const labels = memberLabels(members);
      expect(labels.get(3)).toBe('Test Twin (TT01)');
      expect(labels.get(4)).toBe('Test Twin (#4)');
      expect(labels.get(1)).toBe('Test Person A');
    });

    it('treats names as the same regardless of case and surrounding spaces', () => {
      const labels = memberLabels([
        { userId: 5, name: 'Test Twin ' },
        { userId: 6, name: 'test twin' },
      ]);
      expect(labels.get(5)).toBe('Test Twin  (#5)');
      expect(labels.get(6)).toBe('test twin (#6)');
    });

    it('leaves unique names byte-identical to today', () => {
      const labels = memberLabels([{ userId: 1, name: 'Test Person A' }, { userId: 2, name: 'Test Person B' }]);
      expect([...labels.values()]).toEqual(['Test Person A', 'Test Person B']);
    });

    it('lists the shared names once each', () => {
      expect(duplicateNames(members)).toEqual(['Test Twin']);
      expect(duplicateNames([members[2]])).toEqual([]);
    });
  });

  it('unique-name output is unchanged: same rows and Wise csv as before ids were used', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-02', [jane, bob], { '1:2026-07-01': 3600, '2:2026-07-01': 1800 });
    expect(r.rows).toEqual([
      { member: 'Test Person A', team: 'Team X', period_total_hours: '1h 00m' },
      { member: 'Test Person B', team: 'Team X', period_total_hours: '0h 30m' },
    ]);
    const csv = buildWiseCsv(
      [{ name: 'Test Person A', amountUsd: r.wiseAmounts[1] }, { name: 'Test Person B', amountUsd: r.wiseAmounts[2] }],
      { paymentReference: r.wisePaymentReference },
    );
    expect(csv.split('\n')[1]).toBe(',Test Person A,,Wise account,USD,Php,source,10.00,Payroll Period 1 Jul 2026 - 2 Jul 2026,PERSON');
    expect(csv.split('\n')[2]).toBe(',Test Person B,,Wise account,USD,Php,source,,Payroll Period 1 Jul 2026 - 2 Jul 2026,PERSON');
  });
});

describe('"Still clocked in"', () => {
  it.each([[null], [''], ['   ']])('treats a clock-out of %j as open', value => {
    expect(isOpenSession(value as string | null)).toBe(true);
  });
  it('treats a real timestamp as closed', () => {
    expect(isOpenSession('2026-07-01T09:00:00Z')).toBe(false);
  });

  it('shows "09:05 - Still clocked in" for an open session, in Manila time', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:05:00Z', null),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe(`09:05 - ${STILL_CLOCKED_IN}`);
    expect(STILL_CLOCKED_IN).toBe('Still clocked in');
  });

  it('shows it even when an earlier session that day is closed, keeping the first time in', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], { '1:2026-07-01': 3600 }, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
      sess(1, '2026-07-01', '2026-07-01T05:00:00Z', null),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - Still clocked in');
  });

  it('shows it even when the open session is not the last one listed', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', null),
      sess(1, '2026-07-01', '2026-07-01T05:00:00Z', '2026-07-01T06:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - Still clocked in');
  });

  it('treats an empty-text clock-out as open', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', ' '),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - Still clocked in');
  });

  it('leaves the time out as is when every session that day is closed', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], { '1:2026-07-01': 3600 }, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - 10:00');
  });

  it('does not add the open time to hours, totals, the timesheet or the Wise amount', () => {
    // The server gives open sessions no duration, so they are not in timesheetsByDay.
    const withOpen = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], { '1:2026-07-01': 3600 }, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
      sess(1, '2026-07-01', '2026-07-01T05:00:00Z', null),
    ]);
    const without = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], { '1:2026-07-01': 3600 }, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    expect(withOpen.rows).toEqual(without.rows);
    expect(withOpen.timesheet.rows).toEqual(without.timesheet.rows);
    expect(withOpen.wiseAmounts).toEqual(without.wiseAmounts);
    expect(withOpen.rows[0].period_total_hours).toBe('1h 00m');
  });

  it('reports who is still clocked in, once each, and nobody otherwise', () => {
    const open = buildCustomRangeExport('2026-07-01', '2026-07-02', [jane, bob], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', null),
      sess(1, '2026-07-02', '2026-07-02T01:00:00Z', null),
      sess(2, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    expect(open.openUserIds).toEqual([1]);
    const none = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
    ]);
    expect(none.openUserIds).toEqual([]);
  });

  describe('the note and warning', () => {
    it('is absent when nobody is open', () => {
      expect(openSessionsNote(0)).toBeNull();
    });
    it('uses the plan wording for several people', () => {
      expect(openSessionsNote(3)).toBe("3 people are still clocked in. Their current shift isn't included in hours or pay.");
    });
    it('reads naturally for one person', () => {
      expect(openSessionsNote(1)).toBe("1 person is still clocked in. Their current shift isn't included in hours or pay.");
    });
    it('is written into the timesheet csv only when given', () => {
      const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {});
      const note = openSessionsNote(2)!;
      expect(buildTimesheetCsv(r.timesheet.rows, r.timesheet.meta, undefined, note)).toContain(`Note,${note}`);
      expect(buildTimesheetCsv(r.timesheet.rows, r.timesheet.meta)).not.toContain('Note,');
    });
  });
});

describe('the Wise payout is blocked', () => {
  const a: ExportMember = { userId: 1, name: 'Test Person A' };
  const b: ExportMember = { userId: 2, name: 'Test Person B' };
  const t1: ExportMember = { userId: 3, name: 'Test Twin' };
  const t2: ExportMember = { userId: 4, name: 'Test Twin' };

  it('allows a clean selection', () => {
    expect(wiseBlockReason([a, b], [])).toBeNull();
  });

  it('blocks when one selected person is still clocked in, with the plan message', () => {
    expect(wiseBlockReason([a, b], [2])).toBe(
      "The Wise file can't be created yet: 1 selected person is still clocked in. Try again after they clock out.",
    );
  });

  it('counts several people still clocked in', () => {
    expect(wiseBlockReason([a, b], [1, 2])).toBe(WISE_STILL_CLOCKED_IN_MESSAGE(2));
    expect(WISE_STILL_CLOCKED_IN_MESSAGE(2)).toBe(
      "The Wise file can't be created yet: 2 selected people are still clocked in. Try again after they clock out.",
    );
  });

  it('ignores someone still clocked in who is not selected', () => {
    expect(wiseBlockReason([a], [2])).toBeNull();
  });

  it('blocks when two selected people share a name, until names are told apart', () => {
    expect(wiseBlockReason([t1, t2], [])).toBe(
      `The Wise file can't be created until names are told apart: more than one selected person is named "Test Twin". Deselect one, or export a different template.`,
    );
    expect(wiseBlockReason([t1, t2], [])).toBe(WISE_SHARED_NAME_MESSAGE(['Test Twin']));
  });

  it('does not block when only one of two same-name people is selected', () => {
    expect(wiseBlockReason([t1, a], [])).toBeNull();
  });

  it('reports still-clocked-in first when both problems exist', () => {
    expect(wiseBlockReason([t1, t2], [3])).toBe(WISE_STILL_CLOCKED_IN_MESSAGE(1));
  });

  it('blocks while who is clocked in is not known', () => {
    expect(wiseBlockReason([a], null)).toBe(WISE_UNCHECKED_MESSAGE);
  });

  it('other formats are not blocked by an open session (they only warn)', () => {
    expect(resolveCsvTemplate('csv', 'standard', { allowPayout: true })).toBe('standard');
    expect(resolveCsvTemplate('json', 'wise', { allowPayout: true })).toBe('standard');
  });
});

describe('only admins can get the Wise template, in code', () => {
  it('grants Wise only for allowPayout exactly true', () => {
    expect(resolveCsvTemplate('csv', 'wise', { allowPayout: true })).toBe('wise');
  });
  it.each([[false], [undefined]])('never grants Wise when allowPayout is %s', allowPayout => {
    expect(resolveCsvTemplate('csv', 'wise', { allowPayout })).toBe('standard');
    expect(resolveCsvTemplate('csv', 'wise', {})).toBe('standard');
  });
  it('does not treat a truthy non-boolean as permission', () => {
    expect(resolveCsvTemplate('csv', 'wise', { allowPayout: 'yes' as unknown as boolean })).toBe('standard');
  });
  it('Markdown and JSON never use a template', () => {
    expect(resolveCsvTemplate('md', 'timesheet', { allowPayout: true, canTimesheet: true })).toBe('standard');
  });
  it('timesheet needs timesheet data', () => {
    expect(resolveCsvTemplate('csv', 'timesheet', { canTimesheet: true })).toBe('timesheet');
    expect(resolveCsvTemplate('csv', 'timesheet', { canTimesheet: false })).toBe('standard');
  });

  it('the export panel defaults allowPayout to off and passes ids, not names, to the Wise logic', () => {
    const src = readFileSync('src/components/attendance-export-sheet.tsx', 'utf8');
    expect(src).toMatch(/allowPayout = false/);
    expect(src).not.toMatch(/allowPayout = true/);
    expect(src).toMatch(/resolveCsvTemplate\(/);
    expect(src).toMatch(/wiseBlockReason\(selectedMemberList, openUserIds\)/);
  });

  it('every caller of the panel passes allowPayout from the admin check', () => {
    const src = readFileSync('src/app/(app)/attendance/attendance-client.tsx', 'utf8');
    expect(src.match(/allowPayout=\{isAdmin\}/g)).toHaveLength(2);
    expect(src.match(/<AttendanceExportSheet/g)).toHaveLength(2);
  });
});

describe('(+1) for a shift that ends after midnight in Manila', () => {
  it('marks a shift ending the next Manila day', () => {
    // 21:33 Manila on 1 Jul = 13:33Z; out 02:10 Manila on 2 Jul = 18:10Z on 1 Jul.
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T13:33:00Z', '2026-07-01T18:10:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('21:33 - 02:10 (+1)');
  });

  it('does not mark a shift that ends at 23:59 Manila', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T13:00:00Z', '2026-07-01T15:59:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('21:00 - 23:59');
  });

  it('marks a shift ending exactly at 00:00 Manila', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T13:00:00Z', '2026-07-01T16:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('21:00 - 00:00 (+1)');
  });

  it('does not mark an ordinary day shift', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T09:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - 17:00');
  });

  it('uses the last session of the day, so a later closed night shift is marked', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', '2026-07-01T02:00:00Z'),
      sess(1, '2026-07-01', '2026-07-01T14:00:00Z', '2026-07-01T17:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('09:00 - 01:00 (+1)');
  });

  it('is not added to an open session', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T14:00:00Z', null),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe('22:00 - Still clocked in');
  });
});

describe('"Unknown time" instead of "Invalid Date"', () => {
  it('shows it for a bad clock-in', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', 'not-a-time', '2026-07-01T09:00:00Z'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe(`${UNKNOWN_TIME} - 17:00`);
  });
  it('shows it for a bad clock-out', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '2026-07-01T01:00:00Z', 'garbage'),
    ]);
    expect(r.dayLogs[1]['2026-07-01']).toBe(`09:00 - ${UNKNOWN_TIME}`);
  });
  it('never writes "Invalid Date"', () => {
    const r = buildCustomRangeExport('2026-07-01', '2026-07-01', [jane], {}, [
      sess(1, '2026-07-01', '', 'x'),
    ]);
    expect(JSON.stringify(r)).not.toContain('Invalid Date');
  });
});

describe('notes are off by default and opt-in', () => {
  const weekly = { mode: 'weekly' as const, includeNotes: EXPORT_DEFAULTS.includeNotes, includeWeekendHours: true, includeTotals: true };
  it('defaults the notes tick to off', () => {
    expect(EXPORT_DEFAULTS.includeNotes).toBe(false);
  });
  it('drops notes with the defaults', () => {
    expect(isExcludedColumn('notes', weekly)).toBe(true);
  });
  it('keeps notes once an admin ticks them', () => {
    expect(isExcludedColumn('notes', { ...weekly, includeNotes: true })).toBe(false);
  });
  it('the panel starts from the default and still offers the tick', () => {
    const src = readFileSync('src/components/attendance-export-sheet.tsx', 'utf8');
    expect(src).toMatch(/useState<boolean>\(EXPORT_DEFAULTS\.includeNotes\)/);
    expect(src).toMatch(/onChange=\{setIncludeNotes\}/);
  });
  it('does not change other column choices', () => {
    expect(isExcludedColumn('saturday_hours', weekly)).toBe(false);
    expect(isExcludedColumn('saturday_hours', { ...weekly, includeWeekendHours: false })).toBe(true);
    expect(isExcludedColumn('week_total_hours', { ...weekly, includeTotals: false })).toBe(true);
    expect(isExcludedColumn('notes', { ...weekly, mode: 'monthly' })).toBe(false);
  });
});

describe('file name date is the Manila date', () => {
  it('15:59:59Z is still the same Manila day', () => {
    expect(exportDateSuffix(new Date('2026-10-27T15:59:59Z'))).toBe('2026-10-27');
  });
  it('16:00:00Z is already the next Manila day (a UTC date would still say the 27th)', () => {
    expect(exportDateSuffix(new Date('2026-10-27T16:00:00Z'))).toBe('2026-10-28');
    expect(new Date('2026-10-27T16:00:00Z').toISOString().slice(0, 10)).toBe('2026-10-27');
  });
  it('rolls over a month and a year end', () => {
    expect(exportDateSuffix(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });
  it('is independent of the machine timezone', () => {
    const before = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(exportDateSuffix(new Date('2026-10-27T00:30:00Z'))).toBe('2026-10-27');
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
  });
  it('the panel builds file names from it, not toISOString', () => {
    const src = readFileSync('src/components/attendance-export-sheet.tsx', 'utf8');
    expect(src).toMatch(/exportDateSuffix\(\)/);
    expect(src).not.toMatch(/toISOString\(\)\.slice/);
  });
});

describe('month range for the panel', () => {
  it.each([
    ['2026-07', '2026-07-01', '2026-07-31'],
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
    ['2026-12', '2026-12-01', '2026-12-31'],
  ])('%s runs %s to %s', (month, start, end) => {
    expect(monthDateRange(month)).toEqual({ start, end });
  });
});
