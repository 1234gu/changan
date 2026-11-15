import { useCallback, useEffect, useState } from 'react';
import { getDashboardSummary, subscribeDashboardSummary } from '../../../services/dashboardService';
import type { DashboardSummary } from '../../../types/dashboard';

interface UseDashboardSummaryResult {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDashboardSummary(): UseDashboardSummaryResult {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const summary = await getDashboardSummary();
        if (disposed) return;

        setData(summary);
        unsubscribe = subscribeDashboardSummary(
          summary,
          (latest) => {
            setData(latest);
            setError(null);
          },
          (refreshError) => {
            if (refreshError !== null) {
              setError('FastAPI 总览数据刷新失败，请检查 Backend 连接。');
            }
          },
        );
      } catch {
        if (!disposed) setError('FastAPI 总览数据加载失败，请检查 Backend 连接后重试。');
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void load();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [reloadToken]);

  return { data, loading, error, refresh };
}
