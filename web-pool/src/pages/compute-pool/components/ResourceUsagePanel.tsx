import { BarChartOutlined } from '@ant-design/icons';
import { Card, Progress } from 'antd';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../../components/resourcePresentation';
import type { ComputeResourceMetricMap } from '../../../types/computePool';
import { formatMetricValue } from '../presentation';

interface ResourceUsagePanelProps {
  resources: ComputeResourceMetricMap;
}

export function ResourceUsagePanel({ resources }: ResourceUsagePanelProps) {
  return (
    <Card
      className="compute-pool-panel"
      title={
        <span className="compute-pool-panel__title">
          <BarChartOutlined />
          <span>
            <strong>资源利用情况</strong>
            <small>运行利用率与调度分配量分开统计，不生成综合算力评分</small>
          </span>
        </span>
      }
    >
      <div className="compute-pool-usage-list">
        {RESOURCE_ORDER.flatMap((kind) => {
          const metric = resources[kind];
          if (!metric) return [];
          const presentation = RESOURCE_PRESENTATION[kind];

          return [
            <div key={kind} className="compute-pool-usage-row">
              <div className="compute-pool-usage-row__heading">
                <strong style={{ color: presentation.color }}>{presentation.label}</strong>
                <span>
                  运行利用率{' '}
                  {(metric.runtimeUtilizationPercent ?? metric.utilizationPercent).toFixed(1)}% ·
                  已分配 {formatMetricValue(metric.allocated)} / {formatMetricValue(metric.total)}{' '}
                  {metric.unit}
                </span>
              </div>
              <Progress
                percent={metric.runtimeUtilizationPercent ?? metric.utilizationPercent}
                strokeColor={presentation.color}
                trailColor="#edf1f7"
                size={['100%', 8]}
                showInfo={false}
              />
              <div className="compute-pool-usage-row__footer">
                <span>
                  物理未分配 {formatMetricValue(metric.available)} {metric.unit}
                </span>
                <span>
                  可供调度 {formatMetricValue(metric.schedulableAvailable)} {metric.unit}
                </span>
              </div>
            </div>,
          ];
        })}
      </div>
    </Card>
  );
}
