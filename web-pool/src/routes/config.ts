export const ROUTES = {
  dashboard: '/',
  console: '/console',
  nodes: '/nodes',
  nodeDetail: '/nodes/:nodeId',
  computePool: '/compute-pool',
  clusters: '/clusters',
  clusterDetail: '/clusters/:clusterId',
  scheduling: '/scheduling',
  workloads: '/workloads',
  network: '/network',
  storage: '/storage',
  monitoring: '/monitoring',
} as const;

export const buildNodeDetailPath = (nodeId: string) =>
  `${ROUTES.nodes}/${encodeURIComponent(nodeId)}`;

export const buildClusterDetailPath = (clusterId: string) =>
  `${ROUTES.clusters}/${encodeURIComponent(clusterId)}`;

interface ComputePoolRouteOptions {
  nodeId?: string;
  resourceType?: 'cpu' | 'gpu' | 'npu' | 'dla';
}

export const buildComputePoolPath = (options: ComputePoolRouteOptions = {}) => {
  const params = new URLSearchParams();
  if (options.nodeId) params.set('node', options.nodeId);
  if (options.resourceType) params.set('resource', options.resourceType);
  const search = params.toString();
  return search ? `${ROUTES.computePool}?${search}` : ROUTES.computePool;
};

export const NAVIGATION_ITEMS = [
  { id: 'dashboard', path: ROUTES.dashboard, label: '资源池总览' },
  { id: 'nodes', path: ROUTES.nodes, label: '节点管理' },
  { id: 'computePool', path: ROUTES.computePool, label: '算力池' },
  { id: 'clusters', path: ROUTES.clusters, label: '集群管理' },
  { id: 'scheduling', path: ROUTES.scheduling, label: '资源需求查询' },
] as const;

// Task-side pages (scheduler ownership). Node administration stays in the pool menu above.
export const TASK_PAGES = [
  { id: 'overview', label: '运行总览' },
  { id: 'tasks', label: '任务中心' },
  { id: 'policies', label: '调度策略' },
  { id: 'alerts', label: '告警与恢复' },
] as const;

/** Page ids removed on 2026-11-25, kept routable so old links and evidence still open. */
export const LEGACY_TASK_PAGES: Record<string, string> = {
  candidates: 'tasks',
  compare: 'tasks',
  workflow: 'policies',
  strategies: 'policies',
  incidents: 'alerts',
  nodes: 'nodes',
};

export function consolePath(page: string, task?: string) {
  const search = new URLSearchParams({ page });
  if (task) search.set('task', task);
  return `/console?${search}`;
}

export function consolePage(search: string) {
  const params = new URLSearchParams(search);
  const page = params.get('page');
  if (page === 'detail') return params.get('task') ? 'detail' : 'tasks';
  const current = page && LEGACY_TASK_PAGES[page] ? LEGACY_TASK_PAGES[page] : page;
  return TASK_PAGES.find(item => item.id === current)?.id ?? (current === 'nodes' ? 'nodes' : 'overview');
}

export type NavigationItemId = (typeof NAVIGATION_ITEMS)[number]['id'];

/** Open the task-creation form with a resource-pool selected execution-node scope. */
export function newTaskPath(template: 'video-analysis' | 'aerial-mapping-odx', executionNodeIds: string[]) {
  const search = new URLSearchParams({ page: 'tasks', new: template });
  if (executionNodeIds.length) search.set('nodes', executionNodeIds.join(','));
  return `/console?${search}`;
}
