import { describe, expect, it } from 'vitest';
import { slugify, withSlugs } from '../src/lib/slug';

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Fitness Goals')).toBe('fitness-goals');
  });

  it('strips accents and punctuation', () => {
    expect(slugify('Café & Wérkplekken!')).toBe('cafe-werkplekken');
  });

  it('falls back to "project" for a name with nothing sluggable', () => {
    expect(slugify('   ')).toBe('project');
    expect(slugify('!!!')).toBe('project');
  });
});

describe('withSlugs', () => {
  it('disambiguates same-named projects with a numeric suffix', () => {
    const result = withSlugs([
      { id: 5, name: 'Fitness' },
      { id: 2, name: 'Fitness' },
    ]);
    expect(result.find((p) => p.id === 2)!.slug).toBe('fitness');
    expect(result.find((p) => p.id === 5)!.slug).toBe('fitness-2');
  });

  it('assigns the bare slug by id, independent of array order', () => {
    // id 2 is older (lower id) than id 5, so it should always get the bare
    // slug even when passed in the other order — a drag-reorder elsewhere
    // in the list must not shift which project owns a URL.
    const result = withSlugs([
      { id: 5, name: 'Fitness' },
      { id: 2, name: 'Fitness' },
    ]);
    const reversed = withSlugs([
      { id: 2, name: 'Fitness' },
      { id: 5, name: 'Fitness' },
    ]);
    expect(result.find((p) => p.id === 2)!.slug).toBe(reversed.find((p) => p.id === 2)!.slug);
    expect(result.find((p) => p.id === 5)!.slug).toBe(reversed.find((p) => p.id === 5)!.slug);
  });
});
