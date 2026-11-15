import { Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { RegistrationRecord } from '../../../types/node';
import { formatDateTime } from '../presentation';

interface RegistrationRecordTableProps {
  records: RegistrationRecord[];
  loading: boolean;
}

const resultConfig: Record<RegistrationRecord['result'], { label: string; color: string }> = {
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  in_progress: { label: '进行中', color: 'processing' },
};

const reconnectConfig: Record<
  RegistrationRecord['reconnectStatus'],
  { label: string; color: string }
> = {
  not_required: { label: '无需重接', color: 'default' },
  pending: { label: '等待重接', color: 'warning' },
  in_progress: { label: '正在重接', color: 'processing' },
  recovered: { label: '已恢复', color: 'success' },
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined) return '--';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export function RegistrationRecordTable({ records, loading }: RegistrationRecordTableProps) {
  const columns: ColumnsType<RegistrationRecord> = [
    {
      title: '节点',
      key: 'node',
      width: 150,
      render: (_, record) => (
        <div className="node-identity">
          <strong>{record.nodeName}</strong>
          <code className="node-id">{record.nodeId}</code>
        </div>
      ),
    },
    {
      title: '注册发起时间',
      dataIndex: 'startedAt',
      width: 178,
      render: (value: string) => <time dateTime={value}>{formatDateTime(value)}</time>,
    },
    {
      title: '注册完成时间',
      dataIndex: 'completedAt',
      width: 178,
      render: (value?: string) =>
        value ? <time dateTime={value}>{formatDateTime(value)}</time> : '--',
    },
    {
      title: '注册耗时',
      dataIndex: 'durationSeconds',
      width: 105,
      render: (value?: number) => (
        <span className={value !== undefined && value > 300 ? 'duration--late' : undefined}>
          {formatDuration(value)}
        </span>
      ),
    },
    {
      title: '注册结果',
      dataIndex: 'result',
      width: 105,
      render: (result: RegistrationRecord['result']) => {
        const config = resultConfig[result];
        return (
          <Tag color={config.color} bordered={false}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      ellipsis: true,
      render: (reason?: string) =>
        reason ? (
          <Tooltip title={reason}>
            <span className="failure-reason">{reason}</span>
          </Tooltip>
        ) : (
          '--'
        ),
    },
    {
      title: '重接状态',
      dataIndex: 'reconnectStatus',
      width: 115,
      render: (status: RegistrationRecord['reconnectStatus']) => {
        const config = reconnectConfig[status];
        return (
          <Tag color={config.color} bordered={false}>
            {config.label}
          </Tag>
        );
      },
    },
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={records}
      loading={loading}
      scroll={{ x: 1_080 }}
      pagination={{
        pageSize: 8,
        showSizeChanger: false,
        showTotal: (total) => `共 ${total} 条记录`,
      }}
    />
  );
}
