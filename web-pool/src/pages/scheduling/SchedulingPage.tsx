import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
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
import {
  buildSchedulerSubmission,
  getSchedulerExecutions,
  queryResourceCandidates,
} from '../../services/schedulerService';
import type { ClusterRecord } from '../../types/cluster';
import type {
  CandidateNode,
  CandidateQueryResult,
  ClusterAggregateCapacity,
  ExecutionMode,
  ResourceAvailabilityState,
  SchedulerExecution,
  SchedulerSubmission,
} from '../../types/scheduling';
import { ExecutionTable } from './components/ExecutionTable';
import { submitPoolTask, taskDetailUrl } from '../../services/platformService';
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
  const [submission, setSubmission] = useState<SchedulerSubmission>();
  const [executions, setExecutions] = useState<SchedulerExecution[]>([]);
  const [executionLoading, setExecutionLoading] = useState(true);
  const [executionError, setExecutionError] = useState<string>();

  const refreshExecutions = async (showLoading = true) => {
    if (showLoading) setExecutionLoading(true);
    try {
      const result = await getSchedulerExecutions();
      setExecutions(result.items);
      setExecutionError(undefined);
    } catch (error) {
      setExecutionError(errorMessage(error));
    } finally {
      if (showLoading) setExecutionLoading(false);
    }
  };

  useEffect(() => {
    void getClusters()
      .then((result) => setClusters(result.items))
      .catch((error) => setQueryError(`集群列表加载失败：${errorMessage(error)}`));
    void getSchedulerExecutions()
      .then((result) => {
        setExecutions(result.items);
        setExecutionError(undefined);
      })
      .catch((error) => setExecutionError(errorMessage(error)))
      .finally(() => setExecutionLoading(false));
    const timer = window.setInterval(() => void refreshExecutions(false), 5_000);
    return () => window.clearInterval(timer);
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
    setSubmission(undefined);
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

  const generateSubmission = () => {
    if (!queryResult) return;
    const allowed =
      selectionMode === 'automatic'
        ? queryResult.candidates.map((item) => item.nodeId)
        : selectedNodeIds;
    setSubmission(buildSchedulerSubmission(queryResult, allowed));
  };

  const [dispatching, setDispatching] = useState(false);
  const allowedNodeIds = () =>
    !queryResult
      ? []
      : selectionMode === 'automatic'
        ? queryResult.candidates.map((item) => item.nodeId)
        : selectedNodeIds;

  const dispatchTask = async () => {
    if (!queryResult) return;
    const values = form.getFieldsValue();
    setDispatching(true);
    try {
      const created = await submitPoolTask({
        name: values.taskId?.trim() || '资源池任务',
        algorithm: 'resource_aware',
        poolNodeIds: allowedNodeIds(),
        poolClusterId: values.clusterId,
        poolLabels: (values.labels ?? '')
          .split(/[，,\n]/)
          .map((label) => label.trim())
          .filter(Boolean),
        minCpuCores: values.cpuCores,
        minMemoryGb: values.memoryGb,
        architecture: values.architecture?.trim() || undefined,
      });
      messageApi.success(
        `任务 ${created.id} 已提交，执行节点：${created.executionNodeIds.join('、')}`,
      );
      navigate(taskDetailUrl(created.id));
    } catch (error) {
      messageApi.error(errorMessage(error));
    } finally {
      setDispatching(false);
    }
  };

  const submissionJson = submission ? JSON.stringify(submission, null, 2) : '';

  const copySubmission = async () => {
    await navigator.clipboard.writeText(submissionJson);
    messageApi.success('调度请求 JSON 已复制');
  };

  const downloadSubmission = () => {
    const blob = new Blob([submissionJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${submission?.task_id ?? 'scheduler-request'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="scheduling-page">
      {contextHolder}
      <div className="scheduling-page__toolbar" aria-label="调度执行状态操作">
        <span className="scheduling-page__live-status">
          <i aria-hidden="true" />
          执行状态每 5 秒自动刷新
        </span>
        <Button
          className="scheduling-page__refresh"
          icon={<ReloadOutlined />}
          loading={executionLoading}
          onClick={() => void refreshExecutions()}
        >
          刷新执行状态
        </Button>
      </div>

      <Card className="scheduling-card" title="1. 任务资源需求">
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
                label="任务 ID"
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

      <Card className="scheduling-card" title="3. 参与节点与调度请求">
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
            <Radio.Button value="automatic">自动：全部候选</Radio.Button>
            <Radio.Button value="manual">手动：仅勾选节点</Radio.Button>
          </Radio.Group>
          <Typography.Text type="secondary">
            当前允许{' '}
            {selectionMode === 'automatic'
              ? (queryResult?.candidates.length ?? 0)
              : selectedNodeIds.length}{' '}
            个节点
          </Typography.Text>
          <Button
            disabled={
              !queryResult ||
              !queryResult.requirementSatisfied ||
              (selectionMode === 'manual' && selectedNodeIds.length === 0)
            }
            onClick={generateSubmission}
          >
            生成调度请求
          </Button>
          <Button
            type="primary"
            loading={dispatching}
            disabled={
              !queryResult ||
              !queryResult.requirementSatisfied ||
              (selectionMode === 'manual' && selectedNodeIds.length === 0)
            }
            onClick={() => void dispatchTask()}
          >
            提交执行（示例视频）
          </Button>
        </div>

        {submission && (
          <div className="scheduling-json">
            <Space wrap>
              <Button icon={<CopyOutlined />} onClick={() => void copySubmission()}>
                复制 JSON
              </Button>
              <Button icon={<DownloadOutlined />} onClick={downloadSubmission}>
                导出 JSON
              </Button>
            </Space>
            <Input.TextArea
              value={submissionJson}
              readOnly
              autoSize={{ minRows: 7, maxRows: 14 }}
            />
          </div>
        )}
      </Card>

      <Card className="scheduling-card" title="4. 执行状态">
        {executionError && (
          <Alert
            className="scheduling-inline-alert"
            type="error"
            showIcon
            message={executionError}
          />
        )}
        <ExecutionTable items={executions} loading={executionLoading} />
      </Card>
    </main>
  );
}
