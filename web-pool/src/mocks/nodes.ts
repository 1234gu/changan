import type {
  CapacityMetric,
  NodeDetail,
  NodeEvent,
  NodeSummary,
  RegistrationRecord,
} from '../types/node';
import type { ResourceCapacity, ResourceMap } from '../types/resource';

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1_000).toISOString();
const minutesAgo = (minutes: number) => secondsAgo(minutes * 60);
const daysAgo = (days: number) => minutesAgo(days * 24 * 60);

const cpu = (total: number): ResourceCapacity => ({ total, unit: 'Core' });
const gpu = (total: number): ResourceCapacity => ({ total, unit: '个' });
const npu = (total: number): ResourceCapacity => ({ total, unit: 'TOPS' });
const dla = (total: number): ResourceCapacity => ({ total, unit: '个' });

type SimulatorNodeSummary = Omit<
  NodeSummary,
  | 'nodeSource'
  | 'operationalStatus'
  | 'registrationStatus'
  | 'everApproved'
  | 'authorizationStatus'
  | 'poolMembership'
>;

export const createNodeSummaries = (): NodeSummary[] => {
  const nodes: SimulatorNodeSummary[] = [
    {
      id: 'node-v01',
      name: 'V01',
      nodeType: 'vehicle',
      platform: 'NVIDIA Jetson AGX Orin',
      architecture: 'arm64',
      cluster: { id: 'cluster-a', name: 'Cluster-A' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(1.2),
      resources: { cpu: cpu(12), gpu: gpu(1), dla: dla(2) },
      labels: ['zone:east', 'vehicle:sedan', 'acceleration:cuda'],
    },
    {
      id: 'node-v02',
      name: 'V02',
      nodeType: 'vehicle',
      platform: 'MediaTek MT8676',
      architecture: 'arm64',
      cluster: { id: 'cluster-a', name: 'Cluster-A' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(0.8),
      resources: { cpu: cpu(8), npu: npu(20) },
      labels: ['zone:east', 'vehicle:suv', 'acceleration:npu'],
    },
    {
      id: 'node-v03',
      name: 'V03',
      nodeType: 'edge-server',
      platform: 'x86 Edge Station',
      architecture: 'x86_64',
      cluster: { id: 'cluster-a', name: 'Cluster-A' },
      connectivityStatus: 'suspect',
      activityStatus: 'idle',
      healthStatus: 'degraded',
      accessStatus: 'registered',
      schedulable: false,
      heartbeatAt: secondsAgo(8.5),
      resources: { cpu: cpu(8), gpu: gpu(3) },
      labels: ['zone:east', 'role:gateway', 'acceleration:cuda'],
    },
    {
      id: 'node-v04',
      name: 'V04',
      nodeType: 'vehicle',
      platform: 'Generic ARM Vehicle ECU',
      architecture: 'arm64',
      cluster: { id: 'cluster-a', name: 'Cluster-A' },
      connectivityStatus: 'offline',
      healthStatus: 'unhealthy',
      accessStatus: 'reconnecting',
      schedulable: false,
      heartbeatAt: minutesAgo(2),
      resources: { cpu: cpu(4) },
      labels: ['zone:east', 'vehicle:van'],
    },
    {
      id: 'node-v05',
      name: 'V05',
      nodeType: 'vehicle',
      platform: 'NVIDIA Jetson Orin NX',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'idle',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(1.6),
      resources: { cpu: cpu(12), gpu: gpu(1), npu: npu(20) },
      labels: ['zone:west', 'vehicle:sedan', 'acceleration:cuda'],
    },
    {
      id: 'node-v06',
      name: 'V06',
      nodeType: 'vehicle',
      platform: 'MediaTek Automotive',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(1.1),
      resources: { cpu: cpu(8), npu: npu(24), dla: dla(1) },
      labels: ['zone:west', 'vehicle:suv', 'acceleration:npu'],
    },
    {
      id: 'node-v07',
      name: 'V07',
      nodeType: 'edge-server',
      platform: 'NVIDIA IGX Orin',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: false,
      heartbeatAt: secondsAgo(2.2),
      resources: { cpu: cpu(16), gpu: gpu(1) },
      labels: ['zone:west', 'role:edge', 'maintenance:drain'],
    },
    {
      id: 'node-v08',
      name: 'V08',
      nodeType: 'vehicle',
      platform: 'Generic ARM Vehicle ECU',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'idle',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(1.9),
      resources: { cpu: cpu(8) },
      labels: ['zone:west', 'vehicle:truck'],
    },
    {
      id: 'node-v09',
      name: 'V09',
      nodeType: 'vehicle',
      platform: 'MediaTek MT8676',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(0.9),
      resources: { cpu: cpu(12), npu: npu(48) },
      labels: ['zone:north', 'vehicle:suv', 'acceleration:npu'],
    },
    {
      id: 'node-v10',
      name: 'V10',
      nodeType: 'vehicle',
      platform: 'NVIDIA Jetson Orin Nano',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'idle',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: false,
      heartbeatAt: secondsAgo(3.4),
      resources: { cpu: cpu(8), gpu: gpu(1), dla: dla(1) },
      labels: ['zone:north', 'network:limited', 'acceleration:cuda'],
    },
    {
      id: 'node-v11',
      name: 'V11',
      nodeType: 'workstation',
      platform: 'x86 AI Workstation',
      architecture: 'x86_64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'running',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: true,
      heartbeatAt: secondsAgo(1.4),
      resources: { cpu: cpu(16), gpu: gpu(1) },
      labels: ['zone:north', 'role:workstation', 'acceleration:cuda'],
    },
    {
      id: 'node-v12',
      name: 'V12',
      nodeType: 'vehicle',
      platform: 'MediaTek Automotive',
      architecture: 'arm64',
      cluster: { id: 'cluster-b', name: 'Cluster-B' },
      connectivityStatus: 'online',
      activityStatus: 'idle',
      healthStatus: 'healthy',
      accessStatus: 'registered',
      schedulable: false,
      heartbeatAt: secondsAgo(2.7),
      resources: { cpu: cpu(16), npu: npu(48) },
      labels: ['zone:south', 'vehicle:bus', 'schedule:restricted'],
    },
  ];

  return nodes.map((node) => ({
    ...node,
    nodeSource: 'simulator',
    operationalStatus:
      node.connectivityStatus === 'online' && node.healthStatus !== 'healthy'
        ? 'abnormal'
        : node.connectivityStatus,
    registrationStatus: node.accessStatus === 'reconnecting' ? 'registered' : node.accessStatus,
    everApproved: true,
    authorizationStatus: 'approved',
    poolMembership: 'in_pool',
  }));
};

const resourceMetric = (capacity: ResourceCapacity, ratio: number, usedOverride?: number) => {
  const precision = capacity.unit === '个' ? 0 : 1;
  const used = usedOverride ?? Number((capacity.total * ratio).toFixed(precision));
  return {
    total: capacity.total,
    used,
    available: Number((capacity.total - used).toFixed(precision)),
    utilization: Number(((used / capacity.total) * 100).toFixed(1)),
    unit: capacity.unit,
  };
};

const allocatedDeviceCount = (node: NodeSummary, kind: 'gpu' | 'dla') => {
  if (node.activityStatus !== 'running') return 0;
  if (kind === 'dla' && !node.labels.includes('acceleration:cuda')) return 0;
  return 1;
};

const resourceMap = (node: NodeSummary, ratio: number): ResourceMap => ({
  cpu: resourceMetric(node.resources.cpu, ratio),
  ...(node.resources.gpu
    ? {
        gpu: resourceMetric(
          node.resources.gpu,
          ratio,
          Math.min(node.resources.gpu.total, allocatedDeviceCount(node, 'gpu')),
        ),
      }
    : {}),
  ...(node.resources.npu ? { npu: resourceMetric(node.resources.npu, ratio) } : {}),
  ...(node.resources.dla
    ? {
        dla: resourceMetric(
          node.resources.dla,
          ratio,
          Math.min(node.resources.dla.total, allocatedDeviceCount(node, 'dla')),
        ),
      }
    : {}),
});

const capacityMetric = (total: number, ratio: number): CapacityMetric => {
  const used = Number((total * ratio).toFixed(1));
  return {
    total,
    used,
    available: Number((total - used).toFixed(1)),
    utilization: Number(((used / total) * 100).toFixed(1)),
    unit: 'GB',
  };
};

export const createNodeDetails = (nodes = createNodeSummaries()): Record<string, NodeDetail> =>
  Object.fromEntries(
    nodes.map((node, index) => {
      const offline = node.connectivityStatus === 'offline';
      const degraded = node.connectivityStatus === 'suspect' || node.name === 'V10';
      const utilizationRatio = offline ? 0 : 0.28 + (index % 4) * 0.09;
      const hasGpu = node.resources.gpu !== undefined;
      const hasNpu = node.resources.npu !== undefined;
      const supportsTemperature = node.architecture === 'arm64' && node.name !== 'V04';
      const memoryTotal =
        node.nodeType === 'edge-server' ? 64 : node.nodeType === 'workstation' ? 128 : 32;

      const detail: NodeDetail = {
        ...node,
        serialNumber: `VH-2026-${String(index + 1).padStart(4, '0')}`,
        agentVersion: index % 3 === 0 ? '1.4.2' : '1.4.1',
        registeredAt: daysAgo(42 - index),
        resources: resourceMap(node, utilizationRatio),
        memory: capacityMetric(memoryTotal, offline ? 0 : 0.38 + (index % 3) * 0.08),
        ...(hasGpu
          ? { videoMemory: capacityMetric((node.resources.gpu?.total ?? 1) * 16, utilizationRatio) }
          : {}),
        storage: capacityMetric(node.nodeType === 'vehicle' ? 512 : 1024, offline ? 0 : 0.45),
        network: {
          interfaceName: node.nodeType === 'vehicle' ? 'eth0' : 'enp2s0',
          ipv4Address: `10.20.${Math.floor(index / 4) + 1}.${20 + index}`,
          macAddress: `02:42:ac:14:${String(index + 1).padStart(2, '0')}:01`,
          linkStatus: offline ? 'down' : degraded ? 'degraded' : 'up',
          linkSpeedMbps: offline ? 0 : node.nodeType === 'vehicle' ? 1000 : 2500,
          latencyMs: offline ? 0 : degraded ? 86.4 : Number((8.4 + index * 0.7).toFixed(1)),
          jitterMs: offline ? 0 : degraded ? 18.2 : Number((1.2 + (index % 4) * 0.3).toFixed(1)),
          packetLossPercent: offline ? 100 : degraded ? 5.8 : Number((index % 3) * 0.1),
          rxMbps: offline ? 0 : Number((42 + index * 3.4).toFixed(1)),
          txMbps: offline ? 0 : Number((18 + index * 2.1).toFixed(1)),
        },
        ...(supportsTemperature
          ? {
              temperature: {
                cpuCelsius: 48 + (index % 5) * 2,
                ...(hasGpu ? { gpuCelsius: 52 + (index % 4) * 2 } : {}),
                ...(hasNpu ? { npuCelsius: 49 + (index % 3) * 2 } : {}),
                boardCelsius: 44 + (index % 4),
              },
            }
          : {}),
        currentTasks:
          node.activityStatus === 'running'
            ? [
                {
                  id: `task-${String(index + 1).padStart(3, '0')}`,
                  name: index % 2 === 0 ? '道路目标识别' : '协同感知推理',
                  status: 'running',
                  startedAt: minutesAgo(12 + index),
                },
              ]
            : [],
      };

      return [node.id, detail];
    }),
  );

export const createRegistrationRecords = (): RegistrationRecord[] => [
  {
    id: 'reg-v04-retry',
    nodeId: 'node-v04',
    nodeName: 'V04',
    startedAt: minutesAgo(2),
    result: 'in_progress',
    reconnectStatus: 'in_progress',
  },
  {
    id: 'reg-v04-failed',
    nodeId: 'node-v04',
    nodeName: 'V04',
    startedAt: minutesAgo(18),
    completedAt: minutesAgo(15),
    durationSeconds: 186,
    result: 'failed',
    failureReason: '节点侧采集程序心跳鉴权超时，节点状态同步未完成',
    reconnectStatus: 'in_progress',
  },
  {
    id: 'reg-v03-recovered',
    nodeId: 'node-v03',
    nodeName: 'V03',
    startedAt: minutesAgo(54),
    completedAt: minutesAgo(50),
    durationSeconds: 228,
    result: 'success',
    reconnectStatus: 'recovered',
  },
  ...createNodeSummaries()
    .filter((node) => !['node-v03', 'node-v04'].includes(node.id))
    .map<RegistrationRecord>((node, index) => ({
      id: `reg-${node.name.toLowerCase()}`,
      nodeId: node.id,
      nodeName: node.name,
      startedAt: daysAgo(28 - index),
      completedAt: new Date(
        new Date(daysAgo(28 - index)).getTime() + (142 + index * 9) * 1_000,
      ).toISOString(),
      durationSeconds: 142 + index * 9,
      result: 'success',
      reconnectStatus: 'not_required',
    })),
];

export const createNodeEvents = (): NodeEvent[] => [
  {
    id: 'event-v04-reconnect',
    nodeId: 'node-v04',
    nodeName: 'V04',
    type: 'reconnect_started',
    level: 'info',
    message: '节点侧采集程序已启动重新接入流程',
    occurredAt: minutesAgo(2),
  },
  {
    id: 'event-v03-suspect',
    nodeId: 'node-v03',
    nodeName: 'V03',
    type: 'node_suspect',
    level: 'warning',
    message: '连续心跳抖动，节点进入疑似离线状态',
    occurredAt: minutesAgo(4),
  },
  {
    id: 'event-v03-heartbeat',
    nodeId: 'node-v03',
    nodeName: 'V03',
    type: 'heartbeat_abnormal',
    level: 'warning',
    message: '心跳延迟超过健康阈值',
    occurredAt: minutesAgo(5),
  },
  {
    id: 'event-v06-schedulable',
    nodeId: 'node-v06',
    nodeName: 'V06',
    type: 'schedulable_restored',
    level: 'info',
    message: '资源与网络检查通过，恢复可调度',
    occurredAt: minutesAgo(8),
  },
  {
    id: 'event-v06-online',
    nodeId: 'node-v06',
    nodeName: 'V06',
    type: 'node_online',
    level: 'info',
    message: '节点重新上线并完成状态同步',
    occurredAt: minutesAgo(9),
  },
  {
    id: 'event-v06-recovered',
    nodeId: 'node-v06',
    nodeName: 'V06',
    type: 'node_recovered',
    level: 'info',
    message: '物理链路恢复，节点接入完成',
    occurredAt: minutesAgo(10),
  },
  {
    id: 'event-v04-offline',
    nodeId: 'node-v04',
    nodeName: 'V04',
    type: 'node_offline',
    level: 'error',
    message: '心跳中断，节点已离线并退出调度候选集',
    occurredAt: minutesAgo(15),
  },
  {
    id: 'event-v04-registration-failed',
    nodeId: 'node-v04',
    nodeName: 'V04',
    type: 'registration_failed',
    level: 'error',
    message: '重新注册失败：节点侧采集程序心跳鉴权超时',
    occurredAt: minutesAgo(16),
  },
  {
    id: 'event-v04-suspect',
    nodeId: 'node-v04',
    nodeName: 'V04',
    type: 'node_suspect',
    level: 'warning',
    message: '节点进入疑似离线状态',
    occurredAt: minutesAgo(17),
  },
  {
    id: 'event-v04-heartbeat',
    nodeId: 'node-v04',
    nodeName: 'V04',
    type: 'heartbeat_abnormal',
    level: 'warning',
    message: '心跳连续丢失，等待重试',
    occurredAt: minutesAgo(18),
  },
];
