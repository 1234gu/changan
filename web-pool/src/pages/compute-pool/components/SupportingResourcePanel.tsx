import { DatabaseOutlined, HddOutlined } from '@ant-design/icons';
import { Card, Progress } from 'antd';
import type { SupportingResourceSummary } from '../../../types/computePool';
import { formatCapacity } from '../presentation';

interface SupportingResourcePanelProps {
  resources: SupportingResourceSummary;
}

export function SupportingResourcePanel({ resources }: SupportingResourcePanelProps) {
  const items = [
    { key: 'memory', label: 'Memory', icon: <DatabaseOutlined />, metric: resources.memory },
    ...(resources.videoMemory
      ? [{ key: 'vram', label: 'VRAM', icon: <DatabaseOutlined />, metric: resources.videoMemory }]
      : []),
    { key: 'storage', label: 'Storage', icon: <HddOutlined />, metric: resources.storage },
  ];

  return (
    <Card
      className="compute-pool-panel"
      title={
        <span className="compute-pool-panel__title">
          <DatabaseOutlined />
          <span>
            <strong>支撑资源</strong>
            <small>内存、显存与本地存储容量</small>
          </span>
        </span>
      }
    >
      <div className="supporting-resource-list">
        {items.map(({ key, label, icon, metric }) => (
          <div key={key} className="supporting-resource-row">
            <span className="supporting-resource-row__icon" aria-hidden="true">
              {icon}
            </span>
            <div className="supporting-resource-row__body">
              <div className="supporting-resource-row__heading">
                <strong>{label}</strong>
                <span>{formatCapacity(metric.total, metric.unit)}</span>
              </div>
              <Progress
                percent={metric.utilizationPercent}
                showInfo={false}
                strokeColor="#356df3"
                trailColor="#edf1f7"
                size={['100%', 6]}
              />
              <div className="supporting-resource-row__footer">
                <span>
                  {key === 'vram' ? '已使用' : '已分配'}{' '}
                  {formatCapacity(key === 'vram' ? metric.used : metric.allocated, metric.unit)}
                </span>
                <span>
                  {key === 'vram' ? '可用' : '可调度'}{' '}
                  {formatCapacity(
                    key === 'vram' ? metric.available : metric.schedulableAvailable,
                    metric.unit,
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
