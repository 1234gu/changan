import { ReloadOutlined } from '@ant-design/icons';
import { Button, Radio, Select, Tag } from 'antd';
import type { ComputePoolFilters } from '../../../types/computePool';

interface ResourceFilterBarProps {
  filters: ComputePoolFilters;
  clusters: Array<{ id: string; name: string }>;
  architectures: ComputePoolFilters['architecture'][];
  selectedNodeName?: string;
  onChange: (filters: ComputePoolFilters) => void;
  onClearNode: () => void;
  onReset: () => void;
}

const resourceOptions: Array<{
  label: string;
  value: ComputePoolFilters['resourceType'];
}> = [
  { label: '全部资源', value: 'all' },
  { label: 'CPU', value: 'cpu' },
  { label: 'GPU', value: 'gpu' },
  { label: 'NPU', value: 'npu' },
  { label: 'DLA', value: 'dla' },
];

const statusOptions: Array<{ label: string; value: ComputePoolFilters['status'] }> = [
  { label: '全部状态', value: 'all' },
  { label: '可供调度', value: 'available' },
  { label: '已分配', value: 'allocated' },
  { label: '暂不可用', value: 'unavailable' },
];

export function ResourceFilterBar({
  filters,
  clusters,
  architectures,
  selectedNodeName,
  onChange,
  onClearNode,
  onReset,
}: ResourceFilterBarProps) {
  const update = <Key extends keyof ComputePoolFilters>(key: Key, value: ComputePoolFilters[Key]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className="compute-pool-filter" aria-label="资源来源筛选">
      <div className="compute-pool-filter__resource">
        <span>资源类型</span>
        <Radio.Group
          aria-label="按资源类型筛选"
          optionType="button"
          buttonStyle="solid"
          value={filters.resourceType}
          options={resourceOptions}
          onChange={(event) => update('resourceType', event.target.value)}
        />
      </div>

      <div className="compute-pool-filter__selects">
        <Select
          aria-label="按集群筛选"
          value={filters.clusterId}
          options={[
            { label: '全部集群', value: 'all' },
            ...clusters.map((cluster) => ({ label: cluster.name, value: cluster.id })),
          ]}
          onChange={(value) => update('clusterId', value)}
        />
        <Select
          aria-label="按资源状态筛选"
          value={filters.status}
          options={statusOptions}
          onChange={(value) => update('status', value)}
        />
        <Select
          aria-label="按架构筛选"
          value={filters.architecture}
          options={[
            { label: '全部架构', value: 'all' },
            ...architectures
              .filter((architecture) => architecture !== 'all')
              .map((architecture) => ({
                label: architecture === 'arm64' ? 'ARM64' : 'x86_64',
                value: architecture,
              })),
          ]}
          onChange={(value) => update('architecture', value)}
        />
        {selectedNodeName && (
          <Tag color="blue" closable onClose={onClearNode}>
            来源节点：{selectedNodeName}
          </Tag>
        )}
        <Button icon={<ReloadOutlined />} onClick={onReset}>
          重置
        </Button>
      </div>
    </div>
  );
}
