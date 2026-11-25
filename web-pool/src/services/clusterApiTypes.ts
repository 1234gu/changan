import type { ApiComputePoolResourceMetric } from './computePoolApiTypes';
import type { ApiNodeRecord } from './nodeApiTypes';

export type ApiClusterStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';

export interface ApiClusterResourceSummary {
  resources: {
    cpu: ApiComputePoolResourceMetric;
    gpu: ApiComputePoolResourceMetric;
    npu: ApiComputePoolResourceMetric;
    dla: ApiComputePoolResourceMetric;
  };
  video_memory: ApiComputePoolResourceMetric;
  memory: ApiComputePoolResourceMetric;
  storage: ApiComputePoolResourceMetric;
  gpu_accessible_memory?: ApiComputePoolResourceMetric;
  updated_at: string;
}

export interface ApiClusterRecord {
  cluster_id: string;
  cluster_name: string;
  version: string;
  status: ApiClusterStatus;
  enterprise: string;
  project: string;
  management_endpoint: string | null;
  last_sync_time: string | null;
  created_at: string;
  updated_at: string;
  node_count: number;
  resource_summary: ApiClusterResourceSummary;
}

export interface ApiClusterListResponse {
  items: ApiClusterRecord[];
  total: number;
  updated_at: string;
}

export interface ApiClusterNodeListResponse {
  items: ApiNodeRecord[];
  total: number;
  updated_at: string;
}
