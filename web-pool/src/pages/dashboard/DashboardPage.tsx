import { useEffect, useState } from 'react';
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
import { Alert, Button, Card, Skeleton } from 'antd';
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
import { ResourcePoolOverview } from './components/ResourcePoolOverview';
import { ResourceTrendChart } from './components/ResourceTrendChart';
import { VehicleFleetView } from './components/VehicleFleetView';
import { useDashboardSummary } from './hooks/useDashboardSummary';
import { PlatformReliabilityStrip } from '../../components/platform/PlatformReliabilityCard';
import { ExecutionBindingCard } from '../../components/platform/ExecutionBindingCard';
import { apiClient } from '../../services/apiClient';
import './DashboardPage.css';

const TASK_STATUS_ITEMS = [
  { key: 'waiting', label: 'WAITING' },
  { key: 'running', label: 'RUNNING' },
  { key: 'success', label: 'SUCCESS' },
  { key: 'failed', label: 'FAILED' },
] as const;

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
  const { data, loading, error, authRequired, refresh } = useDashboardSummary();
  const [authenticating, setAuthenticating] = useState(false);
  const navigate = useNavigate();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();

  useEffect(() => {
    if (data?.updatedAt) setHeaderUpdatedAt(data.updatedAt);
  }, [data?.updatedAt, setHeaderUpdatedAt]);

  const authenticate = async () => {
    const apiKey = window.prompt('输入 API 密钥（只用于当前浏览器会话）');
    if (apiKey === null || !apiKey.trim()) return;

    setAuthenticating(true);
    try {
      await apiClient.post('/api/session', { api_key: apiKey.trim() });
      refresh();
    } catch {
      window.alert('API 密钥错误，请重新输入。');
    } finally {
      setAuthenticating(false);
    }
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="dashboard dashboard--error">
        <Alert
          type={authRequired ? 'warning' : 'error'}
          showIcon
          message={authRequired ? '需要登录管理平台' : '无法加载总览'}
          description={error ?? '数据暂时不可用。'}
          action={
            authRequired ? (
              <Button type="primary" loading={authenticating} onClick={() => void authenticate()}>
                输入 API 密钥
              </Button>
            ) : (
              <Button icon={<ReloadOutlined />} onClick={refresh}>
                重新加载
              </Button>
            )
          }
        />
      </div>
    );
  }

  const totalNodes = data.nodeItems.length;
  const onlineNodes = data.nodeItems.filter(
    (node) => node.operationalStatus === 'online',
  ).length;
  const onlineRate = totalNodes > 0 ? Math.round((onlineNodes / totalNodes) * 100) : 0;
  const resources = data.resourcePool.resources;
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
        title="车群算力总览"
        description="面向车辆边缘节点的异构算力接入、资源聚合与任务运行态势"
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

      <VehicleFleetView nodes={data.nodeItems} resources={data.nodeResources} />

      <ResourcePoolOverview
        resources={resources}
        supportingResources={data.supportingResources}
        nodes={data.nodeItems}
        nodeResources={data.nodeResources}
      />

      <PlatformReliabilityStrip platform={data.platform} />

      <div className="dashboard-grid">
        <DashboardCard
          icon={<NotificationOutlined />}
          title="最近事件"
          subtitle="节点、集群与任务的最新动态"
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
