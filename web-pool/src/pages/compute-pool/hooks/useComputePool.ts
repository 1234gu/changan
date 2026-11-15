import { useCallback, useEffect, useMemo, useState } from 'react';
import { getComputePoolSummary } from '../../../services/computePoolService';
import type { ComputePoolFilters, ComputePoolSummary } from '../../../types/computePool';
import { matchesContributionSupplyFilter } from '../presentation';

interface UseComputePoolOptions {
  filters: ComputePoolFilters;
  nodeId?: string;
}

export function useComputePool({ filters, nodeId }: UseComputePoolOptions) {
  const [data, setData] = useState<ComputePoolSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const summary = await getComputePoolSummary();
        if (!disposed) setData(summary);
      } catch {
        if (!disposed) setError('FastAPI 节点资源接口不可用，请检查 Backend 连接后重试。');
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [reloadToken]);

  const sources = useMemo(() => {
    if (!data) return [];

    return data.sources.filter((source) => {
      if (nodeId && source.nodeId !== nodeId) return false;
      if (filters.clusterId !== 'all' && source.cluster?.id !== filters.clusterId) return false;
      if (filters.architecture !== 'all' && source.architecture !== filters.architecture) {
        return false;
      }
      if (filters.resourceType !== 'all' && !source.resources[filters.resourceType]) return false;
      return matchesContributionSupplyFilter(source, filters.resourceType, filters.status);
    });
  }, [data, filters, nodeId]);

  const filterOptions = useMemo(() => {
    if (!data) return { clusters: [], architectures: [] };
    const clusters = new Map<string, string>();

    for (const source of data.sources) {
      if (source.cluster) clusters.set(source.cluster.id, source.cluster.name);
    }

    return {
      clusters: [...clusters].map(([id, name]) => ({ id, name })),
      architectures: [...new Set(data.sources.map((source) => source.architecture))],
    };
  }, [data]);

  return {
    data,
    sources,
    totalSourceCount: data?.sources.length ?? 0,
    filterOptions,
    loading,
    error,
    refresh,
  };
}
