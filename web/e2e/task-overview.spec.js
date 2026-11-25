import { test, expect } from '@playwright/test';

test('在途任务和历史记录可翻页，刷新保留页码', async ({ page }) => {
  const rows = Array.from({length: 21}, (_, i) => ({
    id: String(i), name: '夹具任务 ' + i, status: i ? 'SUCCEEDED' : 'RUNNING',
    created: 1, completed: i ? 2 : 1, total: 2, params: {algorithm: 'resource_aware'},
  }));
  await page.route('**/api/alerts?**', route => route.fulfill({
    json: {summary: {unread: 0}, items: []},
  }));
  await page.route('**/api/overview/tasks?**', route => {
    const number = Number(new URL(route.request().url()).searchParams.get('page'));
    return route.fulfill({json: {
      totals: {RUNNING: 1, SUCCEEDED: 20}, total: 21, page: number, pages: 2,
      items: number === 1 ? rows.slice(0, 20) : rows.slice(20),
    }});
  });
  await page.goto('/');
  const list = page.locator('.task-table');
  await expect(list.locator('tbody tr')).toHaveCount(20);
  await expect(list.locator('tbody tr').first()).toContainText('执行中');
  await expect(page.getByRole('heading', {name: '执行节点'})).toHaveCount(0);
  await page.getByRole('button', {name: '下一页'}).click();
  await expect(list.locator('tbody tr')).toHaveCount(1);
  const refreshed = page.waitForResponse(r => r.url().endsWith('/api/overview/tasks?page=2'));
  await page.getByRole('button', {name: '刷新', exact: true}).click();
  await refreshed;
  await expect(list.getByRole('button', {name: '查看详情：夹具任务 20'})).toBeVisible();
  await expect(page.getByRole('button', {name: '下一页'})).toBeDisabled();
  await page.getByRole('button', {name: '上一页'}).click();
  await expect(list.locator('tbody tr')).toHaveCount(20);
});
