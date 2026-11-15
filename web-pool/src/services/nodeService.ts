import axios from 'axios';
import type {
  NodeDetail,
  NodeEvent,
  NodeListQuery,
  NodeListResponse,
  NodeReconnectGuidance,
  NodeSummary,
  RegistrationRecord,
} from '../types/node';
import { apiClient } from './apiClient';
import { API_ENDPOINTS } from './endpoints';
import {
  mapApiNodeDetail,
  mapApiNodeEvent,
  mapApiNodeSummary,
  mapApiRegistrationRecord,
} from './nodeMapper';
import type {
  ApiNodeEvent,
  ApiNodeListResponse,
  ApiNodeReconnectGuidance,
  ApiNodeRecord,
  ApiRegistrationRecord,
  ManualConnectInput,
  UpdateNodeLabelsInput,
} from './nodeApiTypes';

export type NodeDataMode = 'real' | 'mock' | 'mixed';

export interface NodeInventoryResult {
  items: NodeDetail[];
  updatedAt: string;
}

const configuredMode = import.meta.env.VITE_NODE_DATA_MODE;
const NODE_DATA_MODE: NodeDataMode = ['real', 'mock', 'mixed'].includes(configuredMode ?? '')
  ? (configuredMode as NodeDataMode)
  : 'real';

const includesApi = NODE_DATA_MODE !== 'mock';
const includesSimulator = NODE_DATA_MODE !== 'real';

async function loadSimulatorProvider() {
  return import('./simulatorNodeProvider');
}

async function fetchAgentNodes(): Promise<ApiNodeListResponse> {
  const response = await apiClient.get<ApiNodeListResponse>(API_ENDPOINTS.nodes);
  return response.data;
}

function filterNodes(nodes: NodeSummary[], query: NodeListQuery): NodeSummary[] {
  const keyword = query.keyword?.trim().toLocaleLowerCase();
  return nodes.filter((node) => {
    if (keyword && !`${node.name} ${node.id}`.toLocaleLowerCase().includes(keyword)) return false;
    if (query.connectivityStatus && node.connectivityStatus !== query.connectivityStatus) {
      return false;
    }
    if (query.architecture && node.architecture !== query.architecture) return false;
    if (query.clusterId && node.cluster?.id !== query.clusterId) return false;
    if (query.accessStatus && node.accessStatus !== query.accessStatus) return false;
    if (query.registrationStatus && node.registrationStatus !== query.registrationStatus) {
      return false;
    }
    if (query.nodeSource && node.nodeSource !== query.nodeSource) return false;
    return true;
  });
}

function sortNodes(nodes: NodeSummary[]) {
  return [...nodes].sort((left, right) => {
    if (left.nodeSource !== right.nodeSource) return left.nodeSource === 'agent' ? -1 : 1;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function getNodeDataMode(): NodeDataMode {
  return NODE_DATA_MODE;
}

export async function getNodes(query: NodeListQuery = {}): Promise<NodeListResponse> {
  const simulatorProvider = includesSimulator ? await loadSimulatorProvider() : undefined;
  const simulators = simulatorProvider?.createNodeSummaries() ?? [];
  const apiResult = includesApi ? await fetchAgentNodes() : undefined;
  const agents = apiResult?.items.map(mapApiNodeSummary) ?? [];

  const items = filterNodes(sortNodes([...agents, ...simulators]), query);
  return {
    items: structuredClone(items),
    total: items.length,
    updatedAt: apiResult?.updated_at ?? new Date().toISOString(),
  };
}

export async function getPendingNodes(): Promise<NodeListResponse> {
  if (!includesApi) {
    return {
      items: [],
      total: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  const response = await apiClient.get<ApiNodeListResponse>(API_ENDPOINTS.pendingNodes);
  const items = response.data.items.map(mapApiNodeSummary);
  return {
    items,
    total: items.length,
    updatedAt: response.data.updated_at,
  };
}

export async function getNodeDetail(nodeId: string): Promise<NodeDetail | null> {
  if (includesSimulator) {
    const simulator = (await loadSimulatorProvider()).createNodeDetails()[nodeId];
    if (simulator) return structuredClone(simulator);
  }
  if (!includesApi) return null;

  try {
    const response = await apiClient.get<ApiNodeRecord>(API_ENDPOINTS.nodeDetail(nodeId));
    return mapApiNodeDetail(response.data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}

export async function getNodeInventoryDetails(): Promise<NodeInventoryResult> {
  const simulatorItems = includesSimulator
    ? Object.values((await loadSimulatorProvider()).createNodeDetails())
    : [];
  const result = includesApi ? await fetchAgentNodes() : undefined;
  const agentItems = result?.items.map(mapApiNodeDetail) ?? [];

  return {
    items: structuredClone([...agentItems, ...simulatorItems]),
    updatedAt: result?.updated_at ?? new Date().toISOString(),
  };
}

async function isSimulatorNode(nodeId: string) {
  if (!includesSimulator) return false;
  return (await loadSimulatorProvider()).createNodeDetails()[nodeId] !== undefined;
}

export async function getRegistrationRecords(nodeId?: string): Promise<RegistrationRecord[]> {
  const simulatorProvider = includesSimulator ? await loadSimulatorProvider() : undefined;
  const simulatorRecords =
    simulatorProvider
      ?.createRegistrationRecords()
      .filter((record) => !nodeId || record.nodeId === nodeId) ?? [];
  if (!includesApi || (nodeId && (await isSimulatorNode(nodeId)))) {
    return structuredClone(simulatorRecords);
  }

  const response = await apiClient.get<ApiRegistrationRecord[]>(API_ENDPOINTS.nodeRegistrations, {
    params: nodeId ? { node_id: nodeId } : undefined,
  });
  return [...response.data.map(mapApiRegistrationRecord), ...simulatorRecords].sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export async function getNodeEvents(nodeId?: string): Promise<NodeEvent[]> {
  const simulatorProvider = includesSimulator ? await loadSimulatorProvider() : undefined;
  const simulatorEvents =
    simulatorProvider?.createNodeEvents().filter((event) => !nodeId || event.nodeId === nodeId) ??
    [];
  if (!includesApi || (nodeId && (await isSimulatorNode(nodeId)))) {
    return structuredClone(simulatorEvents);
  }

  const response = await apiClient.get<ApiNodeEvent[]>(API_ENDPOINTS.nodeEvents, {
    params: nodeId ? { node_id: nodeId } : undefined,
  });
  return [...response.data.map(mapApiNodeEvent), ...simulatorEvents].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
}

function assertAgentActionsAvailable() {
  if (!includesApi) throw new Error('Mock 模式不支持节点操作。');
}

async function postNodeAction(endpoint: string, reason?: string): Promise<NodeDetail> {
  assertAgentActionsAvailable();
  const response = await apiClient.post<ApiNodeRecord>(endpoint, reason ? { reason } : {});
  return mapApiNodeDetail(response.data);
}

export async function approveNode(nodeId: string): Promise<NodeDetail> {
  assertAgentActionsAvailable();
  const response = await apiClient.post<ApiNodeRecord>(API_ENDPOINTS.nodeApprove(nodeId));
  return mapApiNodeDetail(response.data);
}

export function rejectNode(nodeId: string, reason?: string): Promise<NodeDetail> {
  return postNodeAction(API_ENDPOINTS.nodeReject(nodeId), reason);
}

export function setNodeScheduling(
  nodeId: string,
  enabled: boolean,
  reason?: string,
): Promise<NodeDetail> {
  return postNodeAction(
    enabled
      ? API_ENDPOINTS.nodeEnableScheduling(nodeId)
      : API_ENDPOINTS.nodeDisableScheduling(nodeId),
    reason,
  );
}

export function retryNodeRegistration(nodeId: string): Promise<NodeDetail> {
  return postNodeAction(API_ENDPOINTS.nodeRetryRegistration(nodeId));
}

export function joinNodePool(nodeId: string): Promise<NodeDetail> {
  return postNodeAction(API_ENDPOINTS.nodeJoinPool(nodeId));
}

export function removeNodeFromPool(nodeId: string, reason?: string): Promise<NodeDetail> {
  return postNodeAction(API_ENDPOINTS.nodeRemovePool(nodeId), reason);
}

export async function deleteNodeRecord(nodeId: string): Promise<void> {
  assertAgentActionsAvailable();
  await apiClient.delete(API_ENDPOINTS.nodeDelete(nodeId));
}

export async function requestNodeReconnect(nodeId: string): Promise<NodeReconnectGuidance> {
  assertAgentActionsAvailable();
  const response = await apiClient.post<ApiNodeReconnectGuidance>(
    API_ENDPOINTS.nodeReconnect(nodeId),
  );
  return {
    nodeId: response.data.node_id,
    nodeName: response.data.node_name,
    currentStatus:
      response.data.current_status.toLowerCase() as NodeReconnectGuidance['currentStatus'],
    registrationStatus:
      response.data.registration_status.toLowerCase() as NodeReconnectGuidance['registrationStatus'],
    poolMembership:
      response.data.pool_membership.toLowerCase() as NodeReconnectGuidance['poolMembership'],
    schedulable: response.data.schedulable,
    remoteStartSupported: response.data.remote_start_supported,
    credentialReissueSupported: response.data.credential_reissue_supported,
    nodeIdMustBePreserved: response.data.node_id_must_be_preserved,
    requestedAt: response.data.requested_at,
    guidance: response.data.guidance,
  };
}

export async function manualConnectNode(input: ManualConnectInput): Promise<NodeDetail> {
  assertAgentActionsAvailable();
  const response = await apiClient.post<ApiNodeRecord>(API_ENDPOINTS.manualConnectNode, {
    agent_address: input.nodeAddress.trim(),
    node_name: input.nodeName?.trim() || null,
    cluster: null,
    labels: [],
  });
  return mapApiNodeDetail(response.data);
}

export async function updateNodeLabels(
  nodeId: string,
  input: UpdateNodeLabelsInput,
): Promise<NodeSummary> {
  assertAgentActionsAvailable();
  const response = await apiClient.post<ApiNodeRecord>(API_ENDPOINTS.nodeLabels(nodeId), input);
  return mapApiNodeSummary(response.data);
}
