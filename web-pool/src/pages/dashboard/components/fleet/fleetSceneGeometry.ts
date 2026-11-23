export interface FleetScenePoint {
  x: number;
  y: number;
}

export interface FleetVehiclePoint extends FleetScenePoint {
  nodeId: string;
  depth: number;
  carWidth: number;
  baseWidth: number;
  baseHeight: number;
  labelScale: number;
  glowStrength: number;
  zIndex: number;
}

export interface FleetSceneGeometry {
  width: number;
  height: number;
  points: FleetVehiclePoint[];
  target: FleetScenePoint;
}

interface GroundSlot {
  lateral: number;
  depth: number;
}

const VEHICLE_WIDTHS = [0, 500, 400, 325, 305, 270, 247, 224, 205];
const HEIGHT_BUDGETS = [0, 1.04, 0.79, 0.62, 0.49, 0.45, 0.42, 0.39, 0.36];
const WIDTH_BUDGETS = [0, 0.39, 0.35, 0.31, 0.29, 0.27, 0.25, 0.23, 0.19];
export const VEHICLE_IMAGE_RATIO = 941 / 1672;
// Fraction of the car width between the ground anchor and the sprite bottom.
export const VEHICLE_TIRE_INSET = 68 / 1672;
export const VEHICLE_ROOF_INSET = 125 / 1672;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const vehicleBaseWidthFactor = (count: number) =>
  count <= 4 ? 1.4 : count <= 6 ? 1.25 : 1.16;

function row(laterals: number[], depth: number): GroundSlot[] {
  return laterals.map((lateral) => ({ lateral, depth }));
}

const DESKTOP_FORMATIONS: Record<number, GroundSlot[]> = {
  0: [],
  1: row([-0.25], 0.99),
  2: row([-0.25, 0.25], 0.99),
  3: [...row([-0.25, 0.25], 0.99), ...row([-0.25], 0.15)],
  4: [...row([-0.25, 0.25], 0.99), ...row([-0.25, 0.25], 0.15)],
  5: [...row([-0.33, 0, 0.33], 0.14), ...row([-0.18, 0.18], 0.99)],
  6: [...row([-0.36, 0, 0.36], 0.14), ...row([-0.29, 0, 0.29], 0.99)],
  7: [...row([-0.35, 0, 0.35], 0.13), ...row([-0.36, -0.12, 0.12, 0.36], 0.99)],
  8: [...row([-0.43, -0.15, 0.15, 0.43], 0.13), ...row([-0.37, -0.125, 0.125, 0.37], 0.99)],
};

function distributedFormation(count: number, columns: number): GroundSlot[] {
  const rows = Math.ceil(count / columns);
  const slots: GroundSlot[] = [];

  for (let index = 0; index < rows; index += 1) {
    const entries = Math.min(columns, count - index * columns);
    const laterals = Array.from({ length: entries }, (_, column) =>
      entries === 1 ? 0 : ((column / (entries - 1)) - 0.5) * (entries === 2 ? 0.59 : 0.8),
    );
    slots.push(...row(laterals, rows === 1 ? 0.82 : 0.09 + (index / (rows - 1)) * 0.92));
  }

  return slots;
}

export function fleetSceneMinimumHeight(width: number, count: number) {
  const rows = Math.ceil(count / (width > 0 && width < 650 ? 2 : 4));
  return rows > 2 ? 450 + (rows - 2) * 182 : undefined;
}

function projectGround(slot: GroundSlot, width: number, height: number) {
  // The same projection controls lateral convergence, footprint size and floor depth.
  const scale = 1 / (1 + 0.44 * (1 - slot.depth));
  const groundDepth = slot.depth * scale;
  return {
    x: width * (0.5 + slot.lateral * scale),
    y: height * (0.35 + 0.48 * groundDepth),
    scale,
  };
}

function chooseVehicleWidth(
  points: ReturnType<typeof projectGround>[],
  width: number,
  height: number,
  count: number,
) {
  const baseWidthFactor = vehicleBaseWidthFactor(count);
  let size = Math.min(
    VEHICLE_WIDTHS[count] ?? 195,
    width * (WIDTH_BUDGETS[count] ?? 0.19),
    height * (HEIGHT_BUDGETS[count] ?? 0.32),
  );

  for (const [index, point] of points.entries()) {
    const horizontalRoom = Math.min(point.x, width - point.x) * 2 - 20;
    const roofRoom = point.y - 43;
    size = Math.min(
      size,
      horizontalRoom / (point.scale * baseWidthFactor),
      roofRoom / (point.scale * 0.52),
    );

    for (const other of points.slice(index + 1)) {
      // Either separate horizontally or, for aligned rows, leave clear space above
      // the front label and below the rear base. Always use the roomier axis.
      const horizontal = (Math.abs(point.x - other.x) - 12) /
        (Math.max(point.scale, other.scale) * baseWidthFactor);
      const rear = point.y <= other.y ? point : other;
      const front = rear === point ? other : point;
      const vertical = (front.y - rear.y - 39) /
        (front.scale * (VEHICLE_IMAGE_RATIO - VEHICLE_TIRE_INSET) + rear.scale * 0.091);
      size = Math.min(size, Math.max(horizontal, vertical));
    }
  }

  return Math.max(1, size);
}

export function createFleetSceneGeometry(
  width: number,
  height: number,
  nodeIds: readonly string[],
  options: { centerSingleNode?: boolean } = {},
): FleetSceneGeometry {
  const count = nodeIds.length;
  let slots = width < 650 && count > 2
    ? distributedFormation(count, 2)
    : (DESKTOP_FORMATIONS[count] ?? distributedFormation(count, 4));
  if (count === 1 && options.centerSingleNode) {
    slots = row([0], 0.9);
  }
  const projected = slots.map((slot) => projectGround(slot, width, height));
  const size = chooseVehicleWidth(projected, width, height, count);
  const baseWidthFactor = vehicleBaseWidthFactor(count);

  const points = projected.map<FleetVehiclePoint>(({ x, y, scale }, index) => {
    const carWidth = size * scale;
    return {
      nodeId: nodeIds[index],
      x,
      y,
      depth: slots[index].depth,
      carWidth,
      baseWidth: carWidth * baseWidthFactor,
      baseHeight: carWidth * (count <= 4 ? 0.19 : 0.18),
      labelScale: clamp(carWidth / 245, 0.78, 1),
      glowStrength: 0.55 + scale * 0.44,
      zIndex: 10 + Math.round(y),
    };
  });

  return {
    width,
    height,
    points,
    target: { x: width / 2, y: height * 0.55 },
  };
}
