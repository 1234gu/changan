import dayjs from 'dayjs';
import type { ClusterSummary } from '../types/cluster';
import type { ComputeResourceMetricMap, ResourceMetric } from '../types/computePool';
import type { DashboardSummary, ResourceTrendPoint } from '../types/dashboard';
import type { SystemEvent } from '../types/event';
import type { NodeEvent, NodeStatusSummary, NodeSummary } from '../types/node';
import { RESOURCE_KINDS } from '../types/resource';
import type { ResourceCapacityMap, ResourceMap, ResourceSummary } from '../types/resource';
import { getComputePoolSummary } from './computePoolService';
import { getClusters } from './clusterService';
import { getNodeDataMode, getNodeEvents, getNodes } from './nodeService';
import {
  getPlatformEvents,
  getPlatformSummary,
  type PlatformEvent,
  type PlatformSummary,
} from './platformService';

const REFRESH_INTERVAL_MS = 5_000;

// Fallback only when the scheduling platform summary is unreachable; task counts are
// otherwise taken from the scheduler's task database (Task-level, not Attempt-level).
const EMPTY_TASK_SUMMARY = { waiting: 0, running: 0, success: 0, failed: 0 } as const;

const createTrendPoint = (resources: ResourceMap, timestamp: string): ResourceTrendPoint => {
  const utilization: ResourceTrendPoint['utilization'] = {};

  for (const kind of RESOURCE_KINDS) {
    const resource = resources[kind];
    if (resource) utilization[kind] = resource.utilization;
  }

  return { timestamp, utilization };
};

const isWithinTrendWindow = (timestamp: string, now: dayjs.Dayjs) =>
  dayjs(timestamp).valueOf() >= now.subtract(30, 'minute').valueOf();

const mergeTrend = (previous: ResourceTrendPoint[], resources: ResourceMap, timestamp: string) => {
  const now = dayjs(timestamp);
  const trendPoint = createTrendPoint(resources, timestamp);
  const recentTrend = previous.filter((point) => isWithinTrendWindow(point.timestamp, now));
  const latestPoint = recentTrend[recentTrend.length - 1];
  const sameMinute = latestPoint
    ? dayjs(latestPoint.timestamp).format('YYYY-MM-DD HH:mm') === now.format('YYYY-MM-DD HH:mm')
    : false;

  return sameMinute ? [...recentTrend.slice(0, -1), trendPoint] : [...recentTrend, trendPoint];
};

const toResourceSummary = (metric: ResourceMetric): ResourceSummary => {
  if (metric.unit === 'GB') throw new Error('核心算力资源不能使用 GB 单位。');

  return {
    total: metric.total,
    used: metric.used,
    allocated: metric.allocated,
    available: metric.available,
    utilization: metric.runtimeUtilizationPercent ?? metric.utilizationPercent,
    runtimeUtilization: metric.runtimeUtilizationPercent ?? metric.utilizationPercent,
    unit: metric.unit,
    collectionStatus: metric.collectionStatus ?? 'complete',
    issueNodeCount: metric.issueNodeCount ?? 0,
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

const activeNodes = (nodes: NodeSummary[]) =>
  nodes.filter((node) => node.registrationStatus === 'registered');

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

function toNodeSystemEvent(event: NodeEvent): SystemEvent {
  let type: SystemEvent['type'] = 'unknown';
  if (event.type === 'node_discovered' || event.type === 'registration_completed') {
    type = 'node_joined';
  } else if (
    event.type === 'heartbeat_abnormal' ||
    event.type === 'node_suspect' ||
    event.type === 'node_offline'
  ) {
    type = 'heartbeat_timeout';
  } else if (
    event.type === 'reconnect_started' ||
    event.type === 'node_recovered' ||
    event.type === 'node_online'
  ) {
    type = 'node_reconnected';
  }

  return {
    id: event.id,
    type,
    level: event.level,
    message: event.message,
    occurredAt: event.occurredAt,
    targetId: event.nodeId,
    targetType: 'node',
  };
}

const taskEventTypes: Record<string, SystemEvent['type']> = {
  TASK_CREATED: 'task_created',
  TASK_SUCCEEDED: 'task_succeeded',
  TASK_FAILED: 'task_failed',
  TASK_CANCELED: 'task_canceled',
  TASK_TIMED_OUT: 'task_timed_out',
};

function toTaskSystemEvent(event: PlatformEvent): SystemEvent {
  const level = event.level.toLowerCase();
  return {
    id: event.id,
    type: taskEventTypes[event.eventType.toUpperCase()] ?? 'unknown',
    level: level === 'warning' || level === 'error' ? level : 'info',
    message: event.message,
    occurredAt: event.occurredAt,
    ...(event.targetId ? { targetId: event.targetId } : {}),
    targetType: 'task',
  };
}

function recentEvents(events: SystemEvent[], now: dayjs.Dayjs) {
  const start = now.subtract(30, 'minute').valueOf();
  const end = now.valueOf();
  return events
    .filter((event) => {
      const occurredAt = dayjs(event.occurredAt).valueOf();
      return Number.isFinite(occurredAt) && occurredAt >= start && occurredAt <= end;
    })
    .sort((left, right) => dayjs(right.occurredAt).valueOf() - dayjs(left.occurredAt).valueOf())
    .slice(0, 8);
}

async function loadSimulatorBaseline() {
  if (getNodeDataMode() === 'real') return undefined;
  const { createDashboardMock } = await import('./simulatorDashboardProvider');
  return createDashboardMock();
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [nodeResult, computePool, clusterResult, nodeEvents, taskEvents, simulatorBaseline, platform] =
    await Promise.all([
      getNodes(),
      getComputePoolSummary(),
      getClusters(),
      getNodeEvents(),
      getPlatformEvents().catch(() => []),
      loadSimulatorBaseline(),
      getPlatformSummary().catch((): PlatformSummary | null => null),
    ]);
  const nodes = activeNodes(nodeResult.items);
  const activeNodeIds = new Set(nodes.map((node) => node.id));
  const resources = toResourceMap(computePool.resources);
  const clusters = clusterResult.items.map<ClusterSummary>((cluster) => ({
    id: cluster.id,
    name: cluster.name,
    status: cluster.status,
    nodeCount: cluster.nodeCount,
    resources: toCapacityMap(cluster.resourceSummary.resources),
  }));

  return {
    nodes: createNodeStatus(nodes),
    nodeItems: nodes,
    nodeResources: computePool.sources.filter((source) => activeNodeIds.has(source.nodeId)),
    resourcePool: { resources },
    supportingResources: computePool.supportingResources,
    tasks: platform
      ? {
          waiting: platform.tasks.waiting,
          running: platform.tasks.running,
          success: platform.tasks.succeeded,
          failed: platform.tasks.failed,
        }
      : (simulatorBaseline?.tasks ?? { ...EMPTY_TASK_SUMMARY }),
    platform,
    clusters,
    events: recentEvents(
      [...nodeEvents.map(toNodeSystemEvent), ...taskEvents.map(toTaskSystemEvent)],
      dayjs(computePool.updatedAt),
    ),
    resourceTrend: mergeTrend(
      simulatorBaseline?.resourceTrend ?? [],
      resources,
      computePool.updatedAt,
    ),
    updatedAt: computePool.updatedAt,
  };
}

export function subscribeDashboardSummary(
  initial: DashboardSummary,
  listener: (summary: DashboardSummary) => void,
  errorListener?: (error: unknown | null) => void,
) {
  let current = initial;
  let disposed = false;
  let refreshInFlight = false;

  const refresh = async () => {
    if (disposed || refreshInFlight) return;
    refreshInFlight = true;
    try {
      const latest = await getDashboardSummary();
      if (disposed) return;

      current = {
        ...latest,
        resourceTrend: mergeTrend(
          current.resourceTrend,
          latest.resourcePool.resources,
          latest.updatedAt,
        ),
      };
      listener(current);
      errorListener?.(null);
    } catch (error) {
      errorListener?.(error);
    } finally {
      refreshInFlight = false;
    }
  };

  const timer = globalThis.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

  return () => {
    disposed = true;
    globalThis.clearInterval(timer);
  };
}
