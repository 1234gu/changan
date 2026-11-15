import { Badge } from 'antd';
import type { BadgeProps } from 'antd';
import type { ClusterStatus } from '../types/cluster';
import type { EventLevel } from '../types/event';
import type {
  NodeActivityStatus,
  NodeConnectivityStatus,
  NodeHealthStatus,
  NodeOperationalStatus,
  NodeRuntimeStatus,
} from '../types/node';
import type { TaskStatus } from '../types/task';

export type PlatformStatus =
  | NodeConnectivityStatus
  | NodeActivityStatus
  | NodeRuntimeStatus
  | NodeOperationalStatus
  | NodeHealthStatus
  | ClusterStatus
  | TaskStatus
  | EventLevel;

type StatusConfig = {
  badgeStatus?: BadgeProps['status'];
  color?: string;
  label: string;
};

const statusConfig: Record<PlatformStatus, StatusConfig> = {
  online: { badgeStatus: 'success', label: '在线' },
  running: { badgeStatus: 'processing', label: '运行中' },
  idle: { badgeStatus: 'default', label: '空闲' },
  suspect: { badgeStatus: 'warning', label: '疑似离线' },
  offline: { badgeStatus: 'error', label: '离线' },
  abnormal: { color: '#722ed1', label: '异常' },
  reconnecting: { badgeStatus: 'processing', label: '重新接入' },
  healthy: { badgeStatus: 'success', label: '健康' },
  degraded: { badgeStatus: 'warning', label: '性能降级' },
  unhealthy: { badgeStatus: 'error', label: '不健康' },
  unknown: { badgeStatus: 'default', label: '未知' },
  waiting: { badgeStatus: 'default', label: '等待中' },
  success: { badgeStatus: 'success', label: '已成功' },
  failed: { badgeStatus: 'error', label: '失败' },
  info: { badgeStatus: 'processing', label: '信息' },
  warning: { badgeStatus: 'warning', label: '警告' },
  error: { badgeStatus: 'error', label: '错误' },
};

interface StatusBadgeProps {
  status: PlatformStatus;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status];
  return config.color ? (
    <Badge color={config.color} text={label ?? config.label} />
  ) : (
    <Badge status={config.badgeStatus} text={label ?? config.label} />
  );
}
