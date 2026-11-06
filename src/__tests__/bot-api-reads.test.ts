import { describe, expect, it, vi } from 'vitest';
import { me, projects, states, tasks, task, comments, activity, safeHistory, literalSearch } from '@/lib/bot-api/read';
import type { ReadContext } from '@/lib/bot-api/auth';
import { fixture, mockDb, step, type Call, type DbResult } from './helpers/bot-api';

type List = { cols: string[]; rows: unknown[][]; next: string | null };
const stamp = '2026-01-01T00:00:00.000000Z';
const item = { id: 5, project_id: 1, sequence_id: 1, name: '<b>Title</b>', priority: 'high', state_id: 1,
  target_date: '2026-01-02', updated_at_ts: stamp, project_states: { project_id: 1, name: 'Ready' }, description: '<p>Text</p>', email: 'hidden@example.invalid' };
function defaultResponse(c: Call): DbResult {
  const single = c.steps.some(s => s.method === 'maybeSingle');
  if (c.table === 'projects') return { data: single ? { id: 1 } : [{ id: 1, identifier: 'PROJ', name: '<p>Project</p>' }] };
  if (c.table === 'project_states') return { data: single ? { id: 1 } : [{ id: 1, name: '<b>Ready</b>', group: 'started', sequence: 0 }] };
  if (['work_items','bot_api_work_items'].includes(c.table)) return { data: single ? item : [item] };
  if (c.table === 'work_item_links') return { data: [{ id: 1, title: '<p>Doc</p>', url: 'https://example.invalid' }], count: 1 };
  if (c.table === 'work_item_assignees') return { data: [{ id: 1, user_id: 1, users: { id: 1, name: '<b>Member</b>', email: 'hidden@example.invalid' } }] };
  if (['work_item_comments','bot_api_work_item_comments'].includes(c.table)) return { data: [{ id: 1, parent_id: 4, author_id: 1, users: { name: 'Member' }, body: '<p>Comment</p>', created_at: stamp, updated_at_ts: stamp, edited_at: null, deleted_at: null }], count: 1 };
  if (['work_item_activity','bot_api_work_item_activity'].includes(c.table)) return { data: [{ id: 1, actor_id: 1, users: { name: 'Member' }, action: 'edited', from_value: 'hidden@example.invalid', to_value: 'private text', created_at_ts: stamp }], count: 1 };
  return { data: [] };
}
function context(path: string, params: Record<string,string> = {}, resolve = defaultResponse) {
  const f = fixture(), m = mockDb([], resolve);
  const c: ReadContext = { db: m.db, key: f.key, req: new Request(`http://local/api/bot/v1/${path}`), params };
  return { c, ...m };
}
describe('bounded read-only adapters', () => {
  it.each([
    ['me',me,{}], ['projects',projects,{}], ['projects/1/states',states,{ id: '1' }], ['tasks?project=1',tasks,{}],
    ['tasks/5',task,{ id: '5' }], ['tasks/5/comments',comments,{ id: '5' }], ['tasks/5/activity',activity,{ id: '5' }],
  ] as const)('reads %s through explicit privacy projections', async (path, handler, params) => {
    const s = context(path,params); const r = await handler(s.c);
    const body = JSON.stringify(r);
    expect(/email|hidden@example|key_hash|rsb_live_|private text/.test(body)).toBe(false);
    expect(r.untrusted.length > 0).toBe(true);
    expect(s.calls.some(c => c.steps.some(s => ['insert','update','delete'].includes(s.method)))).toBe(false);
    expect(s.calls.filter(c => c.steps.some(s => s.method === 'select' && String(s.args[0]).includes('*'))).length).toBe(0);
  });
  it.each([task,comments,activity])('resolves actual task project and active project before children', async handler => {
    const s = context('tasks/5',{ id: '5' });
    await handler(s.c);
    expect(step(s.calls[0], 'in','project_id',[1])).toBe(true);
    expect(step(s.calls[0], 'eq','id',5)).toBe(true);
    expect(step(s.calls[0], 'eq','archived',0)).toBe(true);
    expect(step(s.calls[0], 'eq','projects.archived',0)).toBe(true);
    for (const c of s.calls.filter(c => c.table.startsWith('work_item_') || c.table.startsWith('bot_api_work_item_'))) {
      expect(step(c,'eq','work_item_id',5)).toBe(true);
      expect(step(c,'in','work_items.project_id',[1])).toBe(true);
      expect(step(c,'eq','work_items.archived',0)).toBe(true);
      expect(step(c,'eq','work_items.projects.archived',0)).toBe(true);
    }
  });
  it.each(['missing','archived','foreign','empty'])('returns indistinguishable 404 before child queries: %s', async kind => {
    for (const handler of [task,comments,activity]) {
      const s = context('tasks/5',{ id: '5' }, c => ['work_items','bot_api_work_items'].includes(c.table) ? { data: null } : defaultResponse(c));
      if (kind === 'empty') s.c.key.project_ids = [];
      await expect(handler(s.c)).rejects.toMatchObject({ status: 404, code: 'not_found', msg: 'Not found' });
      expect(s.calls.length).toBe(1);
      expect(step(s.calls[0],'in','project_id',kind === 'empty' ? [] : [1])).toBe(true);
    }
  });
  it('empty project grants remain an explicit SQL intersection', async () => {
    const s = context('projects',{}, () => ({ data: [] })); s.c.key.project_ids = [];
    const r = await projects(s.c); expect((r.data as List).rows).toEqual([]); expect(step(s.calls[0],'in','id',[])).toBe(true);
  });
  it('queries limit+1 and returns keyset pages bound to filters and fields', async () => {
    const s = context('tasks?project=1&limit=1&fields=id,name',{}, c => ['work_items','bot_api_work_items'].includes(c.table) ? { data: [item,{...item,id:6}] } : defaultResponse(c));
    const r = await tasks(s.c), data = r.data as List;
    expect(data.rows).toEqual([[5,'Title']]); expect(typeof data.next).toBe('string');
    expect(step(s.calls.at(-1)!,'limit',2)).toBe(true);
    const next = context(`tasks?project=1&limit=1&fields=id,name&cursor=${data.next}`); await tasks(next.c);
    expect(next.calls.at(-1)!.steps.some(s => s.method === 'or' && String(s.args[0]).includes('id.gt.5'))).toBe(true);
    const changed = context(`tasks?project=1&limit=1&fields=id&cursor=${data.next}`);
    await expect(tasks(changed.c)).rejects.toMatchObject({ status:400 });
  });
  it('applies authorization, filters, literal search, ordering and bounds in SQL', async () => {
    const s = context('tasks?project=1&state=1&priority=high&due_before=2026-02-01&since=2026-01-01T00%3A00%3A00Z&q=a%25_b&limit=100');
    await tasks(s.c); const c = s.calls.at(-1)!;
    expect(step(c,'eq','project_id',1)).toBe(true); expect(step(c,'in','project_id',[1])).toBe(true);
    expect(step(c,'eq','state_id',1)).toBe(true); expect(step(c,'eq','priority','high')).toBe(true);
    expect(step(c,'lt','target_date','2026-02-01')).toBe(true); expect(step(c,'gt','updated_at_ts',new Date(stamp).toISOString())).toBe(true);
    expect(step(c,'filter','name','imatch','a%_b')).toBe(true);
    expect(step(c,'order','updated_at_ts')).toBe(true); expect(step(c,'order','id')).toBe(true); expect(step(c,'limit',101)).toBe(true);
  });
  it('treats every search metacharacter as literal text, never a wildcard or expression', () => {
    for (const value of ['*','%','_','\\','.*','[test]','x|y','(?i)','a,b','a"b','a:b']) {
      const pattern = literalSearch(value), expression = new RegExp(pattern,'i');
      expect(expression.test(value)).toBe(true);
      if (value !== '%') expect(expression.test('unrelated')).toBe(false);
    }
  });
  it.each(['','project=0','project=-1','project=1&limit=101','project=1&limit=0','project=1&limit=1&limit=2','project=1&unknown=1','project=1&fields=email','project=1&priority=bad','project=1&due_before=2026-02-30','project=1&since=etag','project=1&q='+ 'a'.repeat(201),'project=1&cursor=bad!'])('rejects invalid query %s', async query => {
    const s = context(`tasks?${query}`); await expect(tasks(s.c)).rejects.toMatchObject({ status:400 });
  });
  it.each(['0','-1','1.1','bad','9007199254740993'])('rejects invalid path id %s', async value => {
    const s = context('tasks/value',{ id:value }); await expect(task(s.c)).rejects.toMatchObject({ status:400 });
  });
  it('rejects a state outside the selected project', async () => {
    const s = context('tasks?project=1&state=9',{}, c => c.table === 'project_states' ? { data: null } : defaultResponse(c));
    await expect(tasks(s.c)).rejects.toMatchObject({ status:400 }); expect(s.calls.some(c => ['work_items','bot_api_work_items'].includes(c.table))).toBe(false);
  });
  it('preserves deletion footprint and parent, while including edit/deletion deltas', async () => {
    const s = context(`tasks/5/comments?since=${stamp}`,{ id:'5' }, c => ['work_item_comments','bot_api_work_item_comments'].includes(c.table) ? { data: [{id:1,parent_id:4,author_id:1,body:'private deleted body',created_at:stamp,updated_at_ts:stamp,edited_at:stamp,deleted_at:stamp}] } : defaultResponse(c));
    const r = await comments(s.c), list = r.data as List, row = Object.fromEntries(list.cols.map((c,i) => [c,list.rows[0][i]]));
    expect(row.body).toBe(''); expect(row.parent_id).toBe(4); expect(row.deleted_at).toBe(stamp); expect(row.edited_at).toBe(stamp);
    expect(step(s.calls.at(-1)!,'gt','updated_at_ts',new Date(stamp).toISOString())).toBe(true); expect(step(s.calls.at(-1)!,'order','updated_at_ts')).toBe(true);
  });
  it.each([
    ['tasks?project=1', tasks, {}, 'bot_api_work_items', 'updated_at_ts', 'upd'],
    ['tasks/5/comments', comments, {id:'5'}, 'bot_api_work_item_comments', 'updated_at_ts', 'updated_at'],
    ['tasks/5/activity', activity, {id:'5'}, 'bot_api_work_item_activity', 'created_at_ts', 'created_at'],
  ] as const)('normalises offset since and preserves microseconds from cast views: %s', async (path, handler, params, table, column, output) => {
    const rows = [
      {...item, id:5, created_at:'2026-01-01 00:00:00.000001+00', updated_at:'2026-01-01 00:00:00.000001+00', [column]:'2026-01-01T00:00:00.000001+00:00'},
      {...item, id:6, created_at:'2026-01-01T00:00:00.000Z', updated_at:'2026-01-01T00:00:00.000Z', [column]:'2026-01-01T00:00:01+00:00'},
    ];
    const query = `${path}${path.includes('?')?'&':'?'}since=2026-01-01T08:00:00%2B08:00&limit=1`;
    const s = context(query, params, c => c.table === table ? {data:rows} : defaultResponse(c));
    const result = (await handler(s.c)).data as List;
    expect(step(s.calls.at(-1)!,'gt',column,'2026-01-01T00:00:00.000Z')).toBe(true);
    expect(step(s.calls.at(-1)!,'order',column)).toBe(true);
    expect(result.rows[0][result.cols.indexOf(output)]).toBe('2026-01-01T00:00:00.000001Z');
    const next = context(`${query}&cursor=${result.next}`,params,c => c.table === table ? {data:rows} : defaultResponse(c));
    await handler(next.c);
    expect(step(next.calls.at(-1)!,'or',`${column}.gt.2026-01-01T00:00:00.000001Z,and(${column}.eq.2026-01-01T00:00:00.000001Z,id.gt.5)`)).toBe(true);
  });
  it('never exposes user-written history values; approved numeric identifiers only', async () => {
    const s = context('tasks/5/activity',{ id:'5' }); const r = await activity(s.c), list = r.data as List;
    expect(list.rows[0][list.cols.indexOf('from')]).toBeNull(); expect(list.rows[0][list.cols.indexOf('to')]).toBeNull();
    expect(safeHistory('state_changed','1')).toBe('1'); expect(safeHistory('assigned','1')).toBe('1');
    expect(safeHistory('edited','cycle:1')).toBeNull(); expect(safeHistory('link_added','https://example.invalid')).toBeNull();
  });
  it('bounds descriptions, links, assignees and safe nested text without fetching URLs', async () => {
    const fetch = vi.spyOn(globalThis,'fetch');
    const s = context('tasks/5?full=1',{id:'5'}, c => {
      if (['work_items','bot_api_work_items'].includes(c.table)) return { data: { ...item, description:'x'.repeat(16001) } };
      if (c.table === 'work_item_links') return { data:Array.from({length:101},(_,i)=>({id:i+1,title:'Doc',url:i===0?'javascript:bad':'https://example.invalid'})), count:101 };
      if (c.table === 'work_item_assignees') return { data:Array.from({length:101},()=>({user_id:1,users:{name:'Member'}})) };
      return defaultResponse(c);
    });
    const r = await task(s.c), data = r.data as Record<string, unknown>;
    expect(String(data.desc).length).toBe(16000); expect(data.trunc).toBe(true);
    expect((data.links as unknown[]).length).toBe(99); expect(data.links_trunc).toBe(true);
    expect((data.assignees as unknown[]).length).toBe(100); expect(data.assignees_trunc).toBe(true);
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it('fails closed if content or required counts cannot be read', async () => {
    const s = context('tasks/5',{id:'5'}, c => c.table === 'work_item_links' ? { error:true } : defaultResponse(c));
    await expect(task(s.c)).rejects.toMatchObject({ status:503 });
  });
  it('marks every selected user-written column, including nested display names and links', async () => {
    const cases = [
      ['projects',projects,{},['identifier','name']], ['projects/1/states',states,{id:'1'},['name']],
      ['tasks?project=1',tasks,{},['name','state']], ['tasks/5',task,{id:'5'},['name','state','desc','assignees','links']],
      ['tasks/5/comments',comments,{id:'5'},['author_name','body']], ['tasks/5/activity',activity,{id:'5'},['actor_name']],
    ] as const;
    for (const [path,handler,params,columns] of cases) {
      const s = context(path,params); expect((await handler(s.c)).untrusted).toEqual([...columns]);
    }
    const selected = context('tasks?project=1&fields=id'); expect((await tasks(selected.c)).untrusted).toEqual([]);
  });
  it('does not reveal a name through an inconsistent foreign state relation', async () => {
    const s = context('tasks?project=1',{}, c => ['work_items','bot_api_work_items'].includes(c.table) ? { data:[{...item,project_states:{project_id:2,name:'private state'}}] } : defaultResponse(c));
    expect(JSON.stringify(await tasks(s.c)).includes('private state')).toBe(false);
  });
  it('rejects unknown fields or params on non-task endpoints', async () => {
    for (const [path, handler, params] of [['me?fields=id',me,{}],['projects?unknown=1',projects,{}],['projects/1/states?fields=email',states,{id:'1'}],['tasks/5?full=2',task,{id:'5'}],['tasks/5/comments?unknown=1',comments,{id:'5'}],['tasks/5/activity?unknown=1',activity,{id:'5'}]] as const) {
      const s = context(path,params); await expect(handler(s.c)).rejects.toMatchObject({ status:400 });
    }
  });
});
