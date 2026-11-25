import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clusterMemberCardPlacement,
  clusterMemberMinimumHeight,
  clusterMemberRoofY,
  createClusterMemberGeometry,
  sortClusterMembers,
} from '../src/pages/clusters/components/clusterMemberLayout.ts';
import {
  getFleetLayout,
  getFleetVehicleNodes,
  getNodeResourceSnapshot,
  getNodeStatusCounts,
  getOnlineVehicleNodes,
  indexNodeResources,
} from '../src/pages/dashboard/dashboardModel.ts';
import { buildNodeDetailPath } from '../src/routes/config.ts';
import { describeVideoMemory, resolveNodeVideoMemory } from '../src/services/videoMemoryPolicy.ts';
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
import {
  PARKING_SLOTS,
  PARKING_VEHICLE_DEPTH_RATIO,
  PARKING_VEHICLE_WIDTH_RATIO,
  DEBUG_PARKING_ALIGNMENT,
  createParkingSceneGeometry,
  projectParkingSlot,
} from '../src/pages/dashboard/components/fleet/parkingSceneGeometry.ts';

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
  assert.equal(updated.gpuUtilization, 61);
  assert.equal(updated.memoryUtilization, 63);
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
  for (const [width, height] of [
    [1100, 430],
    [1340, 496],
    [1660, 550],
  ]) {
    let previousSize = Infinity;

    for (let count = 1; count <= 8; count += 1) {
      const ids = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
      const { points } = createFleetSceneGeometry(width, height, ids);
      const maxSize = Math.max(...points.map(({ carWidth }) => carWidth));

      assert.deepEqual(
        points.map(({ nodeId }) => nodeId),
        ids,
      );
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
            first.right <= second.left ||
              second.right <= first.left ||
              first.bottom <= second.top ||
              second.bottom <= first.top,
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
  assert.deepEqual([single.points[0].x, single.points[0].y], [pair.points[0].x, pair.points[0].y]);
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
    Math.hypot(single.points[0].x - single.target.x, single.points[0].y - single.target.y) >
      single.points[0].baseWidth / 2,
  );
  assert.equal(singleFlows.length, 1);
  assert.equal(fourFlows.length, 4);
  assert.deepEqual(
    fourFlows.map(({ nodeId }) => nodeId),
    four.points.map(({ nodeId }) => nodeId),
  );
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
    Math.hypot(singleFlows[0].start.x - single.target.x, singleFlows[0].start.y - single.target.y) <
      Math.hypot(single.points[0].x - single.target.x, single.points[0].y - single.target.y),
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

test('在线节点复用稳定编号，刷新或调整上报顺序后仍从 slot-01 连续填充', () => {
  const width = 1440;
  const height = 560;
  const allSlots = Array.from({ length: 8 }, (_, index) => `slot-0${index + 1}`);
  assert.deepEqual(
    PARKING_SLOTS.map(({ id }) => id),
    allSlots,
  );

  for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const nodes = Array.from({ length: count }, (_, index) =>
      makeNode(`parking-node-${index + 1}`),
    );
    const mapping = (input) => {
      const fleet = getFleetVehicleNodes(input);
      const geometry = createParkingSceneGeometry(
        width,
        height,
        fleet.map(({ node }) => node.id),
      );
      return geometry.points.map(({ nodeId, slotId }, index) => [
        nodeId,
        slotId,
        fleet[index].displayName,
      ]);
    };
    const expected = nodes.map(({ id }, index) => [id, allSlots[index], `节点0${index + 1}`]);
    assert.deepEqual(mapping(nodes), expected);
    assert.deepEqual(
      mapping(
        nodes
          .map((node) => ({
            ...node,
            heartbeatAt: '2026-11-20T02:00:00Z',
          }))
          .reverse(),
      ),
      expected,
    );

    if (count >= 3) {
      nodes[1].operationalStatus = 'offline';
      assert.deepEqual(mapping(nodes).slice(0, 2), [
        expected[0],
        [nodes[2].id, 'slot-02', '节点02'],
      ]);
    }
  }

  const projected = PARKING_SLOTS.map((slot) => projectParkingSlot(slot, width, height));
  const near = projected.slice(0, 4);
  const far = projected.slice(4);
  assert.ok(near.every((slot) => slot.row === 'near'));
  assert.ok(far.every((slot) => slot.row === 'far'));
  for (const row of [far, near]) {
    assert.ok(row.every((slot, index) => index === 0 || slot.center.x > row[index - 1].center.x));
  }
  assert.ok(
    Math.max(...far.map(({ center }) => center.y)) <
      Math.min(...near.map(({ center }) => center.y)),
  );
});

test('真实停车场 0 节点不生成车辆，单节点使用下排最左车位', () => {
  const empty = createParkingSceneGeometry(1440, 560, []);
  const single = createParkingSceneGeometry(1440, 560, ['thor1']);
  assert.equal(empty.points.length, 0);
  assert.equal(single.points.length, 1);
  assert.equal(single.points[0].slotId, 'slot-01');
  const projectedPrimary = projectParkingSlot(PARKING_SLOTS[0], 1440, 560);
  assert.equal(projectedPrimary.row, 'near');
  assert.ok(Math.abs(single.points[0].x - projectedPrimary.center.x) < 1e-9);
  assert.ok(Math.abs(single.points[0].y - projectedPrimary.center.y) < 1e-9);
  assert.equal(single.points[0].anchorX, 0.5);
  assert.equal(single.points[0].anchorY, (0.973 + 0.65) / 2);
  assert.equal(single.points[0].nodeId, 'thor1');
});

test('1 至 8 台在线车辆匹配独立 HUD 停车框，接地范围和框边均留有间隙', () => {
  const knownSlots = new Map(PARKING_SLOTS.map((slot) => [slot.id, slot]));

  for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const ids = Array.from({ length: count }, (_, index) => `node-${index + 1}`);
    const geometry = createParkingSceneGeometry(1600, 600, ids);
    const slotIds = geometry.points.map(({ slotId }) => slotId);

    assert.equal(new Set(slotIds).size, count);
    assert.ok(slotIds.every((id) => id && knownSlots.has(id)));
    for (const point of geometry.points) {
      const slot = projectParkingSlot(knownSlots.get(point.slotId), 1600, 600);
      const { groundFootprint, visualWidth, groundLength } = point.parkingAlignment;
      assert.equal(point.rotation, undefined);
      assert.equal(point.imageSkewX, undefined);
      const frame = point.parkingFrame;
      assert.ok(Math.abs(visualWidth / frame.width - PARKING_VEHICLE_WIDTH_RATIO) < 1e-9);
      assert.ok(groundLength <= frame.height * PARKING_VEHICLE_DEPTH_RATIO + 1e-9);
      assert.ok(Math.abs(point.x - (frame.x + frame.width / 2)) < 1e-9);
      assert.ok(Math.abs(point.y - (frame.y + frame.height / 2)) < 1e-9);
      assert.ok(point.parkingAlignment.bounds.left > frame.x);
      assert.ok(point.parkingAlignment.bounds.right < frame.x + frame.width);
      for (const vertex of groundFootprint) {
        assert.ok(vertex.x > frame.x && vertex.x < frame.x + frame.width, point.slotId);
        assert.ok(vertex.y > frame.y && vertex.y < frame.y + frame.height, point.slotId);
      }
      assert.ok(frame.width <= slot.frame.width + 1e-9);
      assert.ok(frame.height <= slot.frame.height + 1e-9);
    }
  }

  const single = createParkingSceneGeometry(1600, 600, ['single-node']);
  const pose = single.points[0];
  assert.ok(pose.parkingAlignment.visualWidth >= pose.parkingFrame.width * 0.72);
});

test('停车场图片按素材原生宽高等比渲染，CSS 禁用车辆变换', () => {
  const sprite = readFileSync(
    new URL('../src/assets/fleet-node-suv-parking-front.png', import.meta.url),
  );
  const nativeWidth = sprite.readUInt32BE(16);
  const nativeHeight = sprite.readUInt32BE(20);
  const { points } = createParkingSceneGeometry(
    1440,
    560,
    Array.from({ length: 8 }, (_, index) => `node-${index}`),
  );
  for (const pose of points) {
    assert.equal(pose.imageRatio, nativeHeight / nativeWidth);
    assert.equal(pose.parkingAlignment.scale, pose.carWidth / nativeWidth);
    assert.equal(pose.labelOffsetX, undefined);
  }
  const css = readFileSync(
    new URL('../src/pages/dashboard/components/fleet/FleetScene.css', import.meta.url),
    'utf8',
  );
  const parkingImageRules = css.match(
    /\.fleet-scene--parking \.vehicle-node__image\s*\{([^}]+)\}/,
  )?.[1];
  assert.match(parkingImageRules, /height:\s*auto;/);
  assert.match(parkingImageRules, /object-fit:\s*contain;/);
  assert.match(parkingImageRules, /transform:\s*none;/);
  assert.doesNotMatch(parkingImageRules, /skew|scale[XY]|rotate|perspective|matrix/);
});

test('多个车辆同时在线时，车体和居中标签保持在场景内且不遮挡其它车辆', () => {
  const overlaps = (first, second) =>
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top;

  for (const [width, height] of [
    [1100, 480],
    [1340, 500],
    [1660, 610],
  ]) {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const ids = Array.from({ length: count }, (_, index) => `online-${index + 1}`);
      const geometry = createParkingSceneGeometry(width, height, ids);
      const vehicles = geometry.points.map((pose) => {
        const roofX = pose.x;
        const roofY = pose.y + pose.carWidth * (pose.roofInset - pose.imageRatio * pose.anchorY);
        return [
          pose.parkingAlignment.bounds,
          { left: roofX - 62, right: roofX + 62, top: roofY - 32, bottom: roofY - 3 },
          {
            left: pose.parkingFrame.x,
            right: pose.parkingFrame.x + pose.parkingFrame.width,
            top: pose.parkingFrame.y,
            bottom: pose.parkingFrame.y + pose.parkingFrame.height,
          },
        ];
      });

      for (const [index, bounds] of vehicles.entries()) {
        for (const box of bounds) {
          assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height);
          for (const other of vehicles.slice(index + 1).flat()) {
            assert.ok(!overlaps(box, other), `${width}x${height} / ${count} 节点不应互相遮挡`);
          }
        }
      }
    }
  }
});

test('集群等距阵列覆盖 0–8 名成员，并适应桌面容器及卡片显示', () => {
  const expected = [[], [1], [2], [3], [4], [3, 2], [3, 3], [4, 3], [4, 4]];
  const overlap = (a, b) =>
    Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
    Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  for (const [width, height] of [
    [1100, 424],
    [1340, 496],
    [1660, 510],
  ]) {
    for (let count = 0; count <= 8; count++) {
      const ids = Array.from({ length: count }, (_, i) => `member-${i}`);
      const geometry = createClusterMemberGeometry(width, height, ids);
      assert.deepEqual(
        geometry.points.map(({ nodeId }) => nodeId),
        ids,
      );
      const rows = new Map();
      for (const pose of geometry.points) {
        const row = rows.get(pose.y) ?? [];
        row.push(pose);
        rows.set(pose.y, row);
      }
      assert.deepEqual(
        [...rows.values()].map((row) => row.length),
        expected[count],
      );
      for (const row of rows.values()) {
        assert.ok(Math.abs(row.reduce((x, pose) => x + pose.x, 0) / row.length - width / 2) < 1e-8);
        row.forEach((pose, index) => {
          assert.equal(pose.carWidth, row[0].carWidth);
          assert.equal(pose.imageRatio, 1195 / 1316);
          if (index >= 2)
            assert.ok(Math.abs(pose.x - row[index - 1].x - (row[1].x - row[0].x)) < 1e-8);
        });
      }
      const bounds = geometry.points.map((pose) => ({
        left: pose.x - Math.max(122, pose.carWidth) / 2,
        right: pose.x + Math.max(122, pose.carWidth) / 2,
        top: clusterMemberRoofY(pose) - 38,
        bottom: pose.y + pose.carWidth * pose.imageRatio * (1 - pose.anchorY),
      }));
      for (const [index, pose] of geometry.points.entries()) {
        const box = bounds[index];
        assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height);
        assert.ok(bounds.slice(index + 1).every((other) => !overlap(box, other)));
        const card = clusterMemberCardPlacement(geometry, pose);
        assert.ok(card.left >= 0 && card.top >= 0);
        assert.ok(card.left + card.width <= width && card.top + card.maxHeight <= height);
        assert.equal(card.maxHeight, Math.min(414, height - 20));
        assert.ok(card.anchorY >= 26 && card.anchorY <= card.maxHeight - 26);
        if (card.side === 'left') assert.ok(card.left + card.width <= box.left);
        if (card.side === 'right') assert.ok(card.left >= box.right);
        assert.ok(
          !overlap(box, {
            left: card.left,
            right: card.left + card.width,
            top: card.top,
            bottom: card.top + card.maxHeight,
          }),
        );
      }
    }
  }
  const extraIds = Array.from({ length: 11 }, (_, i) => `member-${i}`);
  const tall = clusterMemberMinimumHeight(690, extraIds.length);
  assert.ok(tall > 510);
  assert.equal(createClusterMemberGeometry(690, tall, extraIds).points.length, 11);
});

test('集群保留离线和异常成员，并按首次时间及真实 ID 排序', () => {
  const members = [
    { ...makeNode('b', 'offline'), discoveredAt: '2026-11-18T00:00:00Z' },
    makeNode('d', 'abnormal'),
    { ...makeNode('a'), registeredAt: '2026-11-18T00:00:00Z' },
    makeNode('c', 'suspect'),
  ];
  const expected = [
    ['a', 'online'],
    ['b', 'offline'],
    ['c', 'suspect'],
    ['d', 'abnormal'],
  ];
  assert.deepEqual(
    sortClusterMembers(members).map(({ id, operationalStatus }) => [id, operationalStatus]),
    expected,
  );
  assert.deepEqual(
    sortClusterMembers([...members].reverse()).map(({ id }) => id),
    ['a', 'b', 'c', 'd'],
  );
});

test('各 HUD 车位独立标定在背景白线以内，车位中心与车辆底盘锚点一致', () => {
  assert.equal(DEBUG_PARKING_ALIGNMENT, false);
  assert.equal(PARKING_SLOTS.length, 8);

  for (const slot of PARKING_SLOTS) {
    assert.equal(slot.polygon.length, 4);
    assert.ok(slot.polygon.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
    const twiceArea = Math.abs(
      slot.polygon.reduce((area, point, index) => {
        const next = slot.polygon[(index + 1) % slot.polygon.length];
        return area + point.x * next.y - next.x * point.y;
      }, 0),
    );
    assert.ok(twiceArea > 0);

    const projected = projectParkingSlot(slot, 1440, 560);
    const { x, y, width, height } = projected.frame;
    assert.ok(width > 0 && height > 0);
    for (const [cornerX, cornerY] of [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ]) {
      for (const [index, start] of projected.polygon.entries()) {
        const end = projected.polygon[(index + 1) % 4];
        assert.ok(
          (end.x - start.x) * (cornerY - start.y) - (end.y - start.y) * (cornerX - start.x) > 0,
          slot.id,
        );
      }
    }
  }

  for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const geometry = createParkingSceneGeometry(
      1440,
      560,
      Array.from({ length: count }, (_, index) => `anchor-node-${index + 1}`),
    );
    for (const pose of geometry.points) {
      const slot = PARKING_SLOTS.find(({ id }) => id === pose.slotId);
      assert.ok(slot);
      const projected = projectParkingSlot(slot, 1440, 560);
      assert.ok(Math.abs(pose.x - projected.center.x) < 1e-9);
      assert.ok(Math.abs(pose.y - projected.center.y) < 1e-9);
      assert.equal(pose.anchorX, 0.5);
      assert.equal(pose.anchorY, (0.973 + 0.65) / 2);
    }
  }
});
