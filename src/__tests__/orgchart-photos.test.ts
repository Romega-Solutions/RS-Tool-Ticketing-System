import { describe, it, expect } from 'vitest';
import { pickPhoto } from '@/lib/orgchart';

const BASE = 'https://tools.romega-solutions.com/org-chart';

const people = [
  { name: 'Mark Siazon',        email: 'mark@romega.com',  photoUrl: '/uploads/photos/mark.webp' },
  { name: 'Eliza Mae Perez',    email: 'eliza@romega.com', photoUrl: '/uploads/photos/eliza.webp' },
  { name: 'José Ng',            email: null,               photoUrl: 'https://cdn.example.com/jose.png' },
  { name: 'Robbie Galoso',      email: 'rob@romega.com',   photoUrl: null },
];

describe('pickPhoto', () => {
  it('matches by exact email and resolves a relative URL to absolute', () => {
    expect(pickPhoto(people, { email: 'MARK@romega.com', name: 'Anything' }))
      .toBe(`${BASE}/uploads/photos/mark.webp`);
  });

  it('passes through an already-absolute photo URL', () => {
    expect(pickPhoto(people, { name: 'José Ng' })).toBe('https://cdn.example.com/jose.png');
  });

  it('matches by normalized name when accents/case differ', () => {
    expect(pickPhoto(people, { name: 'jose ng' })).toBe('https://cdn.example.com/jose.png');
  });

  it('matches by first+last token, ignoring a middle name', () => {
    expect(pickPhoto(people, { name: 'Eliza Marie Perez' }))
      .toBe(`${BASE}/uploads/photos/eliza.webp`);
  });

  it('returns null for a matched person who has no photo (no fall-through)', () => {
    expect(pickPhoto(people, { email: 'rob@romega.com', name: 'Robbie Galoso' })).toBeNull();
  });

  it('returns null when nobody matches', () => {
    expect(pickPhoto(people, { name: 'Nonexistent Person', email: 'nope@x.com' })).toBeNull();
  });

  it('ignores 1-character name input', () => {
    expect(pickPhoto(people, { name: 'M' })).toBeNull();
  });

  it('returns null on an empty roster', () => {
    expect(pickPhoto([], { name: 'Mark Siazon', email: 'mark@romega.com' })).toBeNull();
  });
});
