import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NodeResourceContribution } from '../../../../types/computePool';
import type { FleetLayout, FleetVehicleNode } from '../../dashboardModel';
import { ComputeFxCanvas } from './ComputeFxCanvas';
import { createFleetSceneGeometry, fleetSceneMinimumHeight } from './fleetSceneGeometry';
import { SceneBackground } from './SceneBackground';
import { VehicleLayer } from './VehicleLayer';

interface FleetSceneProps {
  layout: FleetLayout;
  nodes: FleetVehicleNode[];
  resourceByNode: Map<string, NodeResourceContribution>;
}

export function FleetScene({ layout, nodes, resourceByNode }: FleetSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const geometry = useMemo(
    () => size.width > 0 && size.height > 0
      ? createFleetSceneGeometry(size.width, size.height, nodes.map(({ node }) => node.id))
      : null,
    [size.width, size.height, nodes],
  );

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
      className="fleet-scene"
      data-fleet-layout={layout}
      style={{ minHeight: fleetSceneMinimumHeight(size.width, nodes.length) }}
    >
      <SceneBackground />
      {geometry && (
        <>
          <ComputeFxCanvas geometry={geometry} activeNodeId={activeNodeId} />
          <VehicleLayer
            geometry={geometry}
            nodes={nodes}
            resourceByNode={resourceByNode}
            onActiveNodeChange={setActiveNodeId}
          />
        </>
      )}
    </div>
  );
}
