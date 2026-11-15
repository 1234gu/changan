import { useEffect, useState } from 'react';
import { DeploymentUnitOutlined } from '@ant-design/icons';
import { Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { DashboardCard } from '../../pages/dashboard/components/DashboardCard';
import { buildNodeDetailPath } from '../../routes/config';
import { getExecutionBindings, type ExecutionBinding } from '../../services/platformService';
import './platform.css';

const BINDING_TEXT: Record<ExecutionBinding['bindingState'], { color: string; text: string }> = {
  BOUND: { color: 'success', text: '已绑定' },
  UNBOUND: { color: 'warning', text: '未注册采集' },
  CONFLICT: { color: 'error', text: '身份冲突' },
  NO_MACHINE_ID: { color: 'default', text: '缺少设备标识' },
  UNAVAILABLE: { color: 'error', text: '资源池不可用' },
  OFF: { color: 'default', text: '未启用' },
};
const MODE_TEXT: Record<string, string> = {
  enforce: '资源池资格参与选点',
  observe: '观测模式：只展示，不参与选点',
  off: '资源池准入关闭',
};
const REFRESH_MS = 5000;

/** K3s execution nodes, their bound pool node and stage-1 admission result. */
export function ExecutionBindingCard() {
  const [rows, setRows] = useState<ExecutionBinding[]>([]);
  const [mode, setMode] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    const load = () =>
      getExecutionBindings()
        .then((result) => {
          if (disposed) return;
          setRows(result.items);
          setMode(result.mode);
          setError(undefined);
        })
        .catch((reason: unknown) => !disposed && setError(String(reason)));
    void load();
    const timer = globalThis.setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      globalThis.clearInterval(timer);
    };
  }, []);

  return (
    <DashboardCard
      icon={<DeploymentUnitOutlined />}
      title="执行节点与准入"
      subtitle="K3s 执行节点 ↔ 资源池节点绑定及调度资格"
      extra={<span className="card-context">{error ? '获取失败' : (MODE_TEXT[mode] ?? mode)}</span>}
    >
      <Table<ExecutionBinding>
        className="binding-table"
        size="small"
        rowKey="executionNodeId"
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: '执行节点',
            dataIndex: 'executionNodeId',
            render: (id: string, row) => (
              <span>
                <strong>{id}</strong>
                <div className="binding-reasons">{row.kubeNode}</div>
              </span>
            ),
          },
          {
            title: 'K3s',
            render: (_, row) => (
              <Tag color={row.k3sReady ? 'success' : 'error'} bordered={false}>
                {row.k3sReady ? 'Ready' : '未就绪'}
              </Tag>
            ),
          },
          {
            title: '资源池节点',
            render: (_, row) => {
              const state = BINDING_TEXT[row.bindingState] ?? BINDING_TEXT.OFF;
              return (
                <span>
                  <Tag color={state.color} bordered={false}>
                    {state.text}
                  </Tag>
                  {row.poolNodeId && <Link to={buildNodeDetailPath(row.poolNodeId)}>{row.poolNodeName}</Link>}
                </span>
              );
            },
          },
          {
            title: '调度资格',
            render: (_, row) =>
              row.admissionReasons.length === 0 ? (
                <Tag color="success" bordered={false}>
                  可参与
                </Tag>
              ) : (
                <Tooltip title={row.admissionReasons.join('；')}>
                  <Tag color="warning" bordered={false}>
                    {row.admissionReasons.length} 项限制
                  </Tag>
                  <div className="binding-reasons">{row.admissionReasons[0]}</div>
                </Tooltip>
              ),
          },
          { title: '活动会话', dataIndex: 'activeSessions', width: 80 },
        ]}
      />
    </DashboardCard>
  );
}
