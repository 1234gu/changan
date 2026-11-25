export type EventLevel = 'info' | 'warning' | 'error';

export type EventType =
  | 'heartbeat_timeout'
  | 'node_reconnected'
  | 'cluster_degraded'
  | 'node_joined'
  | 'task_created'
  | 'task_succeeded'
  | 'task_failed'
  | 'task_canceled'
  | 'task_timed_out'
  | 'unknown';

export interface SystemEvent {
  id: string;
  type: EventType;
  level: EventLevel;
  message: string;
  occurredAt: string;
  targetId?: string;
  targetType?: 'node' | 'cluster' | 'task';
}
