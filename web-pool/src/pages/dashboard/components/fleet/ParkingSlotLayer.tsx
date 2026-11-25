import type { FleetScenePoint, FleetSceneGeometry } from './fleetSceneGeometry';
import { DEBUG_PARKING_ALIGNMENT, projectAllParkingSlots } from './parkingSceneGeometry';

interface ParkingSlotLayerProps {
  geometry: FleetSceneGeometry;
  activeNodeId: string | null;
}

const polygonPoints = (points: readonly FleetScenePoint[]) =>
  points.map(({ x, y }) => `${x},${y}`).join(' ');

export function ParkingSlotLayer({ geometry, activeNodeId }: ParkingSlotLayerProps) {
  const viewBox = `0 0 ${geometry.width} ${geometry.height}`;
  const occupiedFrames = DEBUG_PARKING_ALIGNMENT
    ? new Map(geometry.points.map((point) => [point.slotId, point.parkingFrame]))
    : undefined;
  return (
    <>
      <svg
        className="parking-slot-layer"
        viewBox={viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g className="parking-slot-layer__active-slots">
          {geometry.points.map((point) =>
            point.parkingFrame ? (
              <rect
                key={point.nodeId}
                data-parking-slot={point.slotId}
                className={`parking-slot-shape${activeNodeId === point.nodeId ? ' parking-slot-shape--active' : ''}`}
                {...point.parkingFrame}
                rx="3"
              />
            ) : null,
          )}
        </g>
      </svg>
      {DEBUG_PARKING_ALIGNMENT ? (
        <svg
          className="parking-slot-layer parking-slot-layer--debug"
          viewBox={viewBox}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {projectAllParkingSlots(geometry.width, geometry.height).map((slot) => {
            const frame = occupiedFrames?.get(slot.id) ?? slot.frame;
            return (
              <g key={slot.id}>
                <rect className="parking-slot-debug__frame" {...frame} />
                <circle
                  className="parking-slot-debug__center"
                  cx={slot.center.x}
                  cy={slot.center.y}
                  r="4"
                />
                <line
                  className="parking-slot-debug__axis"
                  x1={slot.center.x}
                  y1={frame.y}
                  x2={slot.center.x}
                  y2={frame.y + frame.height}
                />
                <text
                  className="parking-slot-debug__label"
                  x={slot.center.x + 7}
                  y={slot.center.y - 7}
                >
                  {slot.id}
                </text>
              </g>
            );
          })}
          {geometry.points.map((point) => (
            <g key={`anchor-${point.nodeId}`}>
              {point.parkingAlignment && (
                <>
                  <rect
                    className="parking-slot-debug__bounds"
                    x={point.parkingAlignment.bounds.left}
                    y={point.parkingAlignment.bounds.top}
                    width={point.parkingAlignment.bounds.right - point.parkingAlignment.bounds.left}
                    height={
                      point.parkingAlignment.bounds.bottom - point.parkingAlignment.bounds.top
                    }
                  />
                  <polygon
                    className="parking-slot-debug__footprint"
                    points={polygonPoints(point.parkingAlignment.groundFootprint)}
                  />
                  <text
                    className="parking-slot-debug__label"
                    x={point.parkingAlignment.bounds.left}
                    y={point.parkingAlignment.bounds.top - 4}
                  >
                    {`scale ${point.parkingAlignment.scale.toFixed(3)}×`}
                  </text>
                </>
              )}
              <line
                className="parking-slot-debug__vehicle-anchor"
                x1={point.x - 7}
                y1={point.y}
                x2={point.x + 7}
                y2={point.y}
              />
              <line
                className="parking-slot-debug__vehicle-anchor"
                x1={point.x}
                y1={point.y - 7}
                x2={point.x}
                y2={point.y + 7}
              />
            </g>
          ))}
        </svg>
      ) : null}
    </>
  );
}
