import type { CSSProperties, ReactNode } from 'react';
import { Card } from 'antd';
import { Link } from 'react-router-dom';

interface KpiCardProps {
  title: string;
  value: number | string;
  unit?: string;
  icon: ReactNode;
  accentColor?: string;
  hint?: string;
  details?: Array<{ label: string; value: string }>;
  variant?: 'default' | 'hud';
  progress?: number;
  to: string;
}

export function KpiCard({
  title,
  value,
  unit,
  icon,
  accentColor = '#1677ff',
  hint,
  details,
  variant = 'default',
  progress,
  to,
}: KpiCardProps) {
  const normalizedProgress =
    typeof progress === 'number' ? Math.min(100, Math.max(0, Math.round(progress))) : undefined;
  const cardStyle = {
    '--kpi-accent': accentColor,
    '--kpi-progress': normalizedProgress ?? 0,
  } as CSSProperties;

  return (
    <Link
      className="kpi-card-link"
      to={to}
      aria-label={`${title}：${value}${unit ? ` ${unit}` : ''}${hint ? `，${hint}` : ''}`}
    >
      <Card
        className={`kpi-card${variant === 'hud' ? ' kpi-card--hud' : ''}`}
        style={cardStyle}
        hoverable
      >
        {variant === 'hud' ? (
          <div className="kpi-card__hud-layout">
            <span className="kpi-card__icon kpi-card__icon--hud" aria-hidden="true">
              {icon}
            </span>
            <div className="kpi-card__hud-copy">
              <span className="kpi-card__title">{title}</span>
              <div className="kpi-card__value-row">
                <strong className="kpi-card__value">{value}</strong>
                {unit && <span className="kpi-card__unit">{unit}</span>}
              </div>
              {hint && <span className="kpi-card__hint">{hint}</span>}
            </div>
            {normalizedProgress !== undefined && (
              <span className="kpi-card__progress" aria-hidden="true">
                <strong>{normalizedProgress}%</strong>
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="kpi-card__topline">
              <span className="kpi-card__title">{title}</span>
              <span className="kpi-card__icon" aria-hidden="true">
                {icon}
              </span>
            </div>
            <div className="kpi-card__value-row">
              <strong className="kpi-card__value">{value}</strong>
              {unit && <span className="kpi-card__unit">{unit}</span>}
            </div>
            {details && details.length > 0 && (
              <dl className="kpi-card__details">
                {details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {hint && <span className="kpi-card__hint">{hint}</span>}
          </>
        )}
      </Card>
    </Link>
  );
}
