# RS Ticketing System & Plane.so Flow Summary

This document summarizes the core flow, context, and use cases of the RS Ticketing System based on the project documentation. It serves as a quick reference guide before setting up Plane.so and the report script.

## 1. The Core Problem
Romega Solutions currently suffers from scattered task management (across 5 markdown files, Trello, Sheets, and emails) and a highly manual weekly reporting process. Every Friday, ~26 ICs spend 30-60 minutes re-typing their task progress from these scattered sources into a 7-section Excel template. There is also a lack of cross-project visibility and workload tracking for management.

## 2. The Solution
A two-part, self-hosted (Cost: $0) system:
1. **Task Management (Plane.so):** A single source of truth for all projects (C1-C4). It provides Kanban boards, lists, and workload visibility.
2. **Automated Reporting (Python Script):** A custom script (`report-script/generate_report.py`) that uses the Plane API to auto-populate the weekly Excel reports.

**The "Magic" Value Proposition:** ICs track their work in Plane during the week. Come Friday, the most tedious parts of their weekly report (Pending Projects & Key Accomplishments) are already filled out. 

## 3. The Weekly Workflow Flow

Here is how data flows from task to report:

1. **Daily Work (Mon - Thu):** 
   - Team members manage tasks in Plane.so across four main projects.
   - They move tasks through statuses (`To Do` -> `In Progress` -> `In Review` -> `Done`).
2. **Report Generation (Friday):**
   - The reporting script queries the Plane API for each user's tasks.
   - **Section 4 (Pending Projects):** Auto-populated with tasks in `To Do`, `In Progress`, or `In Review`.
   - **Section 5 (Key Accomplishments):** Auto-populated with tasks marked as `Done` during that week.
3. **Manual Input (Friday):**
   - ICs manually fill in the remaining contextual sections: Section 2 (Client Engagement), Section 3 (Risks/Roadblocks), and Section 6 (Ideas/Recommendations).
4. **Manager Review:**
   - Managers review the generated/submitted report, add Section 7 (Management Remarks), and finalize it.
   - The final output is an `.xlsx` file identical to the current template.

## 4. Plane.so Setup & Configuration

Before building the report automation, Plane.so must be deployed (via Docker on the VPS) and configured correctly for the Romega team.

### Workspace & Projects
- **Workspace:** `romega` (Romega Solutions)
- **Projects to Create:**
  - **C1:** Romega Digital v3 (Vanilla to NextJS rebuild)
  - **C2:** PinayMate Platform (Dating platform MVP)
  - **C3:** Internal Tools & Automation
  - **C4:** Upskilling & Research

### Workflow Statuses
To match the reporting logic, Plane must have these exact statuses:
- **Backlog** (Gray)
- **To Do** (Blue) -> Maps to report status *Drafted*
- **In Progress** (Yellow) -> Maps to report status *On-going*
- **In Review** (Orange) -> Maps to report status *For Approval*
- **Done** (Green) -> Automatically moves task to *Key Accomplishments*
- **Cancelled** (Red)

### Organization Tags (Labels)
Create labels like `design`, `dev`, `urgent`, `waiting-approval`, `blocker`, and stream-specific tags (`stream-a` through `stream-g` for C3). This allows for filtering and saved views (e.g., an "All Blockers" view for management).

## 5. Next Steps for Setup

1. **Infrastructure:** Deploy Plane.so on the VPS using Docker (requires 4GB+ RAM).
2. **Plane Configuration:** Set up the workspace, projects, statuses, and labels as outlined above. Invite the 7 core team members.
3. **Data Migration:** Import current tasks from the existing `TODO.md` files into Plane.
4. **Reporting Script:** Configure and test `report-script/generate_report.py` to ensure it successfully reads from the Plane API and exports the `.xlsx` file.
5. **Trial:** Run Plane in parallel with the current workflow for 2 weeks to ensure stability before fully cutting over.