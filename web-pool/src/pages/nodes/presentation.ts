import dayjs from 'dayjs';
import type {
  NetworkLinkStatus,
  NodeAccessStatus,
  NodeActivityStatus,
  NodeHealthStatus,
  NodeType,
} from '../../types/node';

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  vehicle: '车端节点',
  'edge-server': '边缘服务器',
  workstation: '工作站',
};

export const ACTIVITY_LABELS: Record<NodeActivityStatus, string> = {
  running: '运行中',
  idle: '空闲',
};

export const HEALTH_STATUS_CONFIG: Record<NodeHealthStatus, { label: string; color: string }> = {
  healthy: { label: '健康', color: 'success' },
  degraded: { label: '性能降级', color: 'warning' },
  unhealthy: { label: '异常', color: 'error' },
};

export const ACCESS_STATUS_CONFIG: Record<NodeAccessStatus, { label: string; color: string }> = {
  discovered: { label: '已发现', color: 'cyan' },
  pending: { label: '待接入', color: 'default' },
  registering: { label: '注册中', color: 'processing' },
  registered: { label: '已注册', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  failed: { label: '注册失败', color: 'error' },
  removed: { label: '已移出', color: 'default' },
  reconnecting: { label: '重新接入', color: 'warning' },
};

export const NETWORK_LINK_CONFIG: Record<NetworkLinkStatus, { label: string; color: string }> = {
  up: { label: '链路正常', color: 'success' },
  degraded: { label: '链路降级', color: 'warning' },
  down: { label: '链路中断', color: 'error' },
};

export function formatDateTime(timestamp?: string) {
  return timestamp ? dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss') : '--';
}

export function formatHeartbeatAge(timestamp: string) {
  const seconds = Math.max(0, dayjs().diff(dayjs(timestamp), 'second', true));
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3_600)}h`;
}
