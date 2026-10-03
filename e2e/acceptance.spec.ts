import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('FUNCTIONAL_SPEC §20: full MVP lifecycle', async ({ page }) => {
  const { mon, tue, wed, fri } = weekDates();
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  const calendar = page.getByTestId('panel-v-calendar');
  const timeline = page.getByTestId('panel-v-timeline');

  // 1. User creates "Finish assignment".
  await dropbox.getByTestId('dropbox-input').fill('Finish assignment');
  await dropbox.getByTestId('dropbox-input').press('Enter');

  // 2. It appears in Dropbox.
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Finish assignment' });
  await expect(row).toBeVisible();
  const id = await itemIdOf(row);

  // 3–4. Monday as OpenAt, Friday as DeadlineAt.
  await row.getByText('Finish assignment').click();
  const detail = page.getByTestId('item-detail');
  await detail.getByTestId('item-open-date').fill(mon);
  await expect(timeline.getByTestId(`timeline-bar-${id}`)).toHaveCount(0); // open-only stays hidden
  await detail.getByTestId('item-deadline-date').fill(fri);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();

  // 5. Timeline displays Monday → Friday.
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', fri);

  // 6. Calendar is open alongside Timeline (default workspace).
  await expect(calendar).toBeVisible();

  // 7–8. Drag onto Tuesday 7 PM → one-hour WorkBlock.
  await drag(page, row, calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  const block = calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-(?!resize-)/);
  await expect(block).toHaveAttribute('data-start', `${tue}T19:00`);
  await expect(block).toHaveAttribute('data-end', `${tue}T20:00`);
  const blockId = await blockIdOf(block);

  // 9. Resize to two hours.
  const handle = calendar.getByTestId(`calendar-block-resize-${blockId}`);
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 48, { steps: 8 });
  await page.mouse.up();
  await expect(calendar.getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-end', `${tue}T21:00`);

  // 10. Duplicate Dropbox.
  await page.getByTestId('panel-menu-v-dropbox').click();
  await page.getByTestId('panel-menu-duplicate').click();
  const dropboxes = page.locator('[data-view-type="dropbox"]');
  await expect(dropboxes).toHaveCount(2);
  const a = dropboxes.nth(0);
  const b = dropboxes.nth(1);

  // 11–12. A = Unscheduled, B = Scheduled (and wait until that layout is saved).
  const layoutSaved = page.waitForResponse((r) => {
    const body = r.request().postData() ?? '';
    return r.url().endsWith('/api/v1/workspace') && r.request().method() === 'PUT' && body.includes('"unscheduled"') && body.includes('"scheduled"');
  });
  await a.getByTestId('dropbox-filter').click();
  await page.getByTestId('dropbox-filter-option-unscheduled').click();
  await b.getByTestId('dropbox-filter').click();
  await page.getByTestId('dropbox-filter-option-scheduled').click();

  // 13. Assignment appears under Scheduled only.
  await expect(b.getByTestId(`item-row-${id}`)).toBeVisible();
  await expect(a.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await layoutSaved;

  // 14. Drag the block to Wednesday (grab and drop 6px below the top edge).
  const blockSaved = page.waitForResponse((r) => r.url().includes(`/work-blocks/${blockId}`) && r.request().method() === 'PATCH');
  await drag(page, calendar.getByTestId(`calendar-block-${blockId}`), calendar.getByTestId(`calendar-slot-${wed}-1900`), {
    sourceOffset: { y: 6 },
    targetOffset: { y: 6 },
  });
  const moved = calendar.getByTestId(`calendar-day-${wed}`).getByTestId(`calendar-block-${blockId}`);
  await expect(moved).toHaveAttribute('data-start', `${wed}T19:00`);
  await expect(moved).toHaveAttribute('data-end', `${wed}T21:00`);
  await blockSaved;

  // 15. Timeline remains Monday → Friday.
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', fri);

  // 16–18. Close and reopen: layout and state restored.
  await page.reload();
  const reopened = page.locator('[data-view-type="dropbox"]');
  await expect(reopened).toHaveCount(2);
  await expect(reopened.nth(0).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'unscheduled');
  await expect(reopened.nth(1).getByTestId('dropbox-filter')).toHaveAttribute('data-filter', 'scheduled');
  await expect(reopened.nth(1).getByTestId(`item-row-${id}`)).toBeVisible();
  await expect(page.getByTestId(`calendar-block-${blockId}`)).toHaveAttribute('data-start', `${wed}T19:00`);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveAttribute('data-deadline-date', fri);

  // 19. Complete the Item.
  await reopened.nth(1).getByTestId(`item-complete-${id}`).click();

  // 20. Active Dropbox and Timeline views stop displaying it.
  await expect(page.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveCount(0);
});
