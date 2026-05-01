# RS Weekly Report Generator

Pulls task data from Plane.so and generates the 7-section weekly report as `.xlsx`.

## Setup

```bash
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your Plane API key
```

## Usage

```bash
# Current week, all users (individual files)
python generate_report.py

# Current week, one user
python generate_report.py --user "Ken Garcia"

# One user by email or id (also supported)
python generate_report.py --user "ken@romega-solutions.com"
python generate_report.py --user "135f22ae-dd76-402b-a54f-a9aa6d28af8d"

# Specific week (use Monday's date)
python generate_report.py --week 2026-05-05

# All users in one workbook (one sheet per IC)
python generate_report.py --bulk

# Test configuration without calling API
python generate_report.py --dry-run

# Debug member payload + matching fields
python generate_report.py --debug-members --user "ken"

# Debug issue payload + status mapping for one user
python generate_report.py --user "ken" --debug-issues

# Check workspace member count
python check_members.py

# Check count + list all users
python check_members.py --show-all

# Print raw member payload for debugging
python check_members.py --debug
```

## Output

Reports are saved to `./reports/` (configurable via `REPORT_OUTPUT_DIR`):

- Individual: `2026-05-05 - Ken_Garcia - Weekly Report.xlsx`
- Bulk: `2026-05-05 - RS Weekly Report (All).xlsx`

## What Gets Auto-Populated

| Section | Source |
|---------|--------|
| 1. Header | User profile + week dates |
| 4. Pending Projects | Active tasks (backlog/unstarted/started and todo/in_progress/in_review) |
| 5. Key Accomplishments | Tasks completed this week |

Sections 2 (Client Engagement), 3 (Risks), 6 (Ideas), and 7 (Management Remarks) are left blank for manual input.

## Automation

To run weekly via cron (e.g., every Friday at 3 PM):

```bash
0 15 * * 5 cd /path/to/report-script && /path/to/venv/bin/python generate_report.py --bulk
```

Or trigger via n8n webhook / Plane.so webhook on task status changes.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLANE_BASE_URL` | Yes | Your Plane instance URL (e.g., `https://plane.kenbuilds.tech`) |
| `PLANE_API_KEY` | Yes | API token from Plane Settings → API Tokens |
| `PLANE_WORKSPACE_SLUG` | No | Workspace slug (default: `romega`) |
| `REPORT_OUTPUT_DIR` | No | Output directory (default: `./reports`) |
