import { Alert, Button, Drawer, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { NodeSummary } from '../../../types/node';
import { formatDateTime } from '../presentation';

interface PendingNodesDrawerProps {
  open: boolean;
  nodes: NodeSummary[];
  loading: boolean;
  actionNodeId?: string;
  onClose: () => void;
  onApprove: (node: NodeSummary) => void;
  onReject: (node: NodeSummary) => void;
}

function formatCpu(node: NodeSummary) {
  const physicalCores = node.cpuDetails?.physicalCores;
  const total = physicalCores && physicalCores > 0 ? physicalCores : node.resources.cpu.total;
  return `${total} Core`;
}

function formatGpu(node: NodeSummary) {
  if (node.gpuDetails && !node.gpuDetails.supported) return '不支持';
  if (node.gpuDetails && !node.gpuDetails.available) return '采集不可用';
  const deviceCount = node.gpuDetails?.deviceCount ?? node.resources.gpu?.total;
  if (deviceCount === undefined || deviceCount === 0) return '不支持';
  return `${deviceCount} 个`;
}

export function PendingNodesDrawer({
  open,
  nodes,
  loading,
  actionNodeId,
  onClose,
  onApprove,
  onReject,
}: PendingNodesDrawerProps) {
  const columns: ColumnsType<NodeSummary> = [
    {
      title: '节点名称',
      dataIndex: 'name',
      width: 140,
      fixed: 'left',
      render: (name: string, node) => (
        <div className="node-identity">
          <strong>{name}</strong>
          <Tag color="blue" bordered={false}>
            {node.nodeSource === 'agent' ? '主动注册节点' : '模拟节点'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Node ID',
      dataIndex: 'id',
      width: 230,
      render: (id: string) => <code className="node-id">{id}</code>,
    },
    {
      title: '架构',
      dataIndex: 'architecture',
      width: 92,
      render: (architecture: string) => <Tag bordered={false}>{architecture}</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 128,
      render: (ipAddress?: string) => ipAddress ?? '--',
    },
    {
      title: 'CPU',
      key: 'cpu',
      width: 96,
      render: (_, node) => formatCpu(node),
    },
    {
      title: 'GPU',
      key: 'gpu',
      width: 92,
      render: (_, node) => formatGpu(node),
    },
    {
      title: '操作系统',
      key: 'operatingSystem',
      width: 160,
      render: (_, node) => [node.operatingSystem, node.osVersion].filter(Boolean).join(' ') || '--',
    },
    {
      title: '发现时间',
      dataIndex: 'discoveredAt',
      width: 170,
      render: (discoveredAt?: string) =>
        discoveredAt ? <time dateTime={discoveredAt}>{formatDateTime(discoveredAt)}</time> : '--',
    },
    {
      title: '操作',
      key: 'actions',
      width: 164,
      fixed: 'right',
      render: (_, node) => {
        const acting = actionNodeId === node.id;
        const anotherActionRunning = Boolean(actionNodeId) && !acting;

        return (
          <Space size={8}>
            <Button
              type="primary"
              size="small"
              loading={acting}
              disabled={anotherActionRunning}
              onClick={() => onApprove(node)}
            >
              允许接入
            </Button>
            <Button
              danger
              size="small"
              disabled={Boolean(actionNodeId)}
              onClick={() => onReject(node)}
            >
              拒绝
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Drawer
      title={`待接入节点 (${nodes.length})`}
      width={1120}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message="发现新的算力节点"
        description="以下节点已主动注册并上报身份；管理员批准前不会进入可调度资源池。"
        style={{ marginBottom: 16 }}
      />
      <Table
        aria-label="待接入节点列表"
        rowKey="id"
        columns={columns}
        dataSource={nodes}
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={false}
        locale={{ emptyText: '当前没有待接入节点' }}
      />
    </Drawer>
  );
}
