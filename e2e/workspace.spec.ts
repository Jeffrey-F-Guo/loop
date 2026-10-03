import { expect, test } from '@playwright/test';
import { dragPanel, openApp } from './helpers';

const box = async (page: import('@playwright/test').Page, id: string) => (await page.getByTestId(`panel-${id}`).boundingBox())!;

test('views can be moved, resized, closed, and added, and the arrangement survives reload', async ({ page }) => {
  await openApp(page);

  // Move: dock Timeline to the right of Calendar.
  await dragPanel(page, page.getByTestId('panel-header-v-timeline'), () => page.getByTestId('dock-zone-v-calendar-right'));
  await expect.poll(async () => (await box(page, 'v-timeline')).x).toBeGreaterThan((await box(page, 'v-calendar')).x);
  const sameRow = Math.abs((await box(page, 'v-timeline')).y - (await box(page, 'v-calendar')).y) < 4;
  expect(sameRow).toBe(true);

  // Resize: drag the first divider 120px to the right.
  const divider = page.locator('[data-testid^="divider-"]').first();
  const before = (await box(page, 'v-dropbox')).width;
  const d = (await divider.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2 + 120, d.y + d.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, 'v-dropbox')).width).toBeGreaterThan(before + 80);

  // Close Dropbox, add a new one.
  await page.getByTestId('panel-menu-v-dropbox').click();
  await page.getByTestId('panel-menu-close').click();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(0);
  const saved = page.waitForResponse((r) => r.url().endsWith('/api/v1/workspace') && r.request().method() === 'PUT' && (r.request().postData() ?? '').includes('"dropbox"'));
  await page.getByTestId('add-view').click();
  await page.getByTestId('add-view-dropbox').click();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(1);
  await saved;

  // Reload restores the arrangement.
  await page.reload();
  await expect(page.locator('[data-view-type="dropbox"]')).toHaveCount(1);
  await expect.poll(async () => (await box(page, 'v-timeline')).x).toBeGreaterThan((await box(page, 'v-calendar')).x);
});

test('the task list shows Scheduled and Not scheduled by default and can show all three lists', async ({ page }) => {
  await openApp(page);
  const dropbox = page.getByTestId('panel-v-dropbox');
  await expect(dropbox.getByTestId('dropbox-input')).toBeVisible();
  await dropbox.getByTestId('dropbox-input').fill('Tidy desk');
  await dropbox.getByTestId('dropbox-input').press('Enter');
  await expect(dropbox.getByTestId('dropbox-section-unscheduled').getByText('Tidy desk')).toBeVisible();
  await expect(dropbox.getByTestId('dropbox-section-scheduled')).toBeVisible();
  await expect(dropbox.getByTestId('dropbox-section-completed')).toHaveCount(0);

  const panel = (await dropbox.boundingBox())!;
  for (const s of ['scheduled', 'unscheduled', 'completed']) {
    const b = (await dropbox.getByTestId(`dropbox-section-toggle-${s}`).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(panel.x);
    expect(b.x + b.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
  await dropbox.getByTestId('dropbox-section-toggle-completed').click({ timeout: 3000 }); // must not be covered
  await expect(dropbox.getByTestId('dropbox-section-completed')).toBeVisible();
  await expect(dropbox.getByTestId(/^dropbox-section-(?!toggle-)/)).toHaveCount(3);
});
