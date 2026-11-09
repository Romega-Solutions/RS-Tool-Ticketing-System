import { describe, expect, it } from 'vitest';
import { compact, decodeCursor, encodeCursor, etag, fields, fingerprint, project, safeUrl, text, utcTimestamp } from '@/lib/bot-api/format';

describe('bounded untrusted representation', () => {
  it('discards active content, decodes entities and preserves readable spacing', () => {
    const t = text('<style>hidden</style><script>hidden</script><p>A &amp; B&nbsp; &lt;x&gt;</p><p>next<br>last<img src="https://example.invalid"></p>');
    expect(t.value).toBe('A & B <x> next last'); expect(t.trunc).toBe(false);
  });
  it('does not reinterpret encoded markup as HTML', () => { expect(text('&lt;script&gt;literal&lt;/script&gt;').value).toBe('<script>literal</script>'); });
  it('bounds default and full text, without breaking Unicode', () => {
    const value = '😀'.repeat(16001);
    expect(Array.from(text(value).value).length).toBe(1500); expect(text(value).trunc).toBe(true);
    expect(Array.from(text(value,16000).value).length).toBe(16000); expect(text(value,16000).trunc).toBe(true);
  });
  it('only allows selected known columns, never SQL expressions', () => {
    expect(fields('name,id',['id','name'])).toEqual(['id','name']);
    expect(project({ id: 1, name: 'value', private: 'hidden' }, ['id'])).toEqual({ id: 1 });
    for (const v of ['id,id','email','*','id,','count(*)']) expect(() => fields(v,['id','name'])).toThrow();
  });
  it('uses deterministic compact list shape', () => { expect(compact([{ id: 1, name: 'value' }],['id','name'],null)).toEqual({ cols:['id','name'], rows:[[1,'value']], next:null }); });
  it.each(['javascript:alert(1)','file:///etc/passwd','data:text/plain,test','https://user:pass@example.invalid','not a URL'])('rejects unsafe links %s', value => { expect(safeUrl(value)).toBeNull(); });
  it('allows stored http(s) links without fetching', () => { expect(safeUrl('https://example.invalid/a')).toBe('https://example.invalid/a'); });
  it('hashes deterministically including nested content', () => {
    expect(etag({ data: { a: 1, b: 2 } })).toBe(etag({ data: { b: 2, a: 1 } }));
    expect(etag({ links: [['value','https://example.invalid']] }) !== etag({ links: [] })).toBe(true);
    expect(etag({ body: 'before', updated_at: 'same' }) !== etag({ body: 'after', updated_at: 'same' })).toBe(true);
    expect(etag({ counts: { comments: 1 } }) !== etag({ counts: { comments: 2 } })).toBe(true);
  });
  it('requires canonical UTC cursor time and retains submillisecond precision', () => {
    expect(utcTimestamp('2026-01-01 08:00:00.123456+08')).toBe('2026-01-01T00:00:00.123456Z');
    for (const time of ['2026-01-01 00:00:00+00','2026-01-01T08:00:00.000000+08:00','2026-01-01T00:00:00Z','2026-02-30T00:00:00.000000Z']) {
      expect(() => decodeCursor(encodeCursor('tasks','f',[time,1]),'tasks','f','time')).toThrow();
    }
  });
  it('binds versioned cursors to resource, filters and valid ordering tuples', () => {
    const f = fingerprint({ project: 1 }), raw = encodeCursor('tasks',f,['2026-01-01T00:00:00.000000Z',1]);
    expect(decodeCursor(raw,'tasks',f,'time')).toEqual(['2026-01-01T00:00:00.000000Z',1]);
    expect(() => decodeCursor(raw,'comments',f,'time')).toThrow();
    expect(() => decodeCursor(raw,'tasks',fingerprint({ project: 2 }),'time')).toThrow();
    for (const value of ['bad!', 'a'.repeat(1025), encodeCursor('tasks',f,['inject),id.gt.0',1]), encodeCursor('tasks',f,['2026-01-01T00:00:00.000000Z',-1])]) expect(() => decodeCursor(value,'tasks',f,'time')).toThrow();
  });
});
