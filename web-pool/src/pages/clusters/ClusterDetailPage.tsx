import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Result,
  Select,
  Space,
  Statistic,
  Table,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { buildNodeDetailPath, ROUTES } from '../../routes/config';
import {
  assignNodeToCluster,
  deleteCluster,
  getCluster,
  getClusterNodes,
  getClusters,
  getEligibleClusterNodes,
  moveNodeToCluster,
  unassignNodeFromCluster,
  updateCluster,
} from '../../services/clusterService';
import type { ClusterInput, ClusterRecord } from '../../types/cluster';
import type { NodeDetail } from '../../types/node';
import { ClusterFormModal } from './components/ClusterFormModal';
import { ClusterNodeOption } from './components/ClusterNodeOption';
import './ClusterPage.css';

export function ClusterDetailPage() {
  const { clusterId = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const [cluster, setCluster] = useState<ClusterRecord | null>(null);
  const [members, setMembers] = useState<NodeDetail[]>([]);
  const [candidateNodes, setCandidateNodes] = useState<NodeDetail[]>([]);
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionNodeId, setActionNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [record, clusterNodes, clusterList, candidates] = await Promise.all([
        getCluster(clusterId),
        getClusterNodes(clusterId),
        getClusters(),
        getEligibleClusterNodes(),
      ]);
      setCluster(record);
      setMembers(clusterNodes);
      setClusters(clusterList.items);
      setCandidateNodes(candidates);
      setHeaderUpdatedAt(record.resourceSummary.updatedAt);
    } catch {
      setError('无法加载集群详情，集群可能不存在或 Backend 暂时不可用。');
    } finally {
      setLoading(false);
    }
  }, [clusterId, setHeaderUpdatedAt]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  const saveCluster = async (values: ClusterInput) => {
    setSaving(true);
    try {
      await updateCluster(clusterId, values);
      message.success('集群信息已更新');
      setEditing(false);
      await load();
    } catch {
      message.error('集群信息保存失败');
    } finally {
      setSaving(false);
    }
  };

  const assign = async (nodeId: string) => {
    setActionNodeId(nodeId);
    try {
      await assignNodeToCluster(clusterId, nodeId);
      message.success('节点已加入集群');
      setAssignOpen(false);
      setSelectedNodeId(undefined);
      await load();
    } catch {
      message.error('成员关系更新失败');
    } finally {
      setActionNodeId(null);
    }
  };

  const move = async (nodeId: string, targetClusterId: string) => {
    setActionNodeId(nodeId);
    try {
      await moveNodeToCluster(targetClusterId, nodeId);
      message.success('节点已迁移到目标集群');
      await load();
    } catch (moveError) {
      message.error(moveError instanceof Error ? moveError.message : '节点迁移失败');
    } finally {
      setActionNodeId(null);
    }
  };

  const confirmDelete = () => {
    if (!cluster) return;
    if (cluster.nodeCount > 0) {
      modal.info({
        title: '无法删除非空集群',
        content: `该集群当前仍包含 ${cluster.nodeCount} 个节点，请先将节点移出或迁移至其它集群后再删除。`,
        okText: '知道了',
      });
      return;
    }
    modal.confirm({
      title: '删除集群',
      content: (
        <div className="cluster-delete-confirmation">
          <p>集群名称：{cluster.name}</p>
          <p>
            Cluster ID：<code>{cluster.id}</code>
          </p>
          <p>当前节点数：{cluster.nodeCount}</p>
          <p>所属企业：{cluster.enterprise || '--'}</p>
          <p>所属项目：{cluster.project || '--'}</p>
          <p>删除后将移除该集群管理记录，该操作不会删除任何节点。</p>
        </div>
      ),
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true);
        try {
          await deleteCluster(cluster.id);
          message.success('空集群已删除');
          navigate(ROUTES.clusters, { replace: true });
        } catch (deleteError) {
          message.error(deleteError instanceof Error ? deleteError.message : '集群删除失败');
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const unassign = (node: NodeDetail) => {
    modal.confirm({
      title: `将 ${node.name} 移出当前集群？`,
      content: '节点、审批状态、资源池成员关系和调度开关均会保留。',
      okText: '确认移出',
      cancelText: '取消',
      onOk: async () => {
        setActionNodeId(node.id);
        try {
          await unassignNodeFromCluster(clusterId, node.id);
          message.success('节点已移出集群');
          await load();
        } catch {
          message.error('节点移出失败');
        } finally {
          setActionNodeId(null);
        }
      },
    });
  };

  const columns: ColumnsType<NodeDetail> = [
    {
      title: '节点名称',
      dataIndex: 'name',
      render: (name, node) => <Link to={buildNodeDetailPath(node.id)}>{name}</Link>,
    },
    {
      title: 'Node ID',
      dataIndex: 'id',
      width: 250,
      render: (value) => <code className="node-id">{value}</code>,
    },
    {
      title: 'IP',
      width: 145,
      render: (_, node) => node.ipAddress ?? node.network.ipv4Address ?? '--',
    },
    {
      title: '在线状态',
      dataIndex: 'operationalStatus',
      render: (status) => <StatusBadge status={status} />,
    },
    { title: 'CPU', render: (_, node) => `${node.resources.cpu.total} Core` },
    { title: 'GPU', render: (_, node) => `${node.resources.gpu?.total ?? 0} Device` },
    { title: 'VRAM', render: (_, node) => `${node.videoMemory?.total ?? 0} GB` },
    { title: 'NPU', render: (_, node) => `${node.resources.npu?.total ?? 0} TOPS` },
    {
      title: '最后上报时间',
      dataIndex: 'lastResourceAt',
      render: (value) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--'),
    },
    {
      title: '成员管理',
      key: 'actions',
      width: 300,
      render: (_, node) => (
        <Space>
          <Select
            size="small"
            className="cluster-detail__move-select"
            placeholder="迁移到..."
            suffixIcon={<SwapOutlined />}
            options={clusters
              .filter((item) => item.id !== clusterId)
              .map((item) => ({ label: item.name, value: item.id }))}
            onChange={(target) => void move(node.id, target)}
          />
          <Button
            size="small"
            danger
            icon={<UserDeleteOutlined />}
            loading={actionNodeId === node.id}
            onClick={() => unassign(node)}
          >
            移出
          </Button>
        </Space>
      ),
    },
  ];

  if (!cluster && loading) {
    return (
      <main className="cluster-page">
        <Card loading />
      </main>
    );
  }

  if (!cluster) {
    return (
      <main className="cluster-page">
        <Result
          status="404"
          title="集群不可用"
          subTitle={error ?? '没有找到该集群。'}
          extra={<Button onClick={() => navigate(ROUTES.clusters)}>返回集群列表</Button>}
        />
      </main>
    );
  }

  const summary = cluster.resourceSummary;
  const resourceCards = [
    ['CPU 总量', summary.resources.cpu.total, 'Core'],
    ['GPU 总量', summary.resources.gpu.total, 'Device'],
    ['VRAM 总量', summary.videoMemory.total, 'GB'],
    ['NPU 总量', summary.resources.npu.total, 'TOPS'],
    ['DLA 总量', summary.resources.dla.total, 'Device'],
    ['内存', summary.memory.total, 'GB'],
    ['存储', summary.storage.total, 'GB'],
  ] as const;

  return (
    <main className="cluster-page">
      <PageHeader
        eyebrow="CLUSTER DETAIL"
        title={cluster.name}
        description="查看集群基础信息、实时资源汇总和正式节点归属。"
        extra={
          <Space className="cluster-page__header-actions" size={8} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(ROUTES.clusters)}>
              返回列表
            </Button>
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              编辑
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button danger icon={<DeleteOutlined />} loading={deleting} onClick={confirmDelete}>
              删除集群
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssignOpen(true)}>
              添加节点
            </Button>
          </Space>
        }
      />
      {error && <Alert type="warning" showIcon message={error} />}

      <Card className="cluster-page__card" title="基础信息">
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Cluster ID">
            <code>{cluster.id}</code>
          </Descriptions.Item>
          <Descriptions.Item label="名称">{cluster.name}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <StatusBadge status={cluster.status} />
          </Descriptions.Item>
          <Descriptions.Item label="版本">{cluster.version}</Descriptions.Item>
          <Descriptions.Item label="节点数量">{cluster.nodeCount} 个</Descriptions.Item>
          <Descriptions.Item label="所属企业">{cluster.enterprise || '--'}</Descriptions.Item>
          <Descriptions.Item label="所属项目">{cluster.project || '--'}</Descriptions.Item>
          <Descriptions.Item label="管理端点">
            {cluster.managementEndpoint || '--'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <section className="cluster-resource-grid" aria-label="集群资源汇总">
        {resourceCards.map(([title, value, unit]) => (
          <Card key={title} className="cluster-resource-grid__card">
            <Statistic
              title={title}
              value={value}
              suffix={unit}
              precision={unit === 'GB' ? 1 : 0}
            />
          </Card>
        ))}
      </section>

      <Card className="cluster-page__card" title="成员节点">
        {members.length === 0 && !loading ? (
          <Empty description="该集群尚未分配节点" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={members}
            loading={loading}
            scroll={{ x: 1600 }}
            pagination={false}
          />
        )}
      </Card>

      <Modal
        title="添加节点"
        open={assignOpen}
        width={720}
        okText="确认加入"
        cancelText="取消"
        confirmLoading={selectedNodeId ? actionNodeId === selectedNodeId : false}
        okButtonProps={{ disabled: !selectedNodeId }}
        onCancel={() => {
          setAssignOpen(false);
          setSelectedNodeId(undefined);
        }}
        onOk={() => selectedNodeId && void assign(selectedNodeId)}
      >
        <Alert
          type="info"
          showIcon
          message="仅显示可直接加入的未分配节点"
          description="候选节点必须已注册、已批准、仍在资源池、当前 ONLINE；是否允许调度不会影响集群归属。已有归属的节点请使用成员行内的“迁移到”操作。"
          className="cluster-detail__modal-alert"
        />
        <Select
          showSearch
          virtual={false}
          className="cluster-detail__node-select"
          placeholder="选择节点"
          filterOption={(input, option) => {
            const node = candidateNodes.find((item) => item.id === option?.value);
            if (!node) return false;
            return `${node.name} ${node.hostname ?? ''} ${node.ipAddress ?? ''} ${node.network.ipv4Address} ${node.id}`
              .toLocaleLowerCase()
              .includes(input.toLocaleLowerCase());
          }}
          value={selectedNodeId}
          options={candidateNodes.map((node) => ({
            value: node.id,
            label: node.name,
          }))}
          optionRender={(option) => {
            const node = candidateNodes.find((item) => item.id === option.value);
            return node ? <ClusterNodeOption node={node} /> : option.label;
          }}
          onChange={setSelectedNodeId}
        />
      </Modal>

      <ClusterFormModal
        open={editing}
        loading={saving}
        cluster={cluster}
        candidateNodes={[]}
        onCancel={() => setEditing(false)}
        onSubmit={saveCluster}
      />
    </main>
  );
}
