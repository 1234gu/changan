import type {
  FleetSceneGeometry,
  FleetScenePoint,
  FleetVehiclePoint,
  ParkingFrame,
} from './fleetSceneGeometry';

export type ParkingSlotPopoverSide = 'left' | 'right' | 'top-left' | 'top-right';
export type ParkingSlotPolygon = readonly [
  FleetScenePoint,
  FleetScenePoint,
  FleetScenePoint,
  FleetScenePoint,
];

export interface ParkingSlot {
  id: string;
  row: 'far' | 'near';
  /** Painted bay for background calibration, ordered top-left through bottom-left. */
  polygon: ParkingSlotPolygon;
  /** Order-independent HUD center and size in the reference photo. */
  visualSlot: { center: FleetScenePoint; width: number; height: number };
  zIndex: number;
  popoverSide: ParkingSlotPopoverSide;
}

export interface ProjectedParkingSlot extends Omit<ParkingSlot, 'visualSlot'> {
  center: FleetScenePoint;
  frame: ParkingFrame;
}

const SOURCE_WIDTH = 1672;
const SOURCE_HEIGHT = 941;
const sourcePoint = (x: number, y: number): FleetScenePoint => ({
  x: x / SOURCE_WIDTH,
  y: y / SOURCE_HEIGHT,
});
const polygon = (
  topLeft: FleetScenePoint,
  topRight: FleetScenePoint,
  bottomRight: FleetScenePoint,
  bottomLeft: FleetScenePoint,
): ParkingSlotPolygon => [topLeft, topRight, bottomRight, bottomLeft];

const visualSlot = (x: number, y: number, width: number, height: number) => ({
  center: sourcePoint(x, y),
  width,
  height,
});

/**
 * Eight manually calibrated painted bays in fleet-parking-campus-v1.png (1672 × 941).
 * Fill the lower row first, then the upper row, each from left to right.
 * HUD rectangles sit inside the painted bays and follow the upright vehicle axis.
 */
export const PARKING_SLOTS: readonly ParkingSlot[] = [
  {
    id: 'slot-01',
    row: 'near',
    polygon: polygon(
      sourcePoint(213, 629),
      sourcePoint(474, 629),
      sourcePoint(400, 742),
      sourcePoint(86, 743),
    ),
    visualSlot: visualSlot(289, 701, 224, 70),
    zIndex: 21,
    popoverSide: 'right',
  },
  {
    id: 'slot-02',
    row: 'near',
    polygon: polygon(
      sourcePoint(566, 629),
      sourcePoint(824, 629),
      sourcePoint(816, 742),
      sourcePoint(503, 742),
    ),
    visualSlot: visualSlot(681, 698, 245, 76),
    zIndex: 22,
    popoverSide: 'right',
  },
  {
    id: 'slot-03',
    row: 'near',
    polygon: polygon(
      sourcePoint(906, 628),
      sourcePoint(1158, 628),
      sourcePoint(1217, 742),
      sourcePoint(912, 742),
    ),
    visualSlot: visualSlot(1042, 699, 246, 76),
    zIndex: 23,
    popoverSide: 'left',
  },
  {
    id: 'slot-04',
    row: 'near',
    polygon: polygon(
      sourcePoint(1250, 628),
      sourcePoint(1516, 628),
      sourcePoint(1632, 742),
      sourcePoint(1324, 742),
    ),
    visualSlot: visualSlot(1434, 699, 216, 76),
    zIndex: 24,
    popoverSide: 'left',
  },
  {
    id: 'slot-05',
    row: 'far',
    polygon: polygon(
      sourcePoint(382, 465),
      sourcePoint(576, 465),
      sourcePoint(510, 536),
      sourcePoint(271, 536),
    ),
    visualSlot: visualSlot(443, 499, 142, 48),
    zIndex: 12,
    popoverSide: 'right',
  },
  {
    id: 'slot-06',
    row: 'far',
    polygon: polygon(
      sourcePoint(648, 465),
      sourcePoint(838, 464),
      sourcePoint(830, 535),
      sourcePoint(596, 536),
    ),
    visualSlot: visualSlot(735, 495, 173, 50),
    zIndex: 13,
    popoverSide: 'right',
  },
  {
    id: 'slot-07',
    row: 'far',
    polygon: polygon(
      sourcePoint(899, 464),
      sourcePoint(1088, 463),
      sourcePoint(1134, 535),
      sourcePoint(903, 535),
    ),
    visualSlot: visualSlot(998, 494, 178, 52),
    zIndex: 14,
    popoverSide: 'left',
  },
  {
    id: 'slot-08',
    row: 'far',
    polygon: polygon(
      sourcePoint(1163, 463),
      sourcePoint(1359, 462),
      sourcePoint(1464, 534),
      sourcePoint(1225, 534),
    ),
    visualSlot: visualSlot(1291, 498, 144, 48),
    zIndex: 15,
    popoverSide: 'left',
  },
];

const runtimeEnv = import.meta.env as ImportMetaEnv | undefined;
export const DEBUG_PARKING_ALIGNMENT = Boolean(
  runtimeEnv?.DEV &&
  (runtimeEnv.VITE_DEBUG_PARKING_ALIGNMENT === 'true' ||
    runtimeEnv.VITE_DEBUG_PARKING_SLOTS === 'true'),
);

const OBJECT_POSITION_X = 0.5;
const OBJECT_POSITION_Y = 0.54;
/** The visible car width as a fraction of its business frame, with room for the outline. */
export const PARKING_VEHICLE_WIDTH_RATIO = 0.76;
export const PARKING_VEHICLE_DEPTH_RATIO = 0.86;
// Native dimensions of fleet-node-suv-parking-front.png.
const PARKING_IMAGE_WIDTH = 1316;
const PARKING_IMAGE_RATIO = 1195 / PARKING_IMAGE_WIDTH;
const FRONT_TIRE_Y = 0.973;
const REAR_CONTACT_Y = 0.65;
const PARKING_ANCHOR = { x: 0.5, y: (FRONT_TIRE_Y + REAR_CONTACT_Y) / 2 };
const SILHOUETTE = { left: 0.051, right: 0.949, top: 0.025, bottom: 0.977 };
const LABEL_HALF_WIDTH = 64;
const LABEL_CLEARANCE = 33;
// Front tire contacts are visible. The rear contacts are estimated behind the front axle.
const GROUND_FOOTPRINT = polygon(
  { x: 0.18, y: REAR_CONTACT_Y },
  { x: 0.82, y: REAR_CONTACT_Y },
  { x: 0.914, y: FRONT_TIRE_Y },
  { x: 0.086, y: FRONT_TIRE_Y },
);
const FOOTPRINT_PER_PIXEL = GROUND_FOOTPRINT.map((point) => ({
  x: point.x - PARKING_ANCHOR.x,
  y: (point.y - PARKING_ANCHOR.y) * PARKING_IMAGE_RATIO,
}));
const GROUND_LENGTH_PER_PIXEL = (FRONT_TIRE_Y - REAR_CONTACT_Y) * PARKING_IMAGE_RATIO;
const VISUAL_WIDTH_PER_PIXEL = SILHOUETTE.right - SILHOUETTE.left;
const TOP_PER_PIXEL = (SILHOUETTE.top - PARKING_ANCHOR.y) * PARKING_IMAGE_RATIO;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const centeredFrame = (center: FleetScenePoint, width: number, height: number): ParkingFrame => ({
  x: center.x - width / 2,
  y: center.y - height / 2,
  width,
  height,
});

export function projectParkingSlot(
  parkingSlot: ParkingSlot,
  width: number,
  height: number,
): ProjectedParkingSlot {
  const coverScale = Math.max(width / SOURCE_WIDTH, height / SOURCE_HEIGHT);
  const renderedWidth = SOURCE_WIDTH * coverScale;
  const renderedHeight = SOURCE_HEIGHT * coverScale;
  const offsetX = (width - renderedWidth) * OBJECT_POSITION_X;
  const offsetY = (height - renderedHeight) * OBJECT_POSITION_Y;
  const projectPoint = (point: FleetScenePoint): FleetScenePoint => ({
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  });
  const { visualSlot, ...slot } = parkingSlot;
  const [topLeft, topRight, bottomRight, bottomLeft] = slot.polygon;
  const center = projectPoint(visualSlot.center);
  return {
    ...slot,
    polygon: polygon(
      projectPoint(topLeft),
      projectPoint(topRight),
      projectPoint(bottomRight),
      projectPoint(bottomLeft),
    ),
    center,
    frame: centeredFrame(center, visualSlot.width * coverScale, visualSlot.height * coverScale),
  };
}

export const projectAllParkingSlots = (width: number, height: number) =>
  PARKING_SLOTS.map((parkingSlot) => projectParkingSlot(parkingSlot, width, height));

export function parkingSceneMinimumHeight(width: number) {
  if (width > 0 && width < 720) return 440;
  return undefined;
}

function buildVehicleProjection(slot: ProjectedParkingSlot, minimumTop = 0) {
  const naturalWidth = (slot.frame.width * PARKING_VEHICLE_WIDTH_RATIO) / VISUAL_WIDTH_PER_PIXEL;
  const depthLimit = (slot.frame.height * PARKING_VEHICLE_DEPTH_RATIO) / GROUND_LENGTH_PER_PIXEL;
  const carWidth = Math.max(
    1,
    Math.min(naturalWidth, depthLimit, (slot.center.y - minimumTop) / -TOP_PER_PIXEL),
  );
  // When the labels need extra room, shrink the HUD and its hit area together with the car.
  const frameScale = carWidth / naturalWidth;
  const frame = centeredFrame(
    slot.center,
    slot.frame.width * frameScale,
    slot.frame.height * frameScale,
  );
  const carHeight = carWidth * PARKING_IMAGE_RATIO;
  const left = slot.center.x - PARKING_ANCHOR.x * carWidth;
  const top = slot.center.y - PARKING_ANCHOR.y * carHeight;
  return {
    carWidth,
    frame,
    scale: carWidth / PARKING_IMAGE_WIDTH,
    visualWidth: VISUAL_WIDTH_PER_PIXEL * carWidth,
    groundLength: GROUND_LENGTH_PER_PIXEL * carWidth,
    bounds: {
      left: left + SILHOUETTE.left * carWidth,
      right: left + SILHOUETTE.right * carWidth,
      top: top + SILHOUETTE.top * carHeight,
      bottom: top + SILHOUETTE.bottom * carHeight,
    },
    groundFootprint: FOOTPRINT_PER_PIXEL.map(({ x, y }) => ({
      x: slot.center.x + x * carWidth,
      y: slot.center.y + y * carWidth,
    })),
  };
}

export function createParkingSceneGeometry(
  width: number,
  height: number,
  nodeIds: readonly string[],
): FleetSceneGeometry {
  const slots = PARKING_SLOTS.slice(0, nodeIds.length).map((slot) =>
    projectParkingSlot(slot, width, height),
  );
  const projections = slots.map((slot) => buildVehicleProjection(slot));

  const points = slots.map<FleetVehiclePoint>((projected, index) => {
    const isFront = projected.row === 'near';
    let projection = projections[index];
    if (isFront) {
      const labelX = projected.center.x;
      const minimumTop = Math.max(
        0,
        ...slots.flatMap((rear, rearIndex) => {
          if (rear.row !== 'far') return [];
          const { bounds, frame } = projections[rearIndex];
          const left = Math.min(bounds.left, frame.x);
          const right = Math.max(bounds.right, frame.x + frame.width);
          const bottom = Math.max(bounds.bottom, frame.y + frame.height);
          if (right >= labelX - LABEL_HALF_WIDTH && left <= labelX + LABEL_HALF_WIDTH) {
            return [bottom + LABEL_CLEARANCE];
          }
          if (right >= projection.bounds.left && left <= projection.bounds.right) {
            return [bottom + 2];
          }
          return [];
        }),
      );
      if (projection.bounds.top < minimumTop) {
        projection = buildVehicleProjection(projected, minimumTop);
      }
    }
    return {
      nodeId: nodeIds[index],
      slotId: projected.id,
      x: projected.center.x,
      y: projected.center.y,
      depth: isFront ? 1 : 0.55,
      carWidth: projection.carWidth,
      baseWidth: projection.frame.width,
      baseHeight: projection.frame.height,
      labelScale: clamp(projection.carWidth / 230, 0.68, 1),
      glowStrength: isFront ? 0.72 : 0.56,
      zIndex: projected.zIndex,
      imageRatio: PARKING_IMAGE_RATIO,
      roofInset: SILHOUETTE.top * PARKING_IMAGE_RATIO,
      anchorX: PARKING_ANCHOR.x,
      anchorY: PARKING_ANCHOR.y,
      parkingFrame: projection.frame,
      parkingAlignment: {
        bounds: projection.bounds,
        groundFootprint: projection.groundFootprint,
        scale: projection.scale,
        visualWidth: projection.visualWidth,
        groundLength: projection.groundLength,
      },
      popoverSide:
        projected.popoverSide === 'left' || projected.popoverSide === 'top-left' ? 'left' : 'right',
    };
  });

  return {
    width,
    height,
    points,
    target: { x: width / 2, y: height * 0.67 },
  };
}
