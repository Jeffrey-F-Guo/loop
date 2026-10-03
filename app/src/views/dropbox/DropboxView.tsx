import { useMemo } from 'react';
import { useItems } from '../../api/items';
import type { DropboxSection } from '../../api/types';
import { DROPBOX_SECTION_LABELS, DROPBOX_SECTIONS, sectionItems, toggleSection } from '../../domain/scheduling';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { CaptureInput } from './CaptureInput';
import { ItemRow } from './ItemRow';

function SectionToggles({ value, onChange }: { value: DropboxSection[]; onChange: (s: DropboxSection[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {DROPBOX_SECTIONS.map((s) => {
        const on = value.includes(s);
        const locked = on && value.length === 1;
        return (
          <button
            key={s}
            data-testid={`dropbox-section-toggle-${s}`}
            aria-pressed={on}
            title={locked ? 'At least one list stays shown' : undefined}
            onClick={() => !locked && onChange(toggleSection(value, s))}
            style={{
              padding: '2px 8px', borderRadius: 999, fontSize: tokens.font.size.xs, fontWeight: 500,
              border: `1px solid ${on ? tokens.color.accent : tokens.color.border}`,
              background: on ? tokens.color.accentSoft : 'transparent',
              color: on ? tokens.color.text : tokens.color.muted,
              cursor: locked ? 'default' : 'pointer',
            }}
          >
            {DROPBOX_SECTION_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

export function DropboxView({ viewId, config, setConfig }: ViewProps<{ sections: DropboxSection[] }>) {
  const { data: items = [], isLoading } = useItems();
  const sections = useMemo(
    () => DROPBOX_SECTIONS.filter((s) => config.sections.includes(s)).map((s) => ({ s, items: sectionItems(items, s) })),
    [items, config.sections],
  );
  const empty = sections.every((x) => x.items.length === 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 12px 0' }}>
        <SectionToggles value={config.sections} onChange={(next) => setConfig({ sections: next })} />
      </div>
      <div style={{ padding: '8px 12px 8px' }}>
        <CaptureInput />
      </div>
      <div data-drop-clip style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 4px 12px' }}>
        {!isLoading && empty ? (
          <div data-testid="dropbox-empty" style={{ padding: '24px 12px', color: tokens.color.muted, fontSize: tokens.font.size.sm }}>
            <div>Nothing here yet.</div>
            <div style={{ marginTop: 4, color: tokens.color.faint }}>Add something whenever it comes up.</div>
          </div>
        ) : (
          sections.map(({ s, items: list }) => (
            <section key={s} data-testid={`dropbox-section-${s}`} style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex', gap: 6, padding: '6px 8px 2px', fontSize: tokens.font.size.xs, color: tokens.color.muted,
                  textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
                }}
              >
                <span>{DROPBOX_SECTION_LABELS[s]}</span>
                <span style={{ color: tokens.color.faint }}>{list.length}</span>
              </div>
              {list.map((item) => <ItemRow key={item.id} item={item} viewId={viewId} />)}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
