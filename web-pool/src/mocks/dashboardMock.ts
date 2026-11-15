import { createComputePoolMock } from './computePoolMock';
import { createNodeSummaries } from './nodes';
import type { ClusterSummary } from '../types/cluster';
import type {
  ClusterResourceSummary,
  ComputeResourceMetricMap,
  ResourceMetric,
} from '../types/computePool';
import type { DashboardSummary } from '../types/dashboard';
import type { NodeStatusSummary, NodeSummary } from '../types/node';
import { RESOURCE_KINDS } from '../types/resource';
import type { ResourceCapacityMap, ResourceMap, ResourceSummary } from '../types/resource';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const toResourceSummary = (metric: ResourceMetric): ResourceSummary => {
  if (metric.unit === 'GB') throw new Error('核心算力资源不能使用 GB 单位。');
  return {
    total: metric.total,
    used: metric.allocated,
    available: metric.available,
    utilization: metric.utilizationPercent,
    unit: metric.unit,
  };
};

const toResourceMap = (metrics: ComputeResourceMetricMap): ResourceMap => {
  const resources: ResourceMap = { cpu: toResourceSummary(metrics.cpu) };

  for (const kind of RESOURCE_KINDS) {
    const metric = metrics[kind];
    if (kind !== 'cpu' && metric) resources[kind] = toResourceSummary(metric);
  }

  return resources;
};

const toCapacityMap = (metrics: ComputeResourceMetricMap): ResourceCapacityMap => {
  if (metrics.cpu.unit === 'GB') throw new Error('CPU 资源不能使用 GB 单位。');
  const resources: ResourceCapacityMap = {
    cpu: { total: metrics.cpu.total, unit: metrics.cpu.unit },
  };

  for (const kind of RESOURCE_KINDS) {
    const metric = metrics[kind];
    if (kind !== 'cpu' && metric && metric.unit !== 'GB') {
      resources[kind] = { total: metric.total, unit: metric.unit };
    }
  }

  return resources;
};

const createNodeStatus = (nodes: NodeSummary[]): NodeStatusSummary => ({
  connectivity: {
    online: nodes.filter((node) => node.connectivityStatus === 'online').length,
    suspect: nodes.filter((node) => node.connectivityStatus === 'suspect').length,
    offline: nodes.filter((node) => node.connectivityStatus === 'offline').length,
  },
  activity: {
    running: nodes.filter(
      (node) => node.connectivityStatus === 'online' && node.activityStatus === 'running',
    ).length,
    idle: nodes.filter(
      (node) => node.connectivityStatus === 'online' && node.activityStatus === 'idle',
    ).length,
  },
  schedulable: nodes.filter((node) => node.schedulable).length,
});

const createCluster = (
  cluster: ClusterResourceSummary,
  status: ClusterSummary['status'],
): ClusterSummary => ({
  id: cluster.cluster.id,
  name: cluster.cluster.name,
  status,
  nodeCount: cluster.nodeCount,
  resources: toCapacityMap(cluster.resources),
});

export const createDashboardMock = (): DashboardSummary => {
  const nodes = createNodeSummaries();
  const computePool = createComputePoolMock();
  const resources = toResourceMap(computePool.resources);
  const currentUtilization: DashboardSummary['resourceTrend'][number]['utilization'] = {};
  const clusterStatuses: Record<string, ClusterSummary['status']> = {
    'cluster-a': 'degraded',
    'cluster-b': 'online',
  };

  for (const kind of RESOURCE_KINDS) {
    const resource = resources[kind];
    if (resource) currentUtilization[kind] = resource.utilization;
  }

  return {
    nodes: createNodeStatus(nodes),
    resourcePool: {
      resources,
    },
    supportingResources: computePool.supportingResources,
    tasks: {
      waiting: 6,
      running: 18,
      success: 142,
      failed: 3,
    },
    clusters: computePool.clusters.map((cluster) =>
      createCluster(cluster, clusterStatuses[cluster.cluster.id] ?? 'online'),
    ),
    events: [
      {
        id: 'e1',
        type: 'heartbeat_timeout',
        level: 'error',
        message: 'V04 心跳超时',
        occurredAt: minutesAgo(1),
        targetId: 'node-v04',
      },
      {
        id: 'e2',
        type: 'node_reconnected',
        level: 'info',
        message: 'V06 已重新连接',
        occurredAt: minutesAgo(4),
        targetId: 'node-v06',
      },
      {
        id: 'e3',
        type: 'cluster_degraded',
        level: 'warning',
        message: 'Cluster-A 存在异常节点',
        occurredAt: minutesAgo(10),
        targetId: 'cluster-a',
      },
      {
        id: 'e4',
        type: 'node_joined',
        level: 'info',
        message: 'V05 已加入车群',
        occurredAt: minutesAgo(16),
        targetId: 'node-v05',
      },
    ],
    resourceTrend: [
      { timestamp: minutesAgo(30), utilization: { cpu: 32, gpu: 25, npu: 30, dla: 18 } },
      { timestamp: minutesAgo(25), utilization: { cpu: 35, gpu: 28, npu: 31, dla: 20 } },
      { timestamp: minutesAgo(20), utilization: { cpu: 40, gpu: 31, npu: 34, dla: 22 } },
      { timestamp: minutesAgo(15), utilization: { cpu: 43, gpu: 35, npu: 33, dla: 24 } },
      { timestamp: minutesAgo(10), utilization: { cpu: 46, gpu: 39, npu: 35, dla: 26 } },
      { timestamp: minutesAgo(5), utilization: { cpu: 44, gpu: 38, npu: 37, dla: 25 } },
      { timestamp: minutesAgo(0), utilization: currentUtilization },
    ],
    updatedAt: computePool.updatedAt,
  };
};
