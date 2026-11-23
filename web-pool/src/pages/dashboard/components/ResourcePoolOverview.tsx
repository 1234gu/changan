import type { CSSProperties, ReactNode } from 'react';
import {
  ApiOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { buildComputePoolPath, ROUTES } from '../../../routes/config';
import { describeVideoMemory } from '../../../services/videoMemoryPolicy';
import type { SupportingResourceSummary } from '../../../types/computePool';
import type { ResourceMap, ResourceSummary } from '../../../types/resource';

interface ResourcePoolOverviewProps {
  resources: ResourceMap;
  supportingResources: SupportingResourceSummary;
}

interface ResourceCard {
  key: string;
  title: string;
  value: number;
  unit: string;
  utilization: number;
  details: string[];
  icon: ReactNode;
  color: string;
  to: string;
}

const emptyResource = (unit: ResourceSummary['unit']): ResourceSummary => ({
  total: 0,
  used: 0,
  allocated: 0,
  available: 0,
  utilization: 0,
  runtimeUtilization: 0,
  unit,
});

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const utilizationOf = (resource: ResourceSummary) =>
  resource.runtimeUtilization ?? resource.utilization;

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function ResourcePoolOverview({
  resources,
  supportingResources,
}: ResourcePoolOverviewProps) {
  const cpu = resources.cpu ?? emptyResource('Core');
  const gpu = resources.gpu ?? emptyResource('GPU');
  const npu = resources.npu ?? emptyResource('TOPS');
  const dla = resources.dla ?? emptyResource('Device');
  const memory = supportingResources.memory;
  const videoMemoryDetails = describeVideoMemory(supportingResources.videoMemory);

  const cards: ResourceCard[] = [
    {
      key: 'cpu',
      title: 'CPU 算力',
      value: cpu.total,
      unit: cpu.unit,
      utilization: utilizationOf(cpu),
      details: [
        `可用 ${formatNumber(cpu.available)} ${cpu.unit}`,
        `已分配 ${formatNumber(cpu.allocated ?? 0)} ${cpu.unit}`,
      ],
      icon: <DashboardOutlined />,
      color: '#35d6ff',
      to: buildComputePoolPath({ resourceType: 'cpu' }),
    },
    {
      key: 'gpu',
      title: 'GPU 算力',
      value: gpu.total,
      unit: gpu.unit,
      utilization: utilizationOf(gpu),
      details: videoMemoryDetails,
      icon: <ThunderboltOutlined />,
      color: '#6888ff',
      to: buildComputePoolPath({ resourceType: 'gpu' }),
    },
    {
      key: 'memory',
      title: '内存',
      value: memory.total,
      unit: memory.unit,
      utilization: memory.runtimeUtilizationPercent ?? memory.utilizationPercent,
      details: [
        `可用 ${formatNumber(memory.available)} ${memory.unit}`,
        `已分配 ${formatNumber(memory.allocated)} ${memory.unit}`,
      ],
      icon: <DatabaseOutlined />,
      color: '#3de1bd',
      to: ROUTES.computePool,
    },
    {
      key: 'npu',
      title: 'NPU 算力',
      value: npu.total,
      unit: npu.unit,
      utilization: utilizationOf(npu),
      details: [
        npu.total > 0 ? `可用 ${formatNumber(npu.available)} ${npu.unit}` : '当前节点未上报 NPU',
      ],
      icon: <ApiOutlined />,
      color: '#bd7cff',
      to: buildComputePoolPath({ resourceType: 'npu' }),
    },
    {
      key: 'dla',
      title: 'DLA 算力',
      value: dla.total,
      unit: dla.unit,
      utilization: utilizationOf(dla),
      details: [
        dla.total > 0 ? `可用 ${formatNumber(dla.available)} ${dla.unit}` : '当前节点未上报 DLA',
      ],
      icon: <ApiOutlined />,
      color: '#ffb85c',
      to: buildComputePoolPath({ resourceType: 'dla' }),
    },
  ];

  return (
    <section className="resource-pool-overview" aria-label="资源池总览">
      <div className="resource-pool-overview__grid">
        {cards.map((card) => (
          <Link
            key={card.key}
            className="resource-pool-card"
            to={card.to}
            style={{ '--resource-card-accent': card.color } as CSSProperties}
          >
            <div className="resource-pool-card__heading">
              <span>{card.title}</span>
              <i aria-hidden="true">{card.icon}</i>
            </div>
            <div className="resource-pool-card__value">
              <strong>{formatNumber(card.value)}</strong>
              <span>{card.unit}</span>
            </div>
            <div className="resource-pool-card__bar" aria-hidden="true">
              <i style={{ width: `${clampPercent(card.utilization)}%` }} />
            </div>
            <div className="resource-pool-card__utilization">
              <span>运行利用率</span>
              <strong>{formatNumber(card.utilization)}%</strong>
            </div>
            <div className="resource-pool-card__details">
              {card.details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
