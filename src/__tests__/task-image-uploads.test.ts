import { describe, expect, it } from 'vitest';
import { isAllowedTaskImageUpload, taskImageExtension } from '@/lib/task-image-uploads';

describe('task image upload validation', () => {
  it('allows jpg, jpeg, and png image files', () => {
    expect(isAllowedTaskImageUpload({ name: 'screen.jpg', type: 'image/jpeg' })).toBe(true);
    expect(isAllowedTaskImageUpload({ name: 'screen.jpeg', type: 'image/jpeg' })).toBe(true);
    expect(isAllowedTaskImageUpload({ name: 'screen.png', type: 'image/png' })).toBe(true);
  });

  it('rejects unsupported image formats and mismatched mime types', () => {
    expect(isAllowedTaskImageUpload({ name: 'screen.gif', type: 'image/gif' })).toBe(false);
    expect(isAllowedTaskImageUpload({ name: 'screen.webp', type: 'image/webp' })).toBe(false);
    expect(isAllowedTaskImageUpload({ name: 'screen.jpg', type: 'image/gif' })).toBe(false);
    expect(isAllowedTaskImageUpload({ name: 'screen', type: 'image/png' })).toBe(false);
  });

  it('normalizes filename extensions', () => {
    expect(taskImageExtension('SCREEN.PNG')).toBe('png');
    expect(taskImageExtension('archive')).toBe('');
  });
});
