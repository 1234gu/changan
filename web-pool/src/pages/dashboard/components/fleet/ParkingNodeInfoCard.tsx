import type { CSSProperties } from 'react';
import type { NodeResourceContribution } from '../../../../types/computePool';
import type { FleetVehicleNode } from '../../dashboardModel';
import { NodeResourcePopover } from '../NodeResourcePopover';
import type { FleetSceneGeometry } from './fleetSceneGeometry';

interface ParkingNodeInfoCardProps {
  geometry: FleetSceneGeometry;
  vehicle: FleetVehicleNode;
  resource?: NodeResourceContribution;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function ParkingNodeInfoCard({
  geometry,
  vehicle,
  resource,
  onMouseEnter,
  onMouseLeave,
}: ParkingNodeInfoCardProps) {
  const point = geometry.points.find((item) => item.nodeId === vehicle.node.id);
  if (!point?.parkingAlignment) return null;
  const { bounds } = point.parkingAlignment;

  const panelWidth = clamp(geometry.width * 0.29, 318, 382);
  const panelHeight = 414;
  const gap = 18;
  const prefersRight = point.popoverSide
    ? point.popoverSide === 'right'
    : point.x <= geometry.width / 2;
  const proposedLeft = prefersRight ? bounds.right + gap : bounds.left - panelWidth - gap;
  const left = clamp(proposedLeft, 14, geometry.width - panelWidth - 14);
  const top = clamp(bounds.top - gap, 14, Math.max(14, geometry.height - panelHeight - 14));
  const side = left >= point.x ? 'right' : 'left';
  const anchorY = (bounds.top + bounds.bottom) / 2;
  const style = {
    left,
    top,
    width: panelWidth,
    '--parking-card-anchor-y': `${clamp(anchorY - top, 42, panelHeight - 42)}px`,
  } as CSSProperties;

  return (
    <aside
      className={`parking-node-info parking-node-info--${side}`}
      style={style}
      aria-live="polite"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <NodeResourcePopover
        node={vehicle.node}
        displayName={vehicle.displayName}
        resource={resource}
      />
    </aside>
  );
}
