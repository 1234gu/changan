import type { NodeSummary } from '../../types/node';

export type NodesTabKey = 'nodes' | 'registrations' | 'events';

export type NodeStatusFilter = 'all' | NodeSummary['operationalStatus'];

export interface NodeFilters {
  keyword: string;
  status: NodeStatusFilter;
  architecture: 'all' | NodeSummary['architecture'];
  clusterId: 'all' | string;
  accessStatus: 'all' | NodeSummary['accessStatus'];
  schedulableOnly: boolean;
}

export interface NodeFilterOptions {
  architectures: NodeSummary['architecture'][];
  clusters: Array<{ id: string; name: string }>;
  accessStatuses: NodeSummary['accessStatus'][];
}

export const DEFAULT_NODE_FILTERS: NodeFilters = {
  keyword: '',
  status: 'all',
  architecture: 'all',
  clusterId: 'all',
  accessStatus: 'all',
  schedulableOnly: false,
};
