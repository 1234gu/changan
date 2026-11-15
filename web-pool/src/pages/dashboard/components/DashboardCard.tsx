import type { ReactNode } from 'react';
import { Card } from 'antd';

interface DashboardCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function DashboardCard({
  icon,
  title,
  subtitle,
  extra,
  className,
  children,
}: DashboardCardProps) {
  const cardClassName = ['dashboard-card', className].filter(Boolean).join(' ');

  return (
    <Card
      className={cardClassName}
      title={
        <div className="section-title">
          <span className="section-title__icon" aria-hidden="true">
            {icon}
          </span>
          <div>
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
        </div>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
