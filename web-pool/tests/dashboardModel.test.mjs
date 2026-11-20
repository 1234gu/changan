import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFleetLayout,
  getFleetVehicleNodes,
  getNodeResourceSnapshot,
  getNodeStatusCounts,
  getOnlineVehicleNodes,
  indexNodeResources,
} from '../src/pages/dashboard/dashboardModel.ts';
import { buildNodeDetailPath } from '../src/routes/config.ts';

const makeNode = (id, operationalStatus = 'online') => ({
  id,
  name: `Vehicle-${id}`,
  nodeSource: 'agent',
  nodeType: 'vehicle',
  platform: 'Thor',
  architecture: 'arm64',
  cluster: { id: 'cluster-a', name: '车群集群 A' },
  connectivityStatus: operationalStatus === 'offline' ? 'offline' : 'online',
  operationalStatus,
  healthStatus: operationalStatus === 'abnormal' ? 'unhealthy' : 'healthy',
  registrationStatus: 'registered',
  accessStatus: 'registered',
  everApproved: true,
  authorizationStatus: 'approved',
  poolMembership: 'in_pool',
  schedulable: operationalStatus === 'online',
  heartbeatAt: '2026-11-20T01:00:00Z',
  resources: { cpu: { total: 16, unit: 'Core' }, gpu: { total: 1, unit: 'GPU' } },
  labels: [],
  gpuDetails: {
    supported: true,
    available: true,
    deviceCount: 1,
    totalVramBytes: 0,
    usedVramBytes: 0,
    availableVramBytes: 0,
    utilizationPercent: 38,
    devices: [],
    memoryArchitecture: 'unified',
  },
});

const metric = (total, unit, utilizationPercent) => ({
  total,
  used: 0,
  allocated: 0,
  available: total,
  schedulableAvailable: total,
  unavailable: 0,
  utilizationPercent,
  runtimeUtilizationPercent: utilizationPercent,
  unit,
});

const makeResource = (nodeId, memoryTotal = 64, gpuUtilization = 38, memoryUtilization = 42) => ({
  nodeId,
  nodeName: `Vehicle-${nodeId}`,
  nodeSource: 'agent',
  platform: 'Thor',
  architecture: 'arm64',
  cluster: { id: 'cluster-a', name: '车群集群 A' },
  operationalStatus: 'online',
  healthStatus: 'healthy',
  accessStatus: 'registered',
  registrationStatus: 'registered',
  networkStatus: 'up',
  schedulable: true,
  supplyEligible: true,
  supplyStatus: 'available',
  resources: {
    cpu: metric(16, 'Core', 25),
    gpu: metric(1, 'GPU', gpuUtilization),
    npu: metric(0, 'TOPS', 0),
    dla: metric(0, 'Device', 0),
  },
  memory: metric(memoryTotal, 'GB', memoryUtilization),
  storage: metric(256, 'GB', 20),
  labels: [],
});

test('ONLINE 数量严格等于车辆数量（1、4、0）', () => {
  assert.equal(getOnlineVehicleNodes([makeNode('1')]).length, 1);
  assert.equal(getOnlineVehicleNodes(['1', '2', '3', '4'].map((id) => makeNode(id))).length, 4);
  assert.equal(getOnlineVehicleNodes([]).length, 0);
});

test('可疑、离线、异常节点不生成车辆', () => {
  const nodes = [
    makeNode('online', 'online'),
    makeNode('suspect', 'suspect'),
    makeNode('offline', 'offline'),
    makeNode('abnormal', 'abnormal'),
  ];
  assert.deepEqual(
    getOnlineVehicleNodes(nodes).map((node) => node.id),
    ['online'],
  );
});

test('ONLINE 节点按真实 node_id 稳定映射为节点序号且不改写原始 ID', () => {
  const nodes = [
    makeNode('node-10'),
    makeNode('node-2'),
    makeNode('node-offline', 'offline'),
    makeNode('node-1'),
  ];
  const vehicles = getFleetVehicleNodes(nodes);

  assert.deepEqual(
    vehicles.map(({ node, displayName, ordinal }) => ({
      id: node.id,
      displayName,
      ordinal,
    })),
    [
      { id: 'node-1', displayName: '节点01', ordinal: 1 },
      { id: 'node-2', displayName: '节点02', ordinal: 2 },
      { id: 'node-10', displayName: '节点03', ordinal: 3 },
    ],
  );
  assert.equal(vehicles[0].node, nodes[3]);
});

test('0、1、2、3、4、5-8、9+ 节点选择对应车辆编队', () => {
  assert.equal(getFleetLayout(0), 'empty');
  assert.equal(getFleetLayout(1), 'single');
  assert.equal(getFleetLayout(2), 'pair');
  assert.equal(getFleetLayout(3), 'triangle');
  assert.equal(getFleetLayout(4), 'diamond');
  assert.equal(getFleetLayout(5), 'convoy');
  assert.equal(getFleetLayout(6), 'convoy');
  assert.equal(getFleetLayout(8), 'convoy');
  assert.equal(getFleetLayout(9), 'grid');
});

test('四类节点状态按 Backend operationalStatus 统计', () => {
  const counts = getNodeStatusCounts([
    makeNode('1', 'online'),
    makeNode('2', 'online'),
    makeNode('3', 'suspect'),
    makeNode('4', 'offline'),
    makeNode('5', 'abnormal'),
  ]);
  assert.deepEqual(counts, { online: 2, suspect: 1, offline: 1, abnormal: 1 });
});

test('统一内存 Thor 的 Hover 摘要使用真实内存容量且资源更新会生效', () => {
  const node = makeNode('thor1');
  const initial = getNodeResourceSnapshot(node, makeResource(node.id, 64, 38));
  const updated = getNodeResourceSnapshot(node, makeResource(node.id, 96, 61, 63));

  assert.equal(initial.gpuCount, 1);
  assert.equal(initial.gpuMemoryArchitecture, 'unified');
  assert.equal(initial.gpuMemoryGb, 64);
  assert.equal(initial.memoryTotalGb, 64);
  assert.equal(updated.gpuMemoryGb, 96);
  assert.equal(updated.gpuUtilization, 63);
});

test('节点资源按 node_id 关联且车辆点击沿用现有详情路由', () => {
  const source = makeResource('thor1');
  assert.equal(indexNodeResources([source]).get('thor1'), source);
  assert.equal(buildNodeDetailPath('thor/1'), '/nodes/thor%2F1');
});
