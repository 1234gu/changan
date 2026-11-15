import type { CSSProperties, ReactNode } from 'react';
import { Progress } from 'antd';
import { Link } from 'react-router-dom';
import type { ResourceSummary } from '../types/resource';

interface ResourceProgressProps extends ResourceSummary {
  name: string;
  color?: string;
  to?: string;
}

export function ResourceProgress({
  name,
  total,
  used,
  available,
  utilization,
  unit,
  color = '#1677ff',
  to,
}: ResourceProgressProps) {
  const content: ReactNode = (
    <>
      <div className="resource-progress__header">
        <span className="resource-progress__name">{name}</span>
        <span className="resource-progress__amount">
          <strong>{used}</strong> / {total} {unit}
        </span>
      </div>
      <Progress
        percent={utilization}
        strokeColor={color}
        trailColor="#edf1f7"
        size={['100%', 8]}
        format={(percent) => `${Number(percent).toFixed(1)}%`}
      />
      <div className="resource-progress__footer">
        <span>可用</span>
        <strong>
          {available} {unit}
        </strong>
      </div>
    </>
  );
  const className = `resource-progress${to ? ' resource-progress--interactive' : ''}`;
  const style = { '--resource-color': color } as CSSProperties;

  return to ? (
    <Link
      className={className}
      style={style}
      to={to}
      aria-label={`${name}：已用 ${used}，总量 ${total} ${unit}，利用率 ${utilization}%`}
    >
      {content}
    </Link>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
