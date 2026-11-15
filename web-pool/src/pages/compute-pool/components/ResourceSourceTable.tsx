import { ArrowRightOutlined } from '@ant-design/icons';
import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useLocation } from 'react-router-dom';
import { StatusBadge } from '../../../components/StatusBadge';
import { buildClusterDetailPath, buildNodeDetailPath } from '../../../routes/config';
import type {
  ComputePoolFilters,
  NodeResourceContribution,
  ResourceMetric,
} from '../../../types/computePool';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import {
  SUPPLY_STATUS_CONFIG,
  formatMetricValue,
  getContributionSupplyStatus,
} from '../presentation';

interface ResourceSourceTableProps {
  sources: NodeResourceContribution[];
  resourceType: ComputePoolFilters['resourceType'];
  loading: boolean;
}

function ResourceCell({ metric }: { metric?: ResourceMetric }) {
  if (!metric) return <span className="resource-source-cell--unsupported">—</span>;

  return (
    <div className="resource-source-cell">
      <strong>
        {formatMetricValue(metric.total)} {metric.unit}
      </strong>
      <span>
        已分配 {formatMetricValue(metric.allocated)} {metric.unit}
      </span>
      <span>
        可调度 {formatMetricValue(metric.schedulableAvailable)} {metric.unit}
      </span>
      <span>
        运行 {(metric.runtimeUtilizationPercent ?? metric.utilizationPercent).toFixed(1)}%
      </span>
    </div>
  );
}

export function ResourceSourceTable({ sources, resourceType, loading }: ResourceSourceTableProps) {
  const location = useLocation();
  const returnPath = `${location.pathname}${location.search}`;
  const visibleResourceKinds =
    resourceType === 'all'
      ? RESOURCE_ORDER
      : RESOURCE_ORDER.filter((kind) => kind === resourceType);

  const resourceColumns: ColumnsType<NodeResourceContribution> = visibleResourceKinds.map(
    (kind) => ({
      title: RESOURCE_PRESENTATION[kind].label,
      key: kind,
      width: kind === 'npu' ? 130 : 118,
      render: (_, source) => <ResourceCell metric={source.resources[kind]} />,
    }),
  );

  const columns: ColumnsType<NodeResourceContribution> = [
    {
      title: '资源来源节点',
      key: 'node',
      width: 196,
      fixed: 'left',
      render: (_, source) => (
        <div className="resource-source-node">
          <Link
            to={buildNodeDetailPath(source.nodeId)}
            state={{ from: returnPath }}
            aria-label={`查看节点 ${source.nodeName} 详情`}
          >
            <strong>{source.nodeName}</strong>
            <ArrowRightOutlined />
          </Link>
          <code>{source.nodeId}</code>
          <span>{source.platform}</span>
          {source.nodeSource === 'simulator' && <Tag bordered={false}>模拟节点</Tag>}
        </div>
      ),
    },
    {
      title: '所属集群',
      dataIndex: 'cluster',
      width: 126,
      render: (cluster: NodeResourceContribution['cluster']) =>
        cluster ? (
          <Link className="resource-source-cluster" to={buildClusterDetailPath(cluster.id)}>
            {cluster.name}
          </Link>
        ) : (
          '未加入'
        ),
    },
    {
      title: '架构',
      dataIndex: 'architecture',
      width: 96,
      render: (architecture: NodeResourceContribution['architecture']) => (
        <Tag bordered={false}>{architecture === 'arm64' ? 'ARM64' : architecture}</Tag>
      ),
    },
    ...resourceColumns,
    {
      title: '可用内存',
      key: 'memory',
      width: 112,
      render: (_, source) => (
        <span className="resource-source-memory">
          {formatMetricValue(source.memory.schedulableAvailable)} GB
        </span>
      ),
    },
    {
      title: '供给状态',
      key: 'status',
      width: 134,
      fixed: 'right',
      render: (_, source) => {
        const status = getContributionSupplyStatus(source, resourceType);
        const config = SUPPLY_STATUS_CONFIG[status];
        return (
          <div className="resource-source-status">
            <Tag color={config.color} bordered={false}>
              {config.label}
            </Tag>
            <StatusBadge status={source.operationalStatus} />
          </div>
        );
      },
    },
  ];

  return (
    <Table
      className="resource-source-table"
      rowKey="nodeId"
      columns={columns}
      dataSource={sources}
      loading={loading}
      scroll={{ x: resourceType === 'all' ? 1_320 : 900 }}
      pagination={{
        pageSize: 8,
        showSizeChanger: false,
        showTotal: (total) => `共 ${total} 个资源来源`,
      }}
    />
  );
}
