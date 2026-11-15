import { useCallback, useEffect, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Result, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import type { MainLayoutOutletContext } from '../../layouts/MainLayout';
import { buildClusterDetailPath } from '../../routes/config';
import {
  createCluster,
  deleteCluster,
  getEligibleClusterNodes,
  getClusters,
  updateCluster,
} from '../../services/clusterService';
import type { ClusterInput, ClusterRecord } from '../../types/cluster';
import type { NodeDetail } from '../../types/node';
import { ClusterFormModal } from './components/ClusterFormModal';
import './ClusterPage.css';

export function ClusterListPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { setHeaderUpdatedAt } = useOutletContext<MainLayoutOutletContext>();
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClusterRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidateNodes, setCandidateNodes] = useState<NodeDetail[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getClusters();
      setClusters(result.items);
      setHeaderUpdatedAt(result.updatedAt);
    } catch {
      setError('无法加载集群列表，请检查 Backend 连接后重试。');
    } finally {
      setLoading(false);
    }
  }, [setHeaderUpdatedAt]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  const submit = async (values: ClusterInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateCluster(editing.id, values);
        message.success('集群信息已更新');
      } else {
        await createCluster(values);
        message.success('集群已创建');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (saveError) {
      message.error(
        saveError instanceof Error
          ? `集群保存失败：${saveError.message}`
          : '集群保存失败，请检查字段或节点状态。',
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreate = async () => {
    setEditing(null);
    setFormOpen(true);
    setCandidateLoading(true);
    setCandidateError(null);
    try {
      setCandidateNodes(await getEligibleClusterNodes());
    } catch (candidateLoadError) {
      setCandidateNodes([]);
      setCandidateError(
        candidateLoadError instanceof Error
          ? candidateLoadError.message
          : '无法从 Backend 获取候选节点。',
      );
    } finally {
      setCandidateLoading(false);
    }
  };

  const confirmDelete = (cluster: ClusterRecord) => {
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
        try {
          await deleteCluster(cluster.id);
          message.success('空集群已删除');
          await load();
        } catch {
          message.error('删除失败：集群不存在或仍有成员。');
        }
      },
    });
  };

  const columns: ColumnsType<ClusterRecord> = [
    {
      title: '集群名称',
      dataIndex: 'name',
      fixed: 'left',
      render: (name: string, cluster) => (
        <Button type="link" onClick={() => navigate(buildClusterDetailPath(cluster.id))}>
          {name}
        </Button>
      ),
    },
    { title: '状态', dataIndex: 'status', render: (status) => <StatusBadge status={status} /> },
    { title: '版本', dataIndex: 'version' },
    { title: '节点数量', dataIndex: 'nodeCount', render: (value) => `${value} 个` },
    {
      title: 'CPU',
      render: (_, cluster) => `${cluster.resourceSummary.resources.cpu.total} Core`,
    },
    {
      title: 'GPU',
      render: (_, cluster) => `${cluster.resourceSummary.resources.gpu.total} Device`,
    },
    {
      title: 'NPU',
      render: (_, cluster) => `${cluster.resourceSummary.resources.npu.total} TOPS`,
    },
    {
      title: '显存',
      render: (_, cluster) => `${cluster.resourceSummary.videoMemory.total} GB`,
    },
    { title: '所属企业', dataIndex: 'enterprise', render: (value) => value || '--' },
    { title: '所属项目', dataIndex: 'project', render: (value) => value || '--' },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      render: (_, cluster) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate(buildClusterDetailPath(cluster.id))}
          >
            查看详情
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(cluster);
              setFormOpen(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => confirmDelete(cluster)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <main className="cluster-page">
      <PageHeader
        eyebrow="CLUSTERS"
        title="集群管理"
        description="统一管理集群实体、节点归属和集群级资源汇总。"
        extra={
          <Space className="cluster-page__header-actions" size={8} wrap>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreate()}>
              创建集群
            </Button>
          </Space>
        }
      />
      {error && <Alert type="error" showIcon message={error} />}
      <Card className="cluster-page__card">
        {error && clusters.length === 0 ? (
          <Result
            status="error"
            title="集群数据不可用"
            extra={<Button onClick={() => void load()}>重试</Button>}
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={clusters}
            loading={loading}
            scroll={{ x: 1700 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
      </Card>
      <ClusterFormModal
        open={formOpen}
        loading={saving}
        cluster={editing}
        candidateNodes={candidateNodes}
        candidateLoading={candidateLoading}
        candidateError={candidateError}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={submit}
      />
    </main>
  );
}
