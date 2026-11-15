export const API_ENDPOINTS = {
  dashboardSummary: '/api/v1/dashboard/summary',
  nodes: '/api/v1/nodes',
  pendingNodes: '/api/v1/nodes/pending',
  manualConnectNode: '/api/v1/nodes/manual-connect',
  nodeDetail: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}`,
  nodeDelete: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}`,
  nodeLabels: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/labels`,
  nodeReconnect: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/reconnect`,
  nodeApprove: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/approve`,
  nodeReject: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/reject`,
  nodeDisableScheduling: (nodeId: string) =>
    `/api/v1/nodes/${encodeURIComponent(nodeId)}/disable-scheduling`,
  nodeEnableScheduling: (nodeId: string) =>
    `/api/v1/nodes/${encodeURIComponent(nodeId)}/enable-scheduling`,
  nodeRetryRegistration: (nodeId: string) =>
    `/api/v1/nodes/${encodeURIComponent(nodeId)}/retry-registration`,
  nodeJoinPool: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/pool/join`,
  nodeRemovePool: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/pool/remove`,
  /** Compatibility alias for older Backend versions. */
  nodeRemove: (nodeId: string) => `/api/v1/nodes/${encodeURIComponent(nodeId)}/remove`,
  nodeRegistrations: '/api/v1/nodes/registrations',
  nodeEvents: '/api/v1/nodes/events',
  computePoolSummary: '/api/v1/compute-pool/summary',
  computePoolCandidates: '/api/v1/compute-pool/candidates',
  schedulerExecutions: '/api/v1/scheduler/executions',
  schedulerExecutionEvents: '/api/v1/scheduler/execution-events',
  schedulerExecutionSnapshot: '/api/v1/scheduler/executions/snapshot',
  clusters: '/api/v1/clusters',
  clusterDetail: (clusterId: string) => `/api/v1/clusters/${encodeURIComponent(clusterId)}`,
  clusterNodes: (clusterId: string) => `/api/v1/clusters/${encodeURIComponent(clusterId)}/nodes`,
  clusterNode: (clusterId: string, nodeId: string) =>
    `/api/v1/clusters/${encodeURIComponent(clusterId)}/nodes/${encodeURIComponent(nodeId)}`,
  clusterNodeMove: (clusterId: string, nodeId: string) =>
    `/api/v1/clusters/${encodeURIComponent(clusterId)}/nodes/${encodeURIComponent(nodeId)}/move`,
  taskSummary: '/api/v1/tasks/summary',
  events: '/api/v1/events',
} as const;

export const WEBSOCKET_ENDPOINTS = {
  dashboard: '/ws/dashboard',
  nodes: '/ws/nodes',
  resources: '/ws/resources',
  events: '/ws/events',
} as const;
