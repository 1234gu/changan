import type { NodeResourceContribution } from '../../../../types/computePool';
import parkingVehicleImage from '../../../../assets/fleet-node-suv-parking-front.png';
import type { FleetVehicleNode } from '../../dashboardModel';
import { VehicleNode } from '../VehicleNode';
import type { FleetSceneGeometry } from './fleetSceneGeometry';

interface VehicleLayerProps {
  geometry: FleetSceneGeometry;
  nodes: FleetVehicleNode[];
  resourceByNode: Map<string, NodeResourceContribution>;
  onActiveNodeChange: (nodeId: string | null) => void;
  useScenePopover?: boolean;
}

export function VehicleLayer({
  geometry,
  nodes,
  resourceByNode,
  onActiveNodeChange,
  useScenePopover = false,
}: VehicleLayerProps) {
  if (nodes.length === 0) {
    return (
      <div className="fleet-vehicle-layer fleet-vehicle-layer--empty">
        <div className="vehicle-fleet__empty">
          <strong>当前无在线车辆节点</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="fleet-vehicle-layer" data-vehicle-count={geometry.points.length}>
      {nodes.slice(0, geometry.points.length).map(({ node, displayName }, index) => (
        <VehicleNode
          key={node.id}
          node={node}
          displayName={displayName}
          pose={geometry.points[index]}
          mirrored={useScenePopover ? false : geometry.points[index].x > geometry.width / 2}
          resource={resourceByNode.get(node.id)}
          onActiveChange={onActiveNodeChange}
          popoverEnabled={!useScenePopover}
          showStatusLabel={useScenePopover}
          vehicleImageSrc={useScenePopover ? parkingVehicleImage : undefined}
        />
      ))}
    </div>
  );
}
