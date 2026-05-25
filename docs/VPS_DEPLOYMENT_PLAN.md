# AI Assistant VPS Deployment Plan: RS Ticketing System (Plane.so)

**Objective:** Deploy and configure [Plane.so](https://plane.so) on a Virtual Private Server (VPS) via Docker, set up the workspace for Romega Solutions, import existing tasks, and configure the automated Python reporting script. 

**Context:** The team selected Option B (Plane.so + custom report script) over a full custom build. The tool must be self-hosted on the existing VPS to maintain zero cost. The VPS must have at least 4GB of RAM.

---

## AI Assistant Guidelines
When executing this plan, adhere to the following rules:
- **No Unapproved Paid Services:** Only use the free, open-source Community Edition of Plane.so.
- **Data Privacy:** Ensure the database (`PostgreSQL` + `Redis` via Docker) runs locally on the VPS and isn't exposed publicly without authentication.
- **Match Spec Exactly:** Projects, Labels, Statuses, and Priority maps must be configured exactly as specified below to ensure the Python reporting script correctly parses the statuses.

---

## Phase 1: VPS Preparation & Pre-flight Checks
1. **SSH into the VPS:** Connect to the remote server.
2. **Verify System Requirements:**
   - Run `free -h` to verify at least 4GB of available RAM.
   - Run `df -h` to ensure ~2GB of available disk space for Docker images and DB growth.
3. **Verify Docker:** Check if `docker` and `docker-compose` (or `docker compose`) are installed using `docker --version`.

---

## Phase 2: Plane.so Deployment
1. **Clone Repository:** Clone the official Plane self-hosting repository (`makeplane/plane` or equivalent official repo for Community Edition).
2. **Configure Environment:** 
   - Set up the `.env` configuration file (or `docker-compose.yml` if necessary) with the correct target domain (e.g., `tasks.romega-solutions.com` or `plane.kenbuilds.tech`).
   - Configure SMTP if email notifications are desired.
   - *Optional:* If VPS RAM is extremely tight, configure Plane to share a PostgreSQL instance with existing services, rather than spinning up a new container.
3. **Start Services:** Run `docker compose up -d` to launch the application.
4. **Set Up DNS/Reverse Proxy:** Ensure the domain points to the VPS and configure the existing reverse proxy (e.g., Nginx, Traefik) to route traffic to Plane's exposed web port (usually 80/443).

---

## Phase 3: Workspace & Project Configuration
Once the web interface is accessible, log in and configure the following:

### 1. Workspace
- **Name:** Romega Solutions
- **URL Slug:** `romega`
- **Initial Admins:** Invite `Ken` and `Mark Siazon` as workspace Admins. (Also invite `Robbie` as Admin, `Cherry Ann`, `Jenn`, `Duane`, and `Mich` as Members).

### 2. Projects
Create these four projects, setting their "Identifiers" accordingly so tasks have prefixes like `C1-42`:
- **C1:** Romega Digital v3 (Lead: Mark)
- **C2:** PinayMate Platform (Lead: Ken)
- **C3:** Internal Tools & Automation (Lead: Ken)
- **C4:** Upskilling & Research (Lead: Mark)

### 3. Task Statuses (Workflow States)
Map the exact states required for the reporting script. Colors are recommended, names/categories are strict:
- **Backlog** (Gray) - *Category: Backlog*
- **To Do** (Blue) - *Category: Unstarted*
- **In Progress** (Yellow) - *Category: Started*
- **In Review** (Orange) - *Category: Started*
- **Done** (Green) - *Category: Completed*
- **Cancelled** (Red) - *Category: Cancelled*

### 4. Labels (Tags)
Create the following labels:
- `design` (Blue)
- `dev` (Green)
- `urgent` (Red)
- `waiting-approval` (Amber)
- `blocker` (Red)
- `stream-a` through `stream-g` (Used specifically for C3 project streams).

### 5. Saved Views
Set up these shared saved views:
- **My Tasks:** `Assignee = me`, `Status ≠ Done/Cancelled`
- **All Blockers:** `Label = blocker`
- **Ken's Load:** `Assignee = Ken`
- **This Week's Deadlines:** `Due date = this week`
- **C3 Streams:** `Project = C3`, grouped by `Label`
- **High Priority:** `Priority = Urgent or High`

---

## Phase 4: Data Migration (Markdown to Plane.so)
Import tasks from the existing markdown `TODO.md` files located in the `/RS_Workspace/` directory. 
- You may use a migration script or perform a manual import.
- **Parsing Rules:**
  - `[ ]` = `To Do` | `[x]` = `Done`
  - 🔴 = `High` Priority | 🟡 = `Medium` Priority | 🟢 = `Low` Priority
  - `@Ken` = Assign to Ken.
  - Tasks under the "Blocked / Waiting On" table in `MASTER-TODO.md` must be labeled as `blocker`.
  - C3 tasks under stream headings (e.g., "Stream A") get the corresponding label (`stream-a`).

---

## Phase 5: Python Reporting Script Configuration
The Python script located at `report-script/generate_report.py` is responsible for querying Plane's REST API and building the Excel report.

1. **Setup Environment:**
   ```bash
   cd report-script
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
2. **Environment Variables:**
   - Copy `.env.example` to `.env`
   - Generate an API Key in Plane.so and add it to the `.env` file along with the Plane base URL.
3. **Verify Execution:**
   - Run `python generate_report.py --dry-run` to test the connection.
   - Run `python generate_report.py --bulk` to generate sample weekly reports.
4. **Cron Automation (Optional):**
   - Set up a cron job on the VPS to automatically run the report script every Friday at 3:00 PM.
   - `0 15 * * 5 cd /path/to/report-script && /path/to/venv/bin/python generate_report.py --bulk`

---

## Phase 6: Handoff & Testing
- Deliver the domain URL, Admin credentials, and verify that the Excel export creates a `.xlsx` file exactly matching the legacy 7-section layout.
- Monitor the parallel run for the first 2 weeks.