"""
RS Weekly Report Generator
Pulls task data from Plane.so API and generates the 7-section weekly report as .xlsx.

Sections auto-populated:
  1. Header (name + coverage dates)
  4. Pending Projects (active tasks)
  5. Key Accomplishments (tasks completed this week)

Sections left blank for IC input:
  2. Client Engagement Activities
  3. Risks / Issues / Roadblocks
  6. Ideas / Recommendations
  7. Management Remarks

Usage:
  python generate_report.py                     # Current week, all users
  python generate_report.py --user "Ken Garcia" # Current week, one user
  python generate_report.py --week 2026-05-05   # Specific week (Monday date)
  python generate_report.py --bulk              # All users in one workbook
"""

import argparse
import os
import sys
from datetime import datetime, timedelta

import requests
from dotenv import load_dotenv
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

load_dotenv()

# --- Configuration ---

PLANE_BASE_URL = os.getenv("PLANE_BASE_URL", "").rstrip("/")
PLANE_API_KEY = os.getenv("PLANE_API_KEY", "")
PLANE_WORKSPACE_SLUG = os.getenv("PLANE_WORKSPACE_SLUG", "romega")
OUTPUT_DIR = os.getenv("REPORT_OUTPUT_DIR", "./reports")

# Status mapping: Plane status → report display value
STATUS_MAP = {
    "todo": "Drafted",
    "in_progress": "On-going",
    "in_review": "For Approval",
}

# Statuses that count as "pending" (shown in Section 4)
PENDING_STATUSES = {"todo", "in_progress", "in_review"}

# --- Styling ---

RS_BLUE = "0069D9"
RS_ORANGE = "D97B00"
WHITE = "FFFFFF"
LIGHT_GRAY = "F5F5F7"

HEADER_FONT = Font(name="Merriweather", size=14, bold=True, color=RS_BLUE)
SECTION_FONT = Font(name="Source Sans 3", size=12, bold=True, color=WHITE)
SECTION_FILL_BLUE = PatternFill(start_color=RS_BLUE, end_color=RS_BLUE, fill_type="solid")
SECTION_FILL_ORANGE = PatternFill(start_color=RS_ORANGE, end_color=RS_ORANGE, fill_type="solid")
COL_HEADER_FONT = Font(name="Source Sans 3", size=10, bold=True, color="333333")
COL_HEADER_FILL = PatternFill(start_color=LIGHT_GRAY, end_color=LIGHT_GRAY, fill_type="solid")
BODY_FONT = Font(name="Source Sans 3", size=10, color="333333")
THIN_BORDER = Border(
    left=Side(style="thin", color="CCCCCC"),
    right=Side(style="thin", color="CCCCCC"),
    top=Side(style="thin", color="CCCCCC"),
    bottom=Side(style="thin", color="CCCCCC"),
)
WRAP_ALIGNMENT = Alignment(wrap_text=True, vertical="top")


# --- Plane API Client ---


class PlaneClient:
    """Minimal client for Plane.so REST API."""

    def __init__(self, base_url: str, api_key: str, workspace_slug: str):
        if not base_url or not api_key:
            raise ValueError(
                "PLANE_BASE_URL and PLANE_API_KEY must be set. "
                "See .env.example for details."
            )
        self.base_url = base_url
        self.workspace_slug = workspace_slug
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{self.base_url}/api/v1/workspaces/{self.workspace_slug}{path}"
        resp = self.session.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_projects(self) -> list[dict]:
        data = self._get("/projects/")
        return data.get("results", data) if isinstance(data, dict) else data

    def get_members(self) -> list[dict]:
        data = self._get("/members/")
        return data.get("results", data) if isinstance(data, dict) else data

    def get_issues(self, project_id: str, params: dict | None = None) -> list[dict]:
        data = self._get(f"/projects/{project_id}/issues/", params=params)
        return data.get("results", data) if isinstance(data, dict) else data

    def get_project_name(self, projects: list[dict], project_id: str) -> str:
        for p in projects:
            if p.get("id") == project_id:
                return p.get("name", "Unknown Project")
        return "Unknown Project"


# --- Week Calculation ---


def get_week_range(week_start_str: str | None = None) -> tuple[datetime, datetime]:
    """Return (Monday 00:00, Friday 23:59) for the given or current week."""
    if week_start_str:
        monday = datetime.strptime(week_start_str, "%Y-%m-%d")
    else:
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    friday = monday + timedelta(days=4, hours=23, minutes=59, seconds=59)
    return monday, friday


# --- Data Fetching ---


def fetch_user_tasks(
    client: PlaneClient,
    projects: list[dict],
    user_id: str,
) -> tuple[list[dict], list[dict]]:
    """Fetch pending tasks and completed tasks for a user across all projects."""
    pending = []
    completed = []

    for project in projects:
        pid = project["id"]
        pname = project.get("name", "Unknown")

        issues = client.get_issues(pid, params={"assignee": user_id})

        for issue in issues:
            status_group = (issue.get("state_detail", {}).get("group", "")
                           or issue.get("state_group", ""))
            issue["_project_name"] = pname
            issue["_status_group"] = status_group

            if status_group in PENDING_STATUSES:
                pending.append(issue)
            elif status_group == "completed":
                completed.append(issue)

    return pending, completed


def filter_completed_this_week(
    tasks: list[dict], week_start: datetime, week_end: datetime
) -> list[dict]:
    """Filter completed tasks to only those completed within the given week."""
    result = []
    for task in tasks:
        completed_at = task.get("completed_at") or task.get("updated_at", "")
        if not completed_at:
            continue
        try:
            dt = datetime.fromisoformat(completed_at.replace("Z", "+00:00")).replace(tzinfo=None)
            if week_start <= dt <= week_end:
                result.append(task)
        except (ValueError, TypeError):
            continue
    return result


# --- Excel Generation ---


def write_section_header(ws, row: int, text: str, fill=None) -> int:
    """Write a section header row with merged cells. Returns next row."""
    if fill is None:
        fill = SECTION_FILL_BLUE
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
    cell = ws.cell(row=row, column=1, value=text)
    cell.font = SECTION_FONT
    cell.fill = fill
    cell.alignment = Alignment(vertical="center")
    return row + 1


def write_column_headers(ws, row: int, headers: list[str]) -> int:
    """Write column header row. Returns next row."""
    for col_idx, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col_idx, value=header)
        cell.font = COL_HEADER_FONT
        cell.fill = COL_HEADER_FILL
        cell.border = THIN_BORDER
        cell.alignment = WRAP_ALIGNMENT
    return row + 1


def write_data_row(ws, row: int, values: list, col_count: int = 5) -> int:
    """Write a data row. Returns next row."""
    for col_idx in range(1, col_count + 1):
        cell = ws.cell(
            row=row,
            column=col_idx,
            value=values[col_idx - 1] if col_idx - 1 < len(values) else "",
        )
        cell.font = BODY_FONT
        cell.border = THIN_BORDER
        cell.alignment = WRAP_ALIGNMENT
    return row + 1


def write_empty_row(ws, row: int, text: str = "(No items)", col_count: int = 5) -> int:
    """Write a placeholder row when a section has no data."""
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=col_count)
    cell = ws.cell(row=row, column=1, value=text)
    cell.font = Font(name="Source Sans 3", size=10, italic=True, color="999999")
    cell.alignment = Alignment(horizontal="center")
    return row + 1


def write_blank_section(ws, row: int, text: str = "(Fill in manually)") -> int:
    """Write a blank area for manual IC input."""
    ws.merge_cells(start_row=row, start_column=1, end_row=row + 2, end_column=5)
    cell = ws.cell(row=row, column=1, value=text)
    cell.font = Font(name="Source Sans 3", size=10, italic=True, color="999999")
    cell.alignment = Alignment(vertical="top", wrap_text=True)
    for r in range(row, row + 3):
        for c in range(1, 6):
            ws.cell(row=r, column=c).border = THIN_BORDER
    return row + 3


def generate_ic_sheet(
    ws,
    user_name: str,
    week_start: datetime,
    week_end: datetime,
    pending_tasks: list[dict],
    completed_tasks: list[dict],
):
    """Generate a single IC's weekly report sheet."""
    # Column widths
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 20
    ws.column_dimensions["D"].width = 15
    ws.column_dimensions["E"].width = 25

    row = 1

    # --- Row 1: Title ---
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
    cell = ws.cell(row=row, column=1, value="ROMEGA SOLUTIONS — WEEKLY REPORT")
    cell.font = HEADER_FONT
    cell.alignment = Alignment(horizontal="center")
    row += 1

    # --- Row 2: Name + Coverage ---
    ws.cell(row=row, column=1, value="Name:").font = COL_HEADER_FONT
    ws.cell(row=row, column=2, value=user_name).font = BODY_FONT
    ws.cell(row=row, column=3, value="Coverage:").font = COL_HEADER_FONT
    coverage = f"{week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}"
    ws.cell(row=row, column=4, value=coverage).font = BODY_FONT
    row += 2  # blank row

    # --- Section 2: Client Engagement Activities ---
    row = write_section_header(ws, row, "CLIENT ENGAGEMENT ACTIVITIES")
    row = write_column_headers(ws, row, ["Activity", "Date", "Details", "", ""])
    row = write_blank_section(ws, row)
    row += 1

    # --- Section 3: Risks / Issues / Roadblocks ---
    row = write_section_header(ws, row, "RISKS / ISSUES / ROADBLOCKS", SECTION_FILL_ORANGE)
    row = write_column_headers(ws, row, ["Description", "Resolution", "Escalation?", "", ""])
    row = write_blank_section(ws, row)
    row += 1

    # --- Section 4: Pending Projects (AUTO-POPULATED) ---
    row = write_section_header(ws, row, "PENDING PROJECTS (auto-populated from tasks)")
    row = write_column_headers(
        ws, row, ["Project Name", "Task Title", "TAT Estimate", "Status", "Remarks"]
    )

    if pending_tasks:
        for task in pending_tasks:
            project_name = task.get("_project_name", "")
            title = task.get("name", "Untitled")
            status_group = task.get("_status_group", "")
            display_status = STATUS_MAP.get(status_group, status_group.replace("_", " ").title())

            # TAT estimate
            due_date_str = task.get("target_date")
            if due_date_str:
                try:
                    due = datetime.strptime(due_date_str, "%Y-%m-%d")
                    days_left = (due - datetime.now()).days
                    if days_left < 0:
                        tat = f"Overdue by {abs(days_left)} days"
                    elif days_left == 0:
                        tat = "Due today"
                    else:
                        tat = f"{days_left} days remaining"
                except ValueError:
                    tat = "No deadline set"
            else:
                tat = "No deadline set"

            # Remarks from blocker description or label
            remarks = ""
            labels = task.get("label_detail", []) or task.get("labels", [])
            if isinstance(labels, list):
                for label in labels:
                    name = label.get("name", "") if isinstance(label, dict) else str(label)
                    if "blocker" in name.lower():
                        remarks = task.get("description_stripped", "")[:100] or "Blocker"
                        break

            row = write_data_row(ws, row, [project_name, title, tat, display_status, remarks])
    else:
        row = write_empty_row(ws, row)

    row += 1

    # --- Section 5: Key Accomplishments (AUTO-POPULATED) ---
    row = write_section_header(ws, row, "KEY ACCOMPLISHMENTS (auto-populated from tasks)")
    row = write_column_headers(ws, row, ["Description", "Completion Date", "Remarks", "", ""])

    if completed_tasks:
        for task in completed_tasks:
            title = task.get("name", "Untitled")
            completed_at = task.get("completed_at") or task.get("updated_at", "")
            try:
                dt = datetime.fromisoformat(completed_at.replace("Z", "+00:00")).replace(tzinfo=None)
                date_str = dt.strftime("%B %d, %Y")
            except (ValueError, TypeError):
                date_str = ""
            row = write_data_row(ws, row, [title, date_str, ""])
    else:
        row = write_empty_row(ws, row)

    row += 1

    # --- Section 6: Ideas / Recommendations ---
    row = write_section_header(ws, row, "IDEAS / RECOMMENDATIONS")
    row = write_blank_section(ws, row)
    row += 1

    # --- Section 7: Management Remarks ---
    row = write_section_header(ws, row, "MANAGEMENT REMARKS", SECTION_FILL_ORANGE)
    row = write_blank_section(ws, row, "(Manager fills after submission)")


def sanitize_sheet_name(name: str) -> str:
    """Create a valid Excel sheet name from a user's display name."""
    parts = name.strip().split()
    if len(parts) >= 2:
        sheet = f"{parts[-1]}, {parts[0][0]}"
    else:
        sheet = name
    # Excel sheet names max 31 chars, no special chars
    for ch in r"[]:*?/\\":
        sheet = sheet.replace(ch, "")
    return sheet[:31]


# --- Main ---


def main():
    parser = argparse.ArgumentParser(description="Generate RS Weekly Report from Plane.so")
    parser.add_argument("--week", help="Monday date of the week (YYYY-MM-DD). Default: current week.")
    parser.add_argument("--user", help="Generate report for a specific user (display name). Default: all users.")
    parser.add_argument("--bulk", action="store_true", help="Generate one workbook with all users (one sheet per IC).")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be generated without calling the API.")
    args = parser.parse_args()

    week_start, week_end = get_week_range(args.week)
    print(f"Report period: {week_start.strftime('%B %d')} – {week_end.strftime('%B %d, %Y')}")

    if args.dry_run:
        print("[DRY RUN] Would connect to Plane API and generate reports.")
        print(f"  Base URL: {PLANE_BASE_URL}")
        print(f"  Workspace: {PLANE_WORKSPACE_SLUG}")
        print(f"  Output dir: {OUTPUT_DIR}")
        return

    client = PlaneClient(PLANE_BASE_URL, PLANE_API_KEY, PLANE_WORKSPACE_SLUG)
    projects = client.get_projects()
    members = client.get_members()

    print(f"Found {len(projects)} projects, {len(members)} members")

    # Filter to specific user if requested
    if args.user:
        members = [
            m for m in members
            if args.user.lower() in (m.get("member", {}).get("display_name", "")).lower()
        ]
        if not members:
            print(f"No member found matching '{args.user}'")
            sys.exit(1)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    week_label = week_start.strftime("%Y-%m-%d")

    if args.bulk:
        # One workbook, one sheet per IC
        wb = Workbook()
        wb.remove(wb.active)

        for member in members:
            user_info = member.get("member", member)
            user_id = user_info.get("id", "")
            user_name = user_info.get("display_name", "Unknown")

            print(f"  Generating sheet for {user_name}...")
            pending, completed = fetch_user_tasks(client, projects, user_id)
            completed = filter_completed_this_week(completed, week_start, week_end)

            sheet_name = sanitize_sheet_name(user_name)
            ws = wb.create_sheet(title=sheet_name)
            generate_ic_sheet(ws, user_name, week_start, week_end, pending, completed)

        filename = f"{week_label} - RS Weekly Report (All).xlsx"
        filepath = os.path.join(OUTPUT_DIR, filename)
        wb.save(filepath)
        print(f"\nBulk report saved: {filepath}")

    else:
        # Individual workbooks per user
        for member in members:
            user_info = member.get("member", member)
            user_id = user_info.get("id", "")
            user_name = user_info.get("display_name", "Unknown")

            print(f"  Generating report for {user_name}...")
            pending, completed = fetch_user_tasks(client, projects, user_id)
            completed = filter_completed_this_week(completed, week_start, week_end)

            wb = Workbook()
            ws = wb.active
            ws.title = "Weekly Report"
            generate_ic_sheet(ws, user_name, week_start, week_end, pending, completed)

            safe_name = user_name.replace(" ", "_")
            filename = f"{week_label} - {safe_name} - Weekly Report.xlsx"
            filepath = os.path.join(OUTPUT_DIR, filename)
            wb.save(filepath)
            print(f"  Saved: {filepath}")

    print("\nDone.")


if __name__ == "__main__":
    main()
