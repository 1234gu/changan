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
import { Alert, Button, Card, Descriptions, Progress, Result, Skeleton, Space, Tag } from 'antd';
import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { buildClusterDetailPath, buildComputePoolPath, ROUTES } from '../../routes/config';
import { getSchedulerExecutions } from '../../services/schedulerService';
import type { CapacityMetric, NodeGpuDevice } from '../../types/node';
import type { SchedulerExecution } from '../../types/scheduling';
import { ExecutionTable } from '../scheduling/components/ExecutionTable';
import { NodeResourceSummary } from './components/NodeResourceSummary';
import { NodeReliabilityCard } from '../../components/platform/NodeReliabilityCard';
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
        strokeColor="#356df3"
        trailColor="#edf1f7"
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

const UNIFIED_MEMORY_TEXT = '统一内存（与系统内存共享）';

function formatVramBytes(value: number | undefined) {
  if (value === undefined) return '--';
  const gb = value / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

function deviceVramBytes(
  device: NodeGpuDevice,
  bytesField: 'vramTotalBytes' | 'vramUsedBytes' | 'vramAvailableBytes',
  legacyField: 'memoryTotalMB' | 'memoryUsedMB' | 'memoryAvailableMB',
) {
  const bytes = device[bytesField];
  if (bytes !== undefined) return bytes;
  const megabytes = device[legacyField];
  return megabytes === undefined ? undefined : megabytes * 1024 ** 2;
}

function formatDeviceVram(device: NodeGpuDevice) {
  const total = deviceVramBytes(device, 'vramTotalBytes', 'memoryTotalMB');
  const used = deviceVramBytes(device, 'vramUsedBytes', 'memoryUsedMB');
  const available = deviceVramBytes(device, 'vramAvailableBytes', 'memoryAvailableMB');
  return `GPU ${device.index}：${formatVramBytes(total)}（已用 ${formatVramBytes(used)}，可用 ${formatVramBytes(available)}）`;
}

export function NodeDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const { node, loading, error, updatedAt, refresh } = useNodeDetail(nodeId);
  const [executions, setExecutions] = useState<SchedulerExecution[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(true);
  const [executionsError, setExecutionsError] = useState<string>();
  const returnPath = (location.state as { from?: string } | null)?.from ?? ROUTES.nodes;
  const returnLabel = returnPath.startsWith(ROUTES.computePool) ? '返回算力池' : '返回列表';

  useEffect(() => {
    if (updatedAt) setHeaderUpdatedAt(updatedAt);
  }, [setHeaderUpdatedAt, updatedAt]);

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

  const accessStatus = ACCESS_STATUS_CONFIG[node.accessStatus];
  const healthStatus = HEALTH_STATUS_CONFIG[node.healthStatus];
  const networkStatus = NETWORK_LINK_CONFIG[node.network.linkStatus];
  const gpu = node.gpuDetails;
  const gpuUnavailableText = !gpu?.supported ? '不支持' : !gpu.available ? '采集不可用' : undefined;
  const unifiedMemory = gpu?.memoryArchitecture === 'unified';
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
  const formatNetworkMetric = (value: number | undefined, unit: string) =>
    node.network.linkStatus === 'down' ? '--' : formatOptionalMetric(value, unit);
  return (
    <main className="node-detail-page">
      <PageHeader
        eyebrow="NODE DETAIL"
        title={`${node.name} · 节点详情`}
        description={`${node.platform} · ${node.id}`}
        extra={
          <Space wrap>
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
            <span className="node-detail-identity__name">{node.name}</span>
            <code>{node.id}</code>
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
            <h2 id="node-compute-title">计算资源</h2>
            <p>异构能力与实时资源占用</p>
          </div>
        </div>
        <NodeResourceSummary resources={node.resources} nodeSource={node.nodeSource} />
      </section>

      <div className="node-detail-grid">
        {node.nodeSource === 'agent' && (
          <Card
            className="node-detail-card"
            title={
              <span className="node-detail-card__title">
                <DeploymentUnitOutlined /> 节点硬件采集
              </span>
            }
          >
            <Descriptions column={1} size="small" colon={false}>
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
                {gpuUnavailableText ? (
                  <Space size={6} wrap>
                    <Tag color={gpu?.supported ? 'warning' : 'default'} bordered={false}>
                      {gpuUnavailableText}
                    </Tag>
                    {gpu?.error && <span>{gpu.error}</span>}
                  </Space>
                ) : (
                  `${gpu?.deviceCount ?? 0} GPU`
                )}
              </Descriptions.Item>
              <Descriptions.Item label="GPU 型号">
                {gpuUnavailableText ??
                  (gpu?.devices.map((device) => device.model).join('、') || '--')}
              </Descriptions.Item>
              <Descriptions.Item label="GPU 利用率">
                {gpuUnavailableText ?? formatOptionalMetric(gpuUtilization, '%')}
              </Descriptions.Item>
              <Descriptions.Item label="单卡显存">
                {gpuUnavailableText ?? (unifiedMemory ? UNIFIED_MEMORY_TEXT : (gpu?.devices.map(formatDeviceVram).join('；') || '--'))}
              </Descriptions.Item>
              <Descriptions.Item label="节点总显存">
                {gpuUnavailableText ?? (unifiedMemory ? UNIFIED_MEMORY_TEXT : formatVramBytes(gpu?.totalVramBytes))}
              </Descriptions.Item>
              <Descriptions.Item label="已使用显存">
                {gpuUnavailableText ?? (unifiedMemory ? UNIFIED_MEMORY_TEXT : formatVramBytes(gpu?.usedVramBytes))}
              </Descriptions.Item>
              <Descriptions.Item label="可用显存">
                {gpuUnavailableText ?? (unifiedMemory ? UNIFIED_MEMORY_TEXT : formatVramBytes(gpu?.availableVramBytes))}
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
        )}
        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <ProfileOutlined /> 基本信息
            </span>
          }
        >
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="节点类型">
              {NODE_TYPE_LABELS[node.nodeType]}
            </Descriptions.Item>
            <Descriptions.Item label="Hostname">{node.hostname ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="操作系统">
              {[node.operatingSystem, node.osVersion].filter(Boolean).join(' ') || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="节点 IP">{node.ipAddress ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="硬件平台">{node.platform}</Descriptions.Item>
            <Descriptions.Item label="处理器架构">{node.architecture}</Descriptions.Item>
            <Descriptions.Item label="序列号">{node.serialNumber ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="所属集群">
              {node.cluster ? (
                <Link to={buildClusterDetailPath(node.cluster.id)}>{node.cluster.name}</Link>
              ) : (
                '未加入'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="节点标签">
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
          </Descriptions>
        </Card>

        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <DatabaseOutlined /> 存储与内存
            </span>
          }
        >
          <div className="capacity-list">
            <div>
              <span className="capacity-list__label">系统内存</span>
              <CapacityOverview metric={node.memory} />
            </div>
            <div>
              <span className="capacity-list__label">本地存储</span>
              <CapacityOverview metric={node.storage} />
            </div>
            <div>
              <span className="capacity-list__label">显存</span>
              {unifiedMemory ? (
                <div className="capacity-list__unsupported">
                  <Tag color="processing" bordered={false}>统一内存</Tag>
                  <span>GPU 与系统内存共享，不单独计算显存</span>
                </div>
              ) : node.videoMemory ? (
                <CapacityOverview metric={node.videoMemory} />
              ) : (
                <div className="capacity-list__unsupported">
                  <Tag bordered={false}>不支持</Tag>
                  <span>节点未上报独立显存</span>
                </div>
              )}
            </div>
          </div>
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
            column={{ xs: 1, sm: 2 }}
            size="small"
            colon={false}
          >
            <Descriptions.Item label="网络接口">{node.network.interfaceName}</Descriptions.Item>
            <Descriptions.Item label="IPv4 地址">{node.network.ipv4Address}</Descriptions.Item>
            <Descriptions.Item label="MAC 地址">
              {node.network.macAddress ?? '--'}
            </Descriptions.Item>
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
            <Descriptions.Item label="累计接收">
              {formatBytes(node.network.bytesReceived)}
            </Descriptions.Item>
            <Descriptions.Item label="累计发送">
              {formatBytes(node.network.bytesSent)}
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
            <Descriptions.Item label="链路状态">{networkStatus.label}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          className="node-detail-card"
          title={
            <span className="node-detail-card__title">
              <HeartOutlined /> 运行状态
            </span>
          }
        >
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="节点侧采集程序版本">{node.agentVersion}</Descriptions.Item>
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
            <Descriptions.Item label="最后心跳">
              <span>
                {formatHeartbeatAge(node.heartbeatAt)} 前 · {formatDateTime(node.heartbeatAt)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="是否可调度">
              <Tag color={node.schedulable ? 'success' : 'default'} bordered={false}>
                {node.schedulable ? '是' : '否'}
              </Tag>
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
      </div>

      <Card
        className="node-detail-card node-detail-tasks"
        title={
          <span className="node-detail-card__title">
            <ProfileOutlined /> 当前执行
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
        <ExecutionTable
          items={executions}
          loading={executionsLoading}
          emptyDescription="当前物理节点没有执行中的任务会话或分片"
        />
      </Card>

      <NodeReliabilityCard nodeId={node.id} />
    </main>
  );
}
