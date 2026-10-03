import type { DropboxFilter, DropboxSection, Item } from '../api/types';

export const isScheduled = (item: Item) => item.work_block_count > 0;

/** Display order of the Dropbox's sections. */
export const DROPBOX_SECTIONS: DropboxSection[] = ['scheduled', 'unscheduled', 'completed'];
export const DEFAULT_DROPBOX_SECTIONS: DropboxSection[] = ['scheduled', 'unscheduled'];

export const DROPBOX_SECTION_LABELS: Record<DropboxSection, string> = {
  scheduled: 'Scheduled',
  unscheduled: 'Not scheduled',
  completed: 'Completed',
};

/** The items one Dropbox section lists (FUNCTIONAL_SPEC §6). Preserves input order. */
export function sectionItems(items: Item[], section: DropboxSection): Item[] {
  switch (section) {
    case 'scheduled':
      return items.filter((i) => i.status === 'active' && isScheduled(i));
    case 'unscheduled':
      return items.filter((i) => i.status === 'active' && !isScheduled(i));
    case 'completed':
      return items.filter((i) => i.status === 'completed');
  }
}

/** Turns a section on or off, keeping display order. The last section shown stays on. */
export function toggleSection(sections: DropboxSection[], s: DropboxSection): DropboxSection[] {
  const on = new Set(sections);
  if (on.has(s)) {
    if (on.size === 1) return sections;
    on.delete(s);
  } else {
    on.add(s);
  }
  return DROPBOX_SECTIONS.filter((x) => on.has(x));
}

/** The sections equivalent to a pre-sections Dropbox filter. */
export const sectionsFromLegacyFilter = (f: DropboxFilter): DropboxSection[] =>
  f === 'all' ? [...DEFAULT_DROPBOX_SECTIONS] : [f];

/** 150 → "2h 30m", 45 → "45m", 120 → "2h". */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}
