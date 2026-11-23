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
import {
  describeVideoMemory,
  resolveNodeVideoMemory,
} from '../src/services/videoMemoryPolicy.ts';
import {
  VEHICLE_IMAGE_RATIO,
  VEHICLE_TIRE_INSET,
  createFleetSceneGeometry,
  fleetSceneMinimumHeight,
} from '../src/pages/dashboard/components/fleet/fleetSceneGeometry.ts';
import {
  createFleetDataFlows,
  getFleetCoreMetrics,
} from '../src/pages/dashboard/components/fleet/fleetDataFlow.ts';

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

test('显存策略按架构选择数据源，前端统一只显示显存', () => {
  const memory = { total: 122.9, used: 33.4, available: 89.5, utilization: 27.2, unit: 'GB' };
  const dedicatedVram = { total: 16, used: 4, available: 12, utilization: 25, unit: 'GB' };

  const unified = resolveNodeVideoMemory({
    gpuDetails: { supported: true, memoryArchitecture: 'unified' },
    memory,
    videoMemory: { total: 0, used: 0, available: 0, utilization: 0, unit: 'GB' },
  });
  const dedicated = resolveNodeVideoMemory({
    gpuDetails: { supported: true, memoryArchitecture: 'dedicated' },
    memory,
    videoMemory: dedicatedVram,
  });
  const unknown = resolveNodeVideoMemory({
    gpuDetails: { supported: true },
    memory,
  });

  assert.equal(unified, memory);
  assert.equal(dedicated, dedicatedVram);
  assert.equal(unknown, undefined, '未知架构不能因 VRAM 为 0 而回退到系统内存');
  assert.equal((unified?.total ?? 0) + (dedicated?.total ?? 0), 138.9);

  const details = describeVideoMemory({ total: unified.total, available: unified.available });
  assert.deepEqual(details, ['显存 122.9 GB', '可用显存 89.5 GB']);
  assert.ok(details.every((detail) => !detail.includes('独立') && !detail.includes('统一内存')));
});

test('节点资源按 node_id 关联且车辆点击沿用现有详情路由', () => {
  const source = makeResource('thor1');
  assert.equal(indexNodeResources([source]).get('thor1'), source);
  assert.equal(buildNodeDetailPath('thor/1'), '/nodes/thor%2F1');
});

test('车群编队随节点数量缩放，车体、HUD 标签和底座保留安全间距', () => {
  for (const [width, height] of [[1100, 430], [1340, 496], [1660, 550]]) {
    let previousSize = Infinity;

    for (let count = 1; count <= 8; count += 1) {
      const ids = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
      const { points } = createFleetSceneGeometry(width, height, ids);
      const maxSize = Math.max(...points.map(({ carWidth }) => carWidth));

      assert.deepEqual(points.map(({ nodeId }) => nodeId), ids);
      assert.ok(maxSize < previousSize, `${width}: ${count} 台车应随密度缩小`);
      previousSize = maxSize;

      for (const [index, point] of points.entries()) {
        const rect = (pose) => {
          const halfWidth = Math.max(pose.baseWidth / 2, 51);
          return {
            left: pose.x - halfWidth,
            right: pose.x + halfWidth,
            top: pose.y - pose.carWidth * (VEHICLE_IMAGE_RATIO - VEHICLE_TIRE_INSET) - 34,
            bottom: pose.y + pose.baseHeight / 2,
          };
        };
        const first = rect(point);

        assert.ok(first.left >= 0 && first.top >= 0);
        assert.ok(first.right <= width && first.bottom <= height);

        for (const other of points.slice(index + 1)) {
          const second = rect(other);
          assert.ok(
            first.right <= second.left || second.right <= first.left ||
            first.bottom <= second.top || second.bottom <= first.top,
            `${width}: ${count} 台车，${point.nodeId} 和 ${other.nodeId} 不应重叠`,
          );
          if (point.y < other.y) {
            assert.ok(point.carWidth < other.carWidth);
            assert.ok(point.baseWidth < other.baseWidth);
            assert.ok(point.zIndex < other.zIndex);
          }
        }
      }
    }
  }
});

test('容器和 ONLINE 变化重新投影，单车位于外围并连接中央能量场', () => {
  const four = createFleetSceneGeometry(1100, 430, ['a', 'b', 'c', 'd']);
  const resized = createFleetSceneGeometry(1340, 496, ['a', 'b', 'c', 'd']);
  const single = createFleetSceneGeometry(1340, 496, ['a']);
  const pair = createFleetSceneGeometry(1340, 496, ['a', 'b']);
  const triangle = createFleetSceneGeometry(1340, 496, ['a', 'b', 'c']);
  const empty = createFleetSceneGeometry(1340, 496, []);
  const singleFlows = createFleetDataFlows(single);
  const fourFlows = createFleetDataFlows(four);
  const resizedFlows = createFleetDataFlows(resized);

  assert.notEqual(four.points[0].x, resized.points[0].x);
  assert.equal(resized.points[0].y, single.points[0].y);
  assert.notEqual(resized.points[0].carWidth, single.points[0].carWidth);
  assert.equal(single.target.x, single.width / 2);
  assert.equal(single.target.y, single.height * 0.55);
  assert.ok(single.points[0].x < single.target.x);
  assert.deepEqual(
    [single.points[0].x, single.points[0].y],
    [pair.points[0].x, pair.points[0].y],
  );
  assert.deepEqual(
    pair.points.map(({ x, y }) => [x, y]),
    triangle.points.slice(0, 2).map(({ x, y }) => [x, y]),
  );
  assert.deepEqual(
    triangle.points.map(({ x, y }) => [x, y]),
    resized.points.slice(0, 3).map(({ x, y }) => [x, y]),
  );
  assert.equal(single.points[0].baseWidth / single.points[0].carWidth, 1.4);
  assert.ok(
    Math.hypot(
      single.points[0].x - single.target.x,
      single.points[0].y - single.target.y,
    ) > single.points[0].baseWidth / 2,
  );
  assert.equal(singleFlows.length, 1);
  assert.equal(fourFlows.length, 4);
  assert.deepEqual(fourFlows.map(({ nodeId }) => nodeId), four.points.map(({ nodeId }) => nodeId));
  assert.equal(singleFlows[0].nodeId, single.points[0].nodeId);
  assert.ok(singleFlows[0].start.x > single.points[0].x);
  const startEllipseRadius = Math.hypot(
    (singleFlows[0].start.x - single.points[0].x) / (single.points[0].baseWidth * 0.46),
    (singleFlows[0].start.y - single.points[0].y) / (single.points[0].baseHeight * 0.42),
  );
  const core = getFleetCoreMetrics(single);
  const endEllipseRadius = Math.hypot(
    (single.target.x - singleFlows[0].end.x) / (core.rx * 0.76),
    (single.target.y - singleFlows[0].end.y) / (core.ry * 0.82),
  );
  assert.ok(Math.abs(startEllipseRadius - 0.84) < 1e-9);
  assert.ok(Math.abs(endEllipseRadius - 0.72) < 1e-9);
  assert.deepEqual(singleFlows[0].controls[0], singleFlows[0].start);
  assert.deepEqual(singleFlows[0].controls[3], singleFlows[0].end);
  assert.ok(
    Math.hypot(
      singleFlows[0].start.x - single.target.x,
      singleFlows[0].start.y - single.target.y,
    ) < Math.hypot(
      single.points[0].x - single.target.x,
      single.points[0].y - single.target.y,
    ),
  );
  assert.ok(singleFlows[0].bandWidth >= 12 && singleFlows[0].bandWidth <= 20);
  assert.ok(singleFlows[0].particleCount >= 6 && singleFlows[0].particleCount <= 10);
  assert.ok(singleFlows[0].controls.flatMap(({ x, y }) => [x, y]).every(Number.isFinite));
  assert.notDeepEqual(fourFlows[0].start, resizedFlows[0].start);
  assert.equal(empty.points.length, 0);
  assert.ok(fleetSceneMinimumHeight(390, 8) > 650);
});

test('集群详情单成员居中，多成员继续复用自适应编队', () => {
  const width = 1280;
  const height = 390;
  const single = createFleetSceneGeometry(width, height, ['cluster-node-1'], {
    centerSingleNode: true,
  });
  assert.equal(single.points.length, 1);
  assert.equal(single.points[0].x, width / 2);

  for (const count of [0, 1, 2, 3, 4, 6]) {
    const ids = Array.from({ length: count }, (_, index) => `cluster-node-${index + 1}`);
    const geometry = createFleetSceneGeometry(width, height, ids, {
      centerSingleNode: true,
    });
    assert.equal(geometry.points.length, count);
    assert.equal(new Set(geometry.points.map((point) => point.nodeId)).size, count);
    assert.ok(geometry.points.every((point) => point.carWidth > 0));
  }
});
