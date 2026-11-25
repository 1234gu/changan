import type {
  CapacityMetric,
  NetworkLinkStatus,
  NodeAccessStatus,
  NodeArchitecture,
  NodeDetail,
  NodeEvent,
  NodeEventType,
  NodeGpuDetails,
  NodeRegistrationStatus,
  NodeRuntimeStatus,
  NodeSummary,
  RegistrationRecord,
} from '../types/node';
import type { ResourceCapacityMap, ResourceMap, ResourceSummary } from '../types/resource';
import type {
  ApiAcceleratorSupport,
  ApiByteCapacity,
  ApiGpuDevice,
  ApiGpuReport,
  ApiNodeEvent,
  ApiNodeRecord,
  ApiRegistrationRecord,
  ApiRegistrationStatus,
  ApiRuntimeStatus,
} from './nodeApiTypes';

const BYTES_PER_GIB = 1024 ** 3;
const BYTES_PER_MIB = 1024 ** 2;

const round = (value: number, precision = 1) => Number(value.toFixed(precision));

function normalizeArchitecture(value: string): NodeArchitecture {
  const normalized = value.trim().toLowerCase();
  if (['arm64', 'aarch64'].includes(normalized)) return 'arm64';
  if (['x86_64', 'amd64', 'x64'].includes(normalized)) return 'x86_64';
  return 'unknown';
}

function mapRegistrationStatus(status: ApiRegistrationStatus): NodeRegistrationStatus {
  const statuses: Record<ApiRegistrationStatus, NodeRegistrationStatus> = {
    DISCOVERED: 'discovered',
    PENDING_APPROVAL: 'pending',
    REGISTERING: 'registering',
    REGISTERED: 'registered',
    REJECTED: 'rejected',
    FAILED: 'failed',
    REMOVED: 'removed',
  };
  return statuses[status];
}

function mapRuntimeStatus(status: ApiRuntimeStatus): NodeRuntimeStatus {
  return status.toLowerCase() as NodeRuntimeStatus;
}

function mapAccessStatus(node: ApiNodeRecord): NodeAccessStatus {
  return node.runtime_status === 'RECONNECTING'
    ? 'reconnecting'
    : mapRegistrationStatus(node.registration_status);
}

function mapConnectivityStatus(status: ApiRuntimeStatus): NodeSummary['connectivityStatus'] {
  if (status === 'OFFLINE') return 'offline';
  if (status === 'SUSPECT' || status === 'RECONNECTING') return 'suspect';
  return 'online';
}

function mapHealthStatus(status: ApiNodeRecord['health_status']): NodeSummary['healthStatus'] {
  return status.toLowerCase() as NodeSummary['healthStatus'];
}

function deviceVramBytes(
  device: ApiGpuDevice,
  byteField: 'vram_total_bytes' | 'vram_used_bytes' | 'vram_available_bytes',
  megabyteField: 'memory_total_mb' | 'memory_used_mb' | 'memory_available_mb',
) {
  return device[byteField] ?? (device[megabyteField] ?? 0) * BYTES_PER_MIB;
}

function reportVramBytes(
  report: ApiGpuReport,
  reportField: 'total_vram_bytes' | 'used_vram_bytes' | 'available_vram_bytes',
  deviceField: 'vram_total_bytes' | 'vram_used_bytes' | 'vram_available_bytes',
  legacyField: 'memory_total_mb' | 'memory_used_mb' | 'memory_available_mb',
) {
  return (
    report[reportField] ??
    report.devices.reduce(
      (total, device) => total + deviceVramBytes(device, deviceField, legacyField),
      0,
    )
  );
}

function mapGpuReport(report: ApiGpuReport): NodeGpuDetails {
  return {
    supported: report.supported,
    available: report.available,
    deviceCount: report.device_count,
    ...(report.memory_architecture ? { memoryArchitecture: report.memory_architecture } : {}),
    totalVramBytes: reportVramBytes(
      report,
      'total_vram_bytes',
      'vram_total_bytes',
      'memory_total_mb',
    ),
    usedVramBytes: reportVramBytes(report, 'used_vram_bytes', 'vram_used_bytes', 'memory_used_mb'),
    availableVramBytes: reportVramBytes(
      report,
      'available_vram_bytes',
      'vram_available_bytes',
      'memory_available_mb',
    ),
    ...(report.utilization_percent !== null && report.utilization_percent !== undefined
      ? { utilizationPercent: report.utilization_percent }
      : {}),
    devices: report.devices.map((device) => ({
      index: device.index,
      model: device.model || device.name || `GPU ${device.index}`,
      ...(device.utilization_percent !== null
        ? { utilizationPercent: device.utilization_percent }
        : {}),
      ...(device.memory_total_mb !== null ? { memoryTotalMB: device.memory_total_mb } : {}),
      ...(device.memory_used_mb !== null ? { memoryUsedMB: device.memory_used_mb } : {}),
      ...(device.memory_available_mb !== null
        ? { memoryAvailableMB: device.memory_available_mb }
        : {}),
      ...(device.vram_total_bytes !== null && device.vram_total_bytes !== undefined
        ? { vramTotalBytes: device.vram_total_bytes }
        : {}),
      ...(device.vram_used_bytes !== null && device.vram_used_bytes !== undefined
        ? { vramUsedBytes: device.vram_used_bytes }
        : {}),
      ...(device.vram_available_bytes !== null && device.vram_available_bytes !== undefined
        ? { vramAvailableBytes: device.vram_available_bytes }
        : {}),
    })),
    ...(report.error ? { error: report.error } : {}),
  };
}

function cpuCapacity(node: ApiNodeRecord) {
  const cpu = node.resources?.cpu;
  return cpu ? cpu.physical_cores || cpu.logical_cores : 0;
}

function mapCapacityResources(node: ApiNodeRecord): ResourceCapacityMap {
  const resources: ResourceCapacityMap = {
    cpu: { total: cpuCapacity(node), unit: 'Core' },
  };
  const gpuCount = node.resources?.gpu.device_count ?? 0;
  if (gpuCount > 0) resources.gpu = { total: gpuCount, unit: 'GPU' };
  const npuTops = node.resources?.npu.tops ?? 0;
  if (npuTops > 0) resources.npu = { total: npuTops, unit: 'TOPS' };
  const dlaCount = node.resources?.dla.device_count ?? 0;
  if (dlaCount > 0) resources.dla = { total: dlaCount, unit: 'Device' };
  return resources;
}

function mapBaseNode(node: ApiNodeRecord): NodeSummary {
  const runtimeStatus = mapRuntimeStatus(node.runtime_status);
  const report = node.resources;
  return {
    id: node.node_id,
    ...(node.device_fingerprint || node.identity.device_fingerprint
      ? { deviceFingerprint: node.device_fingerprint ?? node.identity.device_fingerprint! }
      : {}),
    name: node.node_name,
    nodeSource: 'agent',
    nodeType: 'workstation',
    platform: `${node.identity.operating_system} 工作站`,
    architecture: normalizeArchitecture(node.identity.architecture),
    clusterId: node.cluster_id ?? node.cluster?.id ?? null,
    cluster: node.cluster_id ? node.cluster : null,
    connectivityStatus: mapConnectivityStatus(node.runtime_status),
    operationalStatus: node.operational_status.toLowerCase() as NodeSummary['operationalStatus'],
    ...(runtimeStatus === 'running' || runtimeStatus === 'idle'
      ? { activityStatus: runtimeStatus }
      : {}),
    runtimeStatus,
    healthStatus: mapHealthStatus(node.health_status),
    registrationStatus: mapRegistrationStatus(node.registration_status),
    accessStatus: mapAccessStatus(node),
    everApproved: node.ever_approved,
    authorizationStatus:
      node.authorization_status.toLowerCase() as NodeSummary['authorizationStatus'],
    poolMembership: node.pool_membership.toLowerCase() as NodeSummary['poolMembership'],
    schedulable: node.schedulable,
    schedulingEnabled: node.scheduling_enabled,
    heartbeatAt: node.last_heartbeat_at ?? node.discovered_at,
    resources: mapCapacityResources(node),
    labels: node.labels,
    hostname: node.identity.hostname,
    operatingSystem: node.identity.operating_system,
    osVersion: node.identity.os_version,
    ipAddress: node.identity.ip,
    discoveredAt: node.discovered_at,
    ...(node.last_registered_at ? { lastRegisteredAt: node.last_registered_at } : {}),
    ...(node.last_resource_at ? { lastResourceAt: node.last_resource_at } : {}),
    ...(node.removed_at ? { removedAt: node.removed_at } : {}),
    ...(node.removed_reason ? { removedReason: node.removed_reason } : {}),
    ...(report
      ? {
          memory: toCapacityMetric(report.memory),
          cpuDetails: {
            physicalCores: report.cpu.physical_cores,
            logicalCores: report.cpu.logical_cores,
            utilizationPercent: report.cpu.utilization_percent,
            ...(report.cpu.frequency_mhz !== null
              ? { frequencyMHz: report.cpu.frequency_mhz }
              : {}),
          },
          gpuDetails: mapGpuReport(report.gpu),
          npuSupport: mapAccelerator(report.npu),
          dlaSupport: mapAccelerator(report.dla),
        }
      : {}),
  };
}

function runtimeResource(
  total: number,
  utilizationPercent: number,
  unit: ResourceSummary['unit'],
): ResourceSummary {
  return {
    total,
    used: 0,
    allocated: 0,
    available: total,
    utilization: round(utilizationPercent),
    runtimeUtilization: round(utilizationPercent),
    unit,
  };
}

function averageGpuUtilization(report: ApiGpuReport): number {
  if (report.utilization_percent !== null && report.utilization_percent !== undefined) {
    return report.utilization_percent;
  }
  const values = report.devices.flatMap((device) =>
    device.utilization_percent === null ? [] : [device.utilization_percent],
  );
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapResourceDetails(node: ApiNodeRecord): ResourceMap {
  const report = node.resources;
  if (!report) return { cpu: runtimeResource(0, 0, 'Core') };

  const resources: ResourceMap = {
    cpu: runtimeResource(cpuCapacity(node), report.cpu.utilization_percent, 'Core'),
  };
  if (report.gpu.device_count > 0) {
    resources.gpu = runtimeResource(
      report.gpu.device_count,
      averageGpuUtilization(report.gpu),
      'GPU',
    );
  }
  const npuTops = report.npu.tops ?? 0;
  if (npuTops > 0) {
    resources.npu = runtimeResource(npuTops, report.npu.utilization_percent ?? 0, 'TOPS');
  }
  const dlaCount = report.dla.device_count ?? 0;
  if (dlaCount > 0) {
    resources.dla = runtimeResource(dlaCount, report.dla.utilization_percent ?? 0, 'Device');
  }
  return resources;
}

function toCapacityMetric(capacity?: ApiByteCapacity | null): CapacityMetric {
  if (!capacity) return { total: 0, used: 0, available: 0, utilization: 0, unit: 'GB' };
  return {
    total: round(capacity.total_bytes / BYTES_PER_GIB),
    used: round(capacity.used_bytes / BYTES_PER_GIB),
    available: round(capacity.available_bytes / BYTES_PER_GIB),
    utilization: round(capacity.utilization_percent),
    unit: 'GB',
  };
}

function toVideoMemory(report: ApiGpuReport): CapacityMetric | undefined {
  const totalBytes = reportVramBytes(
    report,
    'total_vram_bytes',
    'vram_total_bytes',
    'memory_total_mb',
  );
  if (totalBytes <= 0) return undefined;
  const usedBytes = reportVramBytes(report, 'used_vram_bytes', 'vram_used_bytes', 'memory_used_mb');
  const availableBytes = reportVramBytes(
    report,
    'available_vram_bytes',
    'vram_available_bytes',
    'memory_available_mb',
  );
  return {
    total: round(totalBytes / BYTES_PER_GIB),
    used: round(usedBytes / BYTES_PER_GIB),
    available: round(availableBytes / BYTES_PER_GIB),
    utilization: round((usedBytes / totalBytes) * 100),
    unit: 'GB',
  };
}

function mapAccelerator(support: ApiAcceleratorSupport) {
  return {
    supported: support.supported,
    available: support.available,
    ...(support.tops !== undefined ? { tops: support.tops } : {}),
    ...(support.device_count !== undefined ? { deviceCount: support.device_count } : {}),
    ...(support.utilization_percent !== null && support.utilization_percent !== undefined
      ? { utilizationPercent: support.utilization_percent }
      : {}),
    ...(support.error ? { error: support.error } : {}),
  };
}

export function mapApiNodeSummary(node: ApiNodeRecord): NodeSummary {
  return mapBaseNode(node);
}

export function mapApiNodeDetail(node: ApiNodeRecord): NodeDetail {
  const base = mapBaseNode(node);
  const report = node.resources;
  const network = report?.network;
  const linkStatus: NetworkLinkStatus =
    network?.link_status === 'UP' ? 'up' : network?.link_status === 'DOWN' ? 'down' : 'degraded';

  return {
    ...base,
    agentVersion: node.identity.agent_version,
    ...(node.registered_at ? { registeredAt: node.registered_at } : {}),
    resources: mapResourceDetails(node),
    memory: toCapacityMetric(report?.memory),
    ...(report?.gpu ? {
      videoMemory: report.gpu.memory_architecture === 'unified'
        ? base.memory
        : toVideoMemory(report.gpu),
    } : {}),
    storage: toCapacityMetric(report?.storage),
    network: {
      interfaceName: network?.network_interface ?? '未上报',
      ipv4Address: network?.ip ?? node.identity.ip,
      linkStatus,
      ...(network?.mac_address ? { macAddress: network.mac_address } : {}),
      ...(network?.link_speed_mbps !== null && network?.link_speed_mbps !== undefined
        ? { linkSpeedMbps: network.link_speed_mbps }
        : {}),
      ...(network ? { bytesSent: network.bytes_sent, bytesReceived: network.bytes_received } : {}),
      ...(network?.tx_rate_bytes_per_second !== null &&
      network?.tx_rate_bytes_per_second !== undefined
        ? { txBytesPerSecond: network.tx_rate_bytes_per_second }
        : {}),
      ...(network?.rx_rate_bytes_per_second !== null &&
      network?.rx_rate_bytes_per_second !== undefined
        ? { rxBytesPerSecond: network.rx_rate_bytes_per_second }
        : {}),
    },
    ...(report
      ? {
          agentMetrics: {
            collectedAt: report.collected_at,
            cpu: {
              physicalCores: report.cpu.physical_cores,
              logicalCores: report.cpu.logical_cores,
              utilizationPercent: report.cpu.utilization_percent,
              ...(report.cpu.frequency_mhz !== null
                ? { frequencyMHz: report.cpu.frequency_mhz }
                : {}),
            },
            gpu: mapGpuReport(report.gpu),
            npu: mapAccelerator(report.npu),
            dla: mapAccelerator(report.dla),
            memory: {
              totalBytes: report.memory.total_bytes,
              usedBytes: report.memory.used_bytes,
              availableBytes: report.memory.available_bytes,
              utilizationPercent: report.memory.utilization_percent,
            },
            storage: {
              mountPoint: report.storage.mount_point,
              totalBytes: report.storage.total_bytes,
              usedBytes: report.storage.used_bytes,
              availableBytes: report.storage.available_bytes,
              utilizationPercent: report.storage.utilization_percent,
            },
          },
        }
      : {}),
    currentTasks: [],
  };
}

export function mapApiRegistrationRecord(record: ApiRegistrationRecord): RegistrationRecord {
  return {
    id: record.id,
    nodeId: record.node_id,
    nodeName: record.node_name,
    startedAt: record.started_at,
    ...(record.completed_at ? { completedAt: record.completed_at } : {}),
    ...(record.duration_seconds !== null
      ? { durationSeconds: Math.round(record.duration_seconds) }
      : {}),
    result: record.result.toLowerCase() as RegistrationRecord['result'],
    ...(record.failure_reason ? { failureReason: record.failure_reason } : {}),
    reconnectStatus: record.reconnect_status.toLowerCase() as RegistrationRecord['reconnectStatus'],
  };
}

function mapEventType(type: string): NodeEventType {
  const eventTypes: Record<string, NodeEventType> = {
    NODE_DISCOVERED: 'node_discovered',
    PENDING_APPROVAL: 'pending_approval',
    REGISTERING: 'registration_started',
    REGISTERED: 'registration_completed',
    REGISTRATION_REJECTED: 'registration_rejected',
    REGISTRATION_FAILED: 'registration_failed',
    RECONNECT_STARTED: 'reconnect_started',
    NODE_RECOVERED: 'node_recovered',
    NODE_SUSPECT: 'node_suspect',
    NODE_OFFLINE: 'node_offline',
    NODE_ABNORMAL: 'node_abnormal',
    SCHEDULING_DISABLED: 'scheduling_disabled',
    SCHEDULING_ENABLED: 'scheduling_enabled',
    NODE_JOINED_POOL: 'node_joined_pool',
    NODE_REMOVED: 'node_removed',
    NODE_LABELS_UPDATED: 'node_labels_updated',
    NODE_ASSIGNED_CLUSTER: 'node_assigned_cluster',
    NODE_MOVED_CLUSTER: 'node_moved_cluster',
    NODE_UNASSIGNED_CLUSTER: 'node_unassigned_cluster',
    RECONNECT_GUIDANCE_REQUESTED: 'reconnect_guidance_requested',
    REGISTRATION_RETRY: 'registration_retry',
  };
  return eventTypes[type] ?? 'node_online';
}

export function mapApiNodeEvent(event: ApiNodeEvent): NodeEvent {
  return {
    id: event.id,
    nodeId: event.node_id,
    nodeName: event.node_name,
    type: mapEventType(event.event_type),
    level: event.level.toLowerCase() as NodeEvent['level'],
    message: event.message,
    occurredAt: event.occurred_at,
  };
}
