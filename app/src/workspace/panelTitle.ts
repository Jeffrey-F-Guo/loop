import type { ViewInstance } from '../api/types';

export function panelTitle(view: ViewInstance): string {
  switch (view.type) {
    case 'dropbox':
      return 'Dropbox';
    case 'calendar':
      return 'Calendar';
    case 'timeline':
      return 'Timeline';
  }
}
