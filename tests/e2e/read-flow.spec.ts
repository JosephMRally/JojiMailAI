/**
 * End-to-end read flow (user-stories/typescript_email_ui.md): a real browser
 * over the fake build's seeded demo mailbox (public/fixtures/fake-provider.json)
 * — demo tags in the sidebar, Refresh lists a tag's threads, opening a thread
 * shows its messages. No real account anywhere.
 */
import { expect, test } from '@playwright/test';

test('sidebar tags → Refresh → thread list → open thread → messages', async ({ page }) => {
  await page.goto('/');

  // The sidebar lists the demo tags straight from the seeded FakeProvider.
  const tags = page.getByRole('navigation', { name: 'Tags' });
  await expect(tags.getByRole('button', { name: 'Inbox' })).toBeVisible();
  await expect(tags.getByRole('button', { name: 'Starred' })).toBeVisible();

  // Select the demo inbox and pull its threads from the provider into the store.
  await tags.getByRole('button', { name: 'Inbox' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();

  const threads = page.getByLabel('Threads');
  await expect(
    threads.getByRole('button', { name: 'Company picnic planning' }),
  ).toBeVisible();

  // Opening the thread shows its messages, oldest first.
  await threads.getByRole('button', { name: 'Company picnic planning' }).click();
  await expect(
    page.getByRole('article', { name: 'Message from dana@example.com' }),
  ).toBeVisible();
  await expect(page.getByText('Shall we do the picnic on the 14th?')).toBeVisible();
});
