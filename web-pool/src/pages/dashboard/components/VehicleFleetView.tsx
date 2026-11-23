import { useMemo } from 'react';
import type { NodeResourceContribution } from '../../../types/computePool';
import type { NodeSummary } from '../../../types/node';
import {
  getFleetLayout,
  getFleetVehicleNodes,
  indexNodeResources,
} from '../dashboardModel';
import { FleetScene } from './fleet/FleetScene';

interface VehicleFleetViewProps {
  nodes: NodeSummary[];
  resources: NodeResourceContribution[];
}

export function VehicleFleetView({ nodes, resources }: VehicleFleetViewProps) {
  const fleetNodes = useMemo(() => getFleetVehicleNodes(nodes), [nodes]);
  const layout = getFleetLayout(fleetNodes.length);
  const resourceByNode = indexNodeResources(resources);

  return (
    <section className="vehicle-fleet" aria-label="在线车辆节点展示">
      <FleetScene layout={layout} nodes={fleetNodes} resourceByNode={resourceByNode} />
    </section>
  );
}
