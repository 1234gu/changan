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
  { id: 'scheduling', path: ROUTES.scheduling, label: '资源筛选与提交' },
] as const;

export const TASK_PAGES = [
  { id: 'overview', label: '运行总览' },
  { id: 'tasks', label: '任务中心' },
  { id: 'alerts', label: '站内告警' },
  { id: 'nodes', label: '执行节点' },
  { id: 'candidates', label: '候选节点筛选' },
  { id: 'incidents', label: '失联与任务核对' },
  { id: 'workflow', label: '工作流与能力' },
  { id: 'strategies', label: '触发策略' },
  { id: 'compare', label: '历史与对比' },
] as const;

export function consolePath(page: string, task?: string) {
  const search = new URLSearchParams({ page });
  if (task) search.set('task', task);
  return `/console?${search}`;
}

export function consolePage(search: string) {
  const params = new URLSearchParams(search);
  const page = params.get('page');
  if (page === 'detail') return params.get('task') ? 'detail' : 'tasks';
  return TASK_PAGES.find(item => item.id === page)?.id ?? 'overview';
}

export type NavigationItemId = (typeof NAVIGATION_ITEMS)[number]['id'];
