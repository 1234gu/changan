import { useEffect } from 'react';
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  LineChartOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Progress, Skeleton } from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ClusterSummaryCard } from '../../components/ClusterSummaryCard';
import { EventList } from '../../components/EventList';
import { KpiCard } from '../../components/KpiCard';
import { PageHeader } from '../../components/PageHeader';
import { ResourceProgress } from '../../components/ResourceProgress';
import { StatusBadge } from '../../components/StatusBadge';
import { RESOURCE_ORDER, RESOURCE_PRESENTATION } from '../../components/resourcePresentation';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { buildClusterDetailPath, buildComputePoolPath, ROUTES } from '../../routes/config';
import { DashboardCard } from './components/DashboardCard';
import { ResourceTrendChart } from './components/ResourceTrendChart';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import { PlatformReliabilityStrip } from '../../components/platform/PlatformReliabilityCard';
import { ExecutionBindingCard } from '../../components/platform/ExecutionBindingCard';
import './DashboardPage.css';

const TASK_STATUS_ITEMS = [
  { key: 'waiting', label: 'WAITING' },
  { key: 'running', label: 'RUNNING' },
  { key: 'success', label: 'SUCCESS' },
  { key: 'failed', label: 'FAILED' },
] as const;

const formatGb = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} GB`;

function DashboardSkeleton() {
  return (
    <div className="dashboard dashboard--loading" aria-label="正在加载总览数据">
      <Skeleton active paragraph={{ rows: 1 }} />
      <div className="kpi-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} className="kpi-card">
            <Skeleton active title={false} paragraph={{ rows: 2 }} />
          </Card>
        ))}
      </div>
      <div className="dashboard-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data, loading, error, refresh } = useDashboardSummary();
  const navigate = useNavigate();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();

  useEffect(() => {
    if (data?.updatedAt) setHeaderUpdatedAt(data.updatedAt);
  }, [data?.updatedAt, setHeaderUpdatedAt]);

  if (loading && !data) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="dashboard dashboard--error">
        <Alert
          type="error"
          showIcon
          message="无法加载总览"
          description={error ?? '数据暂时不可用。'}
          action={
            <Button icon={<ReloadOutlined />} onClick={refresh}>
              重新加载
            </Button>
          }
        />
      </div>
    );
  }

  const { connectivity, activity } = data.nodes;
  const totalNodes = Object.values(connectivity).reduce((total, count) => total + count, 0);
  const onlineNodes = connectivity.online;
  const onlineRate = totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 0;
  const resources = data.resourcePool.resources;
  const videoMemory = data.supportingResources.videoMemory;
  const unifiedGpuNodes = data.supportingResources.unifiedMemoryGpuNodes ?? 0;
  const visibleResources = RESOURCE_ORDER.map((kind) => {
    const presentation = RESOURCE_PRESENTATION[kind];
    const resource = resources[kind] ?? {
      total: 0,
      used: 0,
      allocated: 0,
      available: 0,
      utilization: 0,
      runtimeUtilization: 0,
      unit: presentation.unit,
    };
    return { kind, resource, ...presentation };
  });
  const updatedAt = dayjs(data.updatedAt).format('YYYY-MM-DD HH:mm:ss');

  return (
    <div className="dashboard">
      <PageHeader
        eyebrow="OVERVIEW"
        title="总览"
        description="实时掌握车群节点、异构算力与任务运行状态"
        extra={
          <div className="dashboard-heading__live">
            <span className="live-dot" aria-hidden="true" />
            <div>
              <span>节点资源实时更新</span>
              <time dateTime={data.updatedAt}>{updatedAt}</time>
            </div>
          </div>
        }
      />

      <section aria-labelledby="core-kpi-title">
        <h2 id="core-kpi-title" className="visually-hidden">
          核心运行指标
        </h2>
        <div className="kpi-grid">
          <KpiCard
            title="算力节点"
            value={totalNodes}
            unit="台"
            icon={<CloudServerOutlined />}
            hint="查看全部节点"
            accentColor="#356df3"
            to={ROUTES.nodes}
          />
          <KpiCard
            title="在线节点"
            value={onlineNodes}
            unit="台"
            icon={<CheckCircleOutlined />}
            hint={`在线率 ${onlineRate}%`}
            accentColor="#08a88a"
            to={`${ROUTES.nodes}?status=online`}
          />
          <KpiCard
            title="集群数量"
            value={data.clusters.length}
            unit="个"
            icon={<ApartmentOutlined />}
            hint="查看集群状态"
            accentColor="#7c5ce7"
            to={ROUTES.clusters}
          />
          <KpiCard
            title="运行任务"
            value={data.tasks.running}
            unit="个"
            icon={<PlayCircleOutlined />}
            hint="查看运行中任务"
            accentColor="#ee8c25"
            to={`${ROUTES.scheduling}?status=running`}
          />
        </div>
      </section>

      <PlatformReliabilityStrip platform={data.platform} />

      <section className="resource-kpi-section" aria-labelledby="resource-kpi-title">
        <h2 id="resource-kpi-title" className="visually-hidden">
          算力资源指标
        </h2>
        <div className="kpi-grid">
          {visibleResources.map(({ kind, resource, label, unit, color, icon }) => {
            const utilization = `${(resource.runtimeUtilization ?? resource.utilization).toFixed(1)}%`;
            const collectionHint =
              resource.collectionStatus === 'error'
                ? `采集异常 · ${resource.issueNodeCount ?? 0} 个节点`
                : resource.collectionStatus === 'partial'
                  ? `采集不完整 · ${resource.issueNodeCount ?? 0} 个节点`
                  : undefined;

            const details =
              kind === 'gpu'
                ? [
                    ...(unifiedGpuNodes > 0
                      ? [{ label: '显存', value: `统一内存 · ${unifiedGpuNodes} 节点` }]
                      : []),
                    { label: '独立显存总量', value: formatGb(videoMemory?.total ?? 0) },
                    { label: '运行利用率', value: utilization },
                  ]
                : kind === 'cpu'
                  ? [
                      { label: '可用资源', value: `${resource.available} ${unit}` },
                      { label: '运行利用率', value: utilization },
                    ]
                  : undefined;

            const hint =
              kind === 'gpu'
                ? undefined
                : kind === 'cpu'
                  ? collectionHint
                  : (collectionHint ?? `${resource.available} ${unit} 可用`);

            return (
              <KpiCard
                key={kind}
                title={`${label} 总量`}
                value={resource.total}
                unit={unit}
                icon={icon}
                details={details}
                hint={hint}
                accentColor={color}
                to={buildComputePoolPath({ resourceType: kind })}
              />
            );
          })}
        </div>
      </section>

      <div className="dashboard-grid">
        <DashboardCard
          icon={<CloudServerOutlined />}
          title="节点状态"
          subtitle="车辆边缘节点连接情况"
          extra={<span className="card-context">共 {totalNodes} 台</span>}
        >
          <div className="node-status">
            <div className="node-status__online">
              <Progress
                type="circle"
                percent={onlineRate}
                size={112}
                strokeWidth={9}
                strokeColor="#08a88a"
                trailColor="#edf1f7"
                format={() => (
                  <span className="node-status__progress-label">
                    <strong>{onlineNodes}</strong>
                    <small>在线节点</small>
                  </span>
                )}
              />
              <span>在线率 {onlineRate}%</span>
            </div>
            <div className="status-list">
              <div className="status-list__row">
                <StatusBadge status="running" />
                <strong>{activity.running}</strong>
              </div>
              <div className="status-list__row">
                <StatusBadge status="idle" />
                <strong>{activity.idle}</strong>
              </div>
              <div className="status-list__row">
                <StatusBadge status="suspect" />
                <strong>{connectivity.suspect}</strong>
              </div>
              <div className="status-list__row">
                <StatusBadge status="offline" />
                <strong>{connectivity.offline}</strong>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          icon={<NotificationOutlined />}
          title="最近事件"
          subtitle="节点与集群的最新动态"
          extra={<span className="card-context">最近 30 分钟</span>}
        >
          <EventList events={data.events} />
        </DashboardCard>

        <DashboardCard
          icon={<DatabaseOutlined />}
          title="算力池状态"
          subtitle="异构资源分配与利用率"
          extra={
            <Button type="link" size="small" onClick={() => navigate(ROUTES.computePool)}>
              查看详情
            </Button>
          }
        >
          <div className="resource-progress-list">
            {visibleResources.map(({ kind, resource, label, color }) => (
              <ResourceProgress
                key={kind}
                name={label}
                {...resource}
                color={color}
                to={buildComputePoolPath({ resourceType: kind })}
              />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          icon={<ApartmentOutlined />}
          title="集群状态"
          subtitle="协同集群健康度与资源汇总"
          extra={
            <Button type="link" size="small" onClick={() => navigate(ROUTES.clusters)}>
              全部集群
            </Button>
          }
        >
          <div className="cluster-list">
            {data.clusters.map((cluster) => (
              <ClusterSummaryCard
                key={cluster.id}
                cluster={cluster}
                to={buildClusterDetailPath(cluster.id)}
              />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          icon={<ProfileOutlined />}
          title="任务状态"
          subtitle="车群调度任务执行概况"
          extra={
            <Button type="link" size="small" href="/?page=tasks">
              任务中心
            </Button>
          }
        >
          <div className="task-grid">
            {TASK_STATUS_ITEMS.map(({ key, label }) => (
              <div key={key} className={`task-metric task-metric--${key}`}>
                <StatusBadge status={key} />
                <strong>{data.tasks[key]}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </DashboardCard>

        <ExecutionBindingCard />

        <DashboardCard
          className="dashboard-card--chart"
          icon={<LineChartOutlined />}
          title="资源变化趋势"
          subtitle="最近 30 分钟资源利用率"
          extra={<span className="card-context">单位：%</span>}
        >
          <ResourceTrendChart points={data.resourceTrend} resources={resources} />
        </DashboardCard>
      </div>
    </div>
  );
}
