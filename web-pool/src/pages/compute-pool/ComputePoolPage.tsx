import { useEffect } from 'react';
import {
  DatabaseOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Result, Skeleton, Space, Tag } from 'antd';
import dayjs from 'dayjs';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import type { ComputePoolFilters } from '../../types/computePool';
import { ClusterResourcePanel } from './components/ClusterResourcePanel';
import { ResourceFilterBar } from './components/ResourceFilterBar';
import { ResourcePoolCards } from './components/ResourcePoolCards';
import { ResourceSourceTable } from './components/ResourceSourceTable';
import { ResourceUsagePanel } from './components/ResourceUsagePanel';
import { SupportingResourcePanel } from './components/SupportingResourcePanel';
import { useComputePool } from './hooks/useComputePool';
import './ComputePoolPage.css';

const DEFAULT_FILTERS: ComputePoolFilters = {
  resourceType: 'all',
  clusterId: 'all',
  status: 'all',
  architecture: 'all',
};

const resourceTypes: ComputePoolFilters['resourceType'][] = ['all', 'cpu', 'gpu', 'npu', 'dla'];
const statuses: ComputePoolFilters['status'][] = ['all', 'available', 'allocated', 'unavailable'];
const architectures: ComputePoolFilters['architecture'][] = ['all', 'arm64', 'x86_64'];

function filtersFromSearch(params: URLSearchParams): ComputePoolFilters {
  const resourceType = params.get('resource');
  const status = params.get('status');
  const architecture = params.get('architecture');

  return {
    resourceType: resourceTypes.includes(resourceType as ComputePoolFilters['resourceType'])
      ? (resourceType as ComputePoolFilters['resourceType'])
      : 'all',
    clusterId: params.get('cluster') ?? 'all',
    status: statuses.includes(status as ComputePoolFilters['status'])
      ? (status as ComputePoolFilters['status'])
      : 'all',
    architecture: architectures.includes(architecture as ComputePoolFilters['architecture'])
      ? (architecture as ComputePoolFilters['architecture'])
      : 'all',
  };
}

function searchFromState(filters: ComputePoolFilters, nodeId?: string) {
  const params = new URLSearchParams();
  if (filters.resourceType !== 'all') params.set('resource', filters.resourceType);
  if (filters.clusterId !== 'all') params.set('cluster', filters.clusterId);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.architecture !== 'all') params.set('architecture', filters.architecture);
  if (nodeId) params.set('node', nodeId);
  return params;
}

function ComputePoolSkeleton() {
  return (
    <main className="compute-pool-page" aria-label="正在加载算力池">
      <Skeleton active paragraph={{ rows: 1 }} />
      <div className="compute-pool-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index}>
            <Skeleton active title={false} paragraph={{ rows: 4 }} />
          </Card>
        ))}
      </div>
    </main>
  );
}

export function ComputePoolPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const filters = filtersFromSearch(searchParams);
  const nodeId = searchParams.get('node') ?? undefined;
  const { data, sources, totalSourceCount, filterOptions, loading, error, refresh } =
    useComputePool({ filters, nodeId });

  useEffect(() => {
    if (data?.updatedAt) setHeaderUpdatedAt(data.updatedAt);
  }, [data?.updatedAt, setHeaderUpdatedAt]);

  if (loading && !data) return <ComputePoolSkeleton />;

  if (!data) {
    return (
      <main className="compute-pool-page">
        <Result
          status="error"
          title="无法加载算力池"
          subTitle={error ?? '资源聚合数据暂时不可用。'}
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={refresh}>
              重新加载
            </Button>
          }
        />
      </main>
    );
  }

  const selectedNodeName = nodeId
    ? (data.sources.find((source) => source.nodeId === nodeId)?.nodeName ?? nodeId)
    : undefined;
  const updatedAt = dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');
  const updateSearch = (nextFilters: ComputePoolFilters, nextNodeId?: string) =>
    setSearchParams(searchFromState(nextFilters, nextNodeId), { replace: true });

  return (
    <main className="compute-pool-page">
      <PageHeader
        eyebrow="COMPUTE POOL"
        title="算力池"
        description="统一查看车群异构计算资源的总量、分配情况和可调度供给"
        extra={
          <Space className="compute-pool-page__header-actions" size={12} wrap>
            <span>
              更新于 <time dateTime={data.updatedAt}>{updatedAt}</time>
            </span>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
              刷新
            </Button>
          </Space>
        }
      />

      {error && (
        <Alert
          className="compute-pool-page__alert"
          type="warning"
          showIcon
          message="本次刷新失败，当前仍显示最近一次成功聚合的数据"
          description={error}
        />
      )}

      <ResourcePoolCards
        resources={data.resources}
        videoMemory={data.supportingResources.videoMemory}
      />

      <div className="compute-pool-secondary-grid">
        <ResourceUsagePanel resources={data.resources} />
        <SupportingResourcePanel resources={data.supportingResources} />
      </div>

      <Card
        className="compute-pool-panel compute-pool-source-panel"
        title={
          <span className="compute-pool-panel__title">
            <DatabaseOutlined />
            <span>
              <strong>资源来源</strong>
              <small>追踪资源来自哪些节点，以及当前可调度余量</small>
            </span>
          </span>
        }
        extra={
          <span className="compute-pool-source-panel__count">
            {sources.length === totalSourceCount
              ? `${totalSourceCount} 个节点`
              : `${sources.length} / ${totalSourceCount} 个节点`}
          </span>
        }
      >
        <div className="compute-pool-boundary-note">
          <InfoCircleOutlined />
          <span>算力池负责回答“谁有资源”，最终选点由调度管理负责。</span>
          <Tag icon={<ScheduleOutlined />} color="blue" bordered={false}>
            全局候选 {data.schedulerCandidates.length} 个节点
          </Tag>
        </div>

        <ResourceFilterBar
          filters={filters}
          clusters={filterOptions.clusters}
          architectures={filterOptions.architectures}
          selectedNodeName={selectedNodeName}
          onChange={(nextFilters) => updateSearch(nextFilters, nodeId)}
          onClearNode={() => updateSearch(filters, undefined)}
          onReset={() => updateSearch(DEFAULT_FILTERS, undefined)}
        />

        <ResourceSourceTable
          sources={sources}
          resourceType={filters.resourceType}
          loading={loading}
        />
      </Card>

      <ClusterResourcePanel clusters={data.clusters} />
    </main>
  );
}
