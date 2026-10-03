import { useEffect } from 'react';
import { useItemsById } from '../../api/items';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { ItemDetail } from './ItemDetail';

export function ItemDetailHost() {
  const { itemId, anchor, source, close } = useItemDetailStore();
  const item = useItemsById().get(itemId ?? '');

  useEffect(() => {
    if (!itemId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [itemId, close]);

  if (!itemId || !item) return null;

  const width = 320;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  let left = (vw - width) / 2;
  let top = 80;
  if (anchor) {
    left = anchor.left + anchor.width + 8 + width <= vw ? anchor.left + anchor.width + 8 : Math.max(8, anchor.left - width - 8);
    top = Math.min(Math.max(8, anchor.top), vh - 420);
  }

  return (
    <>
      <div onMouseDown={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
      <div style={{ position: 'fixed', left, top, width, zIndex: 41 }}>
        <ItemDetail key={item.id} item={item} source={source} onClose={close} />
      </div>
    </>
  );
}
