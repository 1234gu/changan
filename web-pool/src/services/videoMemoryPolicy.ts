import type { ResourceMetric } from '../types/computePool';
import type { CapacityMetric, NodeGpuDetails } from '../types/node';

interface NodeVideoMemorySource {
  gpuDetails?: Pick<NodeGpuDetails, 'supported' | 'memoryArchitecture'>;
  memory: CapacityMetric;
  videoMemory?: CapacityMetric;
}

/**
 * Select the node metric used by every frontend "显存" view.
 *
 * Unified-memory GPUs reuse the collected system-memory metric. Dedicated and
 * unknown architectures only use explicitly collected VRAM; a zero/unknown
 * VRAM value must never make the frontend guess that system memory is shared.
 */
export function resolveNodeVideoMemory(source: NodeVideoMemorySource) {
  if (source.gpuDetails && !source.gpuDetails.supported) return undefined;
  if (source.gpuDetails?.memoryArchitecture === 'unified') return source.memory;
  return source.videoMemory;
}

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

export function describeVideoMemory(metric?: Pick<ResourceMetric, 'total' | 'available'>) {
  return [
    `显存 ${formatNumber(metric?.total ?? 0)} GB`,
    `可用显存 ${formatNumber(metric?.available ?? 0)} GB`,
  ];
}
