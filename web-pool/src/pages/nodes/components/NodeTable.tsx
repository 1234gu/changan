import {
  DeleteOutlined,
  EyeOutlined,
  MoreOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusCircleOutlined,
  RedoOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import { StatusBadge } from '../../../components/StatusBadge';
import type { NodeSummary } from '../../../types/node';
import { buildClusterDetailPath, buildNodeDetailPath } from '../../../routes/config';
import {
  ACCESS_STATUS_CONFIG,
  NODE_TYPE_LABELS,
  formatDateTime,
  formatHeartbeatAge,
} from '../presentation';
import { NodeLabelsEditor } from './NodeLabelsEditor';

interface NodeTableProps {
  nodes: NodeSummary[];
  loading: boolean;
  actionNodeId: string | null;
  onSchedulingChange: (node: NodeSummary, enabled: boolean) => void;
  onReconnect: (node: NodeSummary) => void;
  onJoinPool: (node: NodeSummary) => void;
  onRemove: (node: NodeSummary) => void;
  onDelete: (node: NodeSummary) => void;
  onLabelsChange: (node: NodeSummary, labels: string[]) => Promise<boolean>;
}

function formatResources(node: NodeSummary) {
  const cpuCores = node.resources.cpu.total;
  const gpu = node.gpuDetails;
  const otherAccelerators = [
    node.resources.npu ? `NPU ${node.resources.npu.total} TOPS` : undefined,
    node.resources.dla ? `DLA ${node.resources.dla.total} Device` : undefined,
  ].filter(Boolean);
  const withOtherAccelerators = (summary: string) => [summary, ...otherAccelerators].join(' · ');
  if (gpu && !gpu.supported) {
    return withOtherAccelerators(`CPU ${cpuCores} Core · GPU 不支持 · 显存不支持`);
  }

  const gpuCount = gpu?.deviceCount ?? node.resources.gpu?.total ?? 0;
  if (gpu?.supported && !gpu.available) {
    return withOtherAccelerators(`CPU ${cpuCores} Core · GPU ${gpuCount} · 显存采集不可用`);
  }

  if (gpu?.memoryArchitecture === 'unified') {
    return withOtherAccelerators(`CPU ${cpuCores} Core · GPU ${gpuCount} · 统一内存`);
  }
  const fallbackVramBytes =
    gpu?.devices.reduce(
      (total, device) => total + (device.vramTotalBytes ?? (device.memoryTotalMB ?? 0) * 1024 ** 2),
      0,
    ) ?? 0;
  const totalVramBytes = gpu?.totalVramBytes ?? fallbackVramBytes;
  if (gpu?.supported && totalVramBytes <= 0) {
    return withOtherAccelerators(`CPU ${cpuCores} Core · GPU ${gpuCount} · 显存采集不可用`);
  }

  const vramGb = totalVramBytes / 1024 ** 3;
  const formattedVram = Number.isInteger(vramGb) ? String(vramGb) : vramGb.toFixed(1);
  return withOtherAccelerators(`CPU ${cpuCores} Core · GPU ${gpuCount} · 显存 ${formattedVram} GB`);
}

export function NodeTable({
  nodes,
  loading,
  actionNodeId,
  onSchedulingChange,
  onReconnect,
  onJoinPool,
  onRemove,
  onDelete,
  onLabelsChange,
}: NodeTableProps) {
  const location = useLocation();
  const returnPath = `${location.pathname}${location.search}`;
  const columns: ColumnsType<NodeSummary> = [
    {
      title: '节点名称',
      dataIndex: 'name',
      width: 210,
      fixed: 'left',
      render: (name: string, node) => (
        <div className="node-identity">
          <strong>{name}</strong>
          <NodeLabelsEditor
            labels={node.labels}
            editable={node.nodeSource === 'agent'}
            loading={actionNodeId === node.id}
            onSave={(labels) => onLabelsChange(node, labels)}
          />
        </div>
      ),
    },
    {
      title: 'Node ID',
      dataIndex: 'id',
      width: 226,
      render: (id: string) => <code className="node-id">{id}</code>,
    },
    {
      title: '平台 / 类型',
      dataIndex: 'platform',
      width: 154,
      render: (platform: string, node) => (
        <div className="node-platform">
          <strong>{platform}</strong>
          <span>{NODE_TYPE_LABELS[node.nodeType]}</span>
        </div>
      ),
    },
    {
      title: '架构',
      dataIndex: 'architecture',
      width: 92,
      render: (architecture: string) => (
        <Tag className="node-architecture-tag" bordered={false}>
          {architecture}
        </Tag>
      ),
    },
    {
      title: '算力资源摘要',
      key: 'resources',
      width: 310,
      render: (_, node) => <span className="node-resource-summary">{formatResources(node)}</span>,
    },
    {
      title: '所属集群',
      dataIndex: 'cluster',
      width: 116,
      render: (cluster: NodeSummary['cluster']) =>
        cluster ? (
          <Link className="node-cluster-link" to={buildClusterDetailPath(cluster.id)}>
            {cluster.name}
          </Link>
        ) : (
          '未加入'
        ),
    },
    {
      title: '节点状态',
      key: 'status',
      width: 150,
      render: (_, node) => <StatusBadge status={node.operationalStatus} />,
    },
    {
      title: '可调度',
      dataIndex: 'schedulable',
      width: 88,
      align: 'center',
      render: (schedulable: boolean) => (
        <Tag color={schedulable ? 'success' : 'default'} bordered={false}>
          {schedulable ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '最后心跳',
      dataIndex: 'heartbeatAt',
      width: 106,
      render: (heartbeatAt: string) => (
        <Tooltip title={formatDateTime(heartbeatAt)}>
          <span className="heartbeat-age">{formatHeartbeatAge(heartbeatAt)}</span>
        </Tooltip>
      ),
    },
    {
      title: '接入状态',
      dataIndex: 'accessStatus',
      width: 112,
      render: (status: NodeSummary['accessStatus']) => {
        const config = ACCESS_STATUS_CONFIG[status];
        return (
          <Tag color={config.color} bordered={false}>
            {config.label}
          </Tag>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 148,
      fixed: 'right',
      render: (_, node) => {
        const isAgent = node.nodeSource === 'agent';
        const inPool = node.poolMembership === 'in_pool';
        const canManage = isAgent && node.authorizationStatus === 'approved' && node.everApproved;
        const schedulingEnabled = node.schedulingEnabled ?? node.schedulable;
        const online = node.operationalStatus === 'online';
        const needsReconnect = !online;
        const actionItems: MenuProps['items'] = [];

        if (canManage && online && inPool) {
          actionItems.push({
            key: 'scheduling',
            icon: schedulingEnabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
            label: schedulingEnabled ? '暂停调度' : '恢复调度',
          });
        }
        if (canManage && needsReconnect) {
          actionItems.push({
            key: 'reconnect',
            icon: <RedoOutlined />,
            label: '重新接入',
          });
        }
        if (canManage && actionItems.length > 0) actionItems.push({ type: 'divider' });
        if (canManage) {
          actionItems.push({
            key: 'pool-membership',
            icon: inPool ? <MinusCircleOutlined /> : <PlusCircleOutlined />,
            label: inPool ? '移出资源池' : '加入资源池',
          });
        }
        if (isAgent) {
          if (actionItems.length > 0) actionItems.push({ type: 'divider' });
          actionItems.push({
            key: 'delete-node',
            icon: <DeleteOutlined />,
            label: '删除节点',
            danger: true,
          });
        }

        return (
          <Space size={8}>
            <Link
              className="node-table__detail-link"
              to={buildNodeDetailPath(node.id)}
              state={{ from: returnPath }}
            >
              <EyeOutlined />
              <span>详情</span>
            </Link>
            <Dropdown
              overlayClassName="node-action-dropdown"
              trigger={['click']}
              menu={{
                items: actionItems,
                onClick: ({ key }) => {
                  if (key === 'scheduling') onSchedulingChange(node, !schedulingEnabled);
                  if (key === 'reconnect') onReconnect(node);
                  if (key === 'pool-membership') {
                    if (inPool) onRemove(node);
                    else onJoinPool(node);
                  }
                  if (key === 'delete-node') onDelete(node);
                },
              }}
            >
              <Button
                type="text"
                size="small"
                disabled={actionItems.length === 0}
                aria-label={`更多节点操作：${node.name}`}
                loading={actionNodeId === node.id}
                icon={<MoreOutlined />}
              />
            </Dropdown>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      className="node-table"
      rowKey="id"
      columns={columns}
      dataSource={nodes}
      loading={loading}
      scroll={{ x: 1_710 }}
      pagination={{
        pageSize: 8,
        showSizeChanger: false,
        showTotal: (total) => `共 ${total} 个节点`,
      }}
    />
  );
}
