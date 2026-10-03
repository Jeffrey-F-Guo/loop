import type { DropboxFilter } from '../../api/types';
import { DROPBOX_FILTER_LABELS } from '../../domain/scheduling';
import { Menu } from '../../ui/Menu';
import { tokens } from '../../ui/tokens';

const ORDER: DropboxFilter[] = ['all', 'unscheduled', 'scheduled', 'completed'];

export function FilterMenu({ value, onChange }: { value: DropboxFilter; onChange: (f: DropboxFilter) => void }) {
  return (
    <Menu
      trigger={({ toggle }) => (
        <button
          data-testid="dropbox-filter"
          data-filter={value}
          onClick={toggle}
          style={{ border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted, fontSize: tokens.font.size.sm }}
        >
          {DROPBOX_FILTER_LABELS[value]} ▾
        </button>
      )}
      items={ORDER.map((f) => ({
        key: f,
        label: DROPBOX_FILTER_LABELS[f],
        checked: f === value,
        testID: `dropbox-filter-option-${f}`,
        onSelect: () => onChange(f),
      }))}
    />
  );
}
