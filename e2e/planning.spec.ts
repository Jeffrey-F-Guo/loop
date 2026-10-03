import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('Timeline bar gestures and the Calendar range rule work together', async ({ page }) => {
  const { mon, tue, wed, thu, fri } = weekDates();
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  const timeline = page.getByTestId('panel-v-timeline');
  const calendar = page.getByTestId('panel-v-calendar');

  await dropbox.getByTestId('dropbox-input').fill('Essay draft');
  await dropbox.getByTestId('dropbox-input').press('Enter');
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Essay draft' });
  const id = await itemIdOf(row);

  // Range Mon → Wed via drop + right-edge resize.
  await drag(page, row, timeline.getByTestId(`timeline-day-${mon}`));
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await drag(page, timeline.getByTestId(`timeline-bar-right-${id}`), timeline.getByTestId(`timeline-day-${wed}`));
  await expect(bar).toHaveAttribute('data-deadline-date', wed);

  // In range: Tue 7 PM gets a block.
  await drag(page, row, calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  const block = calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-(?!resize-)/);
  await expect(block).toHaveAttribute('data-start', `${tue}T19:00`);
  const blockId = await blockIdOf(block);

  // Out of range: Friday is shaded while dragging, shows no ghost, and the drop does nothing.
  const friSlot = calendar.getByTestId(`calendar-slot-${fri}-1900`);
  await friSlot.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const r = (await row.boundingBox())!;
  const f = (await friSlot.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width / 2 + 8, r.y + r.height / 2 + 8, { steps: 4 });
  await page.mouse.move(f.x + f.width / 2, f.y + 2, { steps: 15 });
  await expect(calendar.getByTestId(`calendar-day-${fri}`)).toHaveAttribute('data-out-of-range', 'true');
  await expect(calendar.getByTestId('calendar-ghost')).toHaveCount(0);
  await page.mouse.up();
  await expect(calendar.getByTestId(`calendar-day-${fri}`).getByTestId(/^calendar-block-(?!resize-)/)).toHaveCount(0);

  // Move the whole bar +2 days by dragging its body: it slides live (no chip), and the block moves with it.
  const monCol = (await timeline.getByTestId(`timeline-day-${mon}`).boundingBox())!;
  const wedCol = (await timeline.getByTestId(`timeline-day-${wed}`).boundingBox())!;
  const b = (await bar.boundingBox())!;
  const y = b.y + b.height / 2;
  await page.mouse.move(monCol.x + monCol.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(monCol.x + monCol.width / 2 + 8, y, { steps: 4 });
  await page.mouse.move(wedCol.x + wedCol.width / 2, y, { steps: 15 });
  await expect(bar).toHaveAttribute('data-preview-shift', '2');
  await expect(page.getByTestId('drag-chip')).toHaveCount(0);
  await page.mouse.up();
  await expect(bar).toHaveAttribute('data-open-date', wed);
  await expect(bar).toHaveAttribute('data-deadline-date', fri);
  await expect(calendar.getByTestId(`calendar-day-${thu}`).getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-start', `${thu}T19:00`);

  // The left edge cannot be pulled past the scheduled block (Thu), even when released on Fri.
  await drag(page, timeline.getByTestId(`timeline-bar-left-${id}`), timeline.getByTestId(`timeline-day-${fri}`));
  await expect(bar).toHaveAttribute('data-open-date', thu);

  // Everything was saved.
  await page.reload();
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveAttribute('data-open-date', thu);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveAttribute('data-deadline-date', fri);
  await expect(page.getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-start', `${thu}T19:00`);
});
