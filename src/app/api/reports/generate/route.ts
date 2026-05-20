import ExcelJS from 'exceljs';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import {
  getProjects,
  getProjectStates,
  getWorkItems,
  buildStateLookup,
  enrichWorkItems,
  PlaneWorkItem,
} from '@/lib/tickets';

export const runtime = 'nodejs';

// ── Styling constants ──────────────────────────────────────────────────────────

const RS_BLUE   = 'FF0069D9';
const RS_ORANGE = 'FFD97B00';
const WHITE     = 'FFFFFFFF';
const GRAY_100  = 'FFF5F5F7';
const BODY_TEXT = 'FF333333';
const MUTED     = 'FF999999';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin', color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

// ── Status mapping ─────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  backlog:     'Drafted',
  unstarted:   'Drafted',
  todo:        'Drafted',
  started:     'On-going',
  in_progress: 'On-going',
  in_review:   'For Approval',
  completed:   'Completed',
};

const PENDING_GROUPS = new Set([
  'backlog', 'unstarted', 'started', 'todo', 'in_progress', 'in_review',
]);

const EXCLUDED_GROUPS = new Set(['cancelled', 'canceled', 'archived']);

// ── Week helpers ───────────────────────────────────────────────────────────────

function getWeekRange(weekStartStr?: string): { start: Date; end: Date } {
  let monday: Date;
  if (weekStartStr) {
    monday = new Date(`${weekStartStr}T00:00:00`);
  } else {
    const today = new Date();
    const day = today.getDay(); // 0=Sun
    const offset = day === 0 ? -6 : 1 - day;
    monday = new Date(today);
    monday.setDate(today.getDate() + offset);
    monday.setHours(0, 0, 0, 0);
  }
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return { start: monday, end: friday };
}

function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString('en-US', opts);
}

// ── Excel helpers ──────────────────────────────────────────────────────────────

function applyDataCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = { name: 'Calibri', size: 10, color: { argb: BODY_TEXT } };
  cell.border = THIN_BORDER;
  cell.alignment = { wrapText: true, vertical: 'top' };
}

function writeSectionHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  text: string,
  color: string = RS_BLUE,
): number {
  ws.mergeCells(row, 1, row, 5);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  cell.alignment = { vertical: 'middle' };
  ws.getRow(row).height = 22;
  return row + 1;
}

function writeColHeaders(ws: ExcelJS.Worksheet, row: number, headers: string[]): number {
  for (let c = 0; c < headers.length; c++) {
    const cell = ws.getCell(row, c + 1);
    cell.value = headers[c];
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BODY_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_100 } };
    cell.border = THIN_BORDER;
    cell.alignment = { wrapText: true, vertical: 'top' };
  }
  ws.getRow(row).height = 18;
  return row + 1;
}

function writeEmptyRow(ws: ExcelJS.Worksheet, row: number, text = '(No items)'): number {
  ws.mergeCells(row, 1, row, 5);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: MUTED } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 20;
  return row + 1;
}

function writeBlankSection(ws: ExcelJS.Worksheet, row: number, hint = '(Fill in manually)'): number {
  ws.mergeCells(row, 1, row + 2, 5);
  const cell = ws.getCell(row, 1);
  cell.value = hint;
  cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: MUTED } };
  cell.alignment = { vertical: 'top', wrapText: true };
  for (let r = row; r <= row + 2; r++) {
    for (let c = 1; c <= 5; c++) {
      ws.getCell(r, c).border = THIN_BORDER;
    }
    ws.getRow(r).height = 20;
  }
  return row + 3;
}

// ── Sheet builder ──────────────────────────────────────────────────────────────

function buildSheet(
  ws: ExcelJS.Worksheet,
  userName: string,
  weekStart: Date,
  weekEnd: Date,
  pendingTasks: PlaneWorkItem[],
  completedTasks: PlaneWorkItem[],
) {
  ws.columns = [
    { key: 'a', width: 28 },
    { key: 'b', width: 30 },
    { key: 'c', width: 20 },
    { key: 'd', width: 15 },
    { key: 'e', width: 25 },
  ];

  let row = 1;

  // Title
  ws.mergeCells(row, 1, row, 5);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = 'ROMEGA SOLUTIONS — WEEKLY REPORT';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: RS_BLUE } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 28;
  row++;

  // Name + Coverage
  ws.getCell(row, 1).value = 'Name:';
  ws.getCell(row, 1).font = { bold: true, name: 'Calibri', size: 10 };
  ws.getCell(row, 2).value = userName;
  ws.getCell(row, 2).font = { name: 'Calibri', size: 10 };
  ws.getCell(row, 3).value = 'Coverage:';
  ws.getCell(row, 3).font = { bold: true, name: 'Calibri', size: 10 };
  ws.getCell(row, 4).value =
    `${fmtDate(weekStart, { month: 'long', day: 'numeric' })} – ${fmtDate(weekEnd, { month: 'long', day: 'numeric', year: 'numeric' })}`;
  ws.getCell(row, 4).font = { name: 'Calibri', size: 10 };
  ws.mergeCells(row, 4, row, 5);
  ws.getRow(row).height = 18;
  row += 2; // blank spacer

  // Section 2 — Client Engagement
  row = writeSectionHeader(ws, row, 'SECTION 2 — CLIENT ENGAGEMENT ACTIVITIES');
  row = writeColHeaders(ws, row, ['Activity', 'Date', 'Details', '', '']);
  row = writeBlankSection(ws, row);
  row++;

  // Section 3 — Risks
  row = writeSectionHeader(ws, row, 'SECTION 3 — RISKS / ISSUES / ROADBLOCKS', RS_ORANGE);
  row = writeColHeaders(ws, row, ['Description', 'Resolution', 'Escalation?', '', '']);
  row = writeBlankSection(ws, row);
  row++;

  // Section 4 — Pending Projects (auto)
  row = writeSectionHeader(ws, row, 'SECTION 4 — PENDING PROJECTS  (auto-populated from Plane)');
  row = writeColHeaders(ws, row, ['Project Name', 'Task Title', 'TAT Estimate', 'Status', 'Remarks']);

  if (pendingTasks.length > 0) {
    for (const task of pendingTasks) {
      const group = (task.state_detail?.group ?? '').toLowerCase();
      const displayStatus = STATUS_MAP[group] ?? group.replace(/_/g, ' ');

      let tat = 'No deadline set';
      if (task.target_date) {
        const due = new Date(task.target_date + 'T00:00:00');
        const daysLeft = Math.round((due.getTime() - Date.now()) / 86400000);
        tat = daysLeft < 0
          ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''}`
          : daysLeft === 0 ? 'Due today'
          : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining`;
      }

      const labels = task.label_detail ?? [];
      const blockerLabel = labels.find(l => l.name.toLowerCase().includes('blocker'));
      const remarks = blockerLabel ? (task.description_stripped?.slice(0, 100) || 'Blocker') : '';

      const dataRow = [
        (task as PlaneWorkItem & { _projectName?: string })._projectName ?? '',
        task.name,
        tat,
        displayStatus,
        remarks,
      ];
      for (let c = 0; c < 5; c++) {
        applyDataCell(ws.getCell(row, c + 1), dataRow[c]);
      }
      ws.getRow(row).height = 18;
      row++;
    }
  } else {
    row = writeEmptyRow(ws, row);
  }
  row++;

  // Section 5 — Key Accomplishments (auto)
  row = writeSectionHeader(ws, row, 'SECTION 5 — KEY ACCOMPLISHMENTS  (auto-populated from Plane)');
  row = writeColHeaders(ws, row, ['Description', 'Completion Date', 'Remarks', '', '']);

  if (completedTasks.length > 0) {
    for (const task of completedTasks) {
      const rawDate = task.completed_at ?? '';
      let dateStr = '';
      try {
        dateStr = new Date(rawDate).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
        });
      } catch { /* leave empty */ }

      const dataRow = [task.name, dateStr, ''];
      for (let c = 0; c < 3; c++) {
        applyDataCell(ws.getCell(row, c + 1), dataRow[c]);
      }
      // Empty last two cells with borders
      for (let c = 4; c <= 5; c++) {
        ws.getCell(row, c).border = THIN_BORDER;
      }
      ws.getRow(row).height = 18;
      row++;
    }
  } else {
    row = writeEmptyRow(ws, row);
  }
  row++;

  // Section 6 — Ideas
  row = writeSectionHeader(ws, row, 'SECTION 6 — IDEAS / RECOMMENDATIONS');
  row = writeBlankSection(ws, row);
  row++;

  // Section 7 — Management Remarks
  row = writeSectionHeader(ws, row, 'SECTION 7 — MANAGEMENT REMARKS', RS_ORANGE);
  writeBlankSection(ws, row, '(Manager fills after submission)');
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Auth
  const session = await getSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Body
  let body: { targetMemberId?: string; targetMemberName?: string; week?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  // Resolve member: leads/admins pick any member; ICs generate for themselves
  let memberId: string;
  let memberName: string;

  if (canAccessReports(session.role)) {
    memberId = body.targetMemberId?.trim() ?? '';
    memberName = body.targetMemberName?.trim() || 'Unknown';
    if (!memberId) {
      return Response.json({ error: 'targetMemberId is required.' }, { status: 400 });
    }
  } else {
    memberId = String(session.id);
    memberName = session.name;
  }

  // Week range
  const { start: weekStart, end: weekEnd } = getWeekRange(body.week);
  const weekLabel = weekStart.toISOString().slice(0, 10);

  // Fetch Plane data
  let projects: Awaited<ReturnType<typeof getProjects>>;
  try {
    projects = await getProjects();
  } catch (err) {
    return Response.json(
      { error: `Failed to fetch projects from Plane: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // Fetch work items for this member across all projects, enriched with state info
  type EnrichedItem = PlaneWorkItem & { _projectName: string };
  let allItems: EnrichedItem[] = [];

  try {
    const byProject = await Promise.all(
      projects.map(async p => {
        const [items, states] = await Promise.all([
          getWorkItems(p.id, { assignee: memberId }),
          getProjectStates(p.id),
        ]);
        const lookup = buildStateLookup(states);
        return enrichWorkItems(items, lookup).map(i => ({
          ...i,
          _projectName: p.name,
        }));
      })
    );
    allItems = byProject.flat();
  } catch (err) {
    return Response.json(
      { error: `Failed to fetch work items: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // Categorise
  const pendingTasks = allItems.filter(i => {
    const g = (i.state_detail?.group ?? '').toLowerCase();
    return PENDING_GROUPS.has(g) && !EXCLUDED_GROUPS.has(g);
  });

  const completedTasks = allItems.filter(i => {
    const g = (i.state_detail?.group ?? '').toLowerCase();
    if (g !== 'completed') return false;
    if (!i.completed_at) return false;
    const completedAt = new Date(i.completed_at);
    return completedAt >= weekStart && completedAt <= weekEnd;
  });

  // Build workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RS Ticketing System';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Weekly Report');
  buildSheet(ws, memberName, weekStart, weekEnd, pendingTasks, completedTasks);

  // Write to buffer and stream back
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = memberName.replace(/[^a-z0-9]/gi, '_');
  const filename = `${weekLabel}_${safeName}_Weekly_Report.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
