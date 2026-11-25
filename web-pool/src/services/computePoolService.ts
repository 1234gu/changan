import type { ComputePoolSummary } from '../types/computePool';
import type { ResourceMetric } from '../types/computePool';
import { apiClient } from './apiClient';
import type { ApiComputePoolResourceMetric, ApiComputePoolSummary } from './computePoolApiTypes';
import { API_ENDPOINTS } from './endpoints';
import { getClusters } from './clusterService';
import { getNodeDataMode, getNodeInventoryDetails } from './nodeService';
import { aggregateComputePool } from './resourceAggregation';

export function mapResourceMetric(metric: ApiComputePoolResourceMetric): ResourceMetric {
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

export async function getComputePoolSummary(): Promise<ComputePoolSummary> {
  const inventoryPromise = getNodeInventoryDetails();
  if (getNodeDataMode() !== 'real') {
    const inventory = await inventoryPromise;
    return structuredClone(aggregateComputePool(inventory.items, inventory.updatedAt));
  }

  const [inventory, response, clusterResult] = await Promise.all([
    inventoryPromise,
    apiClient.get<ApiComputePoolSummary>(API_ENDPOINTS.computePoolSummary),
    getClusters(),
  ]);
  const localDetails = aggregateComputePool(inventory.items, response.data.updated_at);
  const videoMemory =
    response.data.video_memory ?? response.data.supporting_resources?.video_memory ?? undefined;

  return structuredClone({
    ...localDetails,
    resources: {
      cpu: mapResourceMetric(response.data.resources.cpu),
      gpu: mapResourceMetric(response.data.resources.gpu),
      npu: mapResourceMetric(response.data.resources.npu),
      dla: mapResourceMetric(response.data.resources.dla),
    },
    supportingResources: {
      memory: response.data.memory
        ? mapResourceMetric(response.data.memory)
        : localDetails.supportingResources.memory,
      storage: response.data.storage
        ? mapResourceMetric(response.data.storage)
        : localDetails.supportingResources.storage,
      ...(videoMemory ? { videoMemory: mapResourceMetric(videoMemory) } : {}),
      unifiedMemoryGpuNodes: response.data.unified_memory_gpu_nodes ?? 0,
    },
    clusters: clusterResult.items.map((cluster) => ({
      cluster: { id: cluster.id, name: cluster.name },
      nodeCount: cluster.nodeCount,
      schedulableNodeCount: localDetails.sources.filter(
        (source) => source.cluster?.id === cluster.id && source.supplyEligible,
      ).length,
      resources: cluster.resourceSummary.resources,
      supportingResources: {
        memory: cluster.resourceSummary.memory,
        videoMemory: cluster.resourceSummary.videoMemory,
        storage: cluster.resourceSummary.storage,
      },
    })),
    updatedAt: response.data.updated_at,
  });
}
