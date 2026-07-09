/**
 * Test for npm run build -- --provider=fake && npm run dev workflow.
 * Verifies that the build creates a working app with fake test emails visible.
 */
import { expect, test } from '@playwright/test';

test('npm run build --provider=fake && npm run dev shows fake test emails', async ({ page }) => {
  // Navigate to the app
  await page.goto('/');

  // Verify the sidebar loads with demo tags from the fake provider
  const tags = page.getByRole('navigation', { name: 'Tags' });
  await expect(tags.getByRole('button', { name: 'Inbox' })).toBeVisible();
  await expect(tags.getByRole('button', { name: 'Starred' })).toBeVisible();

  // Select Inbox and refresh to load threads from the fake provider
  await tags.getByRole('button', { name: 'Inbox' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();

  // Verify test emails appear in the thread list
  const threads = page.getByLabel('Threads');
  await expect(
    threads.getByRole('button', { name: 'Company picnic planning' }),
  ).toBeVisible();

  // Open a thread and verify its messages display
  await threads.getByRole('button', { name: 'Company picnic planning' }).click();
  await expect(
    page.getByRole('article', { name: 'Message from dana@example.com' }),
  ).toBeVisible();
  await expect(page.getByText('Shall we do the picnic on the 14th?')).toBeVisible();
});
