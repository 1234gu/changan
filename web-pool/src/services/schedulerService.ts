import type {
  CandidateNode,
  CandidateQueryInput,
  CandidateQueryResult,
  ExcludedCandidateNode,
  SchedulerExecution,
  SchedulerExecutionList,
  SchedulerSubmission,
} from '../types/scheduling';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './endpoints';

interface ApiCandidateNode {
  node_id: string;
  cluster_id: string | null;
  hostname: string;
  architecture: string;
  labels: string[];
  runtime_status: string;
  operational_status: string;
  health_status: string;
  schedulable: boolean;
  capacity: {
    cpu_cores: number;
    gpu_count: number;
    vram_total_gb: number;
    max_gpu_vram_gb: number;
    npu_tops: number;
    dla_count: number;
    memory_total_gb: number;
  };
  available_capacity: ApiCandidateNode['capacity'];
  resource_availability: {
    cpu: CandidateNode['resourceAvailability']['cpu'];
    gpu: CandidateNode['resourceAvailability']['gpu'];
    memory: CandidateNode['resourceAvailability']['memory'];
    npu: CandidateNode['resourceAvailability']['npu'];
    dla: CandidateNode['resourceAvailability']['dla'];
  };
  runtime_advisory: {
    cpu_utilization_percent: number | null;
    gpu_utilization_percent: number | null;
    vram_available_gb: number | null;
    memory_available_gb: number | null;
  };
  last_heartbeat_at: string | null;
  last_resource_at: string | null;
}

interface ApiCandidateResponse {
  request_id: string;
  task_id: string;
  snapshot_id: string;
  generated_at: string;
  cluster_id: string | null;
  execution_mode: CandidateQueryResult['executionMode'];
  candidates: ApiCandidateNode[];
  excluded_nodes: Array<ApiCandidateNode & { reasons: string[] }>;
  aggregate_capacity: {
    cpu_cores: number;
    gpu_count: number;
    vram_gb: number;
    memory_gb: number;
    npu_tops: number;
    dla_devices: number;
  };
  requirement_satisfied: boolean;
  aggregate_by_cluster: Array<{
    cluster_id: string;
    cluster_name: string;
    node_count: number;
    aggregate_capacity: ApiCandidateResponse['aggregate_capacity'];
    requirement_satisfied: boolean;
  }>;
  satisfied_cluster_ids: string[];
}

interface ApiSchedulerExecution {
  event_version: number;
  task_id: string;
  shard_id: string | null;
  attempt_id: string;
  physical_node_id: string;
  executor_id: string | null;
  k3s: {
    cluster_id: string | null;
    namespace: string | null;
    job_name: string | null;
    pod_uid: string | null;
    container_id: string | null;
  } | null;
  status: SchedulerExecution['status'];
  allocated_resources: {
    cpu_cores: number | null;
    gpu_count: number | null;
    vram_gb: number | null;
    memory_gb: number | null;
    npu_tops: number | null;
    dla_count: number | null;
  } | null;
  queue_length: number | null;
  occurred_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  last_event_id: string | null;
  updated_at: string;
}

interface ApiSchedulerExecutionList {
  items: ApiSchedulerExecution[];
  total: number;
  updated_at: string;
}

function optional<T>(value: T | null): T | undefined {
  return value ?? undefined;
}

function mapCandidate(node: ApiCandidateNode): CandidateNode {
  const mapCapacity = (capacity: ApiCandidateNode['capacity']) => ({
    cpuCores: capacity.cpu_cores,
    gpuCount: capacity.gpu_count,
    vramTotalGb: capacity.vram_total_gb,
    maxGpuVramGb: capacity.max_gpu_vram_gb,
    npuTops: capacity.npu_tops,
    dlaCount: capacity.dla_count,
    memoryTotalGb: capacity.memory_total_gb,
  });
  return {
    nodeId: node.node_id,
    clusterId: optional(node.cluster_id),
    hostname: node.hostname,
    architecture: node.architecture,
    labels: node.labels,
    runtimeStatus: node.runtime_status,
    operationalStatus: node.operational_status,
    healthStatus: node.health_status,
    schedulable: node.schedulable,
    capacity: mapCapacity(node.capacity),
    availableCapacity: mapCapacity(node.available_capacity),
    resourceAvailability: node.resource_availability,
    runtimeAdvisory: {
      cpuUtilizationPercent: optional(node.runtime_advisory.cpu_utilization_percent),
      gpuUtilizationPercent: optional(node.runtime_advisory.gpu_utilization_percent),
      vramAvailableGb: optional(node.runtime_advisory.vram_available_gb),
      memoryAvailableGb: optional(node.runtime_advisory.memory_available_gb),
    },
    lastHeartbeatAt: optional(node.last_heartbeat_at),
    lastResourceAt: optional(node.last_resource_at),
  };
}

function mapExecution(item: ApiSchedulerExecution): SchedulerExecution {
  return {
    eventVersion: item.event_version,
    taskId: item.task_id,
    shardId: optional(item.shard_id),
    attemptId: item.attempt_id,
    physicalNodeId: item.physical_node_id,
    executorId: optional(item.executor_id),
    k3s: item.k3s
      ? {
          clusterId: optional(item.k3s.cluster_id),
          namespace: optional(item.k3s.namespace),
          jobName: optional(item.k3s.job_name),
          podUid: optional(item.k3s.pod_uid),
          containerId: optional(item.k3s.container_id),
        }
      : undefined,
    status: item.status,
    allocatedResources: item.allocated_resources
      ? {
          cpuCores: optional(item.allocated_resources.cpu_cores),
          gpuCount: optional(item.allocated_resources.gpu_count),
          vramGb: optional(item.allocated_resources.vram_gb),
          memoryGb: optional(item.allocated_resources.memory_gb),
          npuTops: optional(item.allocated_resources.npu_tops),
          dlaCount: optional(item.allocated_resources.dla_count),
        }
      : undefined,
    queueLength: optional(item.queue_length),
    occurredAt: item.occurred_at,
    startedAt: optional(item.started_at),
    finishedAt: optional(item.finished_at),
    error: optional(item.error),
    lastEventId: optional(item.last_event_id),
    updatedAt: item.updated_at,
  };
}

export async function queryResourceCandidates(
  input: CandidateQueryInput,
): Promise<CandidateQueryResult> {
  const response = await apiClient.post<ApiCandidateResponse>(API_ENDPOINTS.computePoolCandidates, {
    request_id: input.requestId,
    task_id: input.taskId,
    cluster_id: input.clusterId ?? null,
    execution_mode: input.executionMode,
    requirement: {
      cpu_cores: input.requirement.cpuCores ?? null,
      gpu_count: input.requirement.gpuCount ?? null,
      min_vram_total_gb: input.requirement.minVramTotalGb ?? null,
      npu_tops: input.requirement.npuTops ?? null,
      dla_count: input.requirement.dlaCount ?? null,
      memory_gb: input.requirement.memoryGb ?? null,
      architecture: input.requirement.architecture ?? null,
      required_labels: input.requirement.requiredLabels,
    },
    allowed_node_ids: input.allowedNodeIds ?? null,
  });
  return {
    requestId: response.data.request_id,
    taskId: response.data.task_id,
    snapshotId: response.data.snapshot_id,
    generatedAt: response.data.generated_at,
    clusterId: optional(response.data.cluster_id),
    executionMode: response.data.execution_mode,
    candidates: response.data.candidates.map(mapCandidate),
    excludedNodes: response.data.excluded_nodes.map((item): ExcludedCandidateNode => ({
      ...mapCandidate(item),
      reasons: item.reasons,
    })),
    aggregateCapacity: {
      cpuCores: response.data.aggregate_capacity.cpu_cores,
      gpuCount: response.data.aggregate_capacity.gpu_count,
      vramGb: response.data.aggregate_capacity.vram_gb,
      memoryGb: response.data.aggregate_capacity.memory_gb,
      npuTops: response.data.aggregate_capacity.npu_tops,
      dlaDevices: response.data.aggregate_capacity.dla_devices,
    },
    requirementSatisfied: response.data.requirement_satisfied,
    aggregateByCluster: response.data.aggregate_by_cluster.map((group) => ({
      clusterId: group.cluster_id,
      clusterName: group.cluster_name,
      nodeCount: group.node_count,
      aggregateCapacity: {
        cpuCores: group.aggregate_capacity.cpu_cores,
        gpuCount: group.aggregate_capacity.gpu_count,
        vramGb: group.aggregate_capacity.vram_gb,
        memoryGb: group.aggregate_capacity.memory_gb,
        npuTops: group.aggregate_capacity.npu_tops,
        dlaDevices: group.aggregate_capacity.dla_devices,
      },
      requirementSatisfied: group.requirement_satisfied,
    })),
    satisfiedClusterIds: response.data.satisfied_cluster_ids,
  };
}

export async function getSchedulerExecutions(options?: {
  physicalNodeId?: string;
  taskId?: string;
  activeOnly?: boolean;
}): Promise<SchedulerExecutionList> {
  const response = await apiClient.get<ApiSchedulerExecutionList>(
    API_ENDPOINTS.schedulerExecutions,
    {
      params: {
        physical_node_id: options?.physicalNodeId,
        task_id: options?.taskId,
        active_only: options?.activeOnly,
      },
    },
  );
  return {
    items: response.data.items.map(mapExecution),
    total: response.data.total,
    updatedAt: response.data.updated_at,
  };
}

export function buildSchedulerSubmission(
  result: CandidateQueryResult,
  allowedNodeIds: string[],
): SchedulerSubmission {
  return {
    task_id: result.taskId,
    execution_mode: result.executionMode,
    resource_snapshot_id: result.snapshotId,
    candidate_node_ids: result.candidates.map((candidate) => candidate.nodeId),
    allowed_node_ids: allowedNodeIds,
  };
}

export const schedulerAdapterConfiguration = {
  baseUrl: import.meta.env.VITE_SCHEDULER_BASE_URL?.trim() || null,
  submissionContractConfigured: false,
} as const;

export async function submitToScheduler(_request: SchedulerSubmission): Promise<never> {
  void _request;
  throw new Error('Scheduler 提交服务未配置。');
}
