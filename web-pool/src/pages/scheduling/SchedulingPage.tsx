import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getClusters } from '../../services/clusterService';
import { queryResourceCandidates } from '../../services/schedulerService';
import type { ClusterRecord } from '../../types/cluster';
import type {
  CandidateNode,
  CandidateQueryResult,
  ClusterAggregateCapacity,
  ExecutionMode,
  ResourceAvailabilityState,
} from '../../types/scheduling';
import { getExecutionBindings } from '../../services/platformService';
import { newTaskPath } from '../../routes/config';
import './SchedulingPage.css';

interface RequirementFormValues {
  taskId: string;
  clusterId?: string;
  executionMode: ExecutionMode;
  cpuCores?: number;
  vramGb?: number;
  npuTops?: number;
  dlaCount?: number;
  memoryGb?: number;
  architecture?: string;
  labels?: string;
}

interface CandidateRow extends CandidateNode {
  eligibility: 'candidate' | 'excluded';
  reasons: string[];
}

function formatCapacity(available: number, total: number, unit: string) {
  return `${available} / ${total} ${unit}`;
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查 Backend 状态。';
}

const AVAILABILITY_LABEL: Record<ResourceAvailabilityState, string> = {
  FREE: '空闲',
  PARTIAL: '部分占用',
  BUSY: '忙碌',
  UNKNOWN: '未知',
  NOT_PRESENT: '无设备',
};

const AVAILABILITY_COLOR: Record<ResourceAvailabilityState, string> = {
  FREE: 'success',
  PARTIAL: 'warning',
  BUSY: 'error',
  UNKNOWN: 'default',
  NOT_PRESENT: 'default',
};

const RESOURCE_LABEL: Record<string, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  memory: '内存',
  npu: 'NPU',
  dla: 'DLA',
};

export function SchedulingPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm<RequirementFormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [clusters, setClusters] = useState<ClusterRecord[]>([]);
  const [queryResult, setQueryResult] = useState<CandidateQueryResult>();
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string>();
  const [selectionMode, setSelectionMode] = useState<'automatic' | 'manual'>('automatic');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [template, setTemplate] = useState<'video-analysis' | 'aerial-mapping-odx'>('video-analysis');
  const [handingOff, setHandingOff] = useState(false);

  useEffect(() => {
    void getClusters()
      .then((result) => setClusters(result.items))
      .catch((error) => setQueryError(`集群列表加载失败：${errorMessage(error)}`));
  }, []);

  const rows = useMemo<CandidateRow[]>(
    () => [
      ...(queryResult?.candidates.map((item) => ({
        ...item,
        eligibility: 'candidate' as const,
        reasons: [],
      })) ?? []),
      ...(queryResult?.excludedNodes.map((item) => ({
        ...item,
        eligibility: 'excluded' as const,
      })) ?? []),
    ],
    [queryResult],
  );

  const lockedClusterId = useMemo(() => {
    if (
      selectionMode !== 'manual' ||
      !queryResult ||
      queryResult.executionMode !== 'DISTRIBUTED' ||
      selectedNodeIds.length === 0
    ) {
      return undefined;
    }
    const first = queryResult.candidates.find((item) => item.nodeId === selectedNodeIds[0]);
    return first ? (first.clusterId ?? '') : undefined;
  }, [selectionMode, queryResult, selectedNodeIds]);

  const columns: ColumnsType<CandidateRow> = [
    {
      title: '结果',
      dataIndex: 'eligibility',
      width: 90,
      fixed: 'left',
      render: (value: CandidateRow['eligibility']) =>
        value === 'candidate' ? (
          <Tag color="success" bordered={false}>
            候选
          </Tag>
        ) : (
          <Tag color="default" bordered={false}>
            排除
          </Tag>
        ),
    },
    {
      title: '节点',
      width: 210,
      fixed: 'left',
      render: (_, item) => (
        <div className="scheduling-node-cell">
          <strong>{item.hostname}</strong>
          <code>{item.nodeId}</code>
        </div>
      ),
    },
    {
      title: '集群',
      dataIndex: 'clusterId',
      width: 130,
      render: (value?: string) => value ?? '--',
    },
    { title: '架构', dataIndex: 'architecture', width: 110 },
    {
      title: 'CPU',
      width: 120,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.cpuCores, item.capacity.cpuCores, 'Core'),
    },
    {
      title: 'GPU',
      width: 105,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.gpuCount, item.capacity.gpuCount, 'Device'),
    },
    {
      title: '独立显存',
      width: 120,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.vramTotalGb, item.capacity.vramTotalGb, 'GB'),
    },
    {
      title: '内存',
      width: 120,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.memoryTotalGb, item.capacity.memoryTotalGb, 'GB'),
    },
    {
      title: 'NPU',
      width: 120,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.npuTops, item.capacity.npuTops, 'TOPS'),
    },
    {
      title: 'DLA',
      width: 115,
      render: (_, item) =>
        formatCapacity(item.availableCapacity.dlaCount, item.capacity.dlaCount, 'Device'),
    },
    { title: '运行状态', dataIndex: 'runtimeStatus', width: 100 },
    { title: '健康状态', dataIndex: 'healthStatus', width: 100 },
    {
      title: '可调度',
      dataIndex: 'schedulable',
      width: 90,
      render: (value: boolean) => (
        <Tag color={value ? 'success' : 'default'} bordered={false}>
          {value ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '资源占用',
      width: 260,
      render: (_, item) => (
        <Space size={[4, 4]} wrap>
          {(
            Object.entries(item.resourceAvailability) as Array<[string, ResourceAvailabilityState]>
          ).map(([resource, state]) => (
            <Tag key={resource} color={AVAILABILITY_COLOR[state]} bordered={false}>
              {RESOURCE_LABEL[resource] ?? resource} {AVAILABILITY_LABEL[state]}
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: '最后资源时间', dataIndex: 'lastResourceAt', width: 170, render: formatTime },
    {
      title: '排除原因',
      dataIndex: 'reasons',
      width: 270,
      render: (reasons: string[]) =>
        reasons.length > 0 ? (
          <Space size={[4, 4]} wrap>
            {reasons.map((reason) => (
              <Tag key={reason} bordered={false}>
                {reason}
              </Tag>
            ))}
          </Space>
        ) : (
          '--'
        ),
    },
  ];

  const clusterColumns: ColumnsType<ClusterAggregateCapacity> = [
    { title: 'Cluster', dataIndex: 'clusterName' },
    { title: 'Node', dataIndex: 'nodeCount', width: 80, render: (value) => `${value} 个` },
    { title: 'CPU', render: (_, group) => `${group.aggregateCapacity.cpuCores} Core` },
    { title: '独立显存', render: (_, group) => `${group.aggregateCapacity.vramGb} GB` },
    { title: '内存', render: (_, group) => `${group.aggregateCapacity.memoryGb} GB` },
    { title: 'NPU', render: (_, group) => `${group.aggregateCapacity.npuTops} TOPS` },
    { title: 'DLA', render: (_, group) => `${group.aggregateCapacity.dlaDevices} Device` },
    {
      title: '资源需求',
      render: (_, group) => (
        <Tag color={group.requirementSatisfied ? 'success' : 'error'}>
          {group.requirementSatisfied ? '满足' : '不满足'}
        </Tag>
      ),
    },
  ];

  const runCandidateQuery = async (values: RequirementFormValues) => {
    setQuerying(true);
    setQueryError(undefined);
    try {
      const result = await queryResourceCandidates({
        requestId: `candidate-${Date.now()}`,
        taskId: values.taskId.trim(),
        clusterId: values.clusterId,
        executionMode: values.executionMode,
        requirement: {
          cpuCores: values.cpuCores,
          minVramTotalGb: values.vramGb,
          npuTops: values.npuTops,
          dlaCount: values.dlaCount,
          memoryGb: values.memoryGb,
          architecture: values.architecture?.trim() || undefined,
          requiredLabels: (values.labels ?? '')
            .split(/[，,\n]/)
            .map((label) => label.trim())
            .filter(Boolean),
        },
      });
      setQueryResult(result);
      setSelectedNodeIds(result.candidates.map((item) => item.nodeId));
      messageApi.success(`候选查询完成：${result.candidates.length} 个候选节点`);
    } catch (error) {
      setQueryResult(undefined);
      setSelectedNodeIds([]);
      setQueryError(errorMessage(error));
    } finally {
      setQuerying(false);
    }
  };

  const allowedNodeIds = () =>
    !queryResult
      ? []
      : selectionMode === 'automatic'
        ? queryResult.candidates.map((item) => item.nodeId)
        : selectedNodeIds;

  /**
   * Hand the pool-side answer to task creation: pool node UUIDs are mapped to their bound
   * K3s execution nodes and become the task's node scope. The task form re-checks both
   * admission stages before submission, so this page never creates tasks itself.
   */
  const openTaskCreation = async () => {
    setHandingOff(true);
    try {
      const allowed = allowedNodeIds();
      const { items } = await getExecutionBindings();
      const executionNodeIds = items
        .filter((item) => item.bindingState === 'BOUND' && item.poolNodeId && allowed.includes(item.poolNodeId))
        .map((item) => item.executionNodeId);
      if (executionNodeIds.length === 0) {
        messageApi.error('所选资源节点均未绑定 K3s 执行节点，无法作为执行范围');
        return;
      }
      if (executionNodeIds.length < allowed.length) {
        messageApi.warning(`${allowed.length - executionNodeIds.length} 个资源节点未绑定执行节点，已从执行范围中略去`);
      }
      navigate(newTaskPath(template, executionNodeIds));
    } catch (error) {
      messageApi.error(errorMessage(error));
    } finally {
      setHandingOff(false);
    }
  };

  return (
    <main className="scheduling-page">
      {contextHolder}
      <Alert
        className="scheduling-inline-alert"
        type="info"
        showIcon
        message="资源需求查询只回答“资源池里哪些节点满足这组硬件与管理条件”（第一阶段准入），不创建任务。"
        description="任务的创建、选点、下发与执行在「任务中心」完成；可在第 3 步把查询出的节点作为执行范围带入新建任务，任务侧会再核对一次准入与运行可行性。"
      />
      <Card className="scheduling-card" title="1. 资源需求">
        <Form<RequirementFormValues>
          form={form}
          layout="vertical"
          initialValues={{
            taskId: 'Task-001',
            executionMode: 'SINGLE_NODE',
            vramGb: 8,
          }}
          onFinish={(values) => void runCandidateQuery(values)}
        >
          <Row gutter={12}>
            <Col xs={24} md={8} lg={6}>
              <Form.Item
                name="taskId"
                label="查询标识"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input placeholder="Task-001" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} lg={6}>
              <Form.Item name="clusterId" label="资源管理集群">
                <Select
                  popupClassName="scheduling-select-dropdown"
                  allowClear
                  placeholder="全部可调度节点"
                  options={clusters.map((cluster) => ({ value: cluster.id, label: cluster.name }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} lg={6}>
              <Form.Item name="executionMode" label="执行方式" rules={[{ required: true }]}>
                <Select
                  popupClassName="scheduling-select-dropdown"
                  options={[
                    { value: 'SINGLE_NODE', label: '单节点执行' },
                    { value: 'DISTRIBUTED', label: '跨节点协同执行' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={3}>
              <Form.Item name="cpuCores" label="CPU Core ≥">
                <InputNumber min={0} precision={0} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={3}>
              <Form.Item name="vramGb" label="独立显存 ≥">
                <InputNumber min={0} addonAfter="GB" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={3}>
              <Form.Item name="memoryGb" label="内存 ≥">
                <InputNumber min={0} addonAfter="GB" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={3}>
              <Form.Item name="npuTops" label="NPU TOPS ≥">
                <InputNumber min={0} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6} lg={3}>
              <Form.Item name="dlaCount" label="DLA Device ≥">
                <InputNumber min={0} precision={0} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} lg={6}>
              <Form.Item name="architecture" label="架构">
                <Input placeholder="amd64 / arm64" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12} lg={9}>
              <Form.Item name="labels" label="标签" tooltip="逗号分隔，必须全部匹配">
                <Input placeholder="region:tokyo, accelerator:nvidia" />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" loading={querying} icon={<SearchOutlined />}>
            查询候选节点
          </Button>
        </Form>
        {queryError && (
          <Alert className="scheduling-inline-alert" type="error" showIcon message={queryError} />
        )}
      </Card>

      <Card
        className="scheduling-card"
        title="2. 候选节点"
        extra={
          queryResult && (
            <Typography.Text type="secondary">Snapshot: {queryResult.snapshotId}</Typography.Text>
          )
        }
      >
        {queryResult && (
          <div className="scheduling-result-summary">
            <div className="scheduling-statistics">
              <Statistic
                title="候选"
                value={queryResult.candidates.length}
                prefix={<CheckCircleOutlined />}
              />
              <Statistic title="排除" value={queryResult.excludedNodes.length} />
              <Statistic title="快照时间" value={formatTime(queryResult.generatedAt)} />
            </div>
            {queryResult.executionMode === 'DISTRIBUTED' && (
              <div className="scheduling-aggregate">
                <div className="scheduling-aggregate__header">
                  <strong>候选资源汇总</strong>
                  <Tag color={queryResult.requirementSatisfied ? 'success' : 'error'}>
                    资源需求：{queryResult.requirementSatisfied ? '满足' : '不满足'}
                  </Tag>
                </div>
                <div className="scheduling-aggregate__metrics">
                  <span>CPU：{queryResult.aggregateCapacity.cpuCores} Core</span>
                  <span>独立显存：{queryResult.aggregateCapacity.vramGb} GB</span>
                  <span>内存：{queryResult.aggregateCapacity.memoryGb} GB</span>
                  <span>NPU：{queryResult.aggregateCapacity.npuTops} TOPS</span>
                  <span>DLA：{queryResult.aggregateCapacity.dlaDevices} Device</span>
                </div>
              </div>
            )}
            {queryResult.executionMode === 'DISTRIBUTED' && !queryResult.clusterId && (
              <div className="scheduling-cluster-aggregate">
                <strong>Cluster资源汇总</strong>
                <Table
                  rowKey="clusterId"
                  columns={clusterColumns}
                  dataSource={queryResult.aggregateByCluster}
                  pagination={false}
                  size="small"
                />
              </div>
            )}
          </div>
        )}
        <Table
          rowKey="nodeId"
          columns={columns}
          dataSource={rows}
          loading={querying}
          pagination={rows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
          rowSelection={
            queryResult
              ? {
                  selectedRowKeys: selectedNodeIds,
                  onChange: (keys) => {
                    const next = keys.map(String);
                    if (
                      selectionMode === 'manual' &&
                      queryResult.executionMode === 'DISTRIBUTED' &&
                      next.length > 0
                    ) {
                      const first = queryResult.candidates.find((item) => item.nodeId === next[0]);
                      const cluster = first ? (first.clusterId ?? '') : '';
                      setSelectedNodeIds(
                        next.filter((id) => {
                          const node = queryResult.candidates.find((item) => item.nodeId === id);
                          return node && (node.clusterId ?? '') === cluster;
                        }),
                      );
                      return;
                    }
                    setSelectedNodeIds(next);
                  },
                  getCheckboxProps: (record) => ({
                    disabled:
                      selectionMode === 'automatic' ||
                      record.eligibility === 'excluded' ||
                      (lockedClusterId !== undefined &&
                        queryResult.executionMode === 'DISTRIBUTED' &&
                        (record.clusterId ?? '') !== lockedClusterId),
                  }),
                }
              : undefined
          }
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先提交资源需求查询" />
            ),
          }}
          scroll={{ x: 1900 }}
          size="small"
        />
      </Card>

      <Card className="scheduling-card" title="3. 带入任务创建">
        <div className="scheduling-selection">
          <Radio.Group
            value={selectionMode}
            onChange={(event) => {
              const mode = event.target.value as 'automatic' | 'manual';
              setSelectionMode(mode);
              if (mode === 'automatic' && queryResult) {
                setSelectedNodeIds(queryResult.candidates.map((item) => item.nodeId));
              }
            }}
          >
            <Radio.Button value="automatic">全部候选</Radio.Button>
            <Radio.Button value="manual">仅勾选节点</Radio.Button>
          </Radio.Group>
          <Select
            aria-label="任务模板"
            popupClassName="scheduling-select-dropdown"
            value={template}
            onChange={setTemplate}
            style={{ width: 160 }}
            options={[
              { value: 'video-analysis', label: '视频分析' },
              { value: 'aerial-mapping-odx', label: '航拍建图' },
            ]}
          />
          <Typography.Text type="secondary">
            执行范围{' '}
            {selectionMode === 'automatic'
              ? (queryResult?.candidates.length ?? 0)
              : selectedNodeIds.length}{' '}
            个节点
          </Typography.Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={handingOff}
            disabled={
              !queryResult ||
              !queryResult.requirementSatisfied ||
              allowedNodeIds().length === 0
            }
            onClick={() => void openTaskCreation()}
          >
            以此范围新建任务
          </Button>
        </div>
      </Card>
    </main>
  );
}
