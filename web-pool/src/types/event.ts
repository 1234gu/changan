export type EventLevel = 'info' | 'warning' | 'error';

export type EventType =
  'heartbeat_timeout' | 'node_reconnected' | 'cluster_degraded' | 'node_joined' | 'unknown';

export interface SystemEvent {
  id: string;
  type: EventType;
  level: EventLevel;
  message: string;
  occurredAt: string;
  targetId?: string;
}
