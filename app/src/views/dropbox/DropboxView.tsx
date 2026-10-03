import { useMemo } from 'react';
import { useItems } from '../../api/items';
import type { DropboxFilter } from '../../api/types';
import { filterItems } from '../../domain/scheduling';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { CaptureInput } from './CaptureInput';
import { FilterMenu } from './FilterMenu';
import { ItemRow } from './ItemRow';

export function DropboxView({ viewId, config, setConfig }: ViewProps<{ filter: DropboxFilter }>) {
  const { data: items = [], isLoading } = useItems();
  const visible = useMemo(() => filterItems(items, config.filter), [items, config.filter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
        <FilterMenu value={config.filter} onChange={(filter) => setConfig({ filter })} />
      </div>
      <div style={{ padding: '6px 12px 8px' }}>
        <CaptureInput />
      </div>
      <div data-drop-clip style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 4px 12px' }}>
        {visible.map((item) => <ItemRow key={item.id} item={item} viewId={viewId} />)}
        {!isLoading && visible.length === 0 && (
          <div data-testid="dropbox-empty" style={{ padding: '24px 12px', color: tokens.color.muted, fontSize: tokens.font.size.sm }}>
            <div>Nothing here yet.</div>
            <div style={{ marginTop: 4, color: tokens.color.faint }}>Add something whenever it comes up.</div>
          </div>
        )}
      </div>
    </div>
  );
}
