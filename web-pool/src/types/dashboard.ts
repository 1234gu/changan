import type { ClusterSummary } from './cluster';
import type { SystemEvent } from './event';
import type { NodeStatusSummary } from './node';
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
