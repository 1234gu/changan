import { CloudServerOutlined, RightOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import type { ClusterSummary } from '../types/cluster';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from './resourcePresentation';
import { StatusBadge } from './StatusBadge';

interface ClusterSummaryCardProps {
  cluster: ClusterSummary;
  to: string;
}

export function ClusterSummaryCard({ cluster, to }: ClusterSummaryCardProps) {
  return (
    <Link className="cluster-summary" to={to} aria-label={`查看 ${cluster.name}`}>
      <div className="cluster-summary__header">
        <div className="cluster-summary__identity">
          <span className="cluster-summary__icon" aria-hidden="true">
            <CloudServerOutlined />
          </span>
          <div>
            <strong>{cluster.name}</strong>
            <StatusBadge status={cluster.status} />
          </div>
        </div>
        <RightOutlined className="cluster-summary__arrow" />
      </div>
      <div className="cluster-summary__meta">
        <span>{cluster.nodeCount} 个节点</span>
        <div className="cluster-summary__resources">
          {RESOURCE_ORDER.flatMap((kind) => {
            const resource = cluster.resources[kind];
            if (!resource) return [];

            return (
              <Tag key={kind} bordered={false}>
                {RESOURCE_PRESENTATION[kind].label} {resource.total} {resource.unit}
              </Tag>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
