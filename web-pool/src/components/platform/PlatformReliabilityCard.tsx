import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Progress, Tooltip } from 'antd';
import type { PlatformSummary } from '../../services/platformService';
import './platform.css';

const percent = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 10);

/** Task completion rate and node reliability, computed by the scheduling platform. */
export function PlatformReliabilityStrip({ platform }: { platform?: PlatformSummary | null }) {
  if (!platform) {
    return <div className="platform-strip platform-strip--empty">调度平台统计暂不可用</div>;
  }
  const { tasks, reliability } = platform;
  const rate = percent(tasks.completionRate);
  return (
    <div className="platform-strip" aria-label="任务执行与可靠性">
      <div className="platform-strip__rate">
        <Progress
          type="dashboard"
          percent={rate ?? 0}
          size={96}
          strokeColor="#08a88a"
          format={() => (rate === null ? '—' : `${rate}%`)}
        />
        <Tooltip title={tasks.definition}>
          <span>任务完成率</span>
        </Tooltip>
      </div>
      <dl className="platform-strip__metrics">
        <div>
          <dt>累计任务</dt>
          <dd>{tasks.total}</dd>
        </div>
        <div>
          <dt>已完成</dt>
          <dd>{tasks.succeeded}</dd>
        </div>
        <div>
          <dt>待执行</dt>
          <dd>{tasks.waiting}</dd>
        </div>
        <div>
          <dt>已完成分片</dt>
          <dd>
            {tasks.segmentsSucceeded}
            <small> / {tasks.segmentsTotal}</small>
          </dd>
        </div>
        <div>
          <dt>分片重试</dt>
          <dd>{tasks.segmentRetries}</dd>
        </div>
        <div>
          <dt>节点失联事件</dt>
          <dd>
            {reliability.incidentCount}
            {reliability.openIncidents > 0 && <small className="is-warning"> · {reliability.openIncidents} 未恢复</small>}
          </dd>
        </div>
        <div>
          <dt>平均恢复耗时</dt>
          <dd>{reliability.meanRecoverySeconds === null ? '—' : `${reliability.meanRecoverySeconds} s`}</dd>
        </div>
        <div>
          <dt>执行节点绑定</dt>
          <dd>
            {platform.boundNodes}
            <small> / {platform.executionNodes}</small>
          </dd>
        </div>
      </dl>
      <span className="platform-strip__icon">
        <SafetyCertificateOutlined />
      </span>
    </div>
  );
}
