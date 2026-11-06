import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const contract = JSON.parse(readFileSync('docs/bot-api/openapi.yaml','utf8'));

describe('read-only OpenAPI v0 contract', () => {
  it('defines exactly seven GETs, Bearer security, envelopes and no write/report surface', () => {
    expect(contract.openapi).toBe('3.1.0'); expect(contract.security).toEqual([{ BearerAuth:[] }]);
    expect(contract.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    const paths = ['/me','/projects','/projects/{id}/states','/tasks','/tasks/{id}','/tasks/{id}/comments','/tasks/{id}/activity'].map(p => '/api/bot/v1'+p);
    expect(Object.keys(contract.paths).sort()).toEqual(paths.sort());
    for (const path of paths) {
      expect(Object.keys(contract.paths[path])).toEqual(['get']);
      const op = contract.paths[path].get;
      expect(Object.keys(op.responses).sort()).toEqual(['200','304','400','401','403','404','405','429','503']);
      expect(op.responses['304'].content).toBeUndefined();
      expect(op.responses['200'].content['application/json'].example.v).toBe(1);
      expect(op.responses['200'].content['application/json'].example.untrusted.length > 0).toBe(true);
      expect(op.responses['429'].headers['Retry-After']).toBeDefined();
      const file = 'src/app'+path.replaceAll('{id}','[id]')+'/route.ts';
      const source = readFileSync(file,'utf8');
      expect(source.includes("runtime = 'nodejs'")).toBe(true); expect(source.includes("dynamic = 'force-dynamic'")).toBe(true);
      expect(source.includes("botRoute('tasks:read'")).toBe(true);
      for (const method of ['GET','HEAD','OPTIONS','POST','PUT','PATCH','DELETE']) expect(source.includes(`guarded as ${method}`)).toBe(true);
    }
    for (const name of ['MeResponse','TaskResponse','ListResponse']) expect(contract.components.schemas[name].required).toEqual(['v','rid','data','untrusted']);
    expect(contract.components.schemas.Error.required).toEqual(['ok','rid','error']);
  });
  it('documents filter, cursor, field, full mode and strict paging inputs', () => {
    const taskParams = contract.paths['/api/bot/v1/tasks'].get.parameters;
    for (const name of ['project','state','priority','due_before','q','since','fields','limit','cursor']) expect(taskParams.some((p: {name?:string;$ref?:string}) => p.name===name || p.$ref?.endsWith('/'+name))).toBe(true);
    expect(taskParams.find((p: {name?:string}) => p.name==='project').required).toBe(true);
    expect(contract.components.parameters.limit.schema.maximum).toBe(100);
    expect(contract.paths['/api/bot/v1/tasks/{id}'].get.parameters.find((p: {name?:string})=>p.name==='full').schema.enum).toEqual(['1']);
  });
  it('keeps examples neutral and never contains real credentials', () => {
    const source = JSON.stringify(contract);
    expect(source.includes('bot-a')).toBe(true);
    expect(/rsb_live_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}/.test(source)).toBe(false);
  });
});
