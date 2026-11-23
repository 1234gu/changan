import { Tag } from 'antd';
import type { NodeDetail } from '../../../types/node';

interface ClusterNodeOptionProps {
  node: NodeDetail;
}

export function ClusterNodeOption({ node }: ClusterNodeOptionProps) {
  const ipAddress = node.ipAddress ?? node.network.ipv4Address ?? '--';
  const hostname = node.hostname && node.hostname !== node.name ? node.hostname : undefined;

  return (
    <div className="cluster-node-option">
      <div className="cluster-node-option__title">
        <strong>{node.name}</strong>
        {hostname && <span>/ {hostname}</span>}
        <code>{ipAddress}</code>
        <Tag color="success">ONLINE</Tag>
      </div>
      <div className="cluster-node-option__meta">
        <span>CPU {node.resources.cpu.total} Core</span>
        <span>GPU {node.resources.gpu?.total ?? 0}</span>
        <span>显存 {node.videoMemory?.total ?? 0} GB</span>
        <span>NPU {node.resources.npu?.total ?? 0} TOPS</span>
        <span>{node.architecture}</span>
      </div>
    </div>
  );
}
