import {
  CheckCircleOutlined,
  CloudServerOutlined,
  ScheduleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KpiCard } from '../../../components/KpiCard';
import { ROUTES } from '../../../routes/config';

interface NodeSummaryCardsProps {
  summary: {
    total: number;
    online: number;
    schedulable: number;
    abnormal: number;
  };
}

export function NodeSummaryCards({ summary }: NodeSummaryCardsProps) {
  return (
    <section className="node-summary-grid" aria-label="节点汇总">
      <KpiCard
        title="节点总数"
        value={summary.total}
        unit="台"
        icon={<CloudServerOutlined />}
        hint="全部已纳管节点"
        accentColor="#356df3"
        to={ROUTES.nodes}
      />
      <KpiCard
        title="在线节点"
        value={summary.online}
        unit="台"
        icon={<CheckCircleOutlined />}
        hint="当前心跳正常"
        accentColor="#08a88a"
        to={`${ROUTES.nodes}?status=online`}
      />
      <KpiCard
        title="可调度节点"
        value={summary.schedulable}
        unit="台"
        icon={<ScheduleOutlined />}
        hint="已进入调度候选集"
        accentColor="#12a4c7"
        to={`${ROUTES.nodes}?schedulable=true`}
      />
      <KpiCard
        title="异常节点"
        value={summary.abnormal}
        unit="台"
        icon={<WarningOutlined />}
        hint="运行或资源采集异常"
        accentColor="#e75555"
        to={`${ROUTES.nodes}?status=abnormal`}
      />
    </section>
  );
}
