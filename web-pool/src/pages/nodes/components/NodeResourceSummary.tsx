import { Card, Progress, Tag } from 'antd';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import type { ResourceMap } from '../../../types/resource';
import type { CapacityMetric, NodeSource } from '../../../types/node';

interface NodeResourceSummaryProps {
  resources: ResourceMap;
  nodeSource: NodeSource;
  videoMemory?: CapacityMetric;
  memoryLabel: string;
}

const formatAmount = (value: number) => (Number.isInteger(value) ? value : value.toFixed(1));

export function NodeResourceSummary({
  resources,
  nodeSource,
  videoMemory,
  memoryLabel,
}: NodeResourceSummaryProps) {
  return (
    <div className="node-resource-grid">
      {RESOURCE_ORDER.map((kind) => {
        const resource = resources[kind];
        const presentation = RESOURCE_PRESENTATION[kind];

        return (
          <Card key={kind} className="node-resource-card" size="small">
            <div className="node-resource-card__header">
              <span
                className="node-resource-card__icon"
                style={{ color: presentation.color }}
                aria-hidden="true"
              >
                {presentation.icon}
              </span>
              <strong>{presentation.label}</strong>
              {!resource && (
                <Tag className="node-resource-card__unsupported" bordered={false}>
                  不支持
                </Tag>
              )}
            </div>

            {resource ? (
              <>
                <div className="node-resource-card__amount">
                  <strong>{resource.total}</strong>
                  <span>{resource.unit}</span>
                </div>
                <Progress
                  percent={resource.utilization}
                  strokeColor={presentation.color}
                  trailColor="#edf1f7"
                  size={['100%', 7]}
                  format={(percent) => `${Number(percent).toFixed(1)}%`}
                />
                <div className="node-resource-card__footer">
                  <span>
                    {nodeSource === 'agent' ? '已分配' : '已用'}{' '}
                    {nodeSource === 'agent' ? (resource.allocated ?? 0) : resource.used}{' '}
                    {resource.unit}
                  </span>
                  <span>
                    {nodeSource === 'agent' ? '可分配' : '可用'} {resource.available}{' '}
                    {resource.unit}
                  </span>
                </div>
                {kind === 'gpu' && (
                  <div className="node-resource-card__memory">
                    <span>{memoryLabel}</span>
                    <strong>
                      {videoMemory
                        ? `${formatAmount(videoMemory.total)} ${videoMemory.unit}`
                        : '--'}
                    </strong>
                  </div>
                )}
              </>
            ) : (
              <p className="node-resource-card__empty">当前节点未上报该类异构能力</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
