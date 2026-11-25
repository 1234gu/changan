import type {
  ClusterInput,
  ClusterListResponse,
  ClusterRecord,
  ClusterStatus,
} from '../types/cluster';
import type { NodeDetail } from '../types/node';
import { apiClient } from './apiClient';
import type {
  ApiClusterListResponse,
  ApiClusterNodeListResponse,
  ApiClusterRecord,
} from './clusterApiTypes';
import type { ApiComputePoolResourceMetric } from './computePoolApiTypes';
import { API_ENDPOINTS } from './endpoints';
import { mapApiNodeDetail } from './nodeMapper';
import { getNodeDataMode, getNodeInventoryDetails } from './nodeService';
import type { ApiNodeListResponse, ApiNodeRecord } from './nodeApiTypes';

function mapResourceMetric(metric: ApiComputePoolResourceMetric) {
  return {
    total: metric.total,
    used: metric.used ?? metric.allocated,
    allocated: metric.allocated,
    available: metric.available,
    schedulableAvailable: metric.schedulable_available,
    unavailable: metric.unavailable,
    utilizationPercent: metric.utilization_percent,
    runtimeUtilizationPercent: metric.runtime_utilization_percent,
    unit: metric.unit,
    collectionStatus: metric.collection_status,
    issueNodeCount: metric.issue_node_count,
  };
}

function mapCluster(cluster: ApiClusterRecord): ClusterRecord {
  return {
    id: cluster.cluster_id,
    name: cluster.cluster_name,
    version: cluster.version,
    status: cluster.status.toLowerCase() as ClusterStatus,
    enterprise: cluster.enterprise,
    project: cluster.project,
    ...(cluster.management_endpoint ? { managementEndpoint: cluster.management_endpoint } : {}),
    ...(cluster.last_sync_time ? { lastSyncTime: cluster.last_sync_time } : {}),
    createdAt: cluster.created_at,
    updatedAt: cluster.updated_at,
    nodeCount: cluster.node_count,
    resourceSummary: {
      resources: {
        cpu: mapResourceMetric(cluster.resource_summary.resources.cpu),
        gpu: mapResourceMetric(cluster.resource_summary.resources.gpu),
        npu: mapResourceMetric(cluster.resource_summary.resources.npu),
        dla: mapResourceMetric(cluster.resource_summary.resources.dla),
      },
      videoMemory: mapResourceMetric(cluster.resource_summary.gpu_accessible_memory ?? cluster.resource_summary.video_memory),
      memory: mapResourceMetric(cluster.resource_summary.memory),
      storage: mapResourceMetric(cluster.resource_summary.storage),
      updatedAt: cluster.resource_summary.updated_at,
    },
  };
}

function toUpdatePayload(input: ClusterInput) {
  return {
    cluster_name: input.name.trim(),
    version: input.version.trim(),
    enterprise: input.enterprise.trim(),
    project: input.project.trim(),
    management_endpoint: input.managementEndpoint?.trim() || null,
  };
}

function toCreatePayload(input: ClusterInput) {
  return {
    ...toUpdatePayload(input),
    node_ids: input.nodeIds ?? [],
  };
}

export async function getClusters(): Promise<ClusterListResponse> {
  if (getNodeDataMode() === 'mock') {
    const { createComputePoolMock } = await import('../mocks/computePoolMock');
    const pool = createComputePoolMock();
    const updatedAt = pool.updatedAt;
    const zeroVideoMemory = {
      total: 0,
      used: 0,
      allocated: 0,
      available: 0,
      schedulableAvailable: 0,
      unavailable: 0,
      utilizationPercent: 0,
      runtimeUtilizationPercent: 0,
      unit: 'GB' as const,
      collectionStatus: 'complete' as const,
      issueNodeCount: 0,
    };
    const items: ClusterRecord[] = pool.clusters.map((cluster) => ({
      id: cluster.cluster.id,
      name: cluster.cluster.name,
      version: 'mock',
      status: cluster.schedulableNodeCount > 0 ? 'online' : 'offline',
      enterprise: '演示环境',
      project: 'Simulator',
      createdAt: updatedAt,
      updatedAt,
      nodeCount: cluster.nodeCount,
      resourceSummary: {
        resources: cluster.resources,
        videoMemory: cluster.supportingResources.videoMemory ?? zeroVideoMemory,
        memory: cluster.supportingResources.memory,
        storage: cluster.supportingResources.storage,
        updatedAt,
      },
    }));
    return { items, total: items.length, updatedAt };
  }
  const response = await apiClient.get<ApiClusterListResponse>(API_ENDPOINTS.clusters);
  return {
    items: response.data.items.map(mapCluster),
    total: response.data.total,
    updatedAt: response.data.updated_at,
  };
}

export async function getCluster(clusterId: string): Promise<ClusterRecord> {
  if (getNodeDataMode() === 'mock') {
    const cluster = (await getClusters()).items.find((item) => item.id === clusterId);
    if (!cluster) throw new Error(`cluster ${clusterId} was not found`);
    return cluster;
  }
  const response = await apiClient.get<ApiClusterRecord>(API_ENDPOINTS.clusterDetail(clusterId));
  return mapCluster(response.data);
}

export async function createCluster(input: ClusterInput): Promise<ClusterRecord> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  const response = await apiClient.post<ApiClusterRecord>(
    API_ENDPOINTS.clusters,
    toCreatePayload(input),
  );
  return mapCluster(response.data);
}

export async function updateCluster(
  clusterId: string,
  input: ClusterInput,
): Promise<ClusterRecord> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  const response = await apiClient.patch<ApiClusterRecord>(
    API_ENDPOINTS.clusterDetail(clusterId),
    toUpdatePayload(input),
  );
  return mapCluster(response.data);
}

/**
 * Return only Backend-owned Nodes that may be newly assigned to a Cluster.
 * This intentionally bypasses simulator/mixed providers: membership mutations
 * can only reference Nodes that exist in the real Backend database.
 */
export async function getEligibleClusterNodes(): Promise<NodeDetail[]> {
  if (getNodeDataMode() === 'mock') return [];
  const response = await apiClient.get<ApiNodeListResponse>(API_ENDPOINTS.nodes, {
    params: { include_removed: false },
  });
  return response.data.items
    .map(mapApiNodeDetail)
    .filter(
      (node) =>
        node.registrationStatus === 'registered' &&
        node.authorizationStatus === 'approved' &&
        node.everApproved &&
        node.poolMembership === 'in_pool' &&
        node.runtimeStatus === 'online' &&
        node.clusterId == null,
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export async function deleteCluster(clusterId: string): Promise<void> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  await apiClient.delete(API_ENDPOINTS.clusterDetail(clusterId));
}

export async function getClusterNodes(clusterId: string): Promise<NodeDetail[]> {
  if (getNodeDataMode() === 'mock') {
    const inventory = await getNodeInventoryDetails();
    return inventory.items.filter((node) => node.cluster?.id === clusterId);
  }
  const response = await apiClient.get<ApiClusterNodeListResponse>(
    API_ENDPOINTS.clusterNodes(clusterId),
  );
  return response.data.items.map(mapApiNodeDetail);
}

export async function assignNodeToCluster(clusterId: string, nodeId: string): Promise<NodeDetail> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  const response = await apiClient.post<ApiNodeRecord>(
    API_ENDPOINTS.clusterNode(clusterId, nodeId),
  );
  return mapApiNodeDetail(response.data);
}

export async function unassignNodeFromCluster(
  clusterId: string,
  nodeId: string,
): Promise<NodeDetail> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  const response = await apiClient.delete<ApiNodeRecord>(
    API_ENDPOINTS.clusterNode(clusterId, nodeId),
  );
  return mapApiNodeDetail(response.data);
}

export async function moveNodeToCluster(clusterId: string, nodeId: string): Promise<NodeDetail> {
  if (getNodeDataMode() === 'mock') throw new Error('Mock 模式不支持集群变更。');
  const response = await apiClient.post<ApiNodeRecord>(
    API_ENDPOINTS.clusterNodeMove(clusterId, nodeId),
  );
  return mapApiNodeDetail(response.data);
}
