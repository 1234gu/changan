import type {
  FleetSceneGeometry,
  FleetScenePoint,
  FleetVehiclePoint,
} from './fleetSceneGeometry';

export type FleetDataFlowCubic = [
  FleetScenePoint,
  FleetScenePoint,
  FleetScenePoint,
  FleetScenePoint,
];

export interface FleetDataFlowGeometry {
  nodeId: string;
  start: FleetScenePoint;
  end: FleetScenePoint;
  controls: FleetDataFlowCubic;
  pathLength: number;
  bandWidth: number;
  laneOffset: number;
  segmentCount: number;
  particleCount: number;
  duration: number;
}

export interface FleetCoreMetrics {
  rx: number;
  ry: number;
  rise: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function getFleetCoreMetrics(scene: FleetSceneGeometry): FleetCoreMetrics {
  const rx = Math.min(scene.width * 0.14, 146, scene.height * 0.29);
  return {
    rx,
    ry: Math.min(rx * 0.235, scene.height * 0.083),
    rise: Math.min(scene.height * 0.27, 132, rx),
  };
}

function ellipseIntersectionScale(dx: number, dy: number, rx: number, ry: number) {
  return 1 / Math.sqrt(
    (dx / Math.max(1, rx)) ** 2 + (dy / Math.max(1, ry)) ** 2,
  );
}

export function createFleetDataFlow(
  point: FleetVehiclePoint,
  scene: FleetSceneGeometry,
  index: number,
): FleetDataFlowGeometry {
  const toTargetX = scene.target.x - point.x;
  const toTargetY = scene.target.y - point.y;
  const baseScale = ellipseIntersectionScale(
    toTargetX,
    toTargetY,
    point.baseWidth * 0.46,
    point.baseHeight * 0.42,
  ) * 0.84;
  const start = {
    x: point.x + toTargetX * baseScale,
    y: point.y + toTargetY * baseScale,
  };

  const core = getFleetCoreMetrics(scene);
  const startToTargetX = scene.target.x - start.x;
  const startToTargetY = scene.target.y - start.y;
  const coreScale = ellipseIntersectionScale(
    startToTargetX,
    startToTargetY,
    core.rx * 0.76,
    core.ry * 0.82,
  ) * 0.72;
  const end = {
    x: scene.target.x - startToTargetX * coreScale,
    y: scene.target.y - startToTargetY * coreScale,
  };

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fan = Math.sign(dx) * clamp(Math.abs(dx) * 0.04, 0, 12);
  const controls: FleetDataFlowCubic = [
    start,
    {
      x: start.x + dx * 0.38 + fan,
      y: start.y + dy * 0.08,
    },
    {
      x: end.x - dx * 0.18 + fan * 0.25,
      y: end.y - dy * 0.62,
    },
    end,
  ];
  const count = scene.points.length;
  const bandWidth = clamp(
    Math.min(scene.width * 0.012, point.baseWidth * 0.055),
    12,
    count === 1 ? 20 : 18,
  );

  return {
    nodeId: point.nodeId,
    start,
    end,
    controls,
    pathLength: estimateFleetDataFlowLength(controls),
    bandWidth,
    laneOffset: clamp(bandWidth * 0.44, 5, 6.5),
    segmentCount: count <= 4 ? 5 : 4,
    particleCount: count <= 4 ? 8 : 6,
    duration: 4.1 + (index % 4) * 0.38,
  };
}

export function createFleetDataFlows(scene: FleetSceneGeometry) {
  return scene.points.map((point, index) => createFleetDataFlow(point, scene, index));
}

export function sampleFleetDataFlowCubic(
  [a, b, c, d]: FleetDataFlowCubic,
  t: number,
): FleetScenePoint {
  const s = 1 - t;
  const w0 = s ** 3;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t ** 3;
  return {
    x: a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3,
    y: a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3,
  };
}

export function sampleFleetDataFlowTangent(
  [a, b, c, d]: FleetDataFlowCubic,
  t: number,
): FleetScenePoint {
  const s = 1 - t;
  return {
    x: 3 * s * s * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
    y: 3 * s * s * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t * t * (d.y - c.y),
  };
}

export function estimateFleetDataFlowLength(controls: FleetDataFlowCubic) {
  let length = 0;
  let previous = controls[0];
  for (let step = 1; step <= 24; step += 1) {
    const current = sampleFleetDataFlowCubic(controls, step / 24);
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
  }
  return length;
}
