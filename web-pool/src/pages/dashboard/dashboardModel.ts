import type { NodeResourceContribution } from '../../types/computePool';
import type { NodeOperationalStatus, NodeSummary } from '../../types/node';

const BYTES_PER_GIB = 1024 ** 3;

export type DashboardNodeStatusCounts = Record<NodeOperationalStatus, number>;

export interface NodeResourceSnapshot {
  cpuCores: number;
  cpuUtilization?: number;
  gpuCount: number;
  gpuUtilization?: number;
  gpuMemoryGb?: number;
  gpuMemoryArchitecture: 'dedicated' | 'unified' | 'unknown';
  memoryTotalGb?: number;
  memoryUtilization?: number;
  npuSupported: boolean;
  npuTops: number;
  npuUtilization?: number;
  dlaSupported: boolean;
  dlaDevices: number;
  dlaUtilization?: number;
  lastReportedAt?: string;
}

export type FleetLayout =
  | 'empty'
  | 'single'
  | 'pair'
  | 'triangle'
  | 'diamond'
  | 'convoy'
  | 'grid';

export interface FleetVehicleNode {
  node: NodeSummary;
  displayName: string;
  ordinal: number;
}

export const getOnlineVehicleNodes = (nodes: NodeSummary[]) =>
  nodes.filter((node) => node.operationalStatus === 'online');

export const getFleetVehicleNodes = (nodes: NodeSummary[]): FleetVehicleNode[] =>
  [...getOnlineVehicleNodes(nodes)]
    .sort((left, right) =>
      left.id.localeCompare(right.id, 'zh-CN', { numeric: true, sensitivity: 'base' }),
    )
    .map((node, index) => ({
      node,
      displayName: `节点${String(index + 1).padStart(2, '0')}`,
      ordinal: index + 1,
    }));

export const getFleetLayout = (count: number): FleetLayout => {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  if (count === 2) return 'pair';
  if (count === 3) return 'triangle';
  if (count === 4) return 'diamond';
  if (count <= 8) return 'convoy';
  return 'grid';
};

export const getNodeStatusCounts = (nodes: NodeSummary[]): DashboardNodeStatusCounts =>
  nodes.reduce<DashboardNodeStatusCounts>(
    (counts, node) => ({
      ...counts,
      [node.operationalStatus]: counts[node.operationalStatus] + 1,
    }),
    { online: 0, suspect: 0, offline: 0, abnormal: 0 },
  );

export const indexNodeResources = (sources: NodeResourceContribution[]) =>
  new Map(sources.map((source) => [source.nodeId, source]));

const runtimeUtilization = (metric: NodeResourceContribution['resources']['cpu'] | undefined) =>
  metric?.runtimeUtilizationPercent ?? metric?.utilizationPercent;

export function getNodeResourceSnapshot(
  node: NodeSummary,
  source?: NodeResourceContribution,
): NodeResourceSnapshot {
  const cpu = source?.resources.cpu;
  const gpu = source?.resources.gpu;
  const npu = source?.resources.npu;
  const dla = source?.resources.dla;
  const memoryArchitecture =
    node.gpuDetails?.memoryArchitecture ?? (source?.videoMemory ? 'dedicated' : 'unknown');
  const memoryUtilization =
    source?.memory.runtimeUtilizationPercent ?? source?.memory.utilizationPercent;
  const gpuMemoryGb =
    memoryArchitecture === 'unified'
      ? source?.memory.total
      : (source?.videoMemory?.total ??
        (node.gpuDetails && node.gpuDetails.totalVramBytes > 0
          ? node.gpuDetails.totalVramBytes / BYTES_PER_GIB
          : undefined));

  return {
    cpuCores: cpu?.total ?? node.resources.cpu.total,
    cpuUtilization: runtimeUtilization(cpu) ?? node.cpuDetails?.utilizationPercent,
    gpuCount: gpu?.total ?? node.resources.gpu?.total ?? node.gpuDetails?.deviceCount ?? 0,
    gpuUtilization:
      runtimeUtilization(gpu) ?? node.gpuDetails?.utilizationPercent,
    gpuMemoryGb,
    gpuMemoryArchitecture: memoryArchitecture,
    memoryTotalGb: source?.memory.total,
    memoryUtilization,
    npuSupported: node.npuSupport?.supported ?? (npu?.total ?? 0) > 0,
    npuTops: npu?.total ?? node.resources.npu?.total ?? node.npuSupport?.tops ?? 0,
    npuUtilization: runtimeUtilization(npu) ?? node.npuSupport?.utilizationPercent,
    dlaSupported: node.dlaSupport?.supported ?? (dla?.total ?? 0) > 0,
    dlaDevices: dla?.total ?? node.resources.dla?.total ?? node.dlaSupport?.deviceCount ?? 0,
    dlaUtilization: runtimeUtilization(dla) ?? node.dlaSupport?.utilizationPercent,
    lastReportedAt: node.lastResourceAt ?? node.heartbeatAt,
  };
}
