import { z } from 'zod';
import type { ReadContext, Representation } from './auth';
import { compact, decodeCursor, encodeCursor, fields, fingerprint, invalid, missing, project, safeUrl, text, unavailable, utcTimestamp } from './format';

const positive = z.string().regex(/^[1-9]\d*$/).refine(v => Number.isSafeInteger(Number(v)) && Number(v) <= 2147483647).transform(Number);
const time = z.iso.datetime({ offset: true }).transform(v => new Date(v).toISOString());
const common = { limit: positive.refine(v => v <= 100).optional(), cursor: z.string().min(1).max(1024).optional(), fields: z.string().optional() };
const priorities = ['none','urgent','high','medium','low'] as const;
const taskCols = ['id','project_id','sequence','name','state_id','state','pri','due','upd','trunc'] as const;
const detailCols = [...taskCols, 'desc','assignees','assignees_trunc','links','links_trunc','counts'] as const;
type Row = Record<string, unknown>;
const nested = (v: unknown): Row => (Array.isArray(v) ? v[0] : v) as Row ?? {};
const scopeJoin = 'work_items!inner(project_id,archived,projects!inner(archived))';
const itemSelect = 'id,project_id,sequence_id,name,priority,state_id,target_date,updated_at_ts,project_states(project_id,name),projects!inner(archived)';
function parse<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const entries = [...new URL(req.url).searchParams];
  if (new Set(entries.map(([k]) => k)).size !== entries.length) throw invalid();
  const result = schema.safeParse(Object.fromEntries(entries));
  if (!result.success) throw invalid();
  return result.data;
}
function id(value: string) { const result = positive.safeParse(value); if (!result.success) throw invalid(); return result.data; }
function clean(value: unknown, cap = 1500) { return text(value, cap).value; }
function mappedTask(row: Row): Row {
  const name = text(row.name), joinedState = nested(row.project_states);
  const state = text(Number(joinedState.project_id) === Number(row.project_id) ? joinedState.name : '');
  return { id: row.id, project_id: row.project_id, sequence: row.sequence_id, name: name.value,
    state_id: row.state_id, state: state.value, pri: priorities.includes(row.priority as typeof priorities[number]) ? row.priority : null, due: typeof row.target_date === 'string' && z.iso.date().safeParse(row.target_date).success ? row.target_date : null, upd: utcTimestamp(row.updated_at_ts), trunc: name.trunc || state.trunc };
}
function result(data: unknown, untrusted: string[]): Representation { return { data, untrusted }; }
function checked<T>(r: { data: T; error: unknown }): T { if (r.error) throw unavailable(); return r.data; }
function checkedRows(r: { data: unknown; error: unknown }): Row[] {
  const data = checked(r);
  if (data === null) return [];
  if (!Array.isArray(data) || data.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw unavailable();
  return data as Row[];
}
async function activeProject(c: ReadContext, projectId: number) {
  const row = checked(await c.db.from('projects').select('id').eq('id', projectId).in('id', c.key.project_ids).eq('archived', 0).maybeSingle());
  if (!row) throw missing();
}
async function activeTask(c: ReadContext, taskId: number) {
  const row = checked(await c.db.from('work_items').select('id,project_id,projects!inner(archived)').eq('id', taskId).in('project_id', c.key.project_ids).eq('archived', 0).eq('projects.archived', 0).maybeSingle());
  if (!row) throw missing();
  return row;
}
function child(c: ReadContext, table: string, select: string, taskId: number, count?: 'exact', head = false) {
  return c.db.from(table).select([select, scopeJoin].join(','), count ? { count, head } : undefined)
    .eq('work_item_id', taskId).in('work_items.project_id', c.key.project_ids)
    .eq('work_items.archived', 0).eq('work_items.projects.archived', 0);
}
function pageInfo(resource: string, query: Record<string, unknown>, selected: string[], order: 'id' | 'sequence' | 'time', context: unknown) {
  const { cursor: raw, ...filter } = query;
  const signature = fingerprint({ filter, selected, context });
  const after = decodeCursor(raw as string | undefined, resource, signature, order);
  return { signature, after, limit: Number(query.limit ?? 25) };
}
function page(rows: Row[], cols: string[], info: ReturnType<typeof pageInfo>, resource: string, tuple: (r: Row) => (number | string)[], map: (r: Row) => Row, untrusted: string[]) {
  const visible = rows.slice(0, info.limit);
  const next = rows.length > info.limit ? encodeCursor(resource, info.signature, tuple(visible.at(-1)!)) : null;
  return result(compact(visible.map(map), cols, next), cols.filter(c => untrusted.includes(c)));
}

export async function me(c: ReadContext) {
  parse(c.req, z.object({}).strict());
  return result({ label: clean(c.key.label), scopes: c.key.scopes, project_ids: c.key.project_ids,
    limits: { read_per_min: c.key.rate_read_per_min }, expires_at: c.key.expires_at }, ['label']);
}
export async function projects(c: ReadContext) {
  const q = parse(c.req, z.object(common).strict());
  const cols = fields(q.fields, ['id','identifier','name','trunc']);
  const info = pageInfo('projects', q, cols, 'id', null);
  let query = c.db.from('projects').select('id,identifier,name').in('id', c.key.project_ids).eq('archived', 0).order('id').limit(info.limit + 1);
  if (info.after) query = query.gt('id', info.after[0]);
  const rows = checkedRows(await query);
  return page(rows, cols, info, 'projects', r => [Number(r.id)], r => {
    const identifier = text(r.identifier), name = text(r.name);
    return { id: r.id, identifier: identifier.value, name: name.value, trunc: identifier.trunc || name.trunc };
  }, ['identifier','name']);
}
export async function states(c: ReadContext) {
  const projectId = id(c.params.id);
  const q = parse(c.req, z.object(common).strict());
  await activeProject(c, projectId);
  const cols = fields(q.fields, ['id','name','group','order','trunc']);
  const info = pageInfo('states', q, cols, 'sequence', projectId);
  let query = c.db.from('project_states').select('id,name,group,sequence,projects!inner(archived)').eq('project_id', projectId).in('project_id', c.key.project_ids).eq('projects.archived', 0).order('sequence').order('id').limit(info.limit + 1);
  if (info.after) query = query.or(`sequence.gt.${info.after[0]},and(sequence.eq.${info.after[0]},id.gt.${info.after[1]})`);
  return page(checkedRows(await query), cols, info, 'states', r => [Number(r.sequence), Number(r.id)], r => {
    const name = text(r.name);
    return { id: r.id, name: name.value, group: ['backlog','unstarted','started','completed','cancelled'].includes(String(r.group)) ? r.group : null, order: r.sequence, trunc: name.trunc };
  }, ['name']);
}
// Regex-literal matching avoids the REST layer's asterisk alias for LIKE wildcards.
export function literalSearch(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export async function tasks(c: ReadContext) {
  const q = parse(c.req, z.object({ ...common, project: positive, state: positive.optional(), priority: z.enum(priorities).optional(), due_before: z.iso.date().optional(), q: z.string().max(200).refine(v => !v.includes('\u0000')).optional(), since: time.optional() }).strict());
  await activeProject(c, q.project);
  const cols = fields(q.fields, taskCols);
  const info = pageInfo('tasks', q, cols, 'time', null);
  if (q.state) {
    const state = checked(await c.db.from('project_states').select('id').eq('id', q.state).eq('project_id', q.project).in('project_id', c.key.project_ids).maybeSingle());
    if (!state) throw invalid();
  }
  let query = c.db.from('bot_api_work_items').select(itemSelect).eq('project_id', q.project).in('project_id', c.key.project_ids).eq('archived', 0).eq('projects.archived', 0);
  if (q.state) query = query.eq('state_id', q.state);
  if (q.priority) query = query.eq('priority', q.priority);
  if (q.due_before) query = query.lt('target_date', q.due_before);
  if (q.since) query = query.gt('updated_at_ts', q.since);
  if (q.q !== undefined) query = query.filter('name', 'imatch', literalSearch(q.q));
  if (info.after) query = query.or(`updated_at_ts.gt.${info.after[0]},and(updated_at_ts.eq.${info.after[0]},id.gt.${info.after[1]})`);
  const rows = checkedRows(await query.order('updated_at_ts').order('id').limit(info.limit + 1));
  return page(rows, cols, info, 'tasks', r => [utcTimestamp(r.updated_at_ts), Number(r.id)], mappedTask, ['name','state']);
}
export async function task(c: ReadContext) {
  const taskId = id(c.params.id);
  const q = parse(c.req, z.object({ fields: z.string().optional(), full: z.literal('1').optional() }).strict());
  const cols = fields(q.fields, detailCols);
  await activeTask(c, taskId);
  const row = checked(await c.db.from('bot_api_work_items').select(`${itemSelect},description`).eq('id', taskId).in('project_id', c.key.project_ids).eq('archived', 0).eq('projects.archived', 0).maybeSingle()) as Row | null;
  if (!row) throw missing();
  const [linksResult, assigneesResult, commentsResult, activityResult] = await Promise.all([
    child(c, 'work_item_links', 'id,title,url', taskId, 'exact').order('id').limit(101),
    child(c, 'work_item_assignees', 'id,user_id,users(id,name)', taskId).order('id').limit(101),
    child(c, 'work_item_comments', 'id', taskId, 'exact', true),
    child(c, 'work_item_activity', 'id', taskId, 'exact', true),
  ]);
  const links = checkedRows(linksResult), assignees = checkedRows(assigneesResult);
  checked(commentsResult); checked(activityResult);
  if ([linksResult.count, commentsResult.count, activityResult.count].some(n => !Number.isSafeInteger(n) || Number(n) < 0)) throw unavailable();
  const desc = text(row.description, q.full ? 16000 : 1500);
  let trunc = desc.trunc;
  const safeLinks = links.slice(0,100).flatMap(link => {
    const url = safeUrl(link.url), title = text(link.title); trunc ||= title.trunc;
    return url ? [[title.value, url]] : [];
  });
  const safeAssignees = assignees.slice(0,100).map(a => { const name = text(nested(a.users).name); trunc ||= name.trunc; return { id: a.user_id, name: name.value }; });
  const mapped = mappedTask(row);
  return result(project({ ...mapped, desc: desc.value, assignees: safeAssignees, assignees_trunc: assignees.length > 100,
    links: safeLinks, links_trunc: links.length > 100, counts: { links: linksResult.count, comments: commentsResult.count, activity: activityResult.count }, trunc: trunc || mapped.trunc }, cols), cols.filter(f => ['name','state','desc','assignees','links'].includes(f)));
}
const actions = ['created','edited','state_changed','assigned','unassigned','commented','archived','restored','link_added','link_removed','comment_edited','comment_deleted'];
export function safeHistory(action: unknown, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (['assigned','unassigned','state_changed'].includes(String(action)) && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2147483647) return value;
  // All free-written edit, comment, link and unknown values are deliberately discarded.
  return null;
}
export async function comments(c: ReadContext) { return children(c, false); }
export async function activity(c: ReadContext) { return children(c, true); }
async function children(c: ReadContext, history: boolean) {
  const taskId = id(c.params.id);
  const q = parse(c.req, z.object({ ...common, since: time.optional() }).strict());
  await activeTask(c, taskId);
  const resource = history ? 'activity' : 'comments';
  const cols = fields(q.fields, history ? ['id','action','actor_id','actor_name','from','to','created_at','trunc'] : ['id','parent_id','author_id','author_name','body','created_at','updated_at','edited_at','deleted_at','trunc']);
  const info = pageInfo(resource, q, cols, 'time', taskId);
  const column = history ? 'created_at_ts' : 'updated_at_ts';
  let query = child(c, history ? 'bot_api_work_item_activity' : 'bot_api_work_item_comments', history ? 'id,action,actor_id,users(name),from_value,to_value,created_at_ts' : 'id,parent_id,author_id,users!author_id(name),body,created_at,updated_at_ts,edited_at,deleted_at', taskId);
  if (q.since) query = query.gt(column, q.since);
  if (info.after) query = query.or(`${column}.gt.${info.after[0]},and(${column}.eq.${info.after[0]},id.gt.${info.after[1]})`);
  const rows = checkedRows(await query.order(column).order('id').limit(info.limit + 1));
  return page(rows, cols, info, resource, r => [utcTimestamp(r[column]), Number(r.id)], r => {
    const name = text(nested(r.users).name);
    if (history) return { id: r.id, action: actions.includes(String(r.action)) ? r.action : 'other', actor_id: r.actor_id, actor_name: name.value,
      from: safeHistory(r.action, r.from_value), to: safeHistory(r.action, r.to_value), created_at: utcTimestamp(r.created_at_ts), trunc: name.trunc };
    const body = text(r.deleted_at ? '' : r.body);
    return { id: r.id, parent_id: r.parent_id, author_id: r.author_id, author_name: name.value, body: body.value,
      created_at: utcTimestamp(r.created_at), updated_at: utcTimestamp(r.updated_at_ts), edited_at: r.edited_at ? utcTimestamp(r.edited_at) : null, deleted_at: r.deleted_at ? utcTimestamp(r.deleted_at) : null, trunc: name.trunc || body.trunc };
  }, history ? ['actor_name'] : ['author_name','body']);
}
