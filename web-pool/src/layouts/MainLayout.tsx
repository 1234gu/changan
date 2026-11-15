import { useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  CodeSandboxOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MonitorOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Badge, Button, Layout, Menu, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAVIGATION_ITEMS, ROUTES, TASK_CONSOLE_LINKS } from '../routes/config';
import type { NavigationItemId } from '../routes/config';
import { getNodeDataMode } from '../services/nodeService';

const { Header, Sider, Content } = Layout;

const dataModeMeta = {
  real: { label: '真实数据源', liveLabel: '实时数据', status: 'processing' },
  mock: { label: '模拟数据源', liveLabel: '模拟数据', status: 'warning' },
  mixed: { label: '混合数据源', liveLabel: '混合数据', status: 'warning' },
} as const;

const navigationIcons: Record<NavigationItemId, ReactNode> = {
  dashboard: <DashboardOutlined />,
  nodes: <CloudServerOutlined />,
  computePool: <DeploymentUnitOutlined />,
  clusters: <ApartmentOutlined />,
  scheduling: <ScheduleOutlined />,
};

const navigationItems = NAVIGATION_ITEMS.map(({ id, path, label }) => ({
  key: path,
  label,
  icon: navigationIcons[id],
}));

const consoleIcons: Record<string, ReactNode> = {
  'console:tasks': <AppstoreOutlined />,
  'console:overview': <MonitorOutlined />,
  'console:incidents': <GlobalOutlined />,
};

const menuItems = [
  ...navigationItems,
  {
    type: 'group' as const,
    key: 'console',
    label: '任务编排与执行',
    children: TASK_CONSOLE_LINKS.map(({ key, label }) => ({ key, label, icon: consoleIcons[key] })),
  },
];

function getSelectedMenuKey(pathname: string) {
  if (pathname === ROUTES.dashboard) return ROUTES.dashboard;
  return (
    navigationItems.find(
      (item) =>
        item.key !== ROUTES.dashboard &&
        (pathname === item.key || pathname.startsWith(`${item.key}/`)),
    )?.key ?? ''
  );
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const selectedKey = useMemo(() => getSelectedMenuKey(location.pathname), [location.pathname]);
  const dataMode = dataModeMeta[getNodeDataMode()];

  const outletContext = useMemo<MainLayoutOutletContext>(
    () => ({ setHeaderUpdatedAt: setUpdatedAt }),
    [],
  );
  const updatedTime = updatedAt ? dayjs(updatedAt).format('HH:mm:ss') : '--:--:--';
  const updatedAtIso = updatedAt ? dayjs(updatedAt).toISOString() : undefined;

  const handleNavigate = (path: string) => {
    const external = TASK_CONSOLE_LINKS.find((link) => link.key === path);
    if (external) {
      window.location.assign(external.href);
      return;
    }
    navigate(path);
    if (isNarrow) setCollapsed(true);
  };

  const handleBreakpoint = (broken: boolean) => {
    setIsNarrow(broken);
    setCollapsed(broken);
  };

  return (
    <Layout className="app-shell">
      <Sider
        className="app-sider"
        width={232}
        collapsedWidth={0}
        collapsed={collapsed}
        breakpoint="lg"
        trigger={null}
        onBreakpoint={handleBreakpoint}
      >
        <button
          type="button"
          className="brand"
          aria-label="返回总览"
          onClick={() => handleNavigate(ROUTES.dashboard)}
        >
          <span className="brand__mark" aria-hidden="true">
            <CodeSandboxOutlined />
          </span>
          {!collapsed && (
            <span className="brand__copy">
              <strong>VEHICULAR</strong>
              <small>COMPUTE CLOUD</small>
            </span>
          )}
        </button>

        <Menu
          className="app-menu"
          theme="dark"
          mode="inline"
          aria-label="平台主导航"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuItems}
          onClick={({ key }) => handleNavigate(key)}
        />

        {!collapsed && (
          <div className="sider-status">
            <span className="sider-status__eyebrow">SYSTEM STATUS</span>
            <Badge status="success" text="前端服务运行正常" />
            <span className="sider-status__meta">{dataMode.label} · v0.1</span>
          </div>
        )}
      </Sider>

      {isNarrow && !collapsed && (
        <button
          type="button"
          className="app-sider-mask"
          aria-label="关闭导航"
          onClick={() => setCollapsed(true)}
        />
      )}

      <Layout className="app-main">
        <Header className="app-header">
          <div className="app-header__leading">
            <Tooltip title={collapsed ? '展开导航' : '收起导航'}>
              <Button
                className="app-header__menu-button"
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                aria-label={collapsed ? '展开导航' : '收起导航'}
                onClick={() => setCollapsed((value) => !value)}
              />
            </Tooltip>
            <div className="app-header__title">
              <strong>车群协同算力管理平台</strong>
              <span>VEHICULAR COMPUTING PLATFORM</span>
            </div>
          </div>

          <div className="app-header__status">
            <Badge status={dataMode.status} text={dataMode.liveLabel} />
            <span className="app-header__divider" aria-hidden="true" />
            <div className="app-header__updated">
              <span>更新时间</span>
              <time dateTime={updatedAtIso}>{updatedTime}</time>
            </div>
          </div>
        </Header>

        <Content className="app-content">
          <Outlet context={outletContext} />
        </Content>
      </Layout>
    </Layout>
  );
}

export interface MainLayoutOutletContext {
  setHeaderUpdatedAt: Dispatch<SetStateAction<string>>;
}
