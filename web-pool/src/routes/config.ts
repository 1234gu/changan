export const ROUTES = {
  dashboard: '/',
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
  { id: 'dashboard', path: ROUTES.dashboard, label: '总览' },
  { id: 'nodes', path: ROUTES.nodes, label: '节点管理' },
  { id: 'computePool', path: ROUTES.computePool, label: '算力池' },
  { id: 'clusters', path: ROUTES.clusters, label: '集群管理' },
  { id: 'scheduling', path: ROUTES.scheduling, label: '资源筛选与提交' },
] as const;

/** Pages of the task/execution console served at the site root (same origin). */
export const TASK_CONSOLE_LINKS = [
  { key: 'console:tasks', href: '/?page=tasks', label: '任务中心' },
  { key: 'console:overview', href: '/?page=overview', label: '运行总览' },
  { key: 'console:incidents', href: '/?page=incidents', label: '失联与任务核对' },
] as const;

export type NavigationItemId = (typeof NAVIGATION_ITEMS)[number]['id'];
