import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import {
  Activity, AlertCircle, Bell, ChartNoAxesCombined, Clock3, Cpu,
  Database, Layers, LayoutDashboard, ListFilter, Network, Search, Server, Workflow,
} from 'lucide-react';
import { Badge, Button, Layout, Menu, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import changanLogo from '../assets/branding/changan-logo.png';
import sidebarVehicle from '../assets/sidebar-suv-front-v2.png';
import { consolePage, consolePath, NAVIGATION_ITEMS, ROUTES, TASK_PAGES } from '../routes/config';
import type { NavigationItemId } from '../routes/config';
import { apiClient } from '../services/apiClient';
import { getNodeDataMode } from '../services/nodeService';

const { Header, Sider, Content } = Layout;

const dataModeMeta = {
  real: { label: '真实数据源', liveLabel: '实时数据', status: 'processing' },
  mock: { label: '模拟数据源', liveLabel: '模拟数据', status: 'warning' },
  mixed: { label: '混合数据源', liveLabel: '混合数据', status: 'warning' },
} as const;

const navigationIcons: Record<NavigationItemId, ReactNode> = {
  dashboard: <Activity size={18} />,
  nodes: <Database size={18} />,
  computePool: <Cpu size={18} />,
  clusters: <Network size={18} />,
  scheduling: <ListFilter size={18} />,
};

const navigationItems = NAVIGATION_ITEMS.map(({ id, path, label }) => ({
  key: path,
  label,
  icon: navigationIcons[id],
}));

const consoleIcons: Record<(typeof TASK_PAGES)[number]['id'], ReactNode> = {
  overview: <LayoutDashboard size={18} />, tasks: <Workflow size={18} />, alerts: <Bell size={18} />,
  nodes: <Server size={18} />, candidates: <Search size={18} />, incidents: <AlertCircle size={18} />,
  workflow: <Layers size={18} />, strategies: <Clock3 size={18} />, compare: <ChartNoAxesCombined size={18} />,
};

function getSelectedMenuKey(pathname: string, search: string) {
  if (pathname === ROUTES.console) {
    const page = consolePage(search);
    return consolePath(page === 'detail' ? 'tasks' : page);
  }
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
  const selectedKey = useMemo(() => getSelectedMenuKey(location.pathname, location.search), [location.pathname, location.search]);
  const dataMode = dataModeMeta[getNodeDataMode()];

  const [counts, setCounts] = useState<{tasks: number; alerts: number}>();
  const updateCounts = useCallback((tasks: number, alerts: number) => {
    setCounts(previous => previous?.tasks === tasks && previous?.alerts === alerts ? previous : {tasks, alerts});
  }, []);
  const inConsole = location.pathname === ROUTES.console;
  useEffect(() => {
    if (inConsole) return;
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      apiClient.get('/api/v1/platform/summary', options),
      apiClient.get('/api/alerts?unread=true&limit=1', options),
    ]).then(([summary, alerts]) => {
      if (!controller.signal.aborted) updateCounts(summary.data.tasks.total, alerts.data.summary.unread);
    }).catch(() => { /* Counts are optional when a data source is unavailable. */ });
    return () => controller.abort();
  }, [inConsole, updateCounts]);
  useEffect(() => { window.scrollTo(0, 0); }, [selectedKey, location.pathname]);
  const menuItems = [
    {type: 'group' as const, key: 'pool', label: '算力池管理', children: navigationItems},
    {type: 'group' as const, key: 'console', label: '任务编排与执行', children: TASK_PAGES.map(({id, label}) => {
      const count = id === 'tasks' ? counts?.tasks : id === 'alerts' ? counts?.alerts : undefined;
      return {key: consolePath(id), icon: consoleIcons[id], title: label,
        label: <span className="console-menu-label">{label}{!!count && <small>{count}</small>}</span>};
    })},
  ];
  const outletContext = useMemo<MainLayoutOutletContext>(
    () => ({ setHeaderUpdatedAt: setUpdatedAt, updateCounts }),
    [updateCounts],
  );
  const updatedTime = updatedAt ? dayjs(updatedAt).format('HH:mm:ss') : '--:--:--';
  const updatedAtIso = updatedAt ? dayjs(updatedAt).toISOString() : undefined;

  const handleNavigate = (path: string) => {
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
            {!inConsole && <div className="app-header__updated">
              <span>更新时间</span>
              <time dateTime={updatedAtIso}>{updatedTime}</time>
            </div>}
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
  updateCounts: (tasks: number, alerts: number) => void;
  setHeaderUpdatedAt: Dispatch<SetStateAction<string>>;
}
