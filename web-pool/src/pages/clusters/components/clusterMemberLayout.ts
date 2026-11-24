import type {
  FleetSceneGeometry,
  FleetVehiclePoint,
} from '../../dashboard/components/fleet/fleetSceneGeometry';
import type { NodeDetail } from '../../../types/node';

// Intrinsic dimensions of the shared, front-facing parking vehicle.
const IMAGE_RATIO = 1195 / 1316;
const GROUND_ANCHOR_Y = 0.97;
const ROOF_INSET = 0.025 * IMAGE_RATIO;
const LABEL_WIDTH = 122;
const LABEL_ROOM = 38;
const COUNT_SCALE = [0, 1, 0.9, 0.82, 0.75, 0.7, 0.67, 0.62, 0.59];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const firstSeen = (node: Pick<NodeDetail, 'discoveredAt' | 'registeredAt'>) => {
  const date = Date.parse(node.discoveredAt ?? node.registeredAt ?? '');
  return Number.isFinite(date) ? date : Number.MAX_SAFE_INTEGER;
};

export function sortClusterMembers<
  T extends Pick<NodeDetail, 'id' | 'discoveredAt' | 'registeredAt'>,
>(members: readonly T[]): T[] {
  return [...members].sort(
    (a, b) => firstSeen(a) - firstSeen(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function memberRows(width: number, count: number) {
  if (!count) return [];
  const capacity = clamp(Math.floor(width / 150), 1, count === 5 || count === 6 ? 3 : 4);
  const rows = Math.ceil(count / capacity);
  return Array.from(
    { length: rows },
    (_, row) => Math.floor(count / rows) + (row < count % rows ? 1 : 0),
  );
}

export function clusterMemberMinimumHeight(width: number, count: number) {
  const rows = memberRows(width, count).length;
  return rows > 2 ? 470 + (rows - 2) * 165 : undefined;
}

export function createClusterMemberGeometry(
  width: number,
  height: number,
  nodeIds: readonly string[],
): FleetSceneGeometry {
  const rows = memberRows(width, nodeIds.length);
  const target = { x: width / 2, y: height * 0.85 };
  if (!rows.length) return { width, height, target, points: [] };

  const margin = clamp(width * 0.055, 8, 58);
  const usableWidth = width - margin * 2;
  const columns = Math.max(...rows);
  const rowStep =
    rows.length > 1 ? Math.min(height * 0.39, (target.y - 124) / (rows.length - 1)) : 0;
  const widthLimit = (usableWidth - (columns - 1) * 14) / columns;
  const heightLimit = (rows.length > 1 ? rowStep : target.y) - LABEL_ROOM;
  const nominal = Math.min(280, width * 0.42, height * 0.64);
  const vehicleWidth = Math.max(
    1,
    Math.min(
      nominal * (COUNT_SCALE[nodeIds.length] ?? 0.55),
      widthLimit,
      heightLimit / IMAGE_RATIO,
    ),
  );
  const pitch =
    columns > 1
      ? Math.min(
          (usableWidth - Math.max(LABEL_WIDTH, vehicleWidth)) / (columns - 1),
          Math.max(vehicleWidth + width * 0.055, LABEL_WIDTH + 12, width * 0.24),
        )
      : 0;
  let nodeIndex = 0;
  const points = rows.flatMap((count, row) => {
    const carWidth = vehicleWidth * (row === 0 ? 1 : 0.92);
    const y = target.y - row * rowStep;
    return Array.from({ length: count }, (_, column): FleetVehiclePoint => {
      const x = target.x + (column - (count - 1) / 2) * pitch;
      return {
        nodeId: nodeIds[nodeIndex++],
        x,
        y,
        carWidth,
        depth: row === 0 ? 1 : 0.65,
        baseWidth: carWidth * 0.84,
        baseHeight: carWidth * 0.12,
        labelScale: 1,
        glowStrength: 0,
        zIndex: 20 + rows.length - row,
        imageRatio: IMAGE_RATIO,
        anchorX: 0.5,
        anchorY: GROUND_ANCHOR_Y,
        roofInset: ROOF_INSET,
        popoverSide: x <= target.x ? 'right' : 'left',
      };
    });
  });
  return { width, height, target, points };
}

export const clusterMemberRoofY = (pose: FleetVehiclePoint) =>
  pose.y + pose.carWidth * (ROOF_INSET - IMAGE_RATIO * GROUND_ANCHOR_Y);

const memberBounds = (pose: FleetVehiclePoint) => {
  const halfWidth = Math.max(LABEL_WIDTH, pose.carWidth) / 2;
  return {
    left: pose.x - halfWidth,
    right: pose.x + halfWidth,
    top: clusterMemberRoofY(pose) - LABEL_ROOM,
    bottom: pose.y + pose.carWidth * IMAGE_RATIO * (1 - GROUND_ANCHOR_Y),
  };
};

export function clusterMemberCardPlacement(geometry: FleetSceneGeometry, pose: FleetVehiclePoint) {
  const margin = 10;
  const width = Math.min(clamp(geometry.width * 0.29, 318, 382), geometry.width - 2 * margin);
  const maxHeight = Math.min(414, geometry.height - 2 * margin);
  const halfCar = Math.max(LABEL_WIDTH, pose.carWidth) / 2;
  const roof = clusterMemberRoofY(pose) - LABEL_ROOM;
  const gap = 18;
  const sideY = (roof + pose.y - maxHeight) / 2;
  const leftEdge = pose.x - halfCar - gap;
  const rightEdge = pose.x + halfCar + gap;
  const leftWidth = clamp(leftEdge - margin, Math.min(220, width), width);
  const rightWidth = clamp(geometry.width - margin - rightEdge, Math.min(220, width), width);
  const left = { left: leftEdge - leftWidth, top: sideY, width: leftWidth };
  const right = { left: rightEdge, top: sideY, width: rightWidth };
  const above = { left: pose.x - width / 2, top: roof - maxHeight - gap, width };
  const below = { left: pose.x - width / 2, top: pose.y + gap, width };
  const sides = pose.popoverSide === 'left' ? [left, right] : [right, left];
  const vertical = pose.depth < 1 ? [below, above] : [above, below];
  const cards = [sides[0], vertical[0], sides[1], vertical[1]].map((candidate) => ({
    left: clamp(candidate.left, margin, geometry.width - candidate.width - margin),
    top: clamp(candidate.top, margin, geometry.height - maxHeight - margin),
    width: candidate.width,
    maxHeight,
  }));
  const overlap = (card: (typeof cards)[number], member: FleetVehiclePoint) => {
    const box = memberBounds(member);
    const x = Math.max(
      0,
      Math.min(card.left + card.width, box.right) - Math.max(card.left, box.left),
    );
    const y = Math.max(0, Math.min(card.top + maxHeight, box.bottom) - Math.max(card.top, box.top));
    return x * y;
  };
  const card = cards
    .map((card) => ({
      card,
      targetOverlap: overlap(card, pose),
      totalOverlap: geometry.points.reduce((total, member) => total + overlap(card, member), 0),
    }))
    .sort((a, b) => a.targetOverlap - b.targetOverlap || a.totalOverlap - b.totalOverlap)[0].card;
  const side =
    card.left >= pose.x + halfCar
      ? 'right'
      : card.left + card.width <= pose.x - halfCar
        ? 'left'
        : undefined;
  const anchorY = clamp((clusterMemberRoofY(pose) + pose.y) / 2 - card.top, 26, maxHeight - 26);
  return { ...card, side, anchorY };
}
