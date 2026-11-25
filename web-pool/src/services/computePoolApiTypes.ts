import type { CanonicalResourceUnit, ResourceKind } from '../types/resource';

export interface ApiComputePoolResourceMetric {
  total: number;
  used?: number;
  allocated: number;
  available: number;
  schedulable_available: number;
  unavailable: number;
  utilization_percent: number;
  runtime_utilization_percent: number;
  unit: CanonicalResourceUnit | 'GB';
  collection_status: 'complete' | 'partial' | 'error';
  issue_node_count: number;
}

export interface ApiComputePoolSummary {
  resources: Record<ResourceKind, ApiComputePoolResourceMetric>;
  memory?: ApiComputePoolResourceMetric;
  storage?: ApiComputePoolResourceMetric;
  supporting_resources?: {
    video_memory?: ApiComputePoolResourceMetric | null;
  };
  /** Compatibility with Backend versions that expose the VRAM metric at the top level. */
  video_memory?: ApiComputePoolResourceMetric | null;
  unified_memory_gpu_nodes?: number;
  gpu_accessible_memory?: ApiComputePoolResourceMetric;
  updated_at: string;
}
