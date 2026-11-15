import type {
  ComputePoolFilters,
  NodeResourceContribution,
  ResourceMetric,
  ResourceSupplyStatus,
} from '../../types/computePool';
import type { ResourceUnit } from '../../types/resource';

export const SUPPLY_STATUS_CONFIG: Record<ResourceSupplyStatus, { label: string; color: string }> =
  {
    available: { label: '可供调度', color: 'success' },
    allocated: { label: '已分配', color: 'processing' },
    unavailable: { label: '暂不可用', color: 'error' },
  };

export function getContributionSupplyStatus(
  source: NodeResourceContribution,
  resourceType: ComputePoolFilters['resourceType'],
): ResourceSupplyStatus {
  const metrics: ResourceMetric[] =
    resourceType === 'all'
      ? Object.values(source.resources).filter(
          (metric): metric is ResourceMetric => metric !== undefined,
        )
      : source.resources[resourceType]
        ? [source.resources[resourceType]]
        : [];

  if (!source.supplyEligible) return 'unavailable';
  if (metrics.some((metric) => metric.schedulableAvailable > 0)) return 'available';
  if (metrics.some((metric) => metric.allocated > 0)) return 'allocated';
  return 'unavailable';
}

export function matchesContributionSupplyFilter(
  source: NodeResourceContribution,
  resourceType: ComputePoolFilters['resourceType'],
  status: ComputePoolFilters['status'],
) {
  if (status === 'all') return true;
  const metrics: ResourceMetric[] =
    resourceType === 'all'
      ? Object.values(source.resources).filter(
          (metric): metric is ResourceMetric => metric !== undefined,
        )
      : source.resources[resourceType]
        ? [source.resources[resourceType]]
        : [];

  if (status === 'available') {
    return source.supplyEligible && metrics.some((metric) => metric.schedulableAvailable > 0);
  }
  if (status === 'allocated') {
    return metrics.some((metric) => metric.allocated > 0);
  }
  return !source.supplyEligible || metrics.every((metric) => metric.schedulableAvailable <= 0);
}

export function formatMetricValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCapacity(value: number, unit: ResourceUnit | 'GB') {
  if (unit === 'GB' && value >= 1024) {
    return `${formatMetricValue(value / 1024)} TB`;
  }
  return `${formatMetricValue(value)} ${unit}`;
}
