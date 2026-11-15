import type { ComputeResourceMetricMap, ResourceMetric } from './computePool';
import type { ResourceCapacityMap } from './resource';

export type ClusterStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface ClusterResourceSummary {
  resources: ComputeResourceMetricMap;
  videoMemory: ResourceMetric;
  memory: ResourceMetric;
  storage: ResourceMetric;
  updatedAt: string;
}

export interface ClusterRecord {
  id: string;
  name: string;
  version: string;
  status: ClusterStatus;
  enterprise: string;
  project: string;
  managementEndpoint?: string;
  lastSyncTime?: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  resourceSummary: ClusterResourceSummary;
}

export interface ClusterListResponse {
  items: ClusterRecord[];
  total: number;
  updatedAt: string;
}

export interface ClusterInput {
  name: string;
  version: string;
  enterprise: string;
  project: string;
  managementEndpoint?: string;
  /** Selected only while creating a Cluster; membership is keyed by Node UUID. */
  nodeIds?: string[];
}

/** Compact Dashboard projection of a management-owned Cluster entity. */
export interface ClusterSummary {
  id: string;
  name: string;
  status: ClusterStatus;
  nodeCount: number;
  resources: ResourceCapacityMap;
}
