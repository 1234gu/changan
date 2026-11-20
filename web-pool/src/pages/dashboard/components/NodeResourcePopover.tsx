import dayjs from 'dayjs';
import type { NodeResourceContribution } from '../../../types/computePool';
import type { NodeSummary } from '../../../types/node';
import { getNodeResourceSnapshot } from '../dashboardModel';

interface NodeResourcePopoverProps {
  node: NodeSummary;
  displayName: string;
  resource?: NodeResourceContribution;
}

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatPercent = (value?: number) => (value === undefined ? '--' : `${formatNumber(value)}%`);

const formatCapacity = (value?: number) =>
  value === undefined ? '--' : `${formatNumber(value)} GB`;

export function NodeResourcePopover({ node, displayName, resource }: NodeResourcePopoverProps) {
  const snapshot = getNodeResourceSnapshot(node, resource);
  const npu = snapshot.npuSupported
    ? `${formatNumber(snapshot.npuTops)} TOPS · ${formatPercent(snapshot.npuUtilization)}`
    : '不支持';
  const dla = snapshot.dlaSupported
    ? `${formatNumber(snapshot.dlaDevices)} Device · ${formatPercent(snapshot.dlaUtilization)}`
    : '不支持';

  return (
    <div className="node-resource-popover" aria-label={`${displayName} 资源摘要`}>
      <div className="node-resource-popover__header">
        <div>
          <strong>{displayName}</strong>
          <span>{node.cluster?.name ?? '未加入集群'}</span>
        </div>
        <span className="node-resource-popover__status">状态：在线</span>
      </div>
      <dl>
        <div>
          <dt>真实节点</dt>
          <dd title={node.name}>{node.name}</dd>
        </div>
        {node.hostname && node.hostname !== node.name ? (
          <div>
            <dt>主机名</dt>
            <dd title={node.hostname}>{node.hostname}</dd>
          </div>
        ) : null}
        <div>
          <dt>Architecture</dt>
          <dd>{node.architecture}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>
            {formatNumber(snapshot.cpuCores)} Core · {formatPercent(snapshot.cpuUtilization)}
          </dd>
        </div>
        <div>
          <dt>GPU</dt>
          <dd>
            {formatNumber(snapshot.gpuCount)} GPU · {formatPercent(snapshot.gpuUtilization)}
          </dd>
        </div>
        <div>
          <dt>GPU 显存</dt>
          <dd>
            {formatCapacity(snapshot.gpuMemoryGb)}
            {snapshot.gpuMemoryArchitecture === 'unified' ? '（统一内存）' : ''}
          </dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>
            {formatCapacity(snapshot.memoryTotalGb)} · {formatPercent(snapshot.memoryUtilization)}
          </dd>
        </div>
        <div>
          <dt>NPU</dt>
          <dd>{npu}</dd>
        </div>
        <div>
          <dt>DLA</dt>
          <dd>{dla}</dd>
        </div>
        <div>
          <dt>最近上报</dt>
          <dd>
            {snapshot.lastReportedAt
              ? dayjs(snapshot.lastReportedAt).format('YYYY-MM-DD HH:mm:ss')
              : '--'}
          </dd>
        </div>
      </dl>
    </div>
  );
}
