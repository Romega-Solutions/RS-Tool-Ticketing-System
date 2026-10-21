import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const layout = readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8');

function pngSize(file: string) {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('browser tab icon', () => {
  it('every icon referenced in the root layout exists in public/', () => {
    const urls = [...layout.matchAll(/"(\/images\/[^"]+\.(?:png|ico))"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(existsSync(path.join(root, 'public', url)), url).toBe(true);
    }
  });

  it('no longer points the tab icon at the old R/S favicon', () => {
    expect(layout).not.toContain('/images/rs-favicon.ico');
    expect(layout).not.toMatch(/icon:[\s\S]*"\/images\/rs-icon\.png"[\s\S]*openGraph/);
  });

  it('ships square PNG icons at the declared sizes', () => {
    expect(pngSize(path.join(root, 'public/images/rs-tab-icon.png'))).toEqual({ width: 192, height: 192 });
    expect(pngSize(path.join(root, 'public/images/rs-apple-icon.png'))).toEqual({ width: 180, height: 180 });
    expect(pngSize(path.join(root, 'src/app/icon.png'))).toEqual({ width: 192, height: 192 });
  });

  it('favicon.ico files contain 16, 32 and 48px images', () => {
    for (const f of ['public/images/rs-tab-favicon.ico', 'src/app/favicon.ico']) {
      const buf = readFileSync(path.join(root, f));
      expect(buf.readUInt16LE(2)).toBe(1); // ICO type
      const count = buf.readUInt16LE(4);
      const sizes = Array.from({ length: count }, (_, i) => buf[6 + i * 16] || 256);
      expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
    }
  });
});
