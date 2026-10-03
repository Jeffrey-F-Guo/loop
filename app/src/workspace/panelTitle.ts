import type { ViewInstance } from '../api/types';
import { DROPBOX_FILTER_LABELS } from '../domain/scheduling';

export function panelTitle(view: ViewInstance): string {
  switch (view.type) {
    case 'dropbox':
      return `Dropbox · ${DROPBOX_FILTER_LABELS[view.config.filter]}`;
    case 'calendar':
      return 'Calendar';
    case 'timeline':
      return 'Timeline';
  }
}
