import { expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/** Opens the app as a brand-new dev user so every test starts from the default workspace. */
export async function openApp(page: Page): Promise<string> {
  const user = randomUUID();
  await page.goto(`/?devUser=${user}`);
  await expect(page.getByTestId('panel-v-dropbox')).toBeVisible();
  return user;
}

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local date keys for the current Monday-start week (runner TZ = browser TZ). */
export function weekDates(now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const keys = Array.from({ length: 7 }, (_, i) => key(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const [mon, tue, wed, thu, fri, sat, sun] = keys;
  return { mon, tue, wed, thu, fri, sat, sun, keys };
}

type Offset = { x?: number; y?: number };

/** Pointer-driven drag that dnd-kit's PointerSensor recognizes (needs >4px movement first). */
export async function drag(page: Page, source: Locator, target: Locator, opts: { sourceOffset?: Offset; targetOffset?: Offset } = {}) {
  // Center the target so the release point is outside dnd-kit's auto-scroll edge bands.
  await target.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  const sx = s.x + (opts.sourceOffset?.x ?? s.width / 2);
  const sy = s.y + (opts.sourceOffset?.y ?? s.height / 2);
  const tx = t.x + (opts.targetOffset?.x ?? t.width / 2);
  const ty = t.y + (opts.targetOffset?.y ?? t.height / 2);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 8, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 15 });
  // dnd-kit may auto-scroll a container while the pointer crosses its edge on the way in.
  // Re-aim at the target's current position before releasing, as a person following the ghost would.
  const t2 = (await target.boundingBox())!;
  await page.mouse.move(t2.x + (opts.targetOffset?.x ?? t2.width / 2), t2.y + (opts.targetOffset?.y ?? t2.height / 2), { steps: 2 });
  await page.mouse.up();
}

/** Panel drags: dock zones only exist after the drag starts, so measure them mid-drag. */
export async function dragPanel(page: Page, header: Locator, zone: () => Locator) {
  const h = (await header.boundingBox())!;
  await page.mouse.move(h.x + 40, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + h.height / 2 + 10, { steps: 4 });
  await expect(zone()).toBeVisible();
  const z = (await zone().boundingBox())!;
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 15 });
  await page.mouse.up();
}

const realId = (prefix: string) => new RegExp(`^${prefix}-(?!tmp-)`);

export async function itemIdOf(row: Locator): Promise<string> {
  await expect(row).toHaveAttribute('data-testid', realId('item-row'));
  return (await row.getAttribute('data-testid'))!.replace('item-row-', '');
}

export async function blockIdOf(block: Locator): Promise<string> {
  await expect(block).toHaveAttribute('data-testid', realId('calendar-block'));
  return (await block.getAttribute('data-testid'))!.replace('calendar-block-', '');
}

export const isPut = (path: string) => (r: { url(): string; request(): { method(): string } }) =>
  r.url().endsWith(path) && r.request().method() === 'PUT';
