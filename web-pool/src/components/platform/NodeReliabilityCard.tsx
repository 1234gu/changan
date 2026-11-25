import { useEffect, useState } from 'react';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Card, Empty, Tag, Timeline } from 'antd';
import dayjs from 'dayjs';
import { getNodeReliability, type NodeReliability } from '../../services/platformService';
import './platform.css';

const time = (seconds?: number) => (seconds ? dayjs(seconds * 1000).format('MM-DD HH:mm:ss') : '—');

/**
 * Reliability timeline for one physical node. The scheduler is the source: link-loss
 * incidents, affected work, link recovery and task reconciliation recorded by execution.
 */
export function NodeReliabilityCard({ nodeId }: { nodeId: string }) {
  const [data, setData] = useState<NodeReliability>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    const load = () =>
      getNodeReliability(nodeId)
        .then((value) => active && (setData(value), setError(undefined)))
        .catch((reason: unknown) => active && setError(String(reason)));
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [nodeId]);

  const attempts = data?.attempts;
  return (
    <Card
      className="node-detail-card"
      title={
        <span className="node-detail-card__title">
          <SafetyCertificateOutlined /> 可靠性记录
        </span>
      }
      extra={
        <span className="node-detail-card__count">
          {data?.executionNodeId
            ? `执行节点 ${data.executionNodeId}`
            : error
              ? '加载失败'
              : '未绑定执行节点'}
        </span>
      }
    >
      <div className="node-reliability-metrics" aria-label="可靠性指标">
        <div>
          <span>分片执行</span>
          <strong>{attempts ? attempts.total : '—'}</strong>
        </div>
        <div>
          <span>成功</span>
          <strong>{attempts ? attempts.succeeded : '—'}</strong>
        </div>
        <div>
          <span>失败/超时</span>
          <strong>{attempts ? attempts.failed : '—'}</strong>
        </div>
        <div>
          <span>平均恢复</span>
          <strong>
            {data?.meanRecoverySeconds == null ? '—' : `${data.meanRecoverySeconds} s`}
          </strong>
        </div>
      </div>
      {data && data.incidents.length > 0 ? (
        <div className="reliability-timeline">
          <Timeline
            items={data.incidents.map((incident) => ({
              color: incident.linkRestoredAt ? 'green' : 'red',
              children: (
                <div>
                  <div>
                    <Tag color={incident.linkRestoredAt ? 'success' : 'error'} bordered={false}>
                      {incident.linkRestoredAt ? '已恢复' : '未恢复'}
                    </Tag>
                    {incident.reason}
                  </div>
                  <div className="reliability-timeline__meta">
                    失联 {time(incident.detectedAt)} · 恢复 {time(incident.linkRestoredAt)}
                    {incident.recoverySeconds != null && `（${incident.recoverySeconds} s）`} · 影响{' '}
                    {incident.affectedCount} 个执行 · 任务核对 {time(incident.taskReconciledAt)}
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无失联或恢复记录" />
      )}
    </Card>
  );
}
