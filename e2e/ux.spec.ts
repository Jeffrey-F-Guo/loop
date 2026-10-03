import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('FEATURE_DESIGN §28: discoverable planning flow', async ({ page }) => {
  const { mon, tue, wed, thu, fri } = weekDates();
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  const timeline = page.getByTestId('panel-v-timeline');
  const calendar = page.getByTestId('panel-v-calendar');

  // 1. Type "Physics assignment" into Dropbox.
  await dropbox.getByTestId('dropbox-input').fill('Physics assignment');
  await dropbox.getByTestId('dropbox-input').press('Enter');
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Physics assignment' });
  const id = await itemIdOf(row);

  // 2. Drag it into Timeline (Monday) → one-day range.
  await drag(page, row, timeline.getByTestId(`timeline-day-${mon}`));
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await expect(bar).toHaveAttribute('data-open-date', mon);
  await expect(bar).toHaveAttribute('data-deadline-date', mon);

  // 3. Stretch it Monday → Friday.
  await drag(page, timeline.getByTestId(`timeline-bar-right-${id}`), timeline.getByTestId(`timeline-day-${fri}`));
  await expect(bar).toHaveAttribute('data-deadline-date', fri);
  await expect(bar).toHaveAttribute('data-open-date', mon);

  // 4. Drag it from Timeline into Tuesday on Calendar.
  await drag(page, bar.getByText('Physics assignment'), calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  await expect(calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-(?!resize-)/)).toHaveAttribute('data-start', `${tue}T19:00`);

  // 5. Drag it again into Thursday.
  await drag(page, bar.getByText('Physics assignment'), calendar.getByTestId(`calendar-slot-${thu}-1600`), { targetOffset: { y: 2 } });
  const thursday = calendar.getByTestId(`calendar-day-${thu}`).getByTestId(/^calendar-block-(?!resize-)/);
  await expect(thursday).toHaveAttribute('data-start', `${thu}T16:00`);
  const thursdayId = await blockIdOf(thursday);
  await expect(bar).toHaveAttribute('data-deadline-date', fri); // scheduling never changes the planning range

  // 6. Move Thursday's block to Wednesday.
  await drag(page, calendar.getByTestId(`calendar-block-${thursdayId}`), calendar.getByTestId(`calendar-slot-${wed}-1600`), {
    sourceOffset: { y: 6 },
    targetOffset: { y: 6 },
  });
  await expect(calendar.getByTestId(`calendar-day-${wed}`).getByTestId(`calendar-block-${thursdayId}`)).toHaveAttribute('data-start', `${wed}T16:00`);
  await expect(calendar.getByTestId(`calendar-day-${thu}`).getByTestId(/^calendar-block-(?!resize-)/)).toHaveCount(0);

  // 7. Mark Item complete.
  await row.getByText('Physics assignment').click();
  await page.getByTestId('item-done').click();
  await expect(page.getByTestId(`item-row-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveCount(0);
});
