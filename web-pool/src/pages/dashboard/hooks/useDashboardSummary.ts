import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getDashboardSummary, subscribeDashboardSummary } from '../../../services/dashboardService';
import type { DashboardSummary } from '../../../types/dashboard';

interface UseDashboardSummaryResult {
  data: DashboardSummary | null;
  loading: boolean;
  error: string | null;
  authRequired: boolean;
  refresh: () => void;
}

const isAuthenticationError = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 401;

export function useDashboardSummary(): UseDashboardSummaryResult {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const load = async () => {
      setLoading(true);
      setError(null);
      setAuthRequired(false);

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
              const authenticationRequired = isAuthenticationError(refreshError);
              setAuthRequired(authenticationRequired);
              setError(
                authenticationRequired
                  ? '当前 Tailscale 域名尚未登录。请先返回主页面，在“连接设置”中输入 API 密钥。'
                  : 'FastAPI 总览数据刷新失败，请检查 Backend 连接。',
              );
            }
          },
        );
      } catch (loadError) {
        if (!disposed) {
          const authenticationRequired = isAuthenticationError(loadError);
          setAuthRequired(authenticationRequired);
          setError(
            authenticationRequired
              ? '当前 Tailscale 域名尚未登录。请先返回主页面，在“连接设置”中输入 API 密钥。'
              : 'FastAPI 总览数据加载失败，请检查 Backend 连接后重试。',
          );
        }
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

  return { data, loading, error, authRequired, refresh };
}
