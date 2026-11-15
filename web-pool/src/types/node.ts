import type { EventLevel } from './event';
import type { ResourceCapacityMap, ResourceMap } from './resource';

export type NodeConnectivityStatus = 'online' | 'suspect' | 'offline';
export type NodeOperationalStatus = NodeConnectivityStatus | 'abnormal';
export type NodeActivityStatus = 'running' | 'idle';
export type NodeHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export type NodeRuntimeStatus =
  'online' | 'running' | 'idle' | 'suspect' | 'offline' | 'reconnecting';
export type NodeRegistrationStatus =
  'discovered' | 'pending' | 'registering' | 'registered' | 'rejected' | 'failed' | 'removed';
/** Compatibility display status. New logic should use registrationStatus + runtimeStatus. */
export type NodeAccessStatus = NodeRegistrationStatus | 'reconnecting';
export type NodeSource = 'agent' | 'simulator';
export type NodeArchitecture = 'arm64' | 'x86_64' | 'unknown';
export type NodeType = 'vehicle' | 'edge-server' | 'workstation';
export type NodeAuthorizationStatus = 'pending' | 'approved' | 'revoked';
export type NodePoolMembership = 'in_pool' | 'removed';

export interface NodeClusterRef {
  id: string;
  name: string;
}

export interface NodeSummary {
  id: string;
  deviceFingerprint?: string;
  name: string;
  nodeSource: NodeSource;
  nodeType: NodeType;
  platform: string;
  architecture: NodeArchitecture;
  clusterId?: string | null;
  cluster: NodeClusterRef | null;
  connectivityStatus: NodeConnectivityStatus;
  /** Backend-authoritative status used by node statistics, filters and UI badges. */
  operationalStatus: NodeOperationalStatus;
  activityStatus?: NodeActivityStatus;
  runtimeStatus?: NodeRuntimeStatus;
  healthStatus: NodeHealthStatus;
  registrationStatus: NodeRegistrationStatus;
  accessStatus: NodeAccessStatus;
  everApproved: boolean;
  authorizationStatus: NodeAuthorizationStatus;
  poolMembership: NodePoolMembership;
  schedulable: boolean;
  schedulingEnabled?: boolean;
  heartbeatAt: string;
  resources: ResourceCapacityMap;
  labels: string[];
  hostname?: string;
  operatingSystem?: string;
  osVersion?: string;
  ipAddress?: string;
  discoveredAt?: string;
  lastRegisteredAt?: string;
  lastResourceAt?: string;
  removedAt?: string;
  removedReason?: string;
  cpuDetails?: NodeCpuDetails;
  gpuDetails?: NodeGpuDetails;
  npuSupport?: NodeAcceleratorSupport;
  dlaSupport?: NodeAcceleratorSupport;
}

export interface NodeStatusSummary {
  connectivity: Record<NodeConnectivityStatus, number>;
  activity: Record<NodeActivityStatus, number>;
  schedulable: number;
}

export interface CapacityMetric {
  total: number;
  used: number;
  available: number;
  utilization: number;
  unit: 'GB';
}

export type NetworkLinkStatus = 'up' | 'degraded' | 'down';

export interface NodeNetworkMetrics {
  interfaceName: string;
  ipv4Address: string;
  macAddress?: string;
  linkStatus: NetworkLinkStatus;
  linkSpeedMbps?: number;
  latencyMs?: number;
  jitterMs?: number;
  packetLossPercent?: number;
  rxMbps?: number;
  txMbps?: number;
  bytesSent?: number;
  bytesReceived?: number;
  rxBytesPerSecond?: number;
  txBytesPerSecond?: number;
}

export interface NodeCpuDetails {
  physicalCores: number;
  logicalCores: number;
  utilizationPercent: number;
  frequencyMHz?: number;
}

export interface NodeGpuDevice {
  index: number;
  model: string;
  utilizationPercent?: number;
  memoryTotalMB?: number;
  memoryUsedMB?: number;
  memoryAvailableMB?: number;
  vramTotalBytes?: number;
  vramUsedBytes?: number;
  vramAvailableBytes?: number;
}

export interface NodeAcceleratorSupport {
  supported: boolean;
  available: boolean;
  tops?: number;
  deviceCount?: number;
  utilizationPercent?: number;
  error?: string;
}

export interface NodeGpuDetails extends NodeAcceleratorSupport {
  deviceCount: number;
  totalVramBytes: number;
  usedVramBytes: number;
  availableVramBytes: number;
  utilizationPercent?: number;
  devices: NodeGpuDevice[];
  /** 'unified': the GPU shares system memory (Jetson/Thor); there is no dedicated VRAM. */
  memoryArchitecture?: 'dedicated' | 'unified';
}

export interface NodeByteCapacity {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  utilizationPercent: number;
}

export interface NodeAgentMetrics {
  collectedAt: string;
  cpu: NodeCpuDetails;
  gpu: NodeGpuDetails;
  npu: NodeAcceleratorSupport;
  dla: NodeAcceleratorSupport;
  memory: NodeByteCapacity;
  storage: NodeByteCapacity & { mountPoint: string };
}

export interface NodeTemperature {
  cpuCelsius?: number;
  gpuCelsius?: number;
  npuCelsius?: number;
  boardCelsius?: number;
}

export interface NodeTask {
  id: string;
  name: string;
  status: 'running' | 'waiting';
  startedAt?: string;
}

export interface NodeDetail extends Omit<NodeSummary, 'resources'> {
  serialNumber?: string;
  agentVersion: string;
  registeredAt?: string;
  resources: ResourceMap;
  memory: CapacityMetric;
  videoMemory?: CapacityMetric;
  storage: CapacityMetric;
  network: NodeNetworkMetrics;
  agentMetrics?: NodeAgentMetrics;
  temperature?: NodeTemperature;
  currentTasks: NodeTask[];
}

export type RegistrationResult = 'success' | 'failed' | 'in_progress';
export type ReconnectStatus = 'not_required' | 'pending' | 'in_progress' | 'recovered';

export interface RegistrationRecord {
  id: string;
  nodeId: string;
  nodeName: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  result: RegistrationResult;
  failureReason?: string;
  reconnectStatus: ReconnectStatus;
}

export type NodeEventType =
  | 'node_online'
  | 'heartbeat_abnormal'
  | 'node_suspect'
  | 'node_offline'
  | 'node_abnormal'
  | 'reconnect_started'
  | 'node_recovered'
  | 'schedulable_restored'
  | 'registration_failed'
  | 'node_discovered'
  | 'pending_approval'
  | 'registration_started'
  | 'registration_completed'
  | 'registration_rejected'
  | 'scheduling_disabled'
  | 'scheduling_enabled'
  | 'node_joined_pool'
  | 'node_removed'
  | 'node_labels_updated'
  | 'node_assigned_cluster'
  | 'node_moved_cluster'
  | 'node_unassigned_cluster'
  | 'reconnect_guidance_requested'
  | 'registration_retry';

export interface NodeReconnectGuidance {
  nodeId: string;
  nodeName: string;
  currentStatus: NodeOperationalStatus;
  registrationStatus: NodeRegistrationStatus;
  poolMembership: NodePoolMembership;
  schedulable: boolean;
  remoteStartSupported: false;
  credentialReissueSupported: false;
  nodeIdMustBePreserved: true;
  requestedAt: string;
  guidance: string[];
}

export interface NodeEvent {
  id: string;
  nodeId: string;
  nodeName: string;
  type: NodeEventType;
  level: EventLevel;
  message: string;
  occurredAt: string;
}

export interface NodeListQuery {
  keyword?: string;
  connectivityStatus?: NodeConnectivityStatus;
  architecture?: NodeArchitecture;
  clusterId?: string;
  accessStatus?: NodeAccessStatus;
  registrationStatus?: NodeRegistrationStatus;
  nodeSource?: NodeSource;
}

export interface NodeListResponse {
  items: NodeSummary[];
  total: number;
  updatedAt: string;
}
