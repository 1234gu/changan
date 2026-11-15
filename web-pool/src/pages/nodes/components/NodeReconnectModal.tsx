import { Alert, Button, Descriptions, List, Modal, Space, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { StatusBadge } from '../../../components/StatusBadge';
import type { NodeReconnectGuidance } from '../../../types/node';
import { formatDateTime } from '../presentation';

interface NodeReconnectModalProps {
  open: boolean;
  guidance: NodeReconnectGuidance | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function NodeReconnectModal({
  open,
  guidance,
  loading,
  onClose,
  onRefresh,
}: NodeReconnectModalProps) {
  return (
    <Modal
      open={open}
      title={guidance ? `${guidance.nodeName} · 重新接入` : '重新接入'}
      width={680}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={onRefresh}>
            检查节点状态
          </Button>
        </Space>
      }
    >
      {guidance && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="管理平台无法远程启动已停止的节点服务"
            description="当前采用节点主动连接模式。此操作只生成真实恢复指引，不会在前端伪造在线状态，也不会自动加入资源池或恢复调度。"
          />

          <Descriptions column={2} size="small" colon={false} bordered>
            <Descriptions.Item label="当前状态">
              <StatusBadge status={guidance.currentStatus} />
            </Descriptions.Item>
            <Descriptions.Item label="资源池关系">
              <Tag color={guidance.poolMembership === 'in_pool' ? 'success' : 'default'}>
                {guidance.poolMembership === 'in_pool' ? '已加入' : '已移出'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="可调度">
              {guidance.schedulable ? '是' : '否'}
            </Descriptions.Item>
            <Descriptions.Item label="请求时间">
              {formatDateTime(guidance.requestedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="Node ID" span={2}>
              <Typography.Text code copyable>
                {guidance.nodeId}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>

          <List
            size="small"
            header={<strong>节点服务恢复步骤</strong>}
            bordered
            dataSource={guidance.guidance}
            renderItem={(item, index) => (
              <List.Item>
                <Typography.Text>
                  {index + 1}. {item}
                </Typography.Text>
              </List.Item>
            )}
          />

          <Alert
            type="info"
            showIcon
            message="历史授权会按原 Node ID 自动恢复"
            description={
              guidance.credentialReissueSupported
                ? '可在身份凭据失效时重新签发接入凭据。'
                : '当前版本尚未启用独立凭据重签；请保留节点状态文件中的持久化 Node ID。若该文件丢失，平台会将其识别为新节点并重新审批。'
            }
          />
        </Space>
      )}
    </Modal>
  );
}
