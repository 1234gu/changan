import { useEffect, useState } from 'react';
import { PlusOutlined, ReloadOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Card, Space, Tabs } from 'antd';
import dayjs from 'dayjs';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { NodeEventTable } from './components/NodeEventTable';
import { NodeFilterBar } from './components/NodeFilterBar';
import { NodeReconnectModal } from './components/NodeReconnectModal';
import { NodeSummaryCards } from './components/NodeSummaryCards';
import { NodeTable } from './components/NodeTable';
import { RegistrationRecordTable } from './components/RegistrationRecordTable';
import { ManualConnectModal } from './components/ManualConnectModal';
import type { ManualConnectValues } from './components/ManualConnectModal';
import { PendingNodesDrawer } from './components/PendingNodesDrawer';
import type { NodeReconnectGuidance, NodeSummary } from '../../types/node';
import { useNodes } from './hooks/useNodes';
import { DEFAULT_NODE_FILTERS } from './types';
import type { NodeFilters, NodesTabKey, NodeStatusFilter } from './types';
import './NodeListPage.css';

const statusValues: NodeStatusFilter[] = ['all', 'online', 'suspect', 'offline', 'abnormal'];
const architectureValues: NodeFilters['architecture'][] = ['all', 'arm64', 'x86_64'];
const accessStatusValues: NodeFilters['accessStatus'][] = [
  'all',
  'discovered',
  'pending',
  'registering',
  'registered',
  'rejected',
  'failed',
  'removed',
  'reconnecting',
];
function filtersFromSearch(params: URLSearchParams): NodeFilters {
  const status = params.get('status');
  const architecture = params.get('architecture');
  const accessStatus = params.get('access');

  return {
    keyword: params.get('keyword') ?? '',
    status: statusValues.includes(status as NodeStatusFilter)
      ? (status as NodeStatusFilter)
      : 'all',
    architecture: architectureValues.includes(architecture as NodeFilters['architecture'])
      ? (architecture as NodeFilters['architecture'])
      : 'all',
    clusterId: params.get('cluster') ?? 'all',
    accessStatus: accessStatusValues.includes(accessStatus as NodeFilters['accessStatus'])
      ? (accessStatus as NodeFilters['accessStatus'])
      : 'all',
    schedulableOnly: params.get('schedulable') === 'true',
  };
}

function searchFromFilters(filters: NodeFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.architecture !== 'all') params.set('architecture', filters.architecture);
  if (filters.clusterId !== 'all') params.set('cluster', filters.clusterId);
  if (filters.accessStatus !== 'all') params.set('access', filters.accessStatus);
  if (filters.schedulableOnly) params.set('schedulable', 'true');
  return params;
}

export function NodeListPage() {
  const { message, modal } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const [activeTab, setActiveTab] = useState<NodesTabKey>('nodes');
  const [pendingOpen, setPendingOpen] = useState(false);
  const [manualConnectOpen, setManualConnectOpen] = useState(false);
  const [reconnectGuidance, setReconnectGuidance] = useState<NodeReconnectGuidance | null>(null);
  const filters = filtersFromSearch(searchParams);
  const {
    nodes,
    allNodeCount,
    summary,
    filterOptions,
    registrationRecords,
    events,
    pendingNodes,
    loading,
    actionNodeId,
    error,
    warning,
    updatedAt,
    refresh,
    approve,
    reject,
    manualConnect,
    setScheduling,
    reconnect,
    joinPool,
    removeFromPool,
    deleteNode,
    updateLabels,
  } = useNodes(filters);

  useEffect(() => {
    if (updatedAt) setHeaderUpdatedAt(updatedAt);
  }, [setHeaderUpdatedAt, updatedAt]);

  const handleFiltersChange = (nextFilters: NodeFilters) =>
    setSearchParams(searchFromFilters(nextFilters), { replace: true });

  const handleReset = () =>
    setSearchParams(searchFromFilters(DEFAULT_NODE_FILTERS), { replace: true });

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    try {
      await action();
      message.success(successMessage);
      return true;
    } catch (actionError) {
      message.error(actionError instanceof Error ? actionError.message : '操作失败，请稍后重试。');
      return false;
    }
  };

  const handleManualConnect = async (values: ManualConnectValues) => {
    const succeeded = await runAction(
      () => manualConnect(values),
      '节点验证成功，接入状态已刷新。',
    );
    if (!succeeded) return;
    setManualConnectOpen(false);
    setPendingOpen(true);
  };

  const handleReconnect = async (node: NodeSummary) => {
    try {
      const guidance = await reconnect(node.id);
      setReconnectGuidance(guidance);
      message.info('已生成节点服务恢复指引，节点状态未被人工修改。');
    } catch (actionError) {
      message.error(actionError instanceof Error ? actionError.message : '恢复指引获取失败。');
    }
  };

  const tabItems = [
    {
      key: 'nodes',
      label: `节点列表 ${nodes.length === allNodeCount ? `(${allNodeCount})` : `(${nodes.length}/${allNodeCount})`}`,
      children: (
        <>
          <NodeFilterBar
            filters={filters}
            options={filterOptions}
            onChange={handleFiltersChange}
            onReset={handleReset}
          />
          <NodeTable
            nodes={nodes}
            loading={loading}
            actionNodeId={actionNodeId}
            onSchedulingChange={(node, enabled) =>
              runAction(
                () => setScheduling(node.id, enabled),
                enabled ? `${node.name} 已恢复调度` : `${node.name} 已暂停调度`,
              )
            }
            onReconnect={(node) => void handleReconnect(node)}
            onJoinPool={(node) =>
              runAction(() => joinPool(node.id), `${node.name} 已重新加入资源池`)
            }
            onLabelsChange={(node, labels) =>
              runAction(() => updateLabels(node.id, labels), `${node.name} 的标签已更新`)
            }
            onRemove={(node) => {
              modal.confirm({
                title: `将 ${node.name} 移出资源池？`,
                content:
                  '仅移出资源池：节点记录、历史资源和审批记录会继续保留；节点不再参与资源统计与调度，之后仍可重新加入。',
                okText: '确认移出',
                cancelText: '取消',
                onOk: () => runAction(() => removeFromPool(node.id), `${node.name} 已移出资源池`),
              });
            }}
            onDelete={(node) => {
              modal.confirm({
                title: `删除 ${node.name} 的节点记录？`,
                content:
                  '删除后将清除该节点的注册记录、历史资源信息和相关事件。若节点侧采集程序仍在运行，该节点可能再次主动注册。',
                okText: '删除节点',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => runAction(() => deleteNode(node.id), `${node.name} 的节点记录已删除`),
              });
            }}
          />
        </>
      ),
    },
    {
      key: 'registrations',
      label: `接入记录 (${registrationRecords.length})`,
      children: <RegistrationRecordTable records={registrationRecords} loading={loading} />,
    },
    {
      key: 'events',
      label: `节点事件 (${events.length})`,
      children: <NodeEventTable events={events} loading={loading} />,
    },
  ];

  return (
    <main className="nodes-page">
      <section className="nodes-page__overview" aria-label="节点汇总与操作">
        <div className="nodes-page__toolbar">
          <span className="nodes-page__updated">
            <i aria-hidden="true" />
            <span>实时更新</span>
            <time dateTime={updatedAt || undefined}>
              {updatedAt ? dayjs(updatedAt).format('HH:mm:ss') : '--:--:--'}
            </time>
          </span>
          <Space className="nodes-page__header-actions" size={8} wrap>
            <Badge count={pendingNodes.length} size="small" offset={[-4, 2]}>
              <Button
                className="nodes-page__action-button nodes-page__action-button--primary"
                icon={<UserAddOutlined />}
                onClick={() => setPendingOpen(true)}
              >
                待接入节点
              </Button>
            </Badge>
            <Button
              className="nodes-page__action-button"
              icon={<PlusOutlined />}
              onClick={() => setManualConnectOpen(true)}
            >
              手动接入
            </Button>
            <Button
              className="nodes-page__action-button"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={refresh}
            >
              刷新
            </Button>
          </Space>
        </div>
        <NodeSummaryCards summary={summary} />
      </section>

      {pendingNodes.length > 0 && (
        <Alert
          className="nodes-page__alert"
          type="info"
          showIcon
          message={`发现 ${pendingNodes.length} 个新的算力节点`}
          description="节点已主动注册；批准前不会进入可调度资源池。"
          action={<Button onClick={() => setPendingOpen(true)}>查看待接入节点</Button>}
        />
      )}

      {error && (
        <Alert
          className="nodes-page__alert"
          type="error"
          showIcon
          message="无法加载节点数据"
          description={error}
          action={<Button onClick={refresh}>重新加载</Button>}
        />
      )}

      {warning && (
        <Alert
          className="nodes-page__alert"
          type="warning"
          showIcon
          message="部分辅助数据不可用"
          description={warning}
        />
      )}

      <Card className="node-module-card">
        <Tabs
          activeKey={activeTab}
          items={tabItems}
          onChange={(key) => setActiveTab(key as NodesTabKey)}
        />
      </Card>

      <PendingNodesDrawer
        open={pendingOpen}
        nodes={pendingNodes}
        loading={loading}
        actionNodeId={actionNodeId ?? undefined}
        onClose={() => setPendingOpen(false)}
        onApprove={(node) => void runAction(() => approve(node.id), `${node.name} 已允许接入`)}
        onReject={(node) => {
          modal.confirm({
            title: `拒绝 ${node.name} 接入？`,
            content: '节点会保留在历史记录中，可稍后重新发起接入。',
            okText: '确认拒绝',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: () => runAction(() => reject(node.id), `${node.name} 已拒绝接入`),
          });
        }}
      />
      <ManualConnectModal
        open={manualConnectOpen}
        loading={actionNodeId === 'manual-connect'}
        onCancel={() => setManualConnectOpen(false)}
        onSubmit={handleManualConnect}
      />
      <NodeReconnectModal
        open={reconnectGuidance !== null}
        guidance={reconnectGuidance}
        loading={loading}
        onClose={() => setReconnectGuidance(null)}
        onRefresh={() => {
          setReconnectGuidance(null);
          refresh();
        }}
      />
    </main>
  );
}
