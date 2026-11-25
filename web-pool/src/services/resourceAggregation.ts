import type {
  ClusterResourceSummary,
  ComputePoolSummary,
  ComputeResourceMetricMap,
  NodeResourceContribution,
  ResourceMetric,
  SchedulerResourceCandidate,
  SupportingResourceSummary,
} from '../types/computePool';
import type { CapacityMetric, NodeDetail } from '../types/node';
import { RESOURCE_KINDS, RESOURCE_UNITS } from '../types/resource';
import type { CanonicalResourceUnit, ResourceKind, ResourceSummary } from '../types/resource';

import { resolveNodeVideoMemory } from './videoMemoryPolicy';

interface MetricSource {
  total: number;
  used: number;
  allocated: number;
  available: number;
  schedulableCapacity: number;
  runtimeUtilizationPercent: number;
  unit: CanonicalResourceUnit | 'GB';
  collectionStatus?: ResourceMetric['collectionStatus'];
  issueNodeCount?: number;
}

type AggregateField =
  'total' | 'used' | 'allocated' | 'available' | 'schedulableAvailable' | 'unavailable';

const round = (value: number, unit: CanonicalResourceUnit | 'GB') =>
  Number(value.toFixed(unit === 'GPU' || unit === 'Device' ? 0 : 1));

function toMetric(source: MetricSource, supplyEligible: boolean): ResourceMetric {
  const total = round(source.total, source.unit);
  const used = round(source.used, source.unit);
  const allocated = round(source.allocated, source.unit);
  const available = round(source.available, source.unit);
  const schedulableCapacity = Math.min(available, Math.max(0, source.schedulableCapacity));
  const schedulableAvailable = supplyEligible ? round(schedulableCapacity, source.unit) : 0;
  const unavailable = round(Math.max(0, total - schedulableAvailable), source.unit);
  const runtimeUtilizationPercent = Number(source.runtimeUtilizationPercent.toFixed(1));

  return {
    total,
    used,
    allocated,
    available,
    schedulableAvailable,
    unavailable,
    utilizationPercent: runtimeUtilizationPercent,
    runtimeUtilizationPercent,
    unit: source.unit,
    collectionStatus: source.collectionStatus ?? 'complete',
    issueNodeCount: source.issueNodeCount ?? 0,
  };
}

function toCoreResourceMetric(
  kind: ResourceKind,
  resource: ResourceSummary,
  supplyEligible: boolean,
  online: boolean,
) {
  return toMetric(
    {
      total: resource.total,
      used: resource.used,
      allocated: resource.allocated ?? resource.used,
      available: online ? resource.available : 0,
      schedulableCapacity: resource.available,
      runtimeUtilizationPercent: resource.runtimeUtilization ?? resource.utilization,
      unit: RESOURCE_UNITS[kind],
    },
    supplyEligible,
  );
}

function createZeroResourceMetric(
  kind: ResourceKind,
  collectionStatus: ResourceMetric['collectionStatus'] = 'complete',
  issueNodeCount = 0,
): ResourceMetric {
  return toMetric(
    {
      total: 0,
      used: 0,
      allocated: 0,
      available: 0,
      schedulableCapacity: 0,
      runtimeUtilizationPercent: 0,
      unit: RESOURCE_UNITS[kind],
      collectionStatus,
      issueNodeCount,
    },
    false,
  );
}

function toSupportingMetric(
  resource: CapacityMetric,
  supplyEligible: boolean,
  isAgent: boolean,
  online: boolean,
  exposeRuntimeAvailable = false,
) {
  return toMetric(
    {
      total: resource.total,
      used: resource.used,
      allocated: isAgent ? 0 : resource.used,
      // Keep the existing memory/storage accounting contract for real nodes:
      // without scheduler reservation data their allocatable pool is the
      // physical total, while schedulable capacity still follows live free
      // capacity. VRAM is explicitly different: the API exposes its measured
      // runtime free amount, so surface that value as Available VRAM.
      available: online
        ? isAgent && !exposeRuntimeAvailable
          ? resource.total
          : resource.available
        : 0,
      schedulableCapacity: resource.available,
      runtimeUtilizationPercent: resource.utilization,
      unit: resource.unit,
    },
    supplyEligible,
  );
}

function isPoolMember(node: NodeDetail) {
  return (
    node.registrationStatus === 'registered' &&
    node.everApproved &&
    node.authorizationStatus === 'approved' &&
    node.poolMembership === 'in_pool'
  );
}

function contributesToCurrentCapacity(node: NodeDetail) {
  return isPoolMember(node) && node.operationalStatus === 'online';
}

function isSupplyEligible(node: NodeDetail) {
  return (
    contributesToCurrentCapacity(node) &&
    node.schedulable &&
    node.healthStatus === 'healthy' &&
    node.network.linkStatus !== 'down'
  );
}

function isNodeOnline(node: NodeDetail) {
  return node.operationalStatus === 'online';
}

function createResourceMap(
  node: NodeDetail,
  supplyEligible: boolean,
  online: boolean,
): ComputeResourceMetricMap {
  const resources: ComputeResourceMetricMap = {
    cpu: toCoreResourceMetric('cpu', node.resources.cpu, supplyEligible, online),
    gpu: createZeroResourceMetric('gpu'),
    npu: createZeroResourceMetric('npu'),
    dla: createZeroResourceMetric('dla'),
  };

  for (const kind of RESOURCE_KINDS) {
    if (kind === 'cpu') continue;
    const resource = node.resources[kind];
    if (resource) {
      resources[kind] = toCoreResourceMetric(kind, resource, supplyEligible, online);
      continue;
    }

    const support =
      kind === 'gpu' ? node.gpuDetails : kind === 'npu' ? node.npuSupport : node.dlaSupport;
    if (support?.supported && !support.available && support.error) {
      resources[kind] = createZeroResourceMetric(kind, 'error', 1);
    }
  }

  return resources;
}

const hasAllocatedResource = (resources: ComputeResourceMetricMap) =>
  RESOURCE_KINDS.some((kind) => (resources[kind]?.allocated ?? 0) > 0);

const hasSchedulableResource = (resources: ComputeResourceMetricMap) =>
  RESOURCE_KINDS.some((kind) => (resources[kind]?.schedulableAvailable ?? 0) > 0);

function createNodeContribution(node: NodeDetail): NodeResourceContribution {
  const supplyEligible = isSupplyEligible(node);
  const online = isNodeOnline(node);
  const currentContributor = contributesToCurrentCapacity(node);
  const resources = currentContributor
    ? createResourceMap(node, supplyEligible, online)
    : (Object.fromEntries(
        RESOURCE_KINDS.map((kind) => [kind, createZeroResourceMetric(kind)]),
      ) as ComputeResourceMetricMap);
  const isAgent = node.nodeSource === 'agent';
  const videoMemory = resolveNodeVideoMemory(node);
  const zeroSupportingMetric = (): ResourceMetric =>
    toMetric(
      {
        total: 0,
        used: 0,
        allocated: 0,
        available: 0,
        schedulableCapacity: 0,
        runtimeUtilizationPercent: 0,
        unit: 'GB',
      },
      false,
    );

  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeSource: node.nodeSource,
    platform: node.platform,
    architecture: node.architecture,
    cluster: node.cluster,
    operationalStatus: node.operationalStatus,
    healthStatus: node.healthStatus,
    accessStatus: node.accessStatus,
    registrationStatus: node.registrationStatus,
    networkStatus: node.network.linkStatus,
    schedulable: node.schedulable,
    supplyEligible,
    supplyStatus: !supplyEligible
      ? 'unavailable'
      : hasSchedulableResource(resources)
        ? 'available'
        : hasAllocatedResource(resources)
          ? 'allocated'
          : 'unavailable',
    resources,
    memory: currentContributor
      ? toSupportingMetric(node.memory, supplyEligible, isAgent, online, true)
      : zeroSupportingMetric(),
    ...(videoMemory
      ? {
          videoMemory: currentContributor
            ? toSupportingMetric(videoMemory, supplyEligible, isAgent, online, true)
            : zeroSupportingMetric(),
        }
      : {}),
    storage: currentContributor
      ? toSupportingMetric(node.storage, supplyEligible, isAgent, online)
      : zeroSupportingMetric(),
    labels: node.labels,
  };
}

function aggregateMetrics(metrics: ResourceMetric[], unit: ResourceMetric['unit']): ResourceMetric {
  const sum = (field: AggregateField) =>
    round(
      metrics.reduce((total, metric) => total + metric[field], 0),
      unit,
    );
  const total = sum('total');
  const weightedRuntime = metrics.reduce(
    (sum, metric) =>
      sum + (metric.runtimeUtilizationPercent ?? metric.utilizationPercent) * metric.total,
    0,
  );
  const runtimeUtilizationPercent = total > 0 ? Number((weightedRuntime / total).toFixed(1)) : 0;
  const issueNodeCount = metrics.reduce((sum, metric) => sum + (metric.issueNodeCount ?? 0), 0);
  const hasComplete = metrics.some(
    (metric) => (metric.collectionStatus ?? 'complete') === 'complete',
  );
  const hasPartial = metrics.some((metric) => metric.collectionStatus === 'partial');
  const collectionStatus: ResourceMetric['collectionStatus'] =
    issueNodeCount === 0 ? 'complete' : hasComplete || hasPartial ? 'partial' : 'error';

  return {
    total,
    used: sum('used'),
    allocated: sum('allocated'),
    available: sum('available'),
    schedulableAvailable: sum('schedulableAvailable'),
    unavailable: sum('unavailable'),
    utilizationPercent: runtimeUtilizationPercent,
    runtimeUtilizationPercent,
    unit,
    collectionStatus,
    issueNodeCount,
  };
}

function aggregateResources(sources: NodeResourceContribution[]): ComputeResourceMetricMap {
  return Object.fromEntries(
    RESOURCE_KINDS.map((kind) => {
      const metrics = sources.map((source) => source.resources[kind]);
      return [
        kind,
        metrics.length > 0
          ? aggregateMetrics(metrics, RESOURCE_UNITS[kind])
          : createZeroResourceMetric(kind),
      ];
    }),
  ) as ComputeResourceMetricMap;
}

function aggregateSupportingResources(
  sources: NodeResourceContribution[],
): SupportingResourceSummary {
  const videoMemory = sources.flatMap((source) => (source.videoMemory ? [source.videoMemory] : []));

  return {
    memory: aggregateMetrics(
      sources.map((source) => source.memory),
      'GB',
    ),
    ...(videoMemory.length > 0 ? { videoMemory: aggregateMetrics(videoMemory, 'GB') } : {}),
    storage: aggregateMetrics(
      sources.map((source) => source.storage),
      'GB',
    ),
  };
}

function createClusterSummaries(sources: NodeResourceContribution[]): ClusterResourceSummary[] {
  const clusters = new Map<string, NodeResourceContribution[]>();

  for (const source of sources) {
    if (!source.cluster) continue;
    const members = clusters.get(source.cluster.id) ?? [];
    members.push(source);
    clusters.set(source.cluster.id, members);
  }

  return [...clusters.values()].map((members) => ({
    cluster: members[0].cluster!,
    nodeCount: members.length,
    schedulableNodeCount: members.filter((member) => member.supplyEligible).length,
    resources: aggregateResources(members),
    supportingResources: aggregateSupportingResources(members),
  }));
}

function createSchedulerCandidate(source: NodeResourceContribution): SchedulerResourceCandidate {
  return {
    nodeId: source.nodeId,
    nodeName: source.nodeName,
    cluster: source.cluster,
    availableCpu: source.resources.cpu.schedulableAvailable,
    availableGpu: source.resources.gpu?.schedulableAvailable ?? 0,
    availableNpu: source.resources.npu?.schedulableAvailable ?? 0,
    availableDla: source.resources.dla?.schedulableAvailable ?? 0,
    availableMemoryGb: source.memory.schedulableAvailable,
    labels: source.labels,
    nodeStatus: source.operationalStatus,
    networkStatus: source.networkStatus,
  };
}

export function aggregateComputePool(
  nodes: NodeDetail[],
  updatedAt = new Date().toISOString(),
): ComputePoolSummary {
  const sources = nodes.filter(isPoolMember).map(createNodeContribution);

  return {
    resources: aggregateResources(sources),
    supportingResources: aggregateSupportingResources(sources),
    sources,
    clusters: createClusterSummaries(sources),
    schedulerCandidates: sources
      .filter((source) => source.supplyEligible)
      .map(createSchedulerCandidate),
    updatedAt,
  };
}
