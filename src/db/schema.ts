import { sql } from 'drizzle-orm';
import { pgTable, text, integer, serial, jsonb, numeric, unique, boolean, index, primaryKey } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id:            serial('id').primaryKey(),
  username:      text('username').notNull().unique(),
  passwordHash:  text('password_hash').notNull(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  role:          text('role').notNull(),
  team:          text('team'),
  jobTitle:      text('job_title'),
  memberCode:    text('member_code'),
  // Personnel info (all optional). Dates stored as 'YYYY-MM-DD' text to match
  // the rest of the schema's date handling. driveUrl = a Google Drive link to
  // the person's HR/personnel folder, surfaced as a clickable file icon.
  dateOfBirth:   text('date_of_birth'),
  startDate:     text('start_date'),
  endDate:       text('end_date'),
  driveUrl:      text('drive_url'),
  hourlyRateUsd: numeric('hourly_rate_usd', { precision: 10, scale: 2 }),
  // Weekly allotted hours — the per-user BASE for the overtime allowance/cap
  // (allowance = approvedHoursPerWeek + admin-approved grants). Default 15 keeps
  // every existing user identical to the old flat 15h cap.
  approvedHoursPerWeek: integer('approved_hours_per_week').notNull().default(15),
  // Daily work schedule in PHT ('HH:MM' 24h, both optional). The PST/PDT
  // equivalent is DERIVED on render (src/lib/schedule.ts), never stored, so it
  // always follows US daylight saving.
  schedulePhtStart: text('schedule_pht_start'),
  schedulePhtEnd:   text('schedule_pht_end'),
  // Per-user tool access (checkbox-driven). JSON array of GateableToolKey
  // strings, e.g. ["projects","attendance","recruiting"]. Admins bypass this
  // (always all). Seeded once from role+team via scripts/seed-tool-access.ts.
  toolAccess:    jsonb('tool_access').notNull().default(sql`'[]'::jsonb`),
  isActive:               integer('is_active').notNull().default(1),
  isOnboarding:           integer('is_onboarding').notNull().default(0),
  reminderEnabled:        integer('reminder_enabled').notNull().default(1),
  reminderIntervalMinutes: integer('reminder_interval_minutes').notNull().default(120),
  createdAt:              text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:              text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  // When an admin last sent this user the Google sign-in "account setup" email
  // (ISO string; null = never). Drives the "Sent · <date>" badge in User Management.
  setupEmailSentAt:       text('setup_email_sent_at'),
  // Per-user notification email preferences. The in-app bell is always on; these
  // toggles gate EMAIL delivery only. `email` is the master switch; the rest are
  // per-event. Default: everything ON, so existing users keep getting emails.
  notificationPrefs:      jsonb('notification_prefs').notNull().default(sql`'{"email":true,"mentions":true,"dueToday":true,"approvals":true,"projectAdded":true,"taskAdded":true}'::jsonb`),
});

export const timesheets = pgTable('timesheets', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull(),
  clockedInAt:     text('clocked_in_at').notNull(),
  clockedOutAt:    text('clocked_out_at'),
  durationSeconds: integer('duration_seconds'),
  isOvertime:      integer('is_overtime').notNull().default(0),
  overtimeSeconds: integer('overtime_seconds'),
  overtimeConsentUntil: text('overtime_consent_until'),
  notes:           text('notes'),
  date:            text('date').notNull(),
  // Audit trail: who last admin-edited this session and when (null = never edited).
  editedBy:        integer('edited_by'),
  editedAt:        text('edited_at'),
  createdAt:       text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('timesheets_user_idx').on(t.userId),
]);

// Overtime admin-approval queue. A contractor cut at the 15h weekly cap files a
// request; an admin approves it with a bounded grant (`grantedSeconds`, e.g. +2h)
// that RAISES that user's weekly allowance for `weekStart` (allowance = 15h base
// + the week's approved grants). `approvedUntil` is retained only as an audit
// record of when the grant was issued. Mirror of docs/migrations/add-overtime-requests.sql.
export const overtimeRequests = pgTable('overtime_requests', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull(),
  weekStart:     text('week_start').notNull(),
  status:        text('status').notNull().default('pending'), // pending | approved | denied
  reason:        text('reason'),
  requestedAt:   text('requested_at').default(sql`CURRENT_TIMESTAMP`),
  decidedBy:     integer('decided_by'),
  decidedAt:     text('decided_at'),
  approvedUntil: text('approved_until'),
  // Bounded overtime grant in seconds, added to this user's 15h weekly allowance
  // for `weekStart` while status='approved'. e.g. a +2h grant = 7200.
  grantedSeconds: integer('granted_seconds'),
}, (t) => [
  index('overtime_requests_user_idx').on(t.userId),
]);

// IC self-service time-edit requests. An IC asks to correct a clock-in/out
// session; the request enters 'pending' and never overwrites the timesheet
// until a lead (on the IC's team) or admin approves it. Approval applies the
// requested times to the timesheet and stamps timesheets.editedBy/editedAt.
export const timesheetEditRequests = pgTable('timesheet_edit_requests', {
  id:                serial('id').primaryKey(),
  userId:            integer('user_id').notNull(),         // the IC requesting
  timesheetId:       integer('timesheet_id'),              // session being corrected
  date:              text('date').notNull(),               // denormalized for display
  currentClockIn:    text('current_clock_in'),             // snapshot at request time
  currentClockOut:   text('current_clock_out'),
  requestedClockIn:  text('requested_clock_in'),           // null = leave unchanged
  requestedClockOut: text('requested_clock_out'),          // null = leave unchanged
  reason:            text('reason').notNull(),             // mandatory explanation
  documentPath:      text('document_path'),                // optional supporting file (Storage path)
  documentName:      text('document_name'),
  status:            text('status').notNull().default('pending'), // pending | approved | denied | cancelled
  requestedAt:       text('requested_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  decidedBy:         integer('decided_by'),
  decidedAt:         text('decided_at'),
  decisionComment:   text('decision_comment'),             // mandatory on denial
}, (t) => [
  index('timesheet_edit_requests_user_idx').on(t.userId),
  index('timesheet_edit_requests_timesheet_idx').on(t.timesheetId),
]);

export const presencePings = pgTable('presence_pings', {
  id:              text('id').primaryKey(),
  fromUserId:      integer('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromName:        text('from_name').notNull(),
  fromRole:        text('from_role').notNull(),
  fromTeam:        text('from_team'),
  fromPhotoUrl:    text('from_photo_url'),
  toUserId:        integer('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message:         text('message').notNull(),
  responseMessage: text('response_message'),
  status:          text('status').notNull().default('pending'),
  createdAt:       text('created_at').notNull(),
  deadlineAt:      text('deadline_at').notNull(),
  acknowledgedAt:  text('acknowledged_at'),
  missedAt:        text('missed_at'),
  updatedAt:       text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('presence_pings_from_created_idx').on(t.fromUserId, t.createdAt),
  index('presence_pings_to_created_idx').on(t.toUserId, t.createdAt),
  index('presence_pings_status_deadline_idx').on(t.status, t.deadlineAt),
]);

export const weeklyReports = pgTable('weekly_reports', {
  id:                serial('id').primaryKey(),
  userId:            integer('user_id').notNull(),
  weekStart:         text('week_start').notNull(),
  clientEngagements: text('client_engagements'),
  risks:             text('risks'),
  ideas:             text('ideas'),
  meetings:          text('meetings'),
  submittedAt:       text('submitted_at'),
  updatedAt:         text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const candidates = pgTable('candidates', {
  id:             serial('id').primaryKey(),
  fullName:       text('full_name').notNull(),
  email:          text('email'),
  phone:          text('phone'),
  position:       text('position'),
  source:         text('source'),
  status:         text('status').notNull().default('applied'),
  rating:         integer('rating'),
  notes:          text('notes'),
  linkedinUrl:    text('linkedin_url'),
  resumeUrl:      text('resume_url'),
  // Resume-parsed fields (populated by n8n + Claude)
  location:       text('location'),
  website:        text('website'),
  summary:        text('summary'),
  skills:         jsonb('skills'),
  experience:     jsonb('experience'),
  education:      jsonb('education'),
  certifications: jsonb('certifications'),
  languages:      jsonb('languages'),
  parsedAt:       text('parsed_at'),
  assignedTo:     integer('assigned_to'),
  // Who added this candidate (users.id). null = self-applied via public /apply.
  createdBy:         integer('created_by'),
  // Public application reference code (shown in the Talent showcase).
  applicationCode:   text('application_code'),
  // Last ATS comms email sent to this candidate (n8n).
  lastEmailTemplate: text('last_email_template'),
  lastEmailSentAt:   text('last_email_sent_at'),
  // When TRUE, this candidate is shown on the public Talent showcase at
  // romega-solutions.com/talent. Default FALSE — requires explicit
  // recruiter publishing.
  isPublicTalent: boolean('is_public_talent').notNull().default(false),
  // GDPR consent gate for public Talent Pool publishing. is_public_talent can
  // only become TRUE once consent_status = 'agreed'. Consent is obtained via an
  // n8n email whose one-click link records agreement (token + ip + timestamp);
  // an HR manual-override path sets method='manual'. See
  // docs/migrations/add-candidates-talent-consent.sql + docs/N8N_TALENT_CONSENT.md.
  consentStatus:      text('consent_status').notNull().default('none'), // none | requested | agreed | revoked
  consentToken:       text('consent_token'),
  consentRequestedAt: text('consent_requested_at'),
  consentAgreedAt:    text('consent_agreed_at'),
  consentAgreedIp:    text('consent_agreed_ip'),
  consentMethod:      text('consent_method'), // link | manual
  createdAt:      text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:      text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('candidates_assigned_to_idx').on(t.assignedTo),
  index('candidates_created_by_idx').on(t.createdBy),
  index('candidates_status_idx').on(t.status),
]);

export const leads = pgTable('leads', {
  id:         serial('id').primaryKey(),
  name:       text('name').notNull(),
  email:      text('email'),
  company:    text('company'),
  stage:      text('stage').notNull().default('new'),
  value:      integer('value').notNull().default(0),
  notes:      text('notes'),
  assignedTo: integer('assigned_to'),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('leads_assigned_to_idx').on(t.assignedTo),
  index('leads_stage_idx').on(t.stage),
]);

export const briefings = pgTable('briefings', {
  id:          serial('id').primaryKey(),
  date:        text('date').notNull().unique(),
  stats:       jsonb('stats').notNull(),
  narrative:   text('narrative'),
  model:       text('model'),
  tokensIn:    integer('tokens_in'),
  tokensOut:   integer('tokens_out'),
  generatedAt: text('generated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  generatedBy: integer('generated_by'),
});

export const statusDrafts = pgTable('status_drafts', {
  id:          serial('id').primaryKey(),
  weekStart:   text('week_start').notNull().unique(),
  stats:       jsonb('stats').notNull(),
  draft:       text('draft'),
  model:       text('model'),
  tokensIn:    integer('tokens_in'),
  tokensOut:   integer('tokens_out'),
  generatedAt: text('generated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  generatedBy: integer('generated_by'),
});

export const contentDrafts = pgTable('content_drafts', {
  id:           serial('id').primaryKey(),
  sourceTitle:  text('source_title').notNull(),
  sourceType:   text('source_type').notNull(),
  sourceContent:text('source_content').notNull(),
  outputs:      jsonb('outputs').notNull(),
  model:        text('model'),
  tokensIn:     integer('tokens_in'),
  tokensOut:    integer('tokens_out'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy:    integer('created_by'),
});

export const attendance = pgTable('attendance', {
  id:              serial('id').primaryKey(),
  userId:          integer('user_id').notNull(),
  weekStart:       text('week_start').notNull(),
  mondayStatus:    text('monday_status'),
  tuesdayStatus:   text('tuesday_status'),
  wednesdayStatus: text('wednesday_status'),
  thursdayStatus:  text('thursday_status'),
  fridayStatus:    text('friday_status'),
  saturdayStatus:  text('saturday_status'),
  sundayStatus:    text('sunday_status'),
  notes:           text('notes'),
  submittedAt:     text('submitted_at'),
  // Audit trail: who last admin-edited this week's attendance and when (null = never edited).
  editedBy:        integer('edited_by'),
  editedAt:        text('edited_at'),
  createdAt:       text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('attendance_user_idx').on(t.userId),
]);

export const projects = pgTable('projects', {
  id:          serial('id').primaryKey(),
  identifier:  text('identifier').notNull().unique(),
  name:        text('name').notNull(),
  description: text('description'),
  team:        text('team'),
  network:     integer('network').notNull().default(2),
  nextSequence: integer('next_sequence').notNull().default(1),
  archived:    integer('archived').notNull().default(0),
  // When the project was archived (ISO string; null = never/active). Powers the
  // "Project Activity" footprint (created_at + archived_at) and the Archived tab.
  archivedAt:  text('archived_at'),
  autoArchiveDoneDays: integer('auto_archive_done_days').default(30), // null/0 = off; days a Done task waits before auto-archiving
  createdAt:   text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:   text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectStates = pgTable('project_states', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  group:     text('group').notNull(), // backlog|unstarted|started|completed|cancelled
  color:     text('color').notNull().default('#6b7280'),
  sequence:  integer('sequence').notNull().default(0),
});

export const cycles = pgTable('cycles', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate:   text('end_date').notNull(),
  archived:  integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workItems = pgTable('work_items', {
  id:           serial('id').primaryKey(),
  projectId:    integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sequenceId:   integer('sequence_id').notNull(),
  name:         text('name').notNull(),
  description:  text('description'),
  priority:     text('priority').notNull().default('none'),
  stateId:      integer('state_id').references(() => projectStates.id, { onDelete: 'set null' }),
  cycleId:      integer('cycle_id').references(() => cycles.id, { onDelete: 'set null' }),
  parentId:     integer('parent_id'),   // self-FK; declared raw to avoid forward-ref dance
  targetDate:   text('target_date'),
  completedAt:  text('completed_at'),
  archived:     integer('archived').notNull().default(0),
  archivedAt:   text('archived_at'),   // set when archived, cleared on restore; sorts the Archive view
  createdBy:    integer('created_by'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:    text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  unique('work_items_project_seq_unique').on(t.projectId, t.sequenceId),
  index('work_items_state_idx').on(t.stateId),
  index('work_items_cycle_idx').on(t.cycleId),
]);

export const workItemAssignees = pgTable('work_item_assignees', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  userId:     integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [
  index('work_item_assignees_work_item_idx').on(t.workItemId),
  index('work_item_assignees_user_idx').on(t.userId),
]);

export const workItemComments = pgTable('work_item_comments', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  authorId:   integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:       text('body').notNull(),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('work_item_comments_work_item_idx').on(t.workItemId),
]);

export const projectComments = pgTable('project_comments', {
  id:         serial('id').primaryKey(),
  projectId:  integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  authorId:   integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:       text('body').notNull(),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('project_comments_project_idx').on(t.projectId),
]);

export const labels = pgTable('labels', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  color:     text('color').notNull().default('#6b7280'),
}, (t) => [
  unique('labels_project_name_unique').on(t.projectId, t.name),
]);

export const workItemLabels = pgTable('work_item_labels', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  labelId:    integer('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (t) => [
  unique('work_item_labels_unique').on(t.workItemId, t.labelId),
]);

export const projectMembers = pgTable('project_members', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:      text('role').notNull().default('member'), // 'lead' | 'member' | 'viewer'
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  unique('project_members_unique').on(t.projectId, t.userId),
  index('project_members_user_idx').on(t.userId),
]);

export const workItemActivity = pgTable('work_item_activity', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  actorId:    integer('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action:     text('action').notNull(), // created | edited | state_changed | assigned | unassigned | commented | archived
  fromValue:  text('from_value'),
  toValue:    text('to_value'),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('work_item_activity_work_item_idx').on(t.workItemId),
]);

export const savedViews = pgTable('saved_views', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  filters:   jsonb('filters').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('saved_views_user_idx').on(t.userId),
  index('saved_views_project_idx').on(t.projectId),
]);

// ─── LMS ──────────────────────────────────────────────────────────────────
// Learning Management System — see docs/LMS_BUILD_PLAN.md.
// Three audiences: Foundation (everyone), Department (matched by users.team),
// Intern (matched by normalized role). Auto-assigned by selectors in
// src/lib/lms.ts; lms_course_assignments only stores per-user overrides
// (mainly due dates). Phase 1 ships the first three tables and the
// soft-enforcement path; Phases 2 and 3 fill in quizzes, certificates,
// assignments, comments, and the hard-enforcement gate.

export const lmsCourses = pgTable('lms_courses', {
  id:             serial('id').primaryKey(),
  title:          text('title').notNull(),
  description:    text('description'),
  scope:          text('scope').notNull(),                    // 'foundation' | 'department' | 'intern'
  department:     text('department'),                          // required when scope='department'
  coverImageUrl:  text('cover_image_url'),
  isPublished:    integer('is_published').notNull().default(0),
  enforcement:    text('enforcement').notNull().default('soft'), // 'soft' | 'hard'
  sortOrder:      integer('sort_order').notNull().default(0),
  createdBy:      integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt:      text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:      text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lmsLessons = pgTable('lms_lessons', {
  id:                   serial('id').primaryKey(),
  courseId:             integer('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
  title:                text('title').notNull(),
  lessonType:           text('lesson_type').notNull().default('text'), // 'text' | 'video' | 'mixed'
  bodyMd:               text('body_md'),
  videoSource:          text('video_source'),                          // 'youtube' | 'upload' | null
  videoUrl:             text('video_url'),                             // YouTube URL or storage path
  videoDurationSeconds: integer('video_duration_seconds'),
  sortOrder:            integer('sort_order').notNull().default(0),
  createdAt:            text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:            text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('lms_lessons_course_idx').on(t.courseId),
]);

export const lmsLessonCompletions = pgTable('lms_lesson_completions', {
  id:          serial('id').primaryKey(),
  userId:      integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lessonId:    integer('lesson_id').notNull().references(() => lmsLessons.id, { onDelete: 'cascade' }),
  completedAt: text('completed_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  unique('lms_lesson_completions_user_lesson_unique').on(t.userId, t.lessonId),
  index('lms_lesson_completions_lesson_idx').on(t.lessonId),
]);

// Phase 2 — quizzes & certificates (schema ready; UI lands in a follow-up commit on this branch)

export const lmsQuizzes = pgTable('lms_quizzes', {
  id:          serial('id').primaryKey(),
  lessonId:    integer('lesson_id').notNull().unique().references(() => lmsLessons.id, { onDelete: 'cascade' }),
  passScore:   integer('pass_score').notNull().default(70),
  maxAttempts: integer('max_attempts'),
  createdAt:   text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:   text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const lmsQuizQuestions = pgTable('lms_quiz_questions', {
  id:           serial('id').primaryKey(),
  quizId:       integer('quiz_id').notNull().references(() => lmsQuizzes.id, { onDelete: 'cascade' }),
  prompt:       text('prompt').notNull(),
  questionType: text('question_type').notNull(),     // 'multiple_choice' | 'true_false'
  choices:      jsonb('choices').notNull(),          // [{key:'a', text:'…'}, …]
  correctKeys:  jsonb('correct_keys').notNull(),     // ['a', 'b']
  sortOrder:    integer('sort_order').notNull().default(0),
});

export const lmsQuizAttempts = pgTable('lms_quiz_attempts', {
  id:          serial('id').primaryKey(),
  userId:      integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  quizId:      integer('quiz_id').notNull().references(() => lmsQuizzes.id, { onDelete: 'cascade' }),
  answers:     jsonb('answers').notNull(),           // { [questionId]: [chosenKeys] }
  score:       integer('score').notNull(),
  passed:      integer('passed').notNull(),
  startedAt:   text('started_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: text('submitted_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('lms_quiz_attempts_user_idx').on(t.userId),
  index('lms_quiz_attempts_quiz_idx').on(t.quizId),
]);

export const lmsCertificates = pgTable('lms_certificates', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId:  integer('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
  issuedAt:  text('issued_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  pdfPath:   text('pdf_path'),
  serial:    text('serial').notNull().unique(),
}, (t) => [
  unique('lms_certificates_user_course_unique').on(t.userId, t.courseId),
]);

// Phase 3 — assignments & discussion (schema ready; UI lands in a follow-up commit on this branch)

export const lmsCourseAssignments = pgTable('lms_course_assignments', {
  id:             serial('id').primaryKey(),
  userId:         integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  courseId:       integer('course_id').notNull().references(() => lmsCourses.id, { onDelete: 'cascade' }),
  dueAt:          text('due_at'),
  assignedBy:     integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  assignedAt:     text('assigned_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  lastRemindedAt: text('last_reminded_at'),
}, (t) => [
  unique('lms_course_assignments_user_course_unique').on(t.userId, t.courseId),
  index('lms_course_assignments_course_idx').on(t.courseId),
]);

export const lmsLessonComments = pgTable('lms_lesson_comments', {
  id:        serial('id').primaryKey(),
  lessonId:  integer('lesson_id').notNull().references(() => lmsLessons.id, { onDelete: 'cascade' }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:      text('body').notNull(),
  parentId:  integer('parent_id'),                            // self-FK; raw to avoid forward-ref
  pinned:    integer('pinned').notNull().default(0),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('lms_lesson_comments_lesson_idx').on(t.lessonId),
  index('lms_lesson_comments_user_idx').on(t.userId),
]);

// Admin-action audit trail. Records who did what to whom (user create / role
// change / (de)activate). Best-effort writes (see src/lib/audit.ts); also a
// source in the admin activity feed. Tables are owned by the Drizzle baseline
// (drizzle/0000_baseline.sql) — this schema.ts definition is the source of truth.
export const auditLog = pgTable('audit_log', {
  id:           serial('id').primaryKey(),
  actorId:      integer('actor_id').notNull(),
  action:       text('action').notNull(),
  targetUserId: integer('target_user_id'),
  details:      jsonb('details'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('audit_log_created_idx').on(t.createdAt),
  index('audit_log_actor_idx').on(t.actorId),
]);

// Fixed-window API rate limiter. One row per (key, window_start); count is
// incremented atomically. See src/lib/rate-limit.ts.
export const rateLimits = pgTable('rate_limits', {
  key:         text('key').notNull(),
  windowStart: text('window_start').notNull(),
  count:       integer('count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.windowStart] }),
]);

// In-app notifications surfaced by the dashboard bell. Produced by @mentions in
// task comments, project-member adds, and the daily "task due tomorrow" cron;
// consumed by GET /api/notifications. See src/lib/notifications.ts.
export const notifications = pgTable('notifications', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // recipient
  actorId:   integer('actor_id').references(() => users.id, { onDelete: 'set null' }),         // who caused it
  type:      text('type').notNull(),   // 'project_added' | 'mentioned' | 'task_due'
  title:     text('title').notNull(),
  body:      text('body'),
  link:      text('link'),             // in-app path to navigate to on click
  isRead:    integer('is_read').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('notifications_user_idx').on(t.userId, t.isRead, t.createdAt),
]);

// Editable transactional email templates — one row per `key`. v1 has a single
// row, key='account_setup' (the Google sign-in invite an admin sends from User
// Management). The app owns + resolves these templates; n8n is just the sender.
// See src/lib/email-templates.ts. Created by drizzle/0008_email_templates.sql.
export const emailTemplates = pgTable('email_templates', {
  key:       text('key').primaryKey(),
  subject:   text('subject').notNull(),
  body:      text('body').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedBy: integer('updated_by'),
});
