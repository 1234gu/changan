import { Popover } from 'antd';
import { Link } from 'react-router-dom';
import vehicleImage from '../../../assets/changan-smart-suv.png';
import { buildNodeDetailPath, ROUTES } from '../../../routes/config';
import type { NodeResourceContribution } from '../../../types/computePool';
import type { NodeSummary } from '../../../types/node';
import { NodeResourcePopover } from './NodeResourcePopover';

interface VehicleNodeProps {
  node: NodeSummary;
  displayName: string;
  ordinal: number;
  resource?: NodeResourceContribution;
}

export function VehicleNode({ node, displayName, ordinal, resource }: VehicleNodeProps) {
  const directionClass = ordinal % 2 === 0 ? ' vehicle-node--mirror' : '';

  return (
    <Popover
      overlayClassName="vehicle-node-popover"
      placement="top"
      mouseEnterDelay={0.12}
      content={<NodeResourcePopover node={node} displayName={displayName} resource={resource} />}
    >
      <Link
        className={`vehicle-node${directionClass}`}
        data-fleet-position={ordinal}
        to={buildNodeDetailPath(node.id)}
        state={{ from: ROUTES.dashboard }}
        aria-label={`查看 ${displayName}（真实节点 ${node.name}）详情`}
      >
        <strong className="vehicle-node__label" title={displayName}>
          <i aria-hidden="true" />
          {displayName}
        </strong>
        <span className="vehicle-node__visual" aria-hidden="true">
          <span className="vehicle-node__platform" />
          <img
            className="vehicle-node__image"
            src={vehicleImage}
            alt=""
            draggable={false}
          />
        </span>
      </Link>
    </Popover>
  );
}
