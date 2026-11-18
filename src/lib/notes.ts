import { getCollection } from 'astro:content';

// Notes that are visible: published ones in production, all of them in `npm run dev`.
// When this is empty, the Notes section, nav item and command-palette entry are hidden.
export const visibleNotes = async () =>
  (await getCollection('notes', (n) => import.meta.env.DEV || !n.data.draft)).sort(
    (a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0),
  );
