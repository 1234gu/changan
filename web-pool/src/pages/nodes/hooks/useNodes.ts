import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  approveNode,
  deleteNodeRecord,
  getNodeDetail,
  getNodeEvents,
  getNodes,
  getPendingNodes,
  getRegistrationRecords,
  joinNodePool,
  manualConnectNode,
  rejectNode,
  removeNodeFromPool,
  requestNodeReconnect,
  setNodeScheduling,
  updateNodeLabels,
} from '../../../services/nodeService';
import { getClusters } from '../../../services/clusterService';
import type { ManualConnectInput } from '../../../services/nodeApiTypes';
import type {
  NodeDetail,
  NodeEvent,
  NodeReconnectGuidance,
  NodeSummary,
  RegistrationRecord,
} from '../../../types/node';
import type { NodeFilterOptions, NodeFilters } from '../types';

interface NodeModuleSummary {
  total: number;
  online: number;
  schedulable: number;
  abnormal: number;
}

interface UseNodesResult {
  nodes: NodeSummary[];
  allNodeCount: number;
  summary: NodeModuleSummary;
  filterOptions: NodeFilterOptions;
  registrationRecords: RegistrationRecord[];
  events: NodeEvent[];
  pendingNodes: NodeSummary[];
  loading: boolean;
  actionNodeId: string | null;
  error: string | null;
  warning: string | null;
  updatedAt: string;
  refresh: () => void;
  approve: (nodeId: string) => Promise<void>;
  reject: (nodeId: string, reason?: string) => Promise<void>;
  manualConnect: (input: ManualConnectInput) => Promise<void>;
  setScheduling: (nodeId: string, enabled: boolean) => Promise<void>;
  reconnect: (nodeId: string) => Promise<NodeReconnectGuidance>;
  joinPool: (nodeId: string) => Promise<void>;
  removeFromPool: (nodeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateLabels: (nodeId: string, labels: string[]) => Promise<void>;
}

export function useNodes(filters: NodeFilters): UseNodesResult {
  const [allNodes, setAllNodes] = useState<NodeSummary[]>([]);
  const [registrationRecords, setRegistrationRecords] = useState<RegistrationRecord[]>([]);
  const [events, setEvents] = useState<NodeEvent[]>([]);
  const [pendingNodes, setPendingNodes] = useState<NodeSummary[]>([]);
  const [officialClusters, setOfficialClusters] = useState<Array<{ id: string; name: string }>>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [actionNodeId, setActionNodeId] = useState<string | null>(null);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setWarning(null);

      try {
        const [nodeResult, pendingResult, recordResult, eventResult, clusterResult] =
          await Promise.allSettled([
            getNodes(),
            getPendingNodes(),
            getRegistrationRecords(),
            getNodeEvents(),
            getClusters(),
          ]);
        if (disposed) return;

        if (nodeResult.status === 'rejected') throw nodeResult.reason;

        setAllNodes(nodeResult.value.items);
        setUpdatedAt(nodeResult.value.updatedAt);

        const unavailableSections: string[] = [];
        if (pendingResult.status === 'fulfilled') {
          setPendingNodes(pendingResult.value.items);
        } else {
          setPendingNodes([]);
          unavailableSections.push('待接入节点');
        }
        if (recordResult.status === 'fulfilled') {
          setRegistrationRecords(recordResult.value);
        } else {
          unavailableSections.push('接入记录');
        }
        if (eventResult.status === 'fulfilled') {
          setEvents(eventResult.value);
        } else {
          unavailableSections.push('节点事件');
        }
        if (clusterResult.status === 'fulfilled') {
          setOfficialClusters(
            clusterResult.value.items.map((cluster) => ({ id: cluster.id, name: cluster.name })),
          );
        } else {
          setOfficialClusters([]);
          unavailableSections.push('集群目录');
        }
        if (unavailableSections.length > 0) {
          setWarning(`${unavailableSections.join('、')}暂时无法加载，节点列表仍可正常使用。`);
        }
      } catch {
        if (!disposed) setError('FastAPI 节点接口不可用，请检查 Backend 连接后重试。');
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [reloadToken]);

  const nodes = useMemo(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();

    return allNodes.filter((node) => {
      if (keyword && !`${node.name} ${node.id}`.toLocaleLowerCase().includes(keyword)) return false;
      if (filters.status !== 'all' && node.operationalStatus !== filters.status) {
        return false;
      }
      if (filters.architecture !== 'all' && node.architecture !== filters.architecture)
        return false;
      if (filters.clusterId !== 'all' && node.cluster?.id !== filters.clusterId) return false;
      if (filters.accessStatus !== 'all' && node.accessStatus !== filters.accessStatus)
        return false;
      if (filters.schedulableOnly && !node.schedulable) return false;
      return true;
    });
  }, [allNodes, filters]);

  const summary = useMemo<NodeModuleSummary>(() => {
    return {
      total: allNodes.length,
      online: allNodes.filter((node) => node.operationalStatus === 'online').length,
      schedulable: allNodes.filter((node) => node.schedulable).length,
      abnormal: allNodes.filter((node) => node.operationalStatus === 'abnormal').length,
    };
  }, [allNodes]);

  const filterOptions = useMemo<NodeFilterOptions>(() => {
    return {
      architectures: [...new Set(allNodes.map((node) => node.architecture))].sort(),
      clusters: [...officialClusters].sort((a, b) => a.name.localeCompare(b.name)),
      accessStatuses: [...new Set(allNodes.map((node) => node.accessStatus))],
    };
  }, [allNodes, officialClusters]);

  const runAction = useCallback(
    async (nodeId: string, action: () => Promise<unknown>) => {
      setActionNodeId(nodeId);
      try {
        await action();
        refresh();
      } finally {
        setActionNodeId(null);
      }
    },
    [refresh],
  );

  const approve = useCallback(
    (nodeId: string) => runAction(nodeId, () => approveNode(nodeId)),
    [runAction],
  );
  const reject = useCallback(
    (nodeId: string, reason?: string) => runAction(nodeId, () => rejectNode(nodeId, reason)),
    [runAction],
  );
  const manualConnect = useCallback(
    (input: ManualConnectInput) => runAction('manual-connect', () => manualConnectNode(input)),
    [runAction],
  );
  const setScheduling = useCallback(
    (nodeId: string, enabled: boolean) =>
      runAction(nodeId, () => setNodeScheduling(nodeId, enabled)),
    [runAction],
  );
  const reconnect = useCallback(
    async (nodeId: string) => {
      setActionNodeId(nodeId);
      try {
        const guidance = await requestNodeReconnect(nodeId);
        refresh();
        return guidance;
      } finally {
        setActionNodeId(null);
      }
    },
    [refresh],
  );
  const joinPool = useCallback(
    (nodeId: string) => runAction(nodeId, () => joinNodePool(nodeId)),
    [runAction],
  );
  const removeFromPool = useCallback(
    (nodeId: string) => runAction(nodeId, () => removeNodeFromPool(nodeId)),
    [runAction],
  );
  const deleteNode = useCallback(async (nodeId: string) => {
    setActionNodeId(nodeId);
    try {
      await deleteNodeRecord(nodeId);
      setAllNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setPendingNodes((nodes) => nodes.filter((node) => node.id !== nodeId));
      setRegistrationRecords((records) => records.filter((record) => record.nodeId !== nodeId));
      setEvents((events) => events.filter((event) => event.nodeId !== nodeId));
      setUpdatedAt(new Date().toISOString());
      setReloadToken((value) => value + 1);
    } finally {
      setActionNodeId(null);
    }
  }, []);
  const updateLabels = useCallback(async (nodeId: string, labels: string[]) => {
    setActionNodeId(nodeId);
    try {
      const updated = await updateNodeLabels(nodeId, { labels });
      setAllNodes((nodes) =>
        nodes.map((node) => (node.id === nodeId ? { ...node, labels: updated.labels } : node)),
      );
      setUpdatedAt(new Date().toISOString());
    } finally {
      setActionNodeId(null);
    }
  }, []);

  return {
    nodes,
    allNodeCount: allNodes.length,
    summary,
    filterOptions,
    registrationRecords,
    events,
    pendingNodes,
    loading,
    actionNodeId,
    error,
    warning,
    updatedAt,
    refresh,
    approve,
    reject,
    manualConnect,
    setScheduling,
    reconnect,
    joinPool,
    removeFromPool,
    deleteNode,
    updateLabels,
  };
}

interface UseNodeDetailResult {
  node: NodeDetail | null;
  loading: boolean;
  error: string | null;
  updatedAt: string;
  refresh: () => void;
}

export function useNodeDetail(nodeId: string | undefined): UseNodeDetailResult {
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!nodeId) {
        setNode(null);
        setError('缺少节点 ID。');
        setLoading(false);
        return;
      }

      try {
        const detail = await getNodeDetail(nodeId);
        if (disposed) return;

        setNode(detail);
        setUpdatedAt(new Date().toISOString());
        if (!detail) setError(`未找到节点 ${nodeId}。`);
      } catch {
        if (!disposed) setError('FastAPI 节点详情接口不可用，请检查 Backend 连接后重试。');
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [nodeId, reloadToken]);

  return { node, loading, error, updatedAt, refresh };
}
