import { format } from 'date-fns';
import type { Item } from '../../api/types';
import { daysBetween } from '../../domain/time';

function day(iso: string, now: Date): string {
  const d = new Date(iso);
  const ahead = daysBetween(now, d);
  return ahead >= 0 && ahead <= 6 ? format(d, 'EEE') : format(d, 'MMM d');
}

/** Secondary line for a Dropbox row (FEATURE_DESIGN §7). */
export function itemMeta(item: Item, now: Date): string {
  const parts: string[] = [];
  if (item.open_at && item.deadline_at) parts.push(`${day(item.open_at, now)} → ${day(item.deadline_at, now)}`);
  else if (item.deadline_at) parts.push(`Due ${day(item.deadline_at, now)}`);
  const n = item.work_block_count;
  if (n > 0) parts.push(`${n} block${n === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
