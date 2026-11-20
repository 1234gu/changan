import { DeploymentUnitOutlined } from '@ant-design/icons';
import type { NodeResourceContribution } from '../../../types/computePool';
import type { NodeSummary } from '../../../types/node';
import {
  getFleetLayout,
  getFleetVehicleNodes,
  indexNodeResources,
} from '../dashboardModel';
import { VehicleNode } from './VehicleNode';

interface VehicleFleetViewProps {
  nodes: NodeSummary[];
  resources: NodeResourceContribution[];
}

export function VehicleFleetView({ nodes, resources }: VehicleFleetViewProps) {
  const fleetNodes = getFleetVehicleNodes(nodes);
  const layout = getFleetLayout(fleetNodes.length);
  const resourceByNode = indexNodeResources(resources);

  return (
    <section className="vehicle-fleet" aria-labelledby="vehicle-fleet-title">
      <header className="vehicle-fleet__header">
        <h2 id="vehicle-fleet-title">车群协同算力池</h2>
        <div className="vehicle-fleet__counter" aria-label={`${fleetNodes.length} 台车辆在线`}>
          <strong>{fleetNodes.length}</strong>
          <span>台车辆在线</span>
        </div>
      </header>

      <div className={`vehicle-fleet__stage vehicle-fleet__stage--${layout}`}>
        <div className="vehicle-fleet__scene" aria-hidden="true">
          <span className="vehicle-fleet__grid" />
          <span className="vehicle-fleet__lane vehicle-fleet__lane--left" />
          <span className="vehicle-fleet__lane vehicle-fleet__lane--right" />
          <span className="vehicle-fleet__hud vehicle-fleet__hud--outer" />
          <span className="vehicle-fleet__hud vehicle-fleet__hud--inner" />
          <svg
            className="vehicle-fleet__tracks"
            viewBox="0 0 1000 460"
            preserveAspectRatio="none"
          >
            <path d="M20 414 C205 352 310 335 500 346 C690 335 795 352 980 414" />
            <path d="M95 448 C260 372 360 362 500 372 C640 362 740 372 905 448" />
            <path d="M500 436 L500 265" />
            <path className="vehicle-fleet__track-spoke" d="M120 405 C265 386 355 350 500 325" />
            <path className="vehicle-fleet__track-spoke" d="M880 405 C735 386 645 350 500 325" />
            <path className="vehicle-fleet__track-spoke" d="M260 255 C350 280 410 302 500 325" />
            <path className="vehicle-fleet__track-spoke" d="M740 255 C650 280 590 302 500 325" />
          </svg>
          <span className="vehicle-fleet__pulse vehicle-fleet__pulse--one" />
          <span className="vehicle-fleet__pulse vehicle-fleet__pulse--two" />
          <span className="vehicle-fleet__compute-field">
            {Array.from({ length: 11 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>

        {fleetNodes.length === 0 ? (
          <div className="vehicle-fleet__empty">
            <DeploymentUnitOutlined />
            <strong>当前无在线车辆节点</strong>
            <span>可前往节点管理查看离线、可疑或异常节点状态。</span>
          </div>
        ) : (
          <div
            className={`vehicle-fleet__vehicles vehicle-fleet__vehicles--${layout}`}
            data-vehicle-count={fleetNodes.length}
          >
            {fleetNodes.map(({ node, displayName, ordinal }) => (
              <VehicleNode
                key={node.id}
                node={node}
                displayName={displayName}
                ordinal={ordinal}
                resource={resourceByNode.get(node.id)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="vehicle-fleet__note">
        数据光轨用于表达车辆节点统一接入与协同计算，不代表真实网络拓扑。
      </p>
    </section>
  );
}
