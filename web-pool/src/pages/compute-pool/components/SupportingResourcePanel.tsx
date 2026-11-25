import { DatabaseOutlined, HddOutlined } from '@ant-design/icons';
import type { SupportingResourceSummary } from '../../../types/computePool';
import { formatCapacity } from '../presentation';

interface SupportingResourcePanelProps {
  resources: SupportingResourceSummary;
}

export function SupportingResourcePanel({ resources }: SupportingResourcePanelProps) {
  const items = [
    { key: 'memory', label: '内存', icon: <DatabaseOutlined />, metric: resources.memory },
    { key: 'storage', label: '存储', icon: <HddOutlined />, metric: resources.storage },
  ];

  return (
    <section className="compute-pool-supporting-strip" aria-label="支撑资源容量">
      <div className="compute-pool-supporting-strip__title">
        <DatabaseOutlined />
        <span>支撑资源</span>
      </div>
      <div className="compute-pool-supporting-strip__items">
        {items.map(({ key, label, icon, metric }) => (
          <article key={key} className="supporting-resource-item">
            <span className="supporting-resource-item__icon" aria-hidden="true">
              {icon}
            </span>
            <div className="supporting-resource-item__main">
              <span>{label}</span>
              <strong>{formatCapacity(metric.total, metric.unit)}</strong>
            </div>
            <dl className="supporting-resource-item__details">
              <div>
                <dt>已分配</dt>
                <dd>{formatCapacity(metric.allocated, metric.unit)}</dd>
              </div>
              <div>
                <dt>可调度</dt>
                <dd>{formatCapacity(metric.schedulableAvailable, metric.unit)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
