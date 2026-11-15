export interface ResourceRequirement {
  cpuCores?: number;
  gpuCount?: number;
  minVramTotalGb?: number;
  npuTops?: number;
  dlaCount?: number;
  memoryGb?: number;
  architecture?: string;
  requiredLabels: string[];
}

export type ExecutionMode = 'SINGLE_NODE' | 'DISTRIBUTED';

export interface CandidateQueryInput {
  requestId: string;
  taskId: string;
  clusterId?: string;
  executionMode: ExecutionMode;
  requirement: ResourceRequirement;
  allowedNodeIds?: string[];
}

export interface CandidateCapacity {
  cpuCores: number;
  gpuCount: number;
  vramTotalGb: number;
  maxGpuVramGb: number;
  npuTops: number;
  dlaCount: number;
  memoryTotalGb: number;
}

export type ResourceAvailabilityState = 'FREE' | 'PARTIAL' | 'BUSY' | 'UNKNOWN' | 'NOT_PRESENT';

export interface CandidateResourceAvailability {
  cpu: ResourceAvailabilityState;
  gpu: ResourceAvailabilityState;
  memory: ResourceAvailabilityState;
  npu: ResourceAvailabilityState;
  dla: ResourceAvailabilityState;
}

export interface CandidateAggregateCapacity {
  cpuCores: number;
  gpuCount: number;
  vramGb: number;
  memoryGb: number;
  npuTops: number;
  dlaDevices: number;
}

export interface ClusterAggregateCapacity {
  clusterId: string;
  clusterName: string;
  nodeCount: number;
  aggregateCapacity: CandidateAggregateCapacity;
  requirementSatisfied: boolean;
}

export interface CandidateRuntimeAdvisory {
  cpuUtilizationPercent?: number;
  gpuUtilizationPercent?: number;
  vramAvailableGb?: number;
  memoryAvailableGb?: number;
}

export interface CandidateNode {
  nodeId: string;
  clusterId?: string;
  hostname: string;
  architecture: string;
  labels: string[];
  runtimeStatus: string;
  operationalStatus: string;
  healthStatus: string;
  schedulable: boolean;
  capacity: CandidateCapacity;
  availableCapacity: CandidateCapacity;
  resourceAvailability: CandidateResourceAvailability;
  runtimeAdvisory: CandidateRuntimeAdvisory;
  lastHeartbeatAt?: string;
  lastResourceAt?: string;
}

export interface ExcludedCandidateNode extends CandidateNode {
  reasons: string[];
}

export interface CandidateQueryResult {
  requestId: string;
  taskId: string;
  snapshotId: string;
  generatedAt: string;
  clusterId?: string;
  executionMode: ExecutionMode;
  candidates: CandidateNode[];
  excludedNodes: ExcludedCandidateNode[];
  aggregateCapacity: CandidateAggregateCapacity;
  requirementSatisfied: boolean;
  aggregateByCluster: ClusterAggregateCapacity[];
  satisfiedClusterIds: string[];
}

export type SchedulerExecutionStatus =
  'QUEUED' | 'ASSIGNED' | 'STARTING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'LOST';

export interface SchedulerK3sReference {
  clusterId?: string;
  namespace?: string;
  jobName?: string;
  podUid?: string;
  containerId?: string;
}

export interface SchedulerAllocatedResources {
  cpuCores?: number;
  gpuCount?: number;
  vramGb?: number;
  memoryGb?: number;
  npuTops?: number;
  dlaCount?: number;
}

export interface SchedulerExecution {
  eventVersion: number;
  taskId: string;
  shardId?: string;
  attemptId: string;
  physicalNodeId: string;
  executorId?: string;
  k3s?: SchedulerK3sReference;
  status: SchedulerExecutionStatus;
  allocatedResources?: SchedulerAllocatedResources;
  queueLength?: number;
  occurredAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  lastEventId?: string;
  updatedAt: string;
}

export interface SchedulerExecutionList {
  items: SchedulerExecution[];
  total: number;
  updatedAt: string;
}

export interface SchedulerSubmission {
  task_id: string;
  execution_mode: ExecutionMode;
  resource_snapshot_id: string;
  candidate_node_ids: string[];
  allowed_node_ids: string[];
}
