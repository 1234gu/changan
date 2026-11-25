import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
import campusImage from '../../../assets/cluster-campus-no-markings.png';
import vehicleImage from '../../../assets/fleet-node-suv-parking-front.png';
import { buildClusterDetailPath } from '../../../routes/config';
import type { NodeDetail, NodeOperationalStatus } from '../../../types/node';
import { NodeResourcePopover } from '../../dashboard/components/NodeResourcePopover';
import { VehicleNode } from '../../dashboard/components/VehicleNode';
import { ParkingSceneBackground } from '../../dashboard/components/fleet/ParkingSceneBackground';
import {
  clusterMemberCardPlacement,
  clusterMemberMinimumHeight,
  clusterMemberRoofY,
  createClusterMemberGeometry,
  sortClusterMembers,
} from './clusterMemberLayout';
import '../../dashboard/components/fleet/FleetScene.css';

interface ClusterMemberSceneProps {
  clusterId: string;
  members: NodeDetail[];
  loading: boolean;
}

const STATUS_TEXT: Record<NodeOperationalStatus, string> = {
  online: '在线',
  suspect: '可疑',
  offline: '离线',
  abnormal: '异常',
};

function MemberStatus({ status }: { status: NodeOperationalStatus }) {
  return (
    <span className={`cluster-member-status cluster-member-status--${status}`}>
      <i aria-hidden="true" />
      {STATUS_TEXT[status]}
    </span>
  );
}

export function ClusterMemberScene({ clusterId, members, loading }: ClusterMemberSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const sortedMembers = useMemo(() => sortClusterMembers(members), [members]);
  const geometry = useMemo(
    () =>
      size.width && size.height
        ? createClusterMemberGeometry(
            size.width,
            size.height,
            sortedMembers.map(({ id }) => id),
          )
        : null,
    [size.width, size.height, sortedMembers],
  );
  const activeIndex = sortedMembers.findIndex(({ id }) => id === activeNodeId);
  const activePose = geometry?.points[activeIndex];
  const activeNode = sortedMembers[activeIndex];
  const activeCard =
    geometry && activePose ? clusterMemberCardPlacement(geometry, activePose) : null;
  const fromPath = buildClusterDetailPath(clusterId);

  const handleActiveChange = useCallback((id: string | null) => {
    clearTimeout(dismissTimer.current);
    if (id) setActiveNodeId(id);
    else dismissTimer.current = setTimeout(() => setActiveNodeId(null), 220);
  }, []);
  useEffect(() => () => clearTimeout(dismissTimer.current), []);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    const observer = new ResizeObserver(
      ([
        {
          contentRect: { width, height },
        },
      ]) => {
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
      },
    );
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="cluster-member-panel" aria-label={`集群成员节点，共 ${members.length} 个`}>
      <div className="cluster-member-panel__heading">
        <span className="cluster-member-panel__icon" aria-hidden="true" />
        <strong>集群成员节点</strong>
        <em>{members.length}</em>
      </div>
      <div
        ref={sceneRef}
        className="cluster-member-scene"
        data-member-count={sortedMembers.length}
        style={{ minHeight: clusterMemberMinimumHeight(size.width, sortedMembers.length) }}
      >
        <ParkingSceneBackground imageSrc={campusImage} />
        {geometry && (
          <div className="fleet-vehicle-layer cluster-member-scene__vehicles">
            {geometry.points.map((pose, index) => {
              const node = sortedMembers[index];
              const displayName = `节点${String(index + 1).padStart(2, '0')}`;
              return (
                <Fragment key={node.id}>
                  <VehicleNode
                    node={node}
                    displayName={displayName}
                    pose={pose}
                    mirrored={false}
                    vehicleImageSrc={vehicleImage}
                    onActiveChange={handleActiveChange}
                    popoverEnabled={false}
                    fromPath={fromPath}
                  />
                  <div
                    className={`cluster-member-scene__label${node.id === activeNodeId ? ' is-active' : ''}`}
                    style={{
                      left: pose.x,
                      top: clusterMemberRoofY(pose) - 5,
                      zIndex: pose.zIndex + 1,
                    }}
                  >
                    <strong>{displayName}</strong>
                    <MemberStatus status={node.operationalStatus} />
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        {activeCard && activePose && activeNode && (
          <aside
            className={`parking-node-info cluster-member-popover${activeCard.side ? ` parking-node-info--${activeCard.side}` : ''}${activeCard.maxHeight < 390 ? ' cluster-member-popover--compact' : ''}`}
            style={
              {
                left: activeCard.left,
                top: activeCard.top,
                width: activeCard.width,
                maxHeight: activeCard.maxHeight,
                '--parking-card-anchor-y': `${activeCard.anchorY}px`,
              } as CSSProperties
            }
            aria-live="polite"
            onMouseEnter={() => handleActiveChange(activePose.nodeId)}
            onMouseLeave={() => handleActiveChange(null)}
          >
            <NodeResourcePopover
              node={activeNode}
              detail={activeNode}
              displayName={`节点${String(activeIndex + 1).padStart(2, '0')}`}
            />
          </aside>
        )}
        {!loading && !sortedMembers.length && (
          <div className="cluster-member-scene__empty">
            <span>当前集群暂无成员节点</span>
          </div>
        )}
      </div>
    </section>
  );
}
