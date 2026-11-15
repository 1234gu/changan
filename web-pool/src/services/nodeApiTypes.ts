export type ApiRegistrationStatus =
  | 'DISCOVERED'
  | 'PENDING_APPROVAL'
  | 'REGISTERING'
  | 'REGISTERED'
  | 'REJECTED'
  | 'FAILED'
  | 'REMOVED';

export type ApiRuntimeStatus =
  'ONLINE' | 'RUNNING' | 'IDLE' | 'SUSPECT' | 'OFFLINE' | 'RECONNECTING';
export type ApiOperationalStatus = 'ONLINE' | 'SUSPECT' | 'OFFLINE' | 'ABNORMAL';

export type ApiHealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
export type ApiLinkStatus = 'UP' | 'DOWN' | 'UNKNOWN';
export type ApiAuthorizationStatus = 'PENDING' | 'APPROVED' | 'REVOKED';
export type ApiPoolMembership = 'IN_POOL' | 'REMOVED';

export interface ApiClusterRef {
  id: string;
  name: string;
}

export interface ApiIdentity {
  node_id: string;
  device_fingerprint?: string | null;
  hostname: string;
  architecture: string;
  operating_system: string;
  os_version: string;
  agent_version: string;
  ip: string;
}

export interface ApiCpuReport {
  physical_cores: number;
  logical_cores: number;
  utilization_percent: number;
  frequency_mhz: number | null;
}

export interface ApiByteCapacity {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  utilization_percent: number;
}

export interface ApiStorageReport extends ApiByteCapacity {
  mount_point: string;
}

export interface ApiGpuDevice {
  index: number;
  model: string;
  name?: string | null;
  utilization_percent: number | null;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_available_mb: number | null;
  vram_total_bytes?: number | null;
  vram_used_bytes?: number | null;
  vram_available_bytes?: number | null;
}

export interface ApiGpuReport {
  memory_architecture?: 'dedicated' | 'unified' | null;
  supported: boolean;
  available: boolean;
  device_count: number;
  total_vram_bytes?: number;
  used_vram_bytes?: number;
  available_vram_bytes?: number;
  utilization_percent?: number | null;
  devices: ApiGpuDevice[];
  error: string | null;
}

export interface ApiAcceleratorSupport {
  supported: boolean;
  available: boolean;
  tops?: number;
  device_count?: number;
  utilization_percent?: number | null;
  error: string | null;
}

export interface ApiNetworkReport {
  ip: string;
  network_interface: string;
  link_status: ApiLinkStatus;
  bytes_sent: number;
  bytes_received: number;
  tx_rate_bytes_per_second: number | null;
  rx_rate_bytes_per_second: number | null;
  mac_address: string | null;
  link_speed_mbps: number | null;
}

export interface ApiResourceReport {
  collected_at: string;
  cpu: ApiCpuReport;
  memory: ApiByteCapacity;
  storage: ApiStorageReport;
  gpu: ApiGpuReport;
  npu: ApiAcceleratorSupport;
  dla: ApiAcceleratorSupport;
  network: ApiNetworkReport;
}

export interface ApiNodeRecord {
  node_id: string;
  device_fingerprint?: string | null;
  node_name: string;
  node_source: 'agent';
  identity: ApiIdentity;
  cluster_id: string | null;
  cluster: ApiClusterRef | null;
  labels: string[];
  registration_status: ApiRegistrationStatus;
  ever_approved: boolean;
  authorization_status: ApiAuthorizationStatus;
  pool_membership: ApiPoolMembership;
  runtime_status: ApiRuntimeStatus;
  operational_status: ApiOperationalStatus;
  health_status: ApiHealthStatus;
  scheduling_enabled: boolean;
  schedulable: boolean;
  discovered_at: string;
  last_registered_at?: string | null;
  registered_at: string | null;
  last_heartbeat_at: string | null;
  last_agent_timestamp: string | null;
  last_resource_at: string | null;
  resources: ApiResourceReport | null;
  removed_at: string | null;
  removed_reason: string | null;
}

export interface ApiNodeListResponse {
  items: ApiNodeRecord[];
  total: number;
  updated_at: string;
}

export interface ApiRegistrationRecord {
  id: string;
  node_id: string;
  node_name: string;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  result: 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
  failure_reason: string | null;
  reconnect_status: 'NOT_REQUIRED' | 'PENDING' | 'IN_PROGRESS' | 'RECOVERED';
}

export interface ApiNodeEvent {
  id: string;
  node_id: string;
  node_name: string;
  event_type: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  occurred_at: string;
}

export interface ManualConnectInput {
  nodeAddress: string;
  nodeName?: string;
}

export interface UpdateNodeLabelsInput {
  labels: string[];
}

export interface ApiNodeReconnectGuidance {
  node_id: string;
  node_name: string;
  current_status: ApiOperationalStatus;
  registration_status: ApiRegistrationStatus;
  pool_membership: ApiPoolMembership;
  schedulable: boolean;
  remote_start_supported: false;
  credential_reissue_supported: false;
  node_id_must_be_preserved: true;
  requested_at: string;
  guidance: string[];
}
