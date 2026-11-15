import { aggregateComputePool } from '../services/resourceAggregation';
import type { ComputePoolSummary } from '../types/computePool';
import { createNodeDetails, createNodeSummaries } from './nodes';

export const createComputePoolMock = (): ComputePoolSummary => {
  const summaries = createNodeSummaries();
  const details = createNodeDetails(summaries);

  return aggregateComputePool(
    summaries.map((node) => details[node.id]),
    new Date().toISOString(),
  );
};
