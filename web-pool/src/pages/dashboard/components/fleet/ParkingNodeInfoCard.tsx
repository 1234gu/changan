import { useLayoutEffect, useRef } from 'react';
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
  const panelRef = useRef<HTMLElement>(null);
  const bounds = point?.parkingAlignment?.bounds;
  const anchorY = bounds && (bounds.top + bounds.bottom) / 2;
  const anchorTop = bounds?.top;
  const inset = 14;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scene = panel?.parentElement;
    if (!panel || !scene || anchorY === undefined || anchorTop === undefined) return;
    const header = document.querySelector('.app-header');
    const position = () => {
      const origin = scene.getBoundingClientRect().top + scene.clientTop;
      const visibleTop = Math.max(0, (header?.getBoundingClientRect().bottom ?? 0) - origin) + inset;
      const visibleBottom = Math.min(scene.clientHeight, window.innerHeight - origin) - inset;
      panel.style.maxHeight = `${Math.max(0, visibleBottom - visibleTop)}px`;
      const height = panel.offsetHeight;
      const top = clamp(anchorTop - height / 2, visibleTop, Math.max(visibleTop, visibleBottom - height));
      panel.style.top = `${top}px`;
      panel.style.setProperty('--parking-card-anchor-y', `${clamp(anchorY - top, 0, height)}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    observer.observe(scene);
    window.addEventListener('scroll', position, { passive: true });
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', position);
      window.removeEventListener('resize', position);
    };
  }, [anchorTop, anchorY]);
  if (!point || !bounds) return null;

  const panelWidth = Math.min(clamp(geometry.width * 0.29, 318, 382), geometry.width - 2 * inset);
  const gap = 18;
  const prefersRight = point.popoverSide
    ? point.popoverSide === 'right'
    : point.x <= geometry.width / 2;
  const proposedLeft = prefersRight ? bounds.right + gap : bounds.left - panelWidth - gap;
  const left = clamp(proposedLeft, inset, geometry.width - panelWidth - inset);
  const side = left >= point.x ? 'right' : 'left';

  return (
    <aside
      className={`parking-node-info parking-node-info--${side}`}
      ref={panelRef}
      style={{ left, width: panelWidth }}
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
