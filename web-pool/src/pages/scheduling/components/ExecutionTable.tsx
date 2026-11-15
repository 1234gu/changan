import { Empty, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { SchedulerExecution, SchedulerExecutionStatus } from '../../../types/scheduling';

const STATUS: Record<SchedulerExecutionStatus, { color: string; label: string }> = {
  QUEUED: { color: 'default', label: '排队中' },
  ASSIGNED: { color: 'blue', label: '已分配' },
  STARTING: { color: 'cyan', label: '启动中' },
  RUNNING: { color: 'processing', label: '运行中' },
  SUCCEEDED: { color: 'success', label: '已完成' },
  FAILED: { color: 'error', label: '失败' },
  CANCELLED: { color: 'warning', label: '已取消' },
  LOST: { color: 'volcano', label: '已丢失' },
};

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--';
}

function formatAllocation(item: SchedulerExecution) {
  const value = item.allocatedResources;
  if (!value) return '未上报';
  const parts = [
    value.cpuCores === undefined ? undefined : `CPU ${value.cpuCores} Core`,
    value.gpuCount === undefined ? undefined : `GPU ${value.gpuCount}`,
    value.vramGb === undefined ? undefined : `显存 ${value.vramGb} GB`,
    value.memoryGb === undefined ? undefined : `内存 ${value.memoryGb} GB`,
    value.npuTops === undefined ? undefined : `NPU ${value.npuTops} TOPS`,
    value.dlaCount === undefined ? undefined : `DLA ${value.dlaCount} Device`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '未上报';
}

const columns: ColumnsType<SchedulerExecution> = [
  { title: '任务', dataIndex: 'taskId', width: 130 },
  { title: '分片', dataIndex: 'shardId', width: 120, render: (value?: string) => value ?? '--' },
  { title: '尝试', dataIndex: 'attemptId', width: 150 },
  {
    title: '物理节点',
    dataIndex: 'physicalNodeId',
    width: 220,
    render: (value: string) => <code>{value}</code>,
  },
  {
    title: 'Executor',
    dataIndex: 'executorId',
    width: 140,
    render: (value?: string) => value ?? '--',
  },
  { title: 'Pod', width: 160, render: (_, item) => item.k3s?.podUid ?? '--' },
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: (value: SchedulerExecutionStatus) => (
      <Tag color={STATUS[value].color} bordered={false}>
        {STATUS[value].label}
      </Tag>
    ),
  },
  { title: '分配资源', width: 250, render: (_, item) => formatAllocation(item) },
  {
    title: '队列',
    dataIndex: 'queueLength',
    width: 80,
    render: (value?: number) => value ?? '--',
  },
  { title: '开始时间', dataIndex: 'startedAt', width: 170, render: formatTime },
  { title: '结束时间', dataIndex: 'finishedAt', width: 170, render: formatTime },
  {
    title: '错误',
    dataIndex: 'error',
    width: 180,
    ellipsis: true,
    render: (value?: string) =>
      value ? (
        <Tooltip title={value}>
          <span>{value}</span>
        </Tooltip>
      ) : (
        '--'
      ),
  },
];

interface ExecutionTableProps {
  items: SchedulerExecution[];
  loading?: boolean;
  emptyDescription?: string;
}

export function ExecutionTable({
  items,
  loading,
  emptyDescription = '尚未收到 Scheduler 执行事件',
}: ExecutionTableProps) {
  return (
    <Table
      rowKey="attemptId"
      columns={columns}
      dataSource={items}
      loading={loading}
      pagination={items.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />,
      }}
      scroll={{ x: 1900 }}
      size="small"
    />
  );
}
