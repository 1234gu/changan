import type { ClusterSummary } from './cluster';
import type { NodeResourceContribution } from './computePool';
import type { SystemEvent } from './event';
import type { NodeStatusSummary, NodeSummary } from './node';
import type { SupportingResourceSummary } from './computePool';
import type { ResourceKind, ResourcePoolSummary } from './resource';
import type { TaskSummary } from './task';
import type { PlatformSummary } from '../services/platformService';

export interface ResourceTrendPoint {
  timestamp: string;
  utilization: Partial<Record<ResourceKind, number>>;
}

export interface DashboardSummary {
  nodes: NodeStatusSummary;
  /** Registered nodes used by the fleet view and the node status summary. */
  nodeItems: NodeSummary[];
  /** Per-node runtime resources from the same compute-pool snapshot. */
  nodeResources: NodeResourceContribution[];
  resourcePool: ResourcePoolSummary;
  supportingResources: SupportingResourceSummary;
  tasks: TaskSummary;
  /** Scheduler-owned statistics; null when the platform summary is unavailable. */
  platform?: PlatformSummary | null;
  clusters: ClusterSummary[];
  events: SystemEvent[];
  resourceTrend: ResourceTrendPoint[];
  updatedAt: string;
}
