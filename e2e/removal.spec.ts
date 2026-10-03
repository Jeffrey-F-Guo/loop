import { expect, test } from '@playwright/test';
import { blockIdOf, drag, itemIdOf, openApp, weekDates } from './helpers';

test('each view removes only what it manages, and the Timeline sums scheduled time', async ({ page }) => {
  const { mon, tue, wed, fri } = weekDates();
  await openApp(page);
  page.on('dialog', (d) => void d.accept());
  const dropbox = page.getByTestId('panel-v-dropbox');
  const timeline = page.getByTestId('panel-v-timeline');
  const calendar = page.getByTestId('panel-v-calendar');

  await dropbox.getByTestId('dropbox-input').fill('Lab report');
  await dropbox.getByTestId('dropbox-input').press('Enter');
  const row = dropbox.getByTestId(/^item-row-/).filter({ hasText: 'Lab report' });
  const id = await itemIdOf(row);

  // Timeline range Mon → Fri, then two one-hour Calendar entries.
  await drag(page, row, timeline.getByTestId(`timeline-day-${mon}`));
  const bar = timeline.getByTestId(`timeline-bar-${id}`);
  await drag(page, timeline.getByTestId(`timeline-bar-right-${id}`), timeline.getByTestId(`timeline-day-${fri}`));
  await expect(bar).toHaveAttribute('data-deadline-date', fri);
  await drag(page, row, calendar.getByTestId(`calendar-slot-${tue}-1900`), { targetOffset: { y: 2 } });
  const tueBlock = calendar.getByTestId(`calendar-day-${tue}`).getByTestId(/^calendar-block-(?!resize-)/);
  const tueId = await blockIdOf(tueBlock);
  await drag(page, row, calendar.getByTestId(`calendar-slot-${wed}-1900`), { targetOffset: { y: 2 } });
  const wedBlock = calendar.getByTestId(`calendar-day-${wed}`).getByTestId(/^calendar-block-(?!resize-)/);
  const wedId = await blockIdOf(wedBlock);

  // The Timeline shows the total scheduled time; the task is listed under Scheduled.
  await expect(timeline.getByTestId(`timeline-time-${id}`)).toHaveText('2h');
  await expect(dropbox.getByTestId('dropbox-section-scheduled').getByTestId(`item-row-${id}`)).toBeVisible();

  // Calendar: removing an entry removes only that entry.
  await calendar.getByTestId(`calendar-block-${tueId}`).click();
  await page.getByTestId('item-remove-block').click();
  await expect(calendar.getByTestId(`calendar-block-${tueId}`)).toHaveCount(0);
  await expect(calendar.getByTestId(`calendar-block-${wedId}`)).toBeVisible();
  await expect(timeline.getByTestId(`timeline-time-${id}`)).toHaveText('1h');
  await expect(bar).toHaveAttribute('data-open-date', mon);

  // Timeline: removing clears the range and every entry; the task stays, now under Not scheduled.
  await bar.getByText('Lab report').click();
  await page.getByTestId('item-remove-from-timeline').click();
  await expect(bar).toHaveCount(0);
  await expect(calendar.getByTestId(`calendar-block-${wedId}`)).toHaveCount(0);
  await expect(dropbox.getByTestId('dropbox-section-unscheduled').getByTestId(`item-row-${id}`)).toBeVisible();

  // All of it was saved.
  await page.reload();
  await expect(page.getByTestId('dropbox-section-unscheduled').getByTestId(`item-row-${id}`)).toBeVisible();
  await expect(page.getByTestId(`timeline-bar-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(/^calendar-block-(?!resize-)/)).toHaveCount(0);

  // Task list: Delete removes the task itself.
  await page.getByTestId(`item-row-${id}`).getByText('Lab report').click();
  await page.getByTestId('item-delete').click();
  await expect(page.getByTestId(`item-row-${id}`)).toHaveCount(0);
});
