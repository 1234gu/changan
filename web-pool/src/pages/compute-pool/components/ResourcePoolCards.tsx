import type { CSSProperties } from 'react';
import { Card, Progress } from 'antd';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import type { ComputeResourceMetricMap, ResourceMetric } from '../../../types/computePool';
import { formatMetricValue } from '../presentation';

interface ResourcePoolCardsProps {
  resources: ComputeResourceMetricMap;
  videoMemory?: ResourceMetric;
}

export function ResourcePoolCards({ resources, videoMemory }: ResourcePoolCardsProps) {
  return (
    <section className="compute-pool-card-grid" aria-label="核心资源池总览">
      {RESOURCE_ORDER.map((kind) => {
        const metric = resources[kind];
        const presentation = RESOURCE_PRESENTATION[kind];
        const collectionStatus = metric.collectionStatus ?? 'complete';
        const statusLabel =
          collectionStatus === 'error'
            ? '采集异常'
            : collectionStatus === 'partial'
              ? '采集不完整'
              : null;

        return (
          <Card
            key={kind}
            className={`compute-pool-resource-card compute-pool-resource-card--${kind}`}
            style={{ '--pool-accent': presentation.color } as CSSProperties}
          >
            <div className="compute-pool-resource-card__header">
              <span className="compute-pool-resource-card__icon" aria-hidden="true">
                {presentation.icon}
              </span>
              <div>
                <strong>{presentation.label} 资源池</strong>
                <span>物理容量</span>
              </div>
            </div>

            <div className="compute-pool-resource-card__total">
              <strong>{formatMetricValue(metric.total)}</strong>
              <span>{presentation.unit}</span>
              <span className="compute-pool-resource-card__utilization">
                运行利用率{' '}
                {(metric.runtimeUtilizationPercent ?? metric.utilizationPercent).toFixed(1)}%
              </span>
            </div>

            <Progress
              percent={metric.runtimeUtilizationPercent ?? metric.utilizationPercent}
              strokeColor={presentation.color}
              trailColor="rgba(36, 105, 142, 0.34)"
              size={['100%', 7]}
              showInfo={false}
            />

            {kind === 'gpu' ? (
              <div className="compute-pool-resource-card__resource-layers">
                <section aria-label="GPU 设备资源">
                  <strong className="compute-pool-resource-card__layer-title">GPU 设备资源</strong>
                  <dl className="compute-pool-resource-card__metrics compute-pool-resource-card__metrics--three">
                    <div>
                      <dt>总量</dt>
                      <dd>{formatMetricValue(metric.total)} GPU</dd>
                    </div>
                    <div>
                      <dt>已分配</dt>
                      <dd>{formatMetricValue(metric.allocated)} GPU</dd>
                    </div>
                    <div>
                      <dt>可用</dt>
                      <dd>{formatMetricValue(metric.available)} GPU</dd>
                    </div>
                  </dl>
                </section>
                <section aria-label="GPU 显存资源">
                  <strong className="compute-pool-resource-card__layer-title">GPU 显存资源</strong>
                  <dl className="compute-pool-resource-card__metrics compute-pool-resource-card__metrics--three">
                    <div>
                      <dt>显存总量</dt>
                      <dd>{formatMetricValue(videoMemory?.total ?? 0)} GB</dd>
                    </div>
                    <div>
                      <dt>已用显存</dt>
                      <dd>{formatMetricValue(videoMemory?.used ?? 0)} GB</dd>
                    </div>
                    <div>
                      <dt>可用显存</dt>
                      <dd>{formatMetricValue(videoMemory?.available ?? 0)} GB</dd>
                    </div>
                  </dl>
                </section>
              </div>
            ) : (
              <dl className="compute-pool-resource-card__metrics">
                <div>
                  <dt>总量</dt>
                  <dd>
                    {formatMetricValue(metric.total)} {presentation.unit}
                  </dd>
                </div>
                <div>
                  <dt>已分配</dt>
                  <dd>
                    {formatMetricValue(metric.allocated)} {presentation.unit}
                  </dd>
                </div>
                <div>
                  <dt>可用</dt>
                  <dd>
                    {formatMetricValue(metric.available)} {presentation.unit}
                  </dd>
                </div>
                <div>
                  <dt>利用率</dt>
                  <dd>
                    {(metric.runtimeUtilizationPercent ?? metric.utilizationPercent).toFixed(1)}%
                  </dd>
                </div>
              </dl>
            )}
            {statusLabel && (
              <div
                className={`compute-pool-resource-card__collection-status is-${collectionStatus}`}
              >
                {statusLabel}
                {(metric.issueNodeCount ?? 0) > 0 ? ` · ${metric.issueNodeCount} 个节点` : ''}
              </div>
            )}
          </Card>
        );
      })}
    </section>
  );
}
