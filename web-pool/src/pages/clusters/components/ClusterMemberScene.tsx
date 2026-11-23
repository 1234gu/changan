import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { buildClusterDetailPath } from '../../../routes/config';
import type { NodeDetail, NodeOperationalStatus } from '../../../types/node';
import { VehicleNode } from '../../dashboard/components/VehicleNode';
import { SceneBackground } from '../../dashboard/components/fleet/SceneBackground';
import {
  createFleetSceneGeometry,
  fleetSceneMinimumHeight,
} from '../../dashboard/components/fleet/fleetSceneGeometry';
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

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

function ClusterMemberPopover({ node, displayName }: { node: NodeDetail; displayName: string }) {
  const gpuCount = node.resources.gpu?.total ?? node.gpuDetails?.deviceCount ?? 0;
  const vram = node.videoMemory?.total ?? 0;
  const npu = node.resources.npu?.total ?? node.npuSupport?.tops ?? 0;
  const ip = node.ipAddress ?? node.network.ipv4Address ?? '--';

  return (
    <div className="cluster-member-popover__content">
      <header>
        <div>
          <strong>{displayName}</strong>
          <span title={node.name}>{node.name}</span>
        </div>
        <b className={`cluster-member-popover__status cluster-member-popover__status--${node.operationalStatus}`}>
          {STATUS_TEXT[node.operationalStatus]}
        </b>
      </header>
      <dl>
        <div>
          <dt>Node ID</dt>
          <dd title={node.id}>{node.id}</dd>
        </div>
        <div>
          <dt>IP</dt>
          <dd>{ip}</dd>
        </div>
        <div>
          <dt>Architecture</dt>
          <dd>{node.architecture}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>{formatNumber(node.resources.cpu.total)} Core</dd>
        </div>
        <div>
          <dt>GPU</dt>
          <dd>{formatNumber(gpuCount)} Device</dd>
        </div>
        <div>
          <dt>显存</dt>
          <dd>{formatNumber(vram)} GB</dd>
        </div>
        <div>
          <dt>NPU</dt>
          <dd>{formatNumber(npu)} TOPS</dd>
        </div>
        <div>
          <dt>最近上报</dt>
          <dd>{node.lastResourceAt ? dayjs(node.lastResourceAt).format('YYYY-MM-DD HH:mm:ss') : '--'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ClusterMemberScene({ clusterId, members, loading }: ClusterMemberSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const sortedMembers = useMemo(
    () => [...members].sort((left, right) => left.id.localeCompare(right.id, 'zh-CN')),
    [members],
  );
  const geometry = useMemo(
    () => size.width > 0 && size.height > 0
      ? createFleetSceneGeometry(
        size.width,
        size.height,
        sortedMembers.map((node) => node.id),
        { centerSingleNode: true },
      )
      : null,
    [size.height, size.width, sortedMembers],
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
        style={{ minHeight: fleetSceneMinimumHeight(size.width, sortedMembers.length) }}
      >
        <SceneBackground />
        <div className="cluster-member-scene__atmosphere" aria-hidden="true" />
        {geometry ? (
          <>
            <svg
              className="cluster-member-scene__bases"
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <filter id="cluster-base-glow" x="-80%" y="-100%" width="260%" height="300%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {geometry.points.map((point) => (
                <g
                  key={point.nodeId}
                  className={`cluster-member-base${activeNodeId === point.nodeId ? ' cluster-member-base--active' : ''}`}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  <ellipse
                    className="cluster-member-base__aura"
                    rx={point.baseWidth * 0.55}
                    ry={point.baseHeight * 0.92}
                  />
                  <ellipse
                    className="cluster-member-base__main"
                    rx={point.baseWidth * 0.48}
                    ry={point.baseHeight * 0.64}
                    filter="url(#cluster-base-glow)"
                  />
                  <ellipse
                    className="cluster-member-base__scan"
                    rx={point.baseWidth * 0.59}
                    ry={point.baseHeight * 0.92}
                    pathLength="100"
                  />
                  <path
                    className="cluster-member-base__ticks"
                    d={`M ${-point.baseWidth * 0.42} 0 H ${-point.baseWidth * 0.28} M ${point.baseWidth * 0.28} 0 H ${point.baseWidth * 0.42}`}
                  />
                </g>
              ))}
            </svg>
            <div className="fleet-vehicle-layer cluster-member-scene__vehicles">
              {sortedMembers.map((node, index) => {
                const displayName = `节点${String(index + 1).padStart(2, '0')}`;
                const pose = geometry.points[index];
                return (
                  <VehicleNode
                    key={node.id}
                    node={node}
                    displayName={displayName}
                    pose={pose}
                    mirrored={pose.x > geometry.width / 2}
                    onActiveChange={setActiveNodeId}
                    popoverClassName="vehicle-node-popover cluster-member-popover"
                    popoverContent={<ClusterMemberPopover node={node} displayName={displayName} />}
                    fromPath={buildClusterDetailPath(clusterId)}
                  />
                );
              })}
            </div>
          </>
        ) : null}
        {!loading && sortedMembers.length === 0 ? (
          <div className="cluster-member-scene__empty">当前集群暂无成员节点</div>
        ) : null}
      </div>
    </section>
  );
}
