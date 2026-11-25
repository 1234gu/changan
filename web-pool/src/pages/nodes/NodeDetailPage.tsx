import { useEffect, useState } from 'react';
import {
  ArrowLeftOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  HeartOutlined,
  ProfileOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Progress,
  Result,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { NodeReliabilityCard } from '../../components/platform/NodeReliabilityCard';
import { StatusBadge } from '../../components/StatusBadge';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { buildClusterDetailPath, buildComputePoolPath, ROUTES } from '../../routes/config';
import { getNodes } from '../../services/nodeService';
import { getSchedulerExecutions } from '../../services/schedulerService';
import { resolveNodeVideoMemory } from '../../services/videoMemoryPolicy';
import type { CapacityMetric, NodeSummary } from '../../types/node';
import type { SchedulerExecution } from '../../types/scheduling';
import { getFleetVehicleNodes } from '../dashboard/dashboardModel';
import { ExecutionTable } from '../scheduling/components/ExecutionTable';
import { NodeResourceSummary } from './components/NodeResourceSummary';
import { useNodeDetail } from './hooks/useNodes';
import {
  ACCESS_STATUS_CONFIG,
  ACTIVITY_LABELS,
  HEALTH_STATUS_CONFIG,
  NETWORK_LINK_CONFIG,
  NODE_TYPE_LABELS,
  formatDateTime,
  formatHeartbeatAge,
} from './presentation';
import './NodeDetailPage.css';

const NODE_ID_COLLATOR = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function formatNodeOrdinal(index: number) {
  return `节点${String(index + 1).padStart(2, '0')}`;
}

function getStableNodeDisplayName(nodes: NodeSummary[], nodeId: string) {
  const fleetMatch = getFleetVehicleNodes(nodes).find(({ node }) => node.id === nodeId);
  if (fleetMatch) return fleetMatch.displayName;

  const sortedIndex = [...nodes]
    .sort((left, right) => NODE_ID_COLLATOR.compare(left.id, right.id))
    .findIndex((node) => node.id === nodeId);
  return sortedIndex >= 0 ? formatNodeOrdinal(sortedIndex) : undefined;
}

function abbreviateId(value: string) {
  return value.length <= 24 ? value : `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function formatCapacity(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
}

function CapacityOverview({ metric }: { metric: CapacityMetric }) {
  return (
    <div className="capacity-overview">
      <div className="capacity-overview__amount">
        <strong>{metric.used}</strong>
        <span>
          / {metric.total} {metric.unit}
        </span>
      </div>
      <Progress
        percent={metric.utilization}
        strokeColor="#20bfe3"
        trailColor="#d7e8ef"
        size={['100%', 7]}
        format={(percent) => `${Number(percent).toFixed(1)}%`}
      />
      <span className="capacity-overview__available">
        可用 {metric.available} {metric.unit}
      </span>
    </div>
  );
}

function TemperatureValue({ value }: { value?: number }) {
  return value === undefined ? (
    <Tag bordered={false}>不支持</Tag>
  ) : (
    <span
      className={value >= 80 ? 'temperature-value temperature-value--high' : 'temperature-value'}
    >
      {value} °C
    </span>
  );
}

function formatBytes(value?: number) {
  if (value === undefined) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatOptionalMetric(value: number | undefined, unit: string) {
  return value === undefined ? '--' : `${value} ${unit}`;
}

export function NodeDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const { node, loading, error, updatedAt, refresh } = useNodeDetail(nodeId);
  const [nodeDisplay, setNodeDisplay] = useState<{ nodeId: string; name: string }>();
  const [executions, setExecutions] = useState<SchedulerExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(true);
  const [executionsError, setExecutionsError] = useState<string>();
  const returnPath = (location.state as { from?: string } | null)?.from ?? ROUTES.nodes;
  const returnLabel = returnPath.startsWith(ROUTES.computePool) ? '返回算力池' : '返回列表';

  useEffect(() => {
    if (updatedAt) setHeaderUpdatedAt(updatedAt);
  }, [setHeaderUpdatedAt, updatedAt]);

  useEffect(() => {
    if (!node) return undefined;
    let active = true;
    const currentNode = node;
    getNodes()
      .then(({ items }) => {
        if (active) {
          const name =
            getStableNodeDisplayName(items, currentNode.id) ??
            getStableNodeDisplayName([currentNode], currentNode.id);
          if (name) setNodeDisplay({ nodeId: currentNode.id, name });
        }
      })
      .catch(() => {
        const name = getStableNodeDisplayName([currentNode], currentNode.id);
        if (active && name) setNodeDisplay({ nodeId: currentNode.id, name });
      });
    return () => {
      active = false;
    };
  }, [node]);

  useEffect(() => {
    if (!nodeId) return undefined;
    let active = true;
    const loadExecutions = async (showLoading: boolean) => {
      if (showLoading) setExecutionsLoading(true);
      try {
        const result = await getSchedulerExecutions({
          physicalNodeId: nodeId,
          activeOnly: true,
        });
        if (!active) return;
        setExecutions(result.items);
        setExecutionsError(undefined);
      } catch (loadError) {
        if (!active) return;
        setExecutionsError(
          loadError instanceof Error ? loadError.message : 'Scheduler 执行投影加载失败',
        );
      } finally {
        if (active && showLoading) setExecutionsLoading(false);
      }
    };
    void loadExecutions(true);
    const timer = window.setInterval(() => void loadExecutions(false), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [nodeId]);

  if (loading && !node) {
    return (
      <main className="node-detail-page" aria-label="正在加载节点详情">
        <Skeleton active paragraph={{ rows: 1 }} />
        <div className="node-detail-page__skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index}>
              <Skeleton active title={false} paragraph={{ rows: 4 }} />
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (!node) {
    return (
      <main className="node-detail-page">
        <Result
          status={error?.startsWith('未找到') ? '404' : 'error'}
          title={error?.startsWith('未找到') ? '未找到节点' : '节点详情加载失败'}
          subTitle={error ?? '节点可能尚未接入，或 Node ID 已失效。'}
          extra={
            <Space>
              <Button onClick={refresh} icon={<ReloadOutlined />}>
                重新加载
              </Button>
              <Button type="primary" onClick={() => navigate(returnPath)}>
                {returnLabel}
              </Button>
            </Space>
          }
        />
      </main>
    );
  }

  const displayName =
    (nodeDisplay?.nodeId === node.id ? nodeDisplay.name : undefined) ??
    getStableNodeDisplayName([node], node.id) ??
    '节点--';
  const accessStatus = ACCESS_STATUS_CONFIG[node.accessStatus];
  const healthStatus = HEALTH_STATUS_CONFIG[node.healthStatus];
  const networkStatus = NETWORK_LINK_CONFIG[node.network.linkStatus];
  const gpu = node.gpuDetails;
  const gpuUnavailableText = !gpu?.supported ? '不支持' : !gpu.available ? '采集不可用' : undefined;
  const gpuUtilization =
    gpu?.utilizationPercent ??
    (() => {
      const values = gpu?.devices.flatMap((device) =>
        device.utilizationPercent === undefined ? [] : [device.utilizationPercent],
      );
      return values && values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined;
    })();
  const videoMemory = resolveNodeVideoMemory(node);
  const memoryLabel = gpu?.memoryArchitecture === 'unified' ? '统一内存' : '显存';
  const gpuModels =
    gpu?.devices
      .map((device) => device.model)
      .filter(Boolean)
      .join('、') || '--';
  const formatNetworkMetric = (value: number | undefined, unit: string) =>
    node.network.linkStatus === 'down' ? '--' : formatOptionalMetric(value, unit);

  return (
    <main className="node-detail-page">
      <PageHeader
        title={`${displayName}详情`}
        description={`${node.name} · ${node.platform} · ${node.architecture.toUpperCase()}`}
        extra={
          <Space className="node-detail-actions" wrap size={8}>
            <Button
              icon={<DeploymentUnitOutlined />}
              onClick={() => navigate(buildComputePoolPath({ nodeId: node.id }))}
            >
              查看所属算力池资源
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(returnPath)}>
              {returnLabel}
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
              刷新
            </Button>
          </Space>
        }
      />

      {error && (
        <Alert
          className="node-detail-page__alert"
          type="warning"
          showIcon
          message="本次刷新失败，当前仍显示最近一次成功获取的数据"
          description={error}
        />
      )}

      <Card className="node-detail-identity-card">
        <div className="node-detail-identity">
          <div className="node-detail-identity__main">
            <span className="node-detail-identity__ordinal">{displayName}</span>
            <div className="node-detail-identity__copy">
              <strong>{node.name}</strong>
              <div>
                <span>Node ID：</span>
                <Tooltip title={node.id}>
                  <code>{abbreviateId(node.id)}</code>
                </Tooltip>
              </div>
              <small>
                {node.platform} · {node.architecture.toUpperCase()}
              </small>
            </div>
          </div>
          <div className="node-detail-identity__statuses" aria-label="节点当前状态">
            <StatusBadge status={node.operationalStatus} />
            {node.activityStatus && (
              <Tag color="processing" bordered={false}>
                {ACTIVITY_LABELS[node.activityStatus]}
              </Tag>
            )}
            <Tag color={healthStatus.color} bordered={false}>
              {healthStatus.label}
            </Tag>
            <Tag color={accessStatus.color} bordered={false}>
              {accessStatus.label}
            </Tag>
            <Tag color={node.schedulable ? 'success' : 'default'} bordered={false}>
              {node.schedulable ? '可调度' : '不可调度'}
            </Tag>
          </div>
        </div>
      </Card>

      <section className="node-detail-section" aria-labelledby="node-compute-title">
        <div className="node-detail-section__heading">
          <HeartOutlined />
          <div>
            <h2 id="node-compute-title">核心计算资源</h2>
            <p>真实异构能力、利用率与可分配容量</p>
          </div>
        </div>
        <NodeResourceSummary
          resources={node.resources}
          nodeSource={node.nodeSource}
          videoMemory={videoMemory}
          memoryLabel={memoryLabel}
        />
      </section>

      <div className="node-detail-grid node-detail-grid--information">
        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <ProfileOutlined /> 设备与平台信息
            </span>
          }
        >
          <Descriptions
            className="node-detail-kv"
            column={{ xs: 1, sm: 2 }}
            size="small"
            colon={false}
          >
            <Descriptions.Item label="节点名称">{node.name}</Descriptions.Item>
            <Descriptions.Item label="Hostname">{node.hostname ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="Node ID" span={2}>
              <Tooltip title={node.id}>
                <code className="node-detail-inline-code">{abbreviateId(node.id)}</code>
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label="节点类型">
              {NODE_TYPE_LABELS[node.nodeType]}
            </Descriptions.Item>
            <Descriptions.Item label="硬件平台">{node.platform}</Descriptions.Item>
            <Descriptions.Item label="操作系统">
              {[node.operatingSystem, node.osVersion].filter(Boolean).join(' ') || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="架构">{node.architecture.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="节点 IP">{node.ipAddress ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="所属集群">
              {node.cluster ? (
                <Link to={buildClusterDetailPath(node.cluster.id)}>{node.cluster.name}</Link>
              ) : (
                '未加入'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="节点标签" span={2}>
              <Space size={[4, 4]} wrap>
                {node.labels.length > 0
                  ? node.labels.map((label) => (
                      <Tag key={label} bordered={false}>
                        {label}
                      </Tag>
                    ))
                  : '--'}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="序列号" span={2}>
              {node.serialNumber ?? '--'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <DeploymentUnitOutlined /> 硬件信息
            </span>
          }
        >
          <Descriptions
            className="node-detail-kv"
            column={{ xs: 1, sm: 2 }}
            size="small"
            colon={false}
          >
            <Descriptions.Item label="物理核心">
              {node.cpuDetails?.physicalCores ?? '--'} Core
            </Descriptions.Item>
            <Descriptions.Item label="逻辑核心">
              {node.cpuDetails?.logicalCores ?? '--'} Core
            </Descriptions.Item>
            <Descriptions.Item label="CPU 利用率">
              {formatOptionalMetric(node.cpuDetails?.utilizationPercent, '%')}
            </Descriptions.Item>
            <Descriptions.Item label="CPU 频率">
              {formatOptionalMetric(node.cpuDetails?.frequencyMHz, 'MHz')}
            </Descriptions.Item>
            <Descriptions.Item label="GPU 设备数量">
              {gpuUnavailableText ?? `${gpu?.deviceCount ?? 0} Device`}
            </Descriptions.Item>
            <Descriptions.Item label="GPU 利用率">
              {gpuUnavailableText ?? formatOptionalMetric(gpuUtilization, '%')}
            </Descriptions.Item>
            <Descriptions.Item label="GPU 型号" span={2}>
              {gpuUnavailableText ?? gpuModels}
            </Descriptions.Item>
            <Descriptions.Item label={memoryLabel + '总量'}>
              {gpuUnavailableText ??
                (videoMemory ? formatCapacity(videoMemory.total, videoMemory.unit) : '--')}
            </Descriptions.Item>
            <Descriptions.Item label={'已用' + memoryLabel}>
              {gpuUnavailableText ??
                (videoMemory ? formatCapacity(videoMemory.used, videoMemory.unit) : '--')}
            </Descriptions.Item>
            <Descriptions.Item label={'可用' + memoryLabel}>
              {gpuUnavailableText ??
                (videoMemory ? formatCapacity(videoMemory.available, videoMemory.unit) : '--')}
            </Descriptions.Item>
            <Descriptions.Item label="显存架构">
              {gpuUnavailableText ??
                (gpu?.memoryArchitecture === 'unified' ? '统一内存架构' : gpu?.memoryArchitecture === 'dedicated' ? '独立显存架构' : '未上报')}
            </Descriptions.Item>
            <Descriptions.Item label="NPU">
              <Tag color={node.npuSupport?.supported ? 'success' : 'default'} bordered={false}>
                {node.npuSupport?.supported ? '支持' : '不支持'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="DLA">
              <Tag color={node.dlaSupport?.supported ? 'success' : 'default'} bordered={false}>
                {node.dlaSupport?.supported ? '支持' : '不支持'}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      <Card
        className="node-detail-card node-detail-capacity-card"
        title={
          <span className="node-detail-card__title">
            <DatabaseOutlined /> 内存与存储
          </span>
        }
      >
        <div className="capacity-list">
          <div className="capacity-list__item">
            <span className="capacity-list__label">内存</span>
            <CapacityOverview metric={node.memory} />
          </div>
          <div className="capacity-list__item">
            <span className="capacity-list__label">本地存储</span>
            <CapacityOverview metric={node.storage} />
          </div>
        </div>
      </Card>

      <div className="node-detail-grid node-detail-grid--runtime">
        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <HeartOutlined /> 运行状态
            </span>
          }
        >
          <Descriptions
            className="node-detail-kv"
            column={{ xs: 1, sm: 2 }}
            size="small"
            colon={false}
          >
            <Descriptions.Item label="采集程序版本">{node.agentVersion}</Descriptions.Item>
            <Descriptions.Item label="是否可调度">
              <Tag color={node.schedulable ? 'success' : 'default'} bordered={false}>
                {node.schedulable ? '是' : '否'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="注册时间">
              {node.registeredAt ? (
                <time dateTime={node.registeredAt}>{formatDateTime(node.registeredAt)}</time>
              ) : (
                '--'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="资源采集时间">
              {node.lastResourceAt ? (
                <time dateTime={node.lastResourceAt}>{formatDateTime(node.lastResourceAt)}</time>
              ) : (
                '--'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="最后心跳" span={2}>
              {formatHeartbeatAge(node.heartbeatAt)} 前 · {formatDateTime(node.heartbeatAt)}
            </Descriptions.Item>
            <Descriptions.Item label="CPU 温度">
              <TemperatureValue value={node.temperature?.cpuCelsius} />
            </Descriptions.Item>
            <Descriptions.Item label="GPU 温度">
              <TemperatureValue value={node.temperature?.gpuCelsius} />
            </Descriptions.Item>
            <Descriptions.Item label="NPU 温度">
              <TemperatureValue value={node.temperature?.npuCelsius} />
            </Descriptions.Item>
            <Descriptions.Item label="板载温度">
              <TemperatureValue value={node.temperature?.boardCelsius} />
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <GlobalOutlined /> 网络状态
            </span>
          }
          extra={
            <Tag color={networkStatus.color} bordered={false}>
              {networkStatus.label}
            </Tag>
          }
        >
          <Descriptions
            className="network-metrics"
            column={{ xs: 1, sm: 2, lg: 3, xl: 4 }}
            size="small"
            colon={false}
          >
            <Descriptions.Item label="网络接口">{node.network.interfaceName}</Descriptions.Item>
            <Descriptions.Item label="IPv4">{node.network.ipv4Address}</Descriptions.Item>
            <Descriptions.Item label="MAC">{node.network.macAddress ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="链路速率">
              {formatNetworkMetric(node.network.linkSpeedMbps, 'Mbps')}
            </Descriptions.Item>
            <Descriptions.Item label="网络延迟">
              {formatNetworkMetric(node.network.latencyMs, 'ms')}
            </Descriptions.Item>
            <Descriptions.Item label="网络抖动">
              {formatNetworkMetric(node.network.jitterMs, 'ms')}
            </Descriptions.Item>
            <Descriptions.Item label="丢包率">
              {formatNetworkMetric(node.network.packetLossPercent, '%')}
            </Descriptions.Item>
            <Descriptions.Item label="接收速率">
              {formatNetworkMetric(node.network.rxMbps, 'Mbps')}
            </Descriptions.Item>
            <Descriptions.Item label="发送速率">
              {formatNetworkMetric(node.network.txMbps, 'Mbps')}
            </Descriptions.Item>
            <Descriptions.Item label="实时 RX">
              {node.network.rxBytesPerSecond === undefined
                ? '--'
                : `${formatBytes(node.network.rxBytesPerSecond)}/s`}
            </Descriptions.Item>
            <Descriptions.Item label="实时 TX">
              {node.network.txBytesPerSecond === undefined
                ? '--'
                : `${formatBytes(node.network.txBytesPerSecond)}/s`}
            </Descriptions.Item>
            <Descriptions.Item label="累计接收">
              {formatBytes(node.network.bytesReceived)}
            </Descriptions.Item>
            <Descriptions.Item label="累计发送">
              {formatBytes(node.network.bytesSent)}
            </Descriptions.Item>
            <Descriptions.Item label="链路状态">{networkStatus.label}</Descriptions.Item>
          </Descriptions>
        </Card>
      </div>

      <Card
        className="node-detail-card node-detail-tasks"
        title={
          <span className="node-detail-card__title">
            <ProfileOutlined /> 当前任务与执行
          </span>
        }
        extra={<span className="node-detail-card__count">{executions.length} 条执行记录</span>}
      >
        {executionsError && (
          <Alert
            className="node-detail-page__alert"
            type="warning"
            showIcon
            message="调度执行记录加载失败"
            description={executionsError}
          />
        )}
        <div className="node-detail-table-scroll">
          <ExecutionTable
            items={executions}
            loading={executionsLoading}
            emptyDescription="当前节点暂无正在执行的任务或分片"
          />
        </div>
      </Card>

      <NodeReliabilityCard nodeId={node.id} />
    </main>
  );
}
