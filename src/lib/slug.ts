// Slugs aren't stored — they're derived from the name on every request, so a
// rename just works without a separate "regenerate slug" step. Trade-off:
// renaming a project changes its URL; an old link 404s into the "not found,
// redirect to Today" fallback the project page already has, rather than
// erroring.
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'project';
}

// Disambiguates by id (creation order), not list position, so a drag
// reorder can't silently shift which project owns a bare slug.
export function withSlugs<T extends { id: number; name: string }>(projects: T[]): (T & { slug: string })[] {
  const byId = [...projects].sort((a, b) => a.id - b.id);
  const counts = new Map<string, number>();
  const slugById = new Map<number, string>();
  for (const p of byId) {
    const base = slugify(p.name);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    slugById.set(p.id, n === 1 ? base : `${base}-${n}`);
  }
  return projects.map((p) => ({ ...p, slug: slugById.get(p.id)! }));
}
