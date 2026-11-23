import { useEffect, useRef } from 'react';
import {
  createFleetDataFlows,
  getFleetCoreMetrics,
  sampleFleetDataFlowCubic,
  sampleFleetDataFlowTangent,
} from './fleetDataFlow';
import type { FleetDataFlowCubic, FleetDataFlowGeometry } from './fleetDataFlow';
import type { FleetSceneGeometry, FleetVehiclePoint } from './fleetSceneGeometry';

interface ComputeFxCanvasProps {
  geometry: FleetSceneGeometry;
  activeNodeId: string | null;
}

type Context = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const phase = (value: number) => value - Math.floor(value);
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const cyan = (alpha: number) => `rgba(26, 204, 255, ${Math.min(1, alpha)})`;
const white = (alpha: number) => `rgba(169, 249, 255, ${Math.min(1, alpha)})`;

function glow(ctx: Context, x: number, y: number, rx: number, ry: number, strength: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, cyan(strength));
  gradient.addColorStop(0.42, `rgba(0, 133, 255, ${strength * 0.35})`);
  gradient.addColorStop(1, 'rgba(0, 105, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function arc(ctx: Context, x: number, y: number, rx: number, ry: number, start = 0, end = TAU) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, start, end);
}

function drawGroundOrbit(ctx: Context, scene: FleetSceneGeometry, time: number) {
  const x = scene.width / 2;
  const y = scene.height * 0.61;
  const rx = scene.width * 0.46;
  const ry = scene.height * 0.257;
  glow(ctx, x, y, rx, ry * 1.3, 0.14);
  const light = ctx.createLinearGradient(x, y - ry, x, y + ry);
  light.addColorStop(0, cyan(0.26));
  light.addColorStop(0.32, cyan(0.5));
  light.addColorStop(1, cyan(0.92));
  for (const ratio of [0.88, 0.95, 1]) {
    arc(ctx, x, y, rx * ratio, ry * ratio);
    ctx.strokeStyle = ratio === 0.95 ? light : cyan(0.27);
    ctx.lineWidth = ratio === 0.95 ? 2.15 : 0.8;
    ctx.shadowColor = '#007bff';
    ctx.shadowBlur = ratio === 0.95 ? 18 : 0;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  ctx.beginPath();
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96 + time / 15) * TAU;
    const inner = index % 6 === 0 ? 0.858 : 0.882;
    ctx.moveTo(x + Math.cos(angle) * rx * inner, y + Math.sin(angle) * ry * inner);
    ctx.lineTo(x + Math.cos(angle) * rx * 0.9, y + Math.sin(angle) * ry * 0.9);
  }
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = cyan(0.34);
  ctx.stroke();

  for (let index = 0; index < 3; index += 1) {
    const lead = (time / 12 + index / 3) * TAU;
    arc(ctx, x, y, rx * 0.95, ry * 0.95, lead - 0.16, lead + 0.12);
    ctx.strokeStyle = white(0.8);
    ctx.lineWidth = 2.25;
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#08bfff';
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  const scan = phase(time / 8.5);
  const scanRadius = 0.51 + scan * 0.45;
  arc(ctx, x, y, rx * scanRadius, ry * scanRadius);
  ctx.lineWidth = 1;
  ctx.strokeStyle = cyan(Math.sin(scan * Math.PI) * 0.32);
  ctx.stroke();
}

function drawBase(ctx: Context, point: FleetVehiclePoint, time: number, active: boolean) {
  const { x, y, baseWidth, baseHeight, glowStrength } = point;
  const rx = baseWidth / 2;
  const ry = baseHeight / 2;
  const strength = glowStrength * (0.88 + Math.sin(time * TAU / 6.8 + x * 0.01) * 0.1) *
    (active ? 1.4 : 1);
  glow(ctx, x, y + ry * 0.55, rx * 1.06, ry * 2.05, 0.29 * strength);
  glow(ctx, x, y + ry * 1.42, rx * 0.72, ry * 2.35, 0.15 * strength);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(x, y);
  ctx.scale(rx * 0.8, ry * 0.62);
  const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  contact.addColorStop(0, 'rgba(0, 4, 12, 0.94)');
  contact.addColorStop(1, 'rgba(0, 5, 14, 0)');
  ctx.fillStyle = contact;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  const rim = ctx.createLinearGradient(x, y - ry, x, y + ry);
  rim.addColorStop(0, cyan(0.5 * strength));
  rim.addColorStop(0.52, cyan(0.96 * strength));
  rim.addColorStop(1, white(0.98 * strength));
  arc(ctx, x, y, rx * 0.93, ry * 0.86);
  ctx.strokeStyle = rim;
  ctx.lineWidth = active ? 4.7 : 3.5;
  ctx.shadowColor = '#00bcff';
  ctx.shadowBlur = active ? 19 : 13;
  ctx.stroke();

  arc(ctx, x, y, rx * 0.72, ry * 0.58);
  ctx.strokeStyle = cyan(0.58 * strength);
  ctx.lineWidth = active ? 1.8 : 1.4;
  ctx.shadowBlur = active ? 11 : 7;
  ctx.stroke();

  arc(ctx, x, y, rx, ry);
  ctx.strokeStyle = cyan(0.54 * strength);
  ctx.lineWidth = 1.15;
  ctx.shadowBlur = 7;
  ctx.setLineDash([13, 7, 3, 6]);
  ctx.lineDashOffset = -time * 10 + (x + y) * 0.01;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  for (let marker = 0; marker < 3; marker += 1) {
    const lead = (time / 9 + marker / 3 + x * 0.0003) * TAU;
    arc(ctx, x, y, rx * 0.985, ry * 0.95, lead - 0.13, lead + 0.09);
    ctx.strokeStyle = white(0.9 * strength);
    ctx.lineWidth = active ? 2.9 : 2.35;
    ctx.shadowColor = '#35e8ff';
    ctx.shadowBlur = active ? 16 : 11;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

interface CanvasFlow extends FleetDataFlowGeometry {
  path: Path2D;
  lanes: [Path2D, Path2D];
}

function createCubicPath(controls: FleetDataFlowCubic) {
  const path = new Path2D();
  path.moveTo(controls[0].x, controls[0].y);
  path.bezierCurveTo(
    controls[1].x,
    controls[1].y,
    controls[2].x,
    controls[2].y,
    controls[3].x,
    controls[3].y,
  );
  return path;
}

function sampleOffsetCubic(controls: FleetDataFlowCubic, t: number, offset = 0) {
  const point = sampleFleetDataFlowCubic(controls, t);
  if (!offset) return point;
  const tangent = sampleFleetDataFlowTangent(controls, t);
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const taperedOffset = offset * Math.sin(Math.PI * t);
  return {
    x: point.x - tangent.y / length * taperedOffset,
    y: point.y + tangent.x / length * taperedOffset,
  };
}

function createOffsetPath(controls: FleetDataFlowCubic, offset: number) {
  const path = new Path2D();
  for (let step = 0; step <= 36; step += 1) {
    const point = sampleOffsetCubic(controls, step / 36, offset);
    if (step === 0) path.moveTo(point.x, point.y);
    else path.lineTo(point.x, point.y);
  }
  return path;
}

function createCanvasFlow(geometry: FleetDataFlowGeometry): CanvasFlow {
  return {
    ...geometry,
    path: createCubicPath(geometry.controls),
    lanes: [
      createOffsetPath(geometry.controls, -geometry.laneOffset),
      createOffsetPath(geometry.controls, geometry.laneOffset),
    ],
  };
}

function createFlowGradient(
  ctx: Context,
  flow: CanvasFlow,
  startAlpha: number,
  endAlpha: number,
  strength: number,
) {
  const gradient = ctx.createLinearGradient(flow.start.x, flow.start.y, flow.end.x, flow.end.y);
  gradient.addColorStop(0, cyan(startAlpha * strength));
  gradient.addColorStop(0.48, cyan((startAlpha * 0.45 + endAlpha * 0.55) * strength));
  gradient.addColorStop(0.84, cyan(endAlpha * 0.88 * strength));
  gradient.addColorStop(1, white(endAlpha * strength));
  return gradient;
}

function traceCubicSection(
  ctx: Context,
  controls: FleetDataFlowCubic,
  from: number,
  to: number,
  offset = 0,
) {
  ctx.beginPath();
  for (let step = 0; step <= 7; step += 1) {
    const t = from + (to - from) * (step / 7);
    const point = sampleOffsetCubic(controls, t, offset);
    if (step === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
}

function drawFlow(
  ctx: Context,
  flow: CanvasFlow,
  index: number,
  time: number,
  active: boolean,
) {
  const strength = active ? 1.25 : 1;
  const bandWidth = flow.bandWidth * (active ? 1.08 : 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Wide additive layers create a soft energy ribbon with a bright central core.
  ctx.strokeStyle = createFlowGradient(ctx, flow, 0.08, 0.27, strength);
  ctx.lineWidth = bandWidth;
  ctx.shadowColor = '#00c9ff';
  ctx.shadowBlur = bandWidth * 0.9;
  ctx.stroke(flow.path);

  ctx.strokeStyle = createFlowGradient(ctx, flow, 0.13, 0.42, strength);
  ctx.lineWidth = bandWidth * 0.54;
  ctx.shadowBlur = bandWidth * 0.46;
  ctx.stroke(flow.path);

  // Two tapered auxiliary tracks turn each connection into a coherent data band.
  ctx.strokeStyle = createFlowGradient(ctx, flow, 0.2, 0.8, strength);
  ctx.lineWidth = clamp(bandWidth * 0.16, 2, 2.8);
  ctx.shadowBlur = 10;
  flow.lanes.forEach((lane) => ctx.stroke(lane));

  ctx.strokeStyle = createFlowGradient(ctx, flow, 0.14, 0.52, strength);
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 6;
  ctx.stroke(flow.path);

  // Bright short segments make the direction toward the core immediately readable.
  for (let segment = 0; segment < flow.segmentCount; segment += 1) {
    const t = phase(time / flow.duration + segment / flow.segmentCount + index * 0.083);
    const fade = Math.min(1, t / 0.08, (1 - t) / 0.05);
    const brightness = (0.55 + 0.45 * t) * fade * strength;
    const tail = Math.max(0, t - clamp(20 / flow.pathLength, 0.035, 0.075));
    const lane = segment % 3;
    const offset = lane === 0 ? -flow.laneOffset : lane === 1 ? flow.laneOffset : 0;
    traceCubicSection(ctx, flow.controls, tail, t, offset);
    ctx.lineWidth = clamp(bandWidth * 0.32, 4.2, 5.8);
    ctx.strokeStyle = white(0.78 * brightness);
    ctx.shadowColor = '#29e3ff';
    ctx.shadowBlur = 12 + t * 8;
    ctx.stroke();
  }

  // Sparse particles have slight speed differences and brighten as they converge.
  for (let particle = 0; particle < flow.particleCount; particle += 1) {
    const particleDuration = flow.duration * (0.91 + (particle % 4) * 0.035);
    const t = phase(time / particleDuration + particle / flow.particleCount + index * 0.071);
    const absorption = t > 0.95 ? (1 - t) / 0.05 : 1;
    const brightness = (0.55 + 0.45 * t) * absorption * strength;
    const lane = particle % 3;
    const offset = lane === 0 ? -flow.laneOffset : lane === 1 ? flow.laneOffset : 0;
    const head = sampleOffsetCubic(flow.controls, t, offset);

    if (particle % 2 === 0) {
      traceCubicSection(ctx, flow.controls, Math.max(0, t - 0.026), t, offset);
      ctx.lineWidth = 1.8 + t;
      ctx.strokeStyle = cyan(0.62 * brightness);
      ctx.shadowBlur = 8 + t * 6;
      ctx.stroke();
    }

    const tangent = sampleFleetDataFlowTangent(flow.controls, t);
    const blockLength = 6 + t * 4;
    const blockHeight = 2.1 + t * 0.9;
    ctx.fillStyle = lane === 2 ? white(brightness) : cyan(0.88 * brightness);
    ctx.shadowColor = '#58edff';
    ctx.shadowBlur = 7 + t * 8;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(Math.atan2(tangent.y, tangent.x));
    ctx.fillRect(-blockLength / 2, -blockHeight / 2, blockLength, blockHeight);
    ctx.restore();
  }

  const arrival = Math.sin(phase(time / flow.duration + index * 0.17) * Math.PI) ** 4;
  glow(ctx, flow.end.x, flow.end.y, 12 + bandWidth * 0.35, 5 + bandWidth * 0.12, 0.22 * arrival * strength);
  ctx.restore();
}

function drawCore(ctx: Context, scene: FleetSceneGeometry, time: number, active: boolean) {
  const { x, y } = scene.target;
  const { rx, ry, rise } = getFleetCoreMetrics(scene);
  const interactionBoost = active ? 1.16 : 1;
  const pulse = (0.88 + Math.sin(time * TAU / 7) * 0.12) * interactionBoost;
  glow(ctx, x, y, rx * 1.62, ry * 2.25, 0.54 * pulse);
  glow(ctx, x, y - rise * 0.28, rx * 0.92, rise * 1.06, 0.19);
  glow(ctx, x, y + ry * 1.2, rx * 0.76, ry * 2.0, 0.19);

  for (let ring = 0; ring < 4; ring += 1) {
    const size = 0.47 + ring * 0.19;
    arc(ctx, x, y, rx * size, ry * size);
    ctx.lineWidth = ring === 1 ? 2.5 : 1;
    ctx.strokeStyle = ring === 1 ? white(0.88) : cyan(0.5);
    ctx.shadowColor = '#00bfff';
    ctx.shadowBlur = ring === 1 ? 13 : 0;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const offset of [0, 0.5]) {
    const t = phase(time / 6.4 + offset);
    const outer = 0.52 + t * 0.83;
    arc(ctx, x, y, rx * outer, ry * outer);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = cyan((1 - t) * 0.58);
    ctx.stroke();
  }

  const summit = y - rise * 0.58 * pulse;
  const surface = ctx.createLinearGradient(x, summit, x, y + ry * 0.58);
  surface.addColorStop(0, white(0.45));
  surface.addColorStop(0.34, cyan(0.34));
  surface.addColorStop(0.8, cyan(0.23));
  surface.addColorStop(1, cyan(0.61));
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.76, y);
  ctx.bezierCurveTo(x - rx * 0.44, y - 4, x - rx * 0.18, summit, x, summit);
  ctx.bezierCurveTo(x + rx * 0.18, summit, x + rx * 0.44, y - 4, x + rx * 0.76, y);
  ctx.ellipse(x, y, rx * 0.76, ry * 0.61, 0, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.strokeStyle = cyan(0.44);
  ctx.lineWidth = 1.25;
  ctx.stroke();
  glow(ctx, x, summit, 14, 13, 0.4 * pulse);

  for (let index = 0; index < 17; index += 1) {
    const across = (index - 8) / 8;
    const px = x + across * rx * 0.63;
    const foot = y + Math.cos(index * 2.4) * ry * 0.3;
    const height = rise * (0.31 + 0.69 * (1 - Math.abs(across))) *
      (0.62 + 0.37 * Math.sin(time * 0.83 + index * 1.73) ** 2);
    const pillar = ctx.createLinearGradient(px, foot - height, px, foot);
    pillar.addColorStop(0, cyan(0));
    pillar.addColorStop(0.36, cyan(0.31));
    pillar.addColorStop(1, white(0.67));
    ctx.fillStyle = pillar;
    ctx.fillRect(px - 0.65, foot - height, 1.3, height);
  }

  // Project the hologram contours onto the same ground ellipse.
  for (let step = 1; step <= 7; step += 1) {
    const r = step / 7;
    const altitude = rise * 0.57 * (1 - r) ** 1.38 * pulse;
    arc(ctx, x, y - altitude, rx * 0.76 * r, ry * 0.61 * r);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = cyan(0.44 - r * 0.12);
    ctx.stroke();
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * TAU + step * 0.18;
      ctx.fillStyle = white(0.3 + 0.28 * Math.sin(time * 1.3 + step * 1.4 + angle) ** 2);
      ctx.fillRect(x + Math.cos(angle) * rx * 0.76 * r, y - altitude + Math.sin(angle) * ry * 0.61 * r, 1.2, 1.2);
    }
  }

  for (let index = 0; index < 19; index += 1) {
    const t = phase(time / (3.9 + (index % 4) * 0.5) + index * 0.091);
    const angle = index * 2.39996;
    const px = x + Math.cos(angle) * rx * 0.51 * (0.5 + t * 0.5);
    const py = y + Math.sin(angle) * ry * 0.6 - t * rise * 1.24;
    const opacity = Math.sin(Math.PI * t) * 0.65;
    ctx.fillStyle = white(opacity);
    ctx.fillRect(px, py, index % 3 === 0 ? 2 : 1.2, index % 3 === 0 ? 2 : 1.2);
  }
}

export function ComputeFxCanvas({ geometry, activeNodeId }: ComputeFxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const { width, height, points } = geometry;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, 4096 / width, 4096 / height,
      Math.sqrt(2200000 / (width * height)));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const flows = createFleetDataFlows(geometry).map(createCanvasFlow);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let lastDraw = -Infinity;
    let inViewport = true;

    const paint = (time: number) => {
      ctx.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      drawGroundOrbit(ctx, geometry, time);
      flows.forEach((flow, index) => drawFlow(ctx, flow, index, time, flow.nodeId === activeNodeId));
      drawCore(ctx, geometry, time, activeNodeId !== null);
      points.forEach((point) => drawBase(ctx, point, time, point.nodeId === activeNodeId));
    };

    const run = (now: number) => {
      if (now - lastDraw >= 1000 / 30 - 1) {
        paint(now / 1000);
        lastDraw = now;
      }
      frame = requestAnimationFrame(run);
    };

    const syncAnimation = () => {
      cancelAnimationFrame(frame);
      if (document.hidden || !inViewport) return;
      if (reducedMotion.matches) paint(3);
      else frame = requestAnimationFrame(run);
    };

    const intersection = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      syncAnimation();
    });
    intersection.observe(canvas);
    document.addEventListener('visibilitychange', syncAnimation);
    reducedMotion.addEventListener('change', syncAnimation);
    syncAnimation();
    return () => {
      cancelAnimationFrame(frame);
      intersection.disconnect();
      document.removeEventListener('visibilitychange', syncAnimation);
      reducedMotion.removeEventListener('change', syncAnimation);
    };
  }, [geometry, activeNodeId]);

  const count = geometry.points.length;
  return (
    <canvas
      ref={canvasRef}
      className="fleet-scene__compute-fx"
      data-renderer="canvas2d"
      data-base-count={count}
      data-flow-count={count}
      aria-hidden="true"
    />
  );
}
