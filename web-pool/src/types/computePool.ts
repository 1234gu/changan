import type {
  NetworkLinkStatus,
  NodeAccessStatus,
  NodeArchitecture,
  NodeClusterRef,
  NodeHealthStatus,
  NodeOperationalStatus,
  NodeRegistrationStatus,
  NodeSource,
} from './node';
import type { CanonicalResourceUnit, ResourceKind } from './resource';

export type ResourceSupplyStatus = 'available' | 'allocated' | 'unavailable';

export interface ResourceMetric {
  total: number;
  /** Runtime consumption reported by the node; distinct from scheduler allocation. */
  used: number;
  allocated: number;
  available: number;
  schedulableAvailable: number;
  unavailable: number;
  utilizationPercent: number;
  runtimeUtilizationPercent?: number;
  unit: CanonicalResourceUnit | 'GB';
  collectionStatus?: 'complete' | 'partial' | 'error';
  issueNodeCount?: number;
}

export type ComputeResourceMetricMap = Record<ResourceKind, ResourceMetric>;

export interface SupportingResourceSummary {
  memory: ResourceMetric;
  videoMemory?: ResourceMetric;
  storage: ResourceMetric;
}

export interface NodeResourceContribution {
  nodeId: string;
  nodeName: string;
  nodeSource: NodeSource;
  platform: string;
  architecture: NodeArchitecture;
  cluster: NodeClusterRef | null;
  operationalStatus: NodeOperationalStatus;
  healthStatus: NodeHealthStatus;
  accessStatus: NodeAccessStatus;
  registrationStatus: NodeRegistrationStatus;
  networkStatus: NetworkLinkStatus;
  schedulable: boolean;
  supplyEligible: boolean;
  supplyStatus: ResourceSupplyStatus;
  resources: ComputeResourceMetricMap;
  memory: ResourceMetric;
  videoMemory?: ResourceMetric;
  storage: ResourceMetric;
  labels: string[];
}

export interface ClusterResourceSummary {
  cluster: NodeClusterRef;
  nodeCount: number;
  schedulableNodeCount: number;
  resources: ComputeResourceMetricMap;
  supportingResources: SupportingResourceSummary;
}

export interface SchedulerResourceCandidate {
  nodeId: string;
  nodeName: string;
  cluster: NodeClusterRef | null;
  availableCpu: number;
  availableGpu: number;
  availableNpu: number;
  availableDla: number;
  availableMemoryGb: number;
  labels: string[];
  nodeStatus: NodeOperationalStatus;
  networkStatus: NetworkLinkStatus;
}

export interface ComputePoolSummary {
  resources: ComputeResourceMetricMap;
  supportingResources: SupportingResourceSummary;
  sources: NodeResourceContribution[];
  clusters: ClusterResourceSummary[];
  schedulerCandidates: SchedulerResourceCandidate[];
  updatedAt: string;
}

export interface ComputePoolFilters {
  resourceType: 'all' | ResourceKind;
  clusterId: 'all' | string;
  status: 'all' | ResourceSupplyStatus;
  architecture: 'all' | NodeArchitecture;
}
