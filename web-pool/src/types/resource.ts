export const RESOURCE_KINDS = ['cpu', 'gpu', 'npu', 'dla'] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_UNITS = {
  cpu: 'Core',
  gpu: 'GPU',
  npu: 'TOPS',
  dla: 'Device',
} as const satisfies Record<ResourceKind, string>;

export type CanonicalResourceUnit = (typeof RESOURCE_UNITS)[ResourceKind];
/** `个` is retained only for compatibility with existing node snapshots. */
export type ResourceUnit = CanonicalResourceUnit | '个';

export interface ResourceSummary {
  total: number;
  used: number;
  available: number;
  utilization: number;
  unit: ResourceUnit;
  /** Scheduler allocation when it is known. Runtime usage is kept separate. */
  allocated?: number;
  runtimeUtilization?: number;
  collectionStatus?: 'complete' | 'partial' | 'error';
  issueNodeCount?: number;
}

export type ResourceCapacity = Pick<ResourceSummary, 'total' | 'unit'>;

type AcceleratorKind = Exclude<ResourceKind, 'cpu'>;

export type ResourceMap = { cpu: ResourceSummary } & Partial<
  Record<AcceleratorKind, ResourceSummary>
>;

export type ResourceCapacityMap = { cpu: ResourceCapacity } & Partial<
  Record<AcceleratorKind, ResourceCapacity>
>;

export interface ResourcePoolSummary {
  resources: ResourceMap;
}
