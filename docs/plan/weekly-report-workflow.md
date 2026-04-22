# RS Ticketing System — Weekly Report Workflow

This document describes how the weekly report system works — the core value proposition of the ticketing system that replaces the Excel workbook.

## Current State (What We're Replacing)

### The Excel File
`2025-12-19 - [ICs] RS Weekly Report.xlsx` — a workbook with 26 IC sheets + an AttendanceChecklist sheet.

Each IC's sheet contains a 7-section template that repeats weekly (stacked vertically):

| # | Section | How It's Filled Today |
|---|---------|----------------------|
| 1 | Header (Name, Coverage dates) | IC types manually |
| 2 | Client Engagement Activities | IC types manually |
| 3 | Risks / Issues / Roadblocks | IC types manually |
| 4 | Pending Projects | IC types manually (duplicating Trello data) |
| 5 | Key Accomplishments | IC types manually (duplicating Trello data) |
| 6 | Ideas / Recommendations | IC types manually |
| 7 | Management Remarks | Manager types manually |

**Submission:** Every Friday by 11:59 PM.

**Problem:** Sections 4 and 5 are re-typed versions of data that already exists in task trackers. This is where the time waste is. The other sections (2, 3, 6, 7) require genuine human input and cannot be automated.

---

## New Workflow

### What Changes

| # | Section | Old: Manual | New: Ticketing System |
|---|---------|-------------|----------------------|
| 1 | Header | IC types name + dates | **Auto** — from user profile + current week |
| 2 | Client Engagement | IC types activities | **Manual** — IC fills in |
| 3 | Risks / Issues | IC types description + resolution | **Manual** — IC fills in |
| 4 | Pending Projects | IC types from memory/Trello | **Auto-generated** from active tasks |
| 5 | Key Accomplishments | IC types from memory/Trello | **Auto-generated** from completed tasks |
| 6 | Ideas / Recommendations | IC types | **Manual** — IC fills in |
| 7 | Management Remarks | Manager types | **Manual** — Manager fills after submission |

**Time savings:** Sections 4 and 5 no longer need to be re-typed — they pull directly from the task system. This removes the biggest time sink.

### The Status Dropdown Mapping

The existing Excel uses a dropdown with 3 values for Pending Projects status. The ticketing system maps task statuses to these same values:

| Task Status | Report Status | Meaning |
|-------------|--------------|---------|
| `todo` | **Drafted** | Task created, not yet started |
| `in_progress` | **On-going** | Actively being worked on |
| `in_review` | **For Approval** | Waiting for review or sign-off |
| `backlog` | *(excluded)* | Not shown in report |
| `done` | *(moves to Accomplishments)* | Completed this week |
| `cancelled` | *(excluded)* | Not shown |

This preserves the existing familiar terminology.

---

## Weekly Lifecycle

### Monday — Auto-create Draft

The system automatically creates a `weekly_report` record for each active user with `status = draft` for the current week (Monday → Friday).

It pre-populates two sections:

**Section 4 — Pending Projects:**
```
Query: All tasks WHERE assignee_id = this_user
       AND status IN ('todo', 'in_progress', 'in_review')

For each task:
  Project Name  = project.name (e.g., "Romega Digital v3")
  Task Title    = task.title
  TAT Estimate  = IF task.due_date exists:
                    "{days_remaining} days remaining"
                  ELSE:
                    "No deadline set"
  Status        = MAP task.status → report status (see table above)
  Remarks       = task.blocker_description IF task.is_blocker = true
                  ELSE "" (editable by IC)
```

**Section 5 — Key Accomplishments:**
```
Query: All tasks WHERE assignee_id = this_user
       AND status = 'done'
       AND completed_at BETWEEN week_start AND week_end

For each task:
  Description     = task.title
  Completion Date = task.completed_at (formatted: "April 11, 2026")
  Remarks         = "" (editable by IC to add context)
```

### Monday–Thursday — Work Normally

ICs work on tasks during the week. Every status change, completion, or new task is tracked.

Each time the IC opens their report draft, sections 4 and 5 **refresh** from current task data. A task completed on Wednesday will appear in Accomplishments when the report is opened on Thursday.

The IC can optionally start filling manual sections (Client Engagement, Risks, Ideas) at any time during the week — no need to wait until Friday.

### Friday — Fill & Submit

**3:00 PM:** If report is still in Draft, the dashboard shows an orange reminder banner: "Weekly report due today at 11:59 PM"

**IC workflow:**
1. Open the report from Dashboard card or Weekly Reports page
2. Review auto-populated sections (edit/add/remove as needed)
3. Fill Section 2: Client Engagement Activities (activities + dates)
4. Fill Section 3: Risks/Issues/Roadblocks (description + resolution pairs)
5. Fill Section 6: Ideas/Recommendations (free text)
6. Click **"Submit Report"**
7. Confirmation dialog → Submit
8. Report status changes to `submitted`. Report becomes read-only for IC.

**Late submissions:** ICs can still submit after 11:59 PM. The report is marked as "Late" but still accepted. This matches current team behavior.

### Friday–Monday — Manager Review

Manager sees submitted reports in their review queue (Weekly Reports page, Manager view).

**Manager workflow:**
1. Open a submitted report
2. Read all sections
3. Write Management Remarks (Section 7) — feedback, observations, coaching
4. Click **"Approve"** or **"Request Revision"**

**If "Approve":** Status → `approved`. Report is finalized.

**If "Request Revision":** Status → `draft`. IC can edit again. A note is attached explaining what needs to change.

---

## Auto-Save Behavior

- Report editor auto-saves to `draft` status every **30 seconds** (debounced on field changes)
- Shows "Auto-saved X minutes ago" indicator at the bottom
- Prevents data loss — unlike the Excel workflow where an unsaved file means redoing everything
- Auto-save only fires for draft reports. Submitted/approved reports are immutable (except Management Remarks for managers)

---

## Excel Export Format

The export must produce an `.xlsx` file that matches the current template format so management sees familiar output.

### Single IC Export

One worksheet per report:

```
Row 1:  ROMEGA SOLUTIONS — WEEKLY REPORT
Row 2:  Name: {IC name}          Coverage: {week_start} – {week_end}
Row 3:  (blank)
Row 4:  🤝 CLIENT ENGAGEMENT ACTIVITIES
Row 5:  Activity | Date
Row 6+: {data rows from section 2}
Row N:  (blank)
Row N+1: 🛑 RISKS / ISSUES / ROADBLOCKS
Row N+2: Description | Resolution | Escalation?
Row N+3+: {data rows from section 3}
...
Row N:  🗝️ KEY ACCOMPLISHMENTS / PROJECTS
Row N+1: Description | Completion Date | Remarks
Row N+2+: {data rows from section 5}
...
Row N:  💡 IDEAS / RECOMMENDATIONS
Row N+1+: {free text from section 6}
...
Row N:  📌 MANAGEMENT REMARKS
Row N+1+: {text from section 7}
```

**Formatting:** Bold section headers, merged cells for headers, column widths matching the original template, text wrapping enabled.

### Bulk Export (Manager)

Manager can export all IC reports for a given week as a single workbook — one sheet per IC (matching the original 26-sheet structure). Sheet tabs named: "Siazon, M", "Garcia, KP", etc.

### Attendance Export

Separate sheet (or separate file) matching the AttendanceChecklist format: Employee Name | Team | Job Title | Mon | Tue | Wed | Thu | Fri

---

## Report Data Flow Diagram

```
                    TASK SYSTEM
                    ┌─────────┐
    IC completes    │ tasks   │    IC changes
    a task ───────→ │ table   │ ←── task status
                    └────┬────┘
                         │
                    Auto-populate
                         │
                    ┌────▼────┐
                    │ report  │    IC manually fills
                    │ sections│ ←── sections 2, 3, 6
                    └────┬────┘
                         │
                    IC clicks
                    "Submit"
                         │
                    ┌────▼────┐
                    │ weekly  │    Manager adds
                    │ report  │ ←── management remarks
                    │ record  │
                    └────┬────┘
                         │
                    Manager clicks
                    "Approve"
                         │
                    ┌────▼────┐
                    │ Export  │───→ .xlsx (Excel)
                    │ engine  │───→ .pdf (branded)
                    └─────────┘
```

---

## Edge Cases

**IC has no tasks this week:**
Sections 4 and 5 are empty (auto-generated with 0 rows). IC can manually add entries if they worked on things not tracked as tasks.

**IC completes a task after submitting report:**
The task appears in next week's report. If it needs to be in this week's, manager can "Request Revision" to reopen.

**Task moved to Done then back to In Progress:**
The `completed_at` timestamp is cleared when status moves away from Done. It only appears in Accomplishments for the week when it was in Done status at report generation time.

**New user added mid-week:**
The Monday auto-create runs weekly. New users added after Monday get a draft report created the first time they visit the Reports page.

**Report week is Mon-Fri but IC submits on Saturday:**
Still counted as that week's report. The `submitted_at` timestamp records the actual submission time.
