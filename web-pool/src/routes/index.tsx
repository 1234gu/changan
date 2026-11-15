import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { ComingSoonPage } from '../pages/coming-soon/ComingSoonPage';
import { ClusterDetailPage, ClusterListPage } from '../pages/clusters';
import { ComputePoolPage } from '../pages/compute-pool';
import { DashboardPage } from '../pages/dashboard';
import { NodeDetailPage, NodeListPage } from '../pages/nodes';
import { SchedulingPage } from '../pages/scheduling';
import { ROUTES } from './config';

export const router = createBrowserRouter([
  {
    path: ROUTES.dashboard,
    element: <MainLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: ROUTES.nodes, element: <NodeListPage /> },
      {
        path: ROUTES.nodeDetail,
        element: <NodeDetailPage />,
      },
      { path: ROUTES.computePool, element: <ComputePoolPage /> },
      { path: ROUTES.clusters, element: <ClusterListPage /> },
      { path: ROUTES.clusterDetail, element: <ClusterDetailPage /> },
      { path: ROUTES.scheduling, element: <SchedulingPage /> },
      { path: ROUTES.workloads, element: <ComingSoonPage title="工作负载" /> },
      { path: ROUTES.network, element: <ComingSoonPage title="网络与配置" /> },
      { path: ROUTES.storage, element: <ComingSoonPage title="存储与镜像" /> },
      { path: ROUTES.monitoring, element: <ComingSoonPage title="系统监控" /> },
      {
        path: '*',
        element: (
          <ComingSoonPage
            title="页面不存在"
            description="当前地址没有对应页面，请返回总览继续浏览。"
          />
        ),
      },
    ],
  },
], { basename: '/pool' });
