import { Popover } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import vehicleImage from '../../../assets/fleet-node-suv-v2.png';
import { buildNodeDetailPath, ROUTES } from '../../../routes/config';
import type { NodeResourceContribution } from '../../../types/computePool';
import type { NodeSummary } from '../../../types/node';
import { NodeResourcePopover } from './NodeResourcePopover';
import {
  VEHICLE_IMAGE_RATIO,
  VEHICLE_ROOF_INSET,
  VEHICLE_TIRE_INSET,
  type FleetVehiclePoint,
} from './fleet/fleetSceneGeometry';

interface VehicleNodeProps {
  node: NodeSummary;
  displayName: string;
  pose: FleetVehiclePoint;
  mirrored: boolean;
  resource?: NodeResourceContribution;
  onActiveChange?: (nodeId: string | null) => void;
  popoverContent?: ReactNode;
  popoverClassName?: string;
  fromPath?: string;
}

export function VehicleNode({
  node,
  displayName,
  pose,
  mirrored,
  resource,
  onActiveChange,
  popoverContent,
  popoverClassName = 'vehicle-node-popover',
  fromPath = ROUTES.dashboard,
}: VehicleNodeProps) {
  const { x, y, carWidth, baseWidth, baseHeight, labelScale, zIndex, depth } = pose;
  const style = {
    left: x - carWidth / 2,
    top: y - carWidth * (VEHICLE_IMAGE_RATIO - VEHICLE_TIRE_INSET),
    width: carWidth,
    height: carWidth * VEHICLE_IMAGE_RATIO,
    zIndex,
    '--vehicle-label-font': `${Math.max(14, 17 * labelScale)}px`,
    '--vehicle-label-padding': `${Math.round(20 * labelScale)}px`,
    '--vehicle-roof-inset': `${carWidth * VEHICLE_ROOF_INSET}px`,
  } as CSSProperties;

  return (
    <Popover
      overlayClassName={popoverClassName}
      placement="top"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.12}
      content={popoverContent ?? (
        <NodeResourcePopover node={node} displayName={displayName} resource={resource} />
      )}
    >
      <Link
        className={`vehicle-node${mirrored ? ' vehicle-node--mirror' : ''}`}
        style={style}
        data-fleet-node-id={node.id}
        data-ground-x={x}
        data-ground-y={y}
        data-base-width={baseWidth}
        data-base-height={baseHeight}
        data-depth={depth}
        to={buildNodeDetailPath(node.id)}
        state={{ from: fromPath }}
        aria-label={`查看 ${displayName}（真实节点 ${node.name}）详情`}
        onMouseEnter={() => onActiveChange?.(node.id)}
        onMouseLeave={() => onActiveChange?.(null)}
        onFocus={() => onActiveChange?.(node.id)}
        onBlur={() => onActiveChange?.(null)}
      >
        <strong className="vehicle-node__label" title={displayName}>
          <span>{displayName}</span>
        </strong>
        <img className="vehicle-node__image" src={vehicleImage} alt="" draggable={false} />
      </Link>
    </Popover>
  );
}
