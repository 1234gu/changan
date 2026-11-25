import { test, expect } from '@playwright/test';

// 2026-11-25 consolidation: four task pages, node scope inside task creation, legacy links.
const candidates = {
  target_node: 'thor2', duration_ms: 0.2, workflow_id: 'video-analysis',
  candidates: [
    {node_id: 'thor2', eligible: true, reasons: [], score: 1.2, estimate_source: '实测推理吞吐',
     pool: {mode: 'enforce', state: 'BOUND', pool_node_id: 'p-2', node_name: 'Thor-2', reasons: []}},
    {node_id: 'thor3', eligible: false, reasons: ['资源池：管理员已暂停调度', '执行槽已占用或预留'], score: 3,
     pool: {mode: 'enforce', state: 'BOUND', pool_node_id: 'p-3', node_name: 'Thor-3', reasons: ['资源池：管理员已暂停调度']}},
  ],
};
const stats = {
  days: 14, timezone: 'Asia/Shanghai', definition: '成功率=成功/(成功+失败+超时)',
  rows: [{day: '2026-11-25', workflow_id: 'aerial-mapping-odx', total: 2, succeeded: 1, failed: 1, timed_out: 0, canceled: 0, active: 0, periodic: 1, success_rate: 0.5}],
  by_workflow: [{workflow_id: 'aerial-mapping-odx', total: 2, succeeded: 1, failed: 1, timed_out: 0, canceled: 0, active: 0, periodic: 1, success_rate: 0.5}],
};

async function mockApi(page, posted) {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;
    if (path === '/api/alerts') return route.fulfill({json: {summary: {unread: 0, open: 0, total: 0}, items: [], total: 0}});
    if (path === '/api/alerts/rules') return route.fulfill({json: []});
    if (path === '/api/overview/tasks') return route.fulfill({json: {totals: {}, total: 0, page: 1, pages: 1, items: []}});
    if (path === '/api/overview/statistics') return route.fulfill({json: stats});
    if (path === '/api/overview') return route.fulfill({json: {totals: {}, nodes: [], daily: []}});
    if (path === '/api/tasks' && method === 'GET') return route.fulfill({json: []});
    if (path === '/api/tasks' && method === 'POST') {
      posted.push(route.request().postDataJSON());
      return route.fulfill({json: {id: 'task_new', task: {}}});
    }
    if (path === '/api/applications') return route.fulfill({json: [{id: 'video-analysis', name: '视频分析', enabled: true}, {id: 'aerial-mapping-odx', name: '航拍建图', enabled: true}]});
    if (path === '/api/configs/algorithm') return route.fulfill({json: [{id: 'resource_aware', name: '资源与网络感知', body: {method: 'resource_aware', weights: {compute: 1}}}, {id: 'round_robin', name: '可行节点轮询', body: {method: 'round_robin'}}]});
    if (path === '/api/v1/clusters') return route.fulfill({json: {items: [{id: 'changan', name: '长安车群'}]}});
    if (path === '/api/scheduling/candidates') return route.fulfill({json: candidates});
    if (path === '/api/datasets') return route.fulfill({json: []});
    if (path === '/api/node-incidents') return route.fulfill({json: []});
    if (path === '/api/strategies') return route.fulfill({json: [{id: 'strategy_1', name: '夜间建图', kind: 'periodic', interval_seconds: 3600, enabled: 1, next_run: 1, last_run: null, params: {workflow_id: 'aerial-mapping-odx', algorithm: 'resource_aware', source: 'dataset_x', node_ids: []}}]});
    return route.fulfill({status: 404, json: {detail: 'not mocked: ' + path}});
  });
}

test('任务侧收敛为四个栏目，并展示调用统计', async ({page}) => {
  await mockApi(page, []);
  await page.goto('/');
  const nav = page.locator('.sidebar nav button');
  await expect(nav).toHaveCount(4);
  for (const [i, name] of ['运行总览', '任务中心', '调度策略', '告警与恢复'].entries()) await expect(nav.nth(i)).toContainText(name);
  await expect(page.getByText('候选节点筛选')).toHaveCount(0);
  await expect(page.getByRole('heading', {name: '调用统计'})).toBeVisible();
  await expect(page.locator('.stat-cards')).toContainText('航拍建图');
  await expect(page.locator('.stat-cards')).toContainText('成功率 50.0%');
  await page.getByRole('button', {name: '调度策略'}).click();
  await expect(page.getByRole('cell', {name: '航拍建图'})).toBeVisible();
  await page.getByRole('tab', {name: '调度算法'}).click();
  await expect(page.getByRole('heading', {name: '调度算法管理'})).toBeVisible();
  await expect(page.getByText('API连接器')).toHaveCount(0);
});

test('旧链接进入合并后的栏目', async ({page}) => {
  await mockApi(page, []);
  await page.goto('/?page=incidents');
  await expect(page.getByRole('tab', {name: '节点失联与任务核对'})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', {name: '节点失联与任务核对'})).toBeVisible();
  await page.goto('/?page=compare');
  await expect(page.getByRole('tab', {name: '运行对比'})).toHaveAttribute('aria-selected', 'true');
  await page.goto('/?page=workflow');
  await expect(page.getByRole('tab', {name: '调度算法'})).toHaveAttribute('aria-selected', 'true');
});

test('新建任务时自动或手动选定节点，并显示两阶段排除原因', async ({page}) => {
  const posted = [];
  await mockApi(page, posted);
  await page.goto('/?page=tasks');
  await page.getByRole('button', {name: '新建任务'}).click();
  const scope = page.getByRole('region', {name: '执行节点选定'});
  await expect(scope.getByRole('row', {name: /thor2/})).toContainText('当前首选');
  await expect(scope.getByRole('row', {name: /thor3/})).toContainText('资源池 · 管理员已暂停调度');
  await expect(scope.getByRole('row', {name: /thor3/})).toContainText('执行侧 · 执行槽已占用或预留');
  await expect(scope.getByRole('row', {name: /thor2/}).getByRole('link', {name: '资源池节点详情'})).toHaveAttribute('href', '/pool/nodes/p-2');
  await scope.getByRole('radio', {name: '手动指定'}).click();
  const submit = page.getByRole('button', {name: /创建并运行/});
  await expect(submit).toBeDisabled();
  await scope.getByRole('checkbox', {name: '指定 thor3'}).check();
  await expect(scope).toContainText('其中 1 个当前不满足条件');
  await scope.getByRole('checkbox', {name: '指定 thor2'}).check();
  await scope.getByLabel('能力标签').fill('accelerator:nvidia, region:cq');
  await scope.getByLabel('资源池集群').selectOption('changan');
  await submit.click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].node_ids).toEqual(['thor3', 'thor2']);
  expect(posted[0].pool_labels).toEqual(['accelerator:nvidia', 'region:cq']);
  expect(posted[0].pool_cluster_id).toBe('changan');
});

test('资源需求查询带入的节点范围预填到新建任务', async ({page}) => {
  await mockApi(page, []);
  await page.goto('/?page=tasks&new=video-analysis&nodes=thor3');
  const scope = page.getByRole('region', {name: '执行节点选定'});
  await expect(scope.getByRole('radio', {name: '手动指定'})).toHaveAttribute('aria-checked', 'true');
  await expect(scope.getByRole('checkbox', {name: '指定 thor3'})).toBeChecked();
  await expect(scope.getByRole('checkbox', {name: '指定 thor2'})).not.toBeChecked();
});
