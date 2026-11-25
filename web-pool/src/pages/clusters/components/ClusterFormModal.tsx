import { Alert, Form, Input, Modal, Select, Spin } from 'antd';
import type { ClusterInput, ClusterRecord } from '../../../types/cluster';
import type { NodeDetail } from '../../../types/node';
import { ClusterNodeOption } from './ClusterNodeOption';

interface ClusterFormModalProps {
  open: boolean;
  loading: boolean;
  cluster?: ClusterRecord | null;
  candidateNodes?: NodeDetail[];
  candidateLoading?: boolean;
  candidateError?: string | null;
  onCancel: () => void;
  onSubmit: (values: ClusterInput) => void | Promise<void>;
}

export function ClusterFormModal({
  open,
  loading,
  cluster,
  candidateNodes = [],
  candidateLoading = false,
  candidateError = null,
  onCancel,
  onSubmit,
}: ClusterFormModalProps) {
  const [form] = Form.useForm<ClusterInput>();

  const initialValues = cluster
    ? {
        name: cluster.name,
        version: cluster.version,
        enterprise: cluster.enterprise,
        project: cluster.project,
        managementEndpoint: cluster.managementEndpoint,
        nodeIds: [],
      }
    : {
        name: '',
        version: '0.1.0',
        enterprise: '',
        project: '',
        managementEndpoint: undefined,
        nodeIds: [],
      };

  const submit = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  return (
    <Modal
      rootClassName="cluster-form-modal"
      title={cluster ? '编辑集群' : '创建集群'}
      open={open}
      confirmLoading={loading}
      okText={cluster ? '保存' : '创建'}
      cancelText="取消"
      destroyOnClose
      width={760}
      onCancel={onCancel}
      onOk={() => void submit()}
    >
      <Form
        key={cluster ? cluster.id : 'create'}
        form={form}
        initialValues={initialValues}
        layout="vertical"
        requiredMark="optional"
        preserve={false}
      >
        <Form.Item
          name="name"
          label="集群名称"
          rules={[{ required: true, whitespace: true, message: '请输入集群名称' }]}
        >
          <Input maxLength={100} placeholder="例如：Cluster-A" />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本"
          rules={[{ required: true, whitespace: true, message: '请输入版本' }]}
        >
          <Input maxLength={100} placeholder="例如：0.1.0" />
        </Form.Item>
        <Form.Item
          name="enterprise"
          label="所属企业"
          rules={[{ required: true, whitespace: true, message: '请输入所属企业' }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          name="project"
          label="所属项目"
          rules={[{ required: true, whitespace: true, message: '请输入所属项目' }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          name="managementEndpoint"
          label="管理端点（可选）"
          extra="预留给未来 K8s/K3s API 管理端点，不表示成员节点 IP。"
          rules={[{ type: 'url', message: '请输入有效的 HTTP(S) URL' }]}
        >
          <Input maxLength={2048} placeholder="https://cluster.example.local" />
        </Form.Item>
        {!cluster && (
          <>
            <Form.Item
              name="nodeIds"
              label="选择节点（可选）"
              extra="成员关系按 Node ID 建立；不选择也可创建空集群，后续可在详情页添加。"
            >
              <Select
                popupClassName="cluster-node-select-dropdown"
                mode="multiple"
                allowClear
                showSearch
                virtual={false}
                maxTagCount="responsive"
                filterOption={(input, option) => {
                  const node = candidateNodes.find((item) => item.id === option?.value);
                  if (!node) return false;
                  return `${node.name} ${node.hostname ?? ''} ${node.ipAddress ?? ''} ${node.network.ipv4Address} ${node.id}`
                    .toLocaleLowerCase()
                    .includes(input.toLocaleLowerCase());
                }}
                placeholder="选择已批准、在资源池中、ONLINE 且未归属的节点"
                loading={candidateLoading}
                notFoundContent={candidateLoading ? <Spin size="small" /> : '暂无符合条件的节点'}
                options={candidateNodes.map((node) => ({
                  value: node.id,
                  label: node.name,
                }))}
                optionRender={(option) => {
                  const node = candidateNodes.find((item) => item.id === option.value);
                  return node ? <ClusterNodeOption node={node} /> : option.label;
                }}
              />
            </Form.Item>
            {candidateError && (
              <Alert
                type="warning"
                showIcon
                message="候选节点加载失败"
                description={candidateError}
              />
            )}
          </>
        )}
        <Alert type="info" showIcon message="节点成员只能从已注册 Node 中按 Node ID 选择。" />
      </Form>
    </Modal>
  );
}
