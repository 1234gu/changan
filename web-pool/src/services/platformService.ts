import { apiClient } from './apiClient';

/** Task-level statistics owned by the scheduling platform (same process, task database). */
export interface PlatformTaskStatistics {
  total: number;
  waiting: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
  completionRate: number | null;
  segmentsTotal: number;
  segmentsSucceeded: number;
  segmentRetries: number;
  definition: string;
}

export interface PlatformSummary {
  tasks: PlatformTaskStatistics;
  reliability: {
    incidentCount: number;
    openIncidents: number;
    meanRecoverySeconds: number | null;
  };
  executionNodes: number;
  boundNodes: number;
  admissionMode: 'off' | 'observe' | 'enforce';
  updatedAt: string;
}

export interface ExecutionBinding {
  executionNodeId: string;
  kubeNode?: string;
  k3sReady: boolean;
  online: boolean;
  gpuSlots?: number;
  bindingState: 'BOUND' | 'UNBOUND' | 'CONFLICT' | 'NO_MACHINE_ID' | 'UNAVAILABLE' | 'OFF';
  poolNodeId?: string;
  poolNodeName?: string;
  admissionReasons: string[];
  activeSessions: number;
}

export interface NodeIncident {
  id: string;
  detectedAt: number;
  lastSeenAt?: number;
  linkRestoredAt?: number;
  taskReconciledAt?: number;
  reason: string;
  affectedCount: number;
  recoverySeconds?: number | null;
}

export interface NodeReliability {
  executionNodeId: string | null;
  bindingState: string;
  incidents: NodeIncident[];
  attempts: { total: number; succeeded: number; failed: number } | null;
  incidentCount: number;
  openIncidents: number;
  meanRecoverySeconds: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function getPlatformSummary(): Promise<PlatformSummary> {
  const { data } = await apiClient.get<any>('/api/v1/platform/summary');
  const t = data.tasks;
  return {
    tasks: {
      total: t.total,
      waiting: t.waiting,
      running: t.running,
      succeeded: t.succeeded,
      failed: t.failed,
      canceled: t.canceled,
      completionRate: t.completion_rate,
      segmentsTotal: t.segments_total,
      segmentsSucceeded: t.segments_succeeded,
      segmentRetries: t.segment_retries,
      definition: t.definition,
    },
    reliability: {
      incidentCount: data.reliability.incident_count,
      openIncidents: data.reliability.open_incidents,
      meanRecoverySeconds: data.reliability.mean_recovery_seconds,
    },
    executionNodes: data.execution_nodes,
    boundNodes: data.bound_nodes,
    admissionMode: data.admission_mode,
    updatedAt: data.updated_at,
  };
}

export async function getExecutionBindings(): Promise<{ mode: string; items: ExecutionBinding[] }> {
  const { data } = await apiClient.get<any>('/api/v1/platform/bindings');
  return {
    mode: data.mode,
    items: data.items.map((item: any) => ({
      executionNodeId: item.execution_node_id,
      kubeNode: item.kube_node ?? undefined,
      k3sReady: item.k3s_ready,
      online: item.online,
      gpuSlots: item.gpu_slots ?? undefined,
      bindingState: item.binding_state,
      poolNodeId: item.pool_node_id ?? undefined,
      poolNodeName: item.pool_node_name ?? undefined,
      admissionReasons: item.admission_reasons ?? [],
      activeSessions: item.active_sessions ?? 0,
    })),
  };
}

export async function getNodeReliability(poolNodeId: string): Promise<NodeReliability> {
  const { data } = await apiClient.get<any>(
    `/api/v1/platform/nodes/${encodeURIComponent(poolNodeId)}/reliability`,
  );
  return {
    executionNodeId: data.execution_node_id,
    bindingState: data.binding_state,
    incidents: (data.incidents ?? []).map((row: any) => ({
      id: row.id,
      detectedAt: row.detected_at,
      lastSeenAt: row.last_seen_at ?? undefined,
      linkRestoredAt: row.link_restored_at ?? undefined,
      taskReconciledAt: row.task_reconciled_at ?? undefined,
      reason: row.reason,
      affectedCount: Array.isArray(row.affected) ? row.affected.length : 0,
      recoverySeconds: row.recovery_seconds,
    })),
    attempts: data.attempts,
    incidentCount: data.incident_count,
    openIncidents: data.open_incidents,
    meanRecoverySeconds: data.mean_recovery_seconds,
  };
}

/** Link back to the task console served at the site root. */
export const TASK_CONSOLE_URL = '/';
export const taskDetailUrl = (taskId: string) => `/?page=detail&task=${encodeURIComponent(taskId)}`;

export interface PoolTaskSubmission {
  name: string;
  algorithm: 'resource_aware' | 'round_robin';
  poolNodeIds: string[];
  poolClusterId?: string;
  poolLabels: string[];
  minCpuCores?: number;
  minGpuCount?: number;
  minMemoryGb?: number;
  architecture?: string;
}

export interface CreatedTask {
  id: string;
  status: string;
  executionNodeIds: string[];
}

/**
 * Hand a pool-selected node set to the scheduler: pool node UUIDs are mapped to
 * bound execution nodes and become the task's node scope; the pool requirements
 * travel with the task so stage-1 admission is re-checked at every placement.
 */
export async function submitPoolTask(request: PoolTaskSubmission): Promise<CreatedTask> {
  const { items } = await getExecutionBindings();
  const executionNodeIds = items
    .filter(
      (item) =>
        item.bindingState === 'BOUND' &&
        item.poolNodeId &&
        request.poolNodeIds.includes(item.poolNodeId),
    )
    .map((item) => item.executionNodeId);
  if (executionNodeIds.length === 0) {
    throw new Error('所选资源节点均未绑定 K3s 执行节点，无法下发');
  }
  const body = {
    name: request.name,
    source: 'demo',
    algorithm: request.algorithm,
    node_ids: executionNodeIds,
    pool_cluster_id: request.poolClusterId,
    pool_labels: request.poolLabels,
    min_cpu_cores: request.minCpuCores,
    min_gpu_count: request.minGpuCount,
    ...(request.minMemoryGb ? { min_memory_mb: Math.ceil(request.minMemoryGb * 1024) } : {}),
    ...(request.architecture ? { architecture: request.architecture } : {}),
  };
  const { data } = await apiClient.post<any>('/api/tasks', body, { timeout: 30_000 });
  return { id: data.id, status: data.status, executionNodeIds };
}
