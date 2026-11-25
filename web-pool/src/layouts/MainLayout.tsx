import { useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
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
import changanLogo from '../assets/branding/changan-logo.png';
import sidebarVehicle from '../assets/sidebar-suv-front-v2.png';
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
        collapsedWidth={isNarrow ? 0 : 64}
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
            <img src={changanLogo} alt="" />
          </span>
          {!collapsed && (
            <span className="brand__copy">
              <strong>长安汽车</strong>
              <small>CHANGAN</small>
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
          <div className="sider-vehicle-decoration" aria-hidden="true">
            <svg
              className="sider-vehicle-decoration__tracks"
              viewBox="0 0 232 142"
              preserveAspectRatio="none"
              focusable="false"
            >
              <defs>
                <linearGradient id="sidebar-track-gradient" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#0a7cc8" stopOpacity="0" />
                  <stop offset="0.4" stopColor="#20cfff" stopOpacity="0.65" />
                  <stop offset="1" stopColor="#61edff" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <path
                className="sider-track sider-track--glow"
                d="M-28 144C34 137 75 122 112 95C148 69 180 51 250 46"
              />
              <path
                className="sider-track sider-track--primary"
                d="M-28 144C34 137 75 122 112 95C148 69 180 51 250 46"
              />
              <path
                className="sider-track sider-track--secondary"
                d="M-20 143C43 132 83 113 122 87C159 62 194 54 252 64"
              />
              <path
                className="sider-track sider-track--secondary"
                d="M12 144C70 136 107 120 143 100C174 83 207 80 250 88"
              />
              <path
                className="sider-track sider-track--pulse"
                pathLength="100"
                d="M-8 137C49 130 93 108 130 79C158 57 190 44 244 39"
              />
            </svg>
            <span className="sider-vehicle-decoration__halo" />
            <img src={sidebarVehicle} alt="" />
          </div>
        )}

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
              <span>Vehicular Computing Platform</span>
            </div>
          </div>

          <span className="app-header__hud-rail" aria-hidden="true">
            <i />
            <i />
            <i />
            <b />
          </span>

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
