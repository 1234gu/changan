import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Select, Tag } from 'antd';
import type { NodeFilters, NodeFilterOptions } from '../types';
import type { NodeStatusFilter } from '../types';
import { ACCESS_STATUS_CONFIG } from '../presentation';

interface NodeFilterBarProps {
  filters: NodeFilters;
  options: NodeFilterOptions;
  onChange: (filters: NodeFilters) => void;
  onReset: () => void;
}

const statusOptions: Array<{ value: NodeStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'online', label: '在线' },
  { value: 'suspect', label: '疑似离线' },
  { value: 'offline', label: '离线' },
  { value: 'abnormal', label: '异常' },
];

export function NodeFilterBar({ filters, options, onChange, onReset }: NodeFilterBarProps) {
  const update = <Key extends keyof NodeFilters>(key: Key, value: NodeFilters[Key]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="node-filter-bar" aria-label="节点筛选">
      <Input
        className="node-filter-bar__search"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索节点名称或 Node ID"
        value={filters.keyword}
        aria-label="搜索节点名称或 Node ID"
        onChange={(event) => update('keyword', event.target.value)}
      />
      <Select
        popupClassName="node-filter-dropdown"
        aria-label="节点状态"
        value={filters.status}
        options={statusOptions}
        onChange={(value) => update('status', value)}
      />
      <Select
        popupClassName="node-filter-dropdown"
        allowClear
        placeholder="处理器架构"
        aria-label="处理器架构"
        value={filters.architecture === 'all' ? undefined : filters.architecture}
        options={options.architectures.map((architecture) => ({
          value: architecture,
          label: architecture,
        }))}
        onChange={(value) => update('architecture', value ?? 'all')}
      />
      <Select
        popupClassName="node-filter-dropdown"
        allowClear
        placeholder="所属集群"
        aria-label="所属集群"
        value={filters.clusterId === 'all' ? undefined : filters.clusterId}
        options={options.clusters.map((cluster) => ({ value: cluster.id, label: cluster.name }))}
        onChange={(value) => update('clusterId', value ?? 'all')}
      />
      <Select
        popupClassName="node-filter-dropdown"
        allowClear
        placeholder="接入状态"
        aria-label="接入状态"
        value={filters.accessStatus === 'all' ? undefined : filters.accessStatus}
        options={options.accessStatuses.map((status) => ({
          value: status,
          label: ACCESS_STATUS_CONFIG[status].label,
        }))}
        onChange={(value) => update('accessStatus', value ?? 'all')}
      />
      {filters.schedulableOnly && (
        <Tag
          className="node-filter-bar__active-tag"
          color="cyan"
          closable
          onClose={() => update('schedulableOnly', false)}
        >
          仅可调度节点
        </Tag>
      )}
      <Button icon={<ReloadOutlined />} onClick={onReset}>
        重置
      </Button>
    </div>
  );
}
