import { ApartmentOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Card, Progress, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import { buildClusterDetailPath } from '../../../routes/config';
import type { ClusterResourceSummary } from '../../../types/computePool';
import { formatMetricValue } from '../presentation';

interface ClusterResourcePanelProps {
  clusters: ClusterResourceSummary[];
}

export function ClusterResourcePanel({ clusters }: ClusterResourcePanelProps) {
  return (
    <Card
      className="compute-pool-panel compute-pool-cluster-panel"
      title={
        <span className="compute-pool-panel__title">
          <ApartmentOutlined />
          <span>
            <strong>资源按集群分布</strong>
            <small>仅展示资源组织分布，生命周期由集群管理负责</small>
          </span>
        </span>
      }
    >
      <div className="cluster-resource-grid">
        {clusters.map((cluster) => {
          const schedulableRate =
            cluster.nodeCount > 0
              ? Number(((cluster.schedulableNodeCount / cluster.nodeCount) * 100).toFixed(1))
              : 0;

          return (
            <article key={cluster.cluster.id} className="cluster-resource-card">
              <div className="cluster-resource-card__header">
                <div>
                  <Link to={buildClusterDetailPath(cluster.cluster.id)}>
                    {cluster.cluster.name}
                    <ArrowRightOutlined />
                  </Link>
                  <span>{cluster.nodeCount} 个节点</span>
                </div>
                <Tag color="blue" bordered={false}>
                  {cluster.schedulableNodeCount} 个可调度
                </Tag>
              </div>

              <div className="cluster-resource-card__schedulable-rate">
                <span>可调度节点比例</span>
                <Progress
                  percent={schedulableRate}
                  strokeColor="#35ddff"
                  trailColor="rgba(36, 105, 142, 0.34)"
                  size={['100%', 6]}
                  format={(percent) => `${Number(percent).toFixed(0)}%`}
                />
              </div>

              <dl className="cluster-resource-card__resources">
                {RESOURCE_ORDER.flatMap((kind) => {
                  const metric = cluster.resources[kind];
                  if (!metric) return [];
                  return [
                    <div key={kind}>
                      <dt style={{ color: RESOURCE_PRESENTATION[kind].color }}>
                        <span className="cluster-resource-card__resource-icon" aria-hidden="true">
                          {RESOURCE_PRESENTATION[kind].icon}
                        </span>
                        <span>{RESOURCE_PRESENTATION[kind].label}</span>
                      </dt>
                      <dd>
                        <strong>{formatMetricValue(metric.total)}</strong>
                        <span>{metric.unit}</span>
                      </dd>
                      <small>可调度 {formatMetricValue(metric.schedulableAvailable)}</small>
                    </div>,
                  ];
                })}
              </dl>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
