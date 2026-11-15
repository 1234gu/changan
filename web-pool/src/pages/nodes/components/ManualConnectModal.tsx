import { useEffect } from 'react';
import { Alert, Form, Input, Modal } from 'antd';

export interface ManualConnectValues {
  nodeAddress: string;
  nodeName?: string;
}

interface ManualConnectModalProps {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onSubmit: (values: ManualConnectValues) => void | Promise<void>;
}

export function ManualConnectModal({ open, loading, onCancel, onSubmit }: ManualConnectModalProps) {
  const [form] = Form.useForm<ManualConnectValues>();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [form, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit({
      nodeAddress: values.nodeAddress.trim(),
      nodeName: values.nodeName?.trim() || undefined,
    });
  };

  return (
    <Modal
      title="手动接入节点"
      open={open}
      confirmLoading={loading}
      okText="验证并接入"
      cancelText="取消"
      onCancel={onCancel}
      onOk={() => void handleSubmit()}
      destroyOnClose
    >
      <Alert
        type="info"
        showIcon
        message="节点接入说明"
        description="节点主动注册是推荐的主要接入方式；此入口仅用于已知节点地址的备用接入。平台会验证目标节点的身份及接入能力，不会扫描网络，验证失败时也不会创建无效节点记录。"
        style={{ marginBottom: 20 }}
      />
      <Form form={form} layout="vertical" requiredMark="optional" preserve={false}>
        <Form.Item
          name="nodeAddress"
          label="节点接入地址"
          rules={[
            { required: true, whitespace: true, message: '请输入节点接入地址' },
            {
              pattern: /^(?:https?:\/\/)?[^\s/]+(?::\d{1,5})?\/?$/i,
              message: '请输入有效的 HTTP(S) 节点地址，例如 http://192.168.1.21:8765',
            },
          ]}
          extra="请输入目标节点接入服务的网络地址，并确保管理平台与目标节点之间网络互通。"
        >
          <Input placeholder="例如：http://192.168.1.21:8765" autoComplete="off" />
        </Form.Item>
        <Form.Item name="nodeName" label="节点名称（可选）">
          <Input placeholder="留空时使用节点上报的主机名" maxLength={255} />
        </Form.Item>
        <Alert
          type="info"
          showIcon
          message="节点接入后保持未分配"
          description="审批并进入资源池后，请在“集群管理”中按 Node ID 建立正式集群归属。"
        />
      </Form>
    </Modal>
  );
}
