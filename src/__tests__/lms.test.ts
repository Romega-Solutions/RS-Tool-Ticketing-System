import { describe, it, expect } from 'vitest';
import { userInCourseAudience, canMarkComplete, type LmsCourse } from '@/lib/lms';

// Reusable course factory — only the fields the audience selector reads.
function course(scope: 'foundation' | 'department' | 'intern', department: string | null = null): LmsCourse {
  return {
    id: 1, title: 'X', description: null, scope, department,
    coverImageUrl: null, isPublished: 1, enforcement: 'soft', sortOrder: 0,
    createdAt: '', updatedAt: '',
  };
}

describe('userInCourseAudience — foundation', () => {
  it('includes every role', () => {
    const c = course('foundation');
    for (const role of ['ic', 'lead', 'admin', 'intern'] as const) {
      expect(userInCourseAudience(c, { userId: 1, role, team: 'Whatever' })).toBe(true);
    }
  });

  it('ignores team', () => {
    expect(userInCourseAudience(course('foundation'),
      { userId: 1, role: 'ic', team: null })).toBe(true);
  });
});

describe('userInCourseAudience — intern', () => {
  it('matches normalized intern role only', () => {
    const c = course('intern');
    expect(userInCourseAudience(c, { userId: 1, role: 'intern', team: 'X' })).toBe(true);
    expect(userInCourseAudience(c, { userId: 1, role: 'ic',     team: 'X' })).toBe(false);
    expect(userInCourseAudience(c, { userId: 1, role: 'lead',   team: 'X' })).toBe(false);
    expect(userInCourseAudience(c, { userId: 1, role: 'admin',  team: 'X' })).toBe(false);
  });
});

describe('userInCourseAudience — department', () => {
  it('matches exact team name', () => {
    const c = course('department', 'Recruitment');
    expect(userInCourseAudience(c, { userId: 1, role: 'ic', team: 'Recruitment' })).toBe(true);
  });

  it('rejects different team', () => {
    const c = course('department', 'Recruitment');
    expect(userInCourseAudience(c, { userId: 1, role: 'ic', team: 'Design' })).toBe(false);
  });

  it('rejects null team when course requires a department', () => {
    const c = course('department', 'Recruitment');
    expect(userInCourseAudience(c, { userId: 1, role: 'ic', team: null })).toBe(false);
  });

  it('does NOT match when the course department is missing (defensive)', () => {
    // Should be impossible per the CHECK constraint, but the selector
    // refuses anyway — never silently grant access to a malformed row.
    const c = course('department', null);
    expect(userInCourseAudience(c, { userId: 1, role: 'ic', team: 'Recruitment' })).toBe(false);
  });
});

describe('canMarkComplete — lesson-type gate', () => {
  it('text lessons unlock immediately', () => {
    expect(canMarkComplete({ lessonType: 'text',  watchedToEnd: false })).toBe(true);
    expect(canMarkComplete({ lessonType: 'text',  watchedToEnd: true  })).toBe(true);
  });

  it('video lessons require watchedToEnd', () => {
    expect(canMarkComplete({ lessonType: 'video', watchedToEnd: false })).toBe(false);
    expect(canMarkComplete({ lessonType: 'video', watchedToEnd: true  })).toBe(true);
  });

  it('mixed lessons require watchedToEnd (matches video)', () => {
    expect(canMarkComplete({ lessonType: 'mixed', watchedToEnd: false })).toBe(false);
    expect(canMarkComplete({ lessonType: 'mixed', watchedToEnd: true  })).toBe(true);
  });
});
