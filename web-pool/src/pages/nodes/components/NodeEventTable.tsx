import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StatusBadge } from '../../../components/StatusBadge';
import type { NodeEvent } from '../../../types/node';
import { formatDateTime } from '../presentation';

interface NodeEventTableProps {
  events: NodeEvent[];
  loading: boolean;
}

const eventTypeLabels: Record<NodeEvent['type'], string> = {
  node_online: '节点上线',
  heartbeat_abnormal: '心跳异常',
  node_suspect: '进入疑似离线',
  node_offline: '节点离线',
  node_abnormal: '节点异常',
  reconnect_started: '开始重新接入',
  node_recovered: '状态恢复',
  schedulable_restored: '恢复可调度',
  registration_failed: '注册失败',
  node_discovered: '发现节点',
  pending_approval: '等待批准',
  registration_started: '开始注册',
  registration_completed: '注册完成',
  registration_rejected: '拒绝接入',
  scheduling_disabled: '暂停调度',
  scheduling_enabled: '恢复调度',
  node_joined_pool: '加入资源池',
  node_removed: '移出资源池',
  node_labels_updated: '更新节点标签',
  node_assigned_cluster: '加入集群',
  node_moved_cluster: '迁移集群',
  node_unassigned_cluster: '移出集群',
  reconnect_guidance_requested: '查看恢复指引',
  registration_retry: '重新接入',
};

const eventTypeColors: Record<NodeEvent['type'], string> = {
  node_online: 'success',
  heartbeat_abnormal: 'warning',
  node_suspect: 'warning',
  node_offline: 'error',
  node_abnormal: 'magenta',
  reconnect_started: 'processing',
  node_recovered: 'cyan',
  schedulable_restored: 'success',
  registration_failed: 'error',
  node_discovered: 'cyan',
  pending_approval: 'default',
  registration_started: 'processing',
  registration_completed: 'success',
  registration_rejected: 'error',
  scheduling_disabled: 'warning',
  scheduling_enabled: 'success',
  node_joined_pool: 'success',
  node_removed: 'default',
  node_labels_updated: 'blue',
  node_assigned_cluster: 'success',
  node_moved_cluster: 'processing',
  node_unassigned_cluster: 'default',
  reconnect_guidance_requested: 'processing',
  registration_retry: 'processing',
};

export function NodeEventTable({ events, loading }: NodeEventTableProps) {
  const columns: ColumnsType<NodeEvent> = [
    {
      title: '发生时间',
      dataIndex: 'occurredAt',
      width: 178,
      render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
    },
    {
      title: '节点',
      key: 'node',
      width: 150,
      render: (_, event) => (
        <div className="node-identity">
          <strong>{event.nodeName}</strong>
          <code className="node-id">{event.nodeId}</code>
        </div>
      ),
    },
    {
      title: '事件类型',
      dataIndex: 'type',
      width: 140,
      render: (type: NodeEvent['type']) => (
        <Tag color={eventTypeColors[type]} bordered={false}>
          {eventTypeLabels[type]}
        </Tag>
      ),
    },
    {
      title: '级别',
      dataIndex: 'level',
      width: 100,
      render: (level: NodeEvent['level']) => <StatusBadge status={level} />,
    },
    {
      title: '事件说明',
      dataIndex: 'message',
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={events}
      loading={loading}
      scroll={{ x: 860 }}
      pagination={{
        pageSize: 8,
        showSizeChanger: false,
        showTotal: (total) => `共 ${total} 条事件`,
      }}
    />
  );
}
