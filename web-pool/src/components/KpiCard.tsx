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
  to,
}: KpiCardProps) {
  return (
    <Link
      className="kpi-card-link"
      to={to}
      aria-label={`${title}：${value}${unit ? ` ${unit}` : ''}`}
    >
      <Card className="kpi-card" style={{ '--kpi-accent': accentColor } as CSSProperties} hoverable>
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
      </Card>
    </Link>
  );
}
