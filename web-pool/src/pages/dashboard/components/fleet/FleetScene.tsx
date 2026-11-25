import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NodeResourceContribution } from '../../../../types/computePool';
import type { FleetLayout, FleetVehicleNode } from '../../dashboardModel';
import { ParkingNodeInfoCard } from './ParkingNodeInfoCard';
import { ParkingSceneBackground } from './ParkingSceneBackground';
import { createParkingSceneGeometry, parkingSceneMinimumHeight } from './parkingSceneGeometry';
import { ParkingSlotLayer } from './ParkingSlotLayer';
import { VehicleLayer } from './VehicleLayer';

interface FleetSceneProps {
  layout: FleetLayout;
  nodes: FleetVehicleNode[];
  resourceByNode: Map<string, NodeResourceContribution>;
}

export function FleetScene({ layout, nodes, resourceByNode }: FleetSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const geometry = useMemo(
    () => size.width > 0 && size.height > 0
      ? createParkingSceneGeometry(size.width, size.height, nodes.map(({ node }) => node.id))
      : null,
    [size.width, size.height, nodes],
  );
  const activeVehicle = useMemo(
    () => nodes.find(({ node }) => node.id === activeNodeId),
    [activeNodeId, nodes],
  );

  const handleActiveNodeChange = useCallback((nodeId: string | null) => {
    if (hideTimerRef.current !== undefined) {
      globalThis.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = undefined;
    }
    if (nodeId) {
      setActiveNodeId(nodeId);
      return;
    }
    hideTimerRef.current = globalThis.setTimeout(() => {
      setActiveNodeId(null);
      hideTimerRef.current = undefined;
    }, 140);
  }, []);

  useEffect(() => () => {
    if (hideTimerRef.current !== undefined) globalThis.clearTimeout(hideTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;

    const updateSize = (width: number, height: number) => {
      setSize((current) => current.width === width && current.height === height
        ? current
        : { width, height });
    };

    const observer = new ResizeObserver(([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sceneRef}
      className="fleet-scene fleet-scene--parking"
      data-fleet-layout={layout}
      style={{ minHeight: parkingSceneMinimumHeight(size.width) }}
    >
      <ParkingSceneBackground />
      {geometry && (
        <>
          <ParkingSlotLayer geometry={geometry} activeNodeId={activeNodeId} />
          <VehicleLayer
            geometry={geometry}
            nodes={nodes}
            resourceByNode={resourceByNode}
            onActiveNodeChange={handleActiveNodeChange}
            useScenePopover
          />
          {activeVehicle ? (
            <ParkingNodeInfoCard
              geometry={geometry}
              vehicle={activeVehicle}
              resource={resourceByNode.get(activeVehicle.node.id)}
              onMouseEnter={() => handleActiveNodeChange(activeVehicle.node.id)}
              onMouseLeave={() => handleActiveNodeChange(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
