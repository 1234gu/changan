import { Link } from 'react-router-dom';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import { Empty, List } from 'antd';
import dayjs from 'dayjs';
import { taskDetailUrl } from '../services/platformService';
import type { SystemEvent } from '../types/event';

const eventIcon = {
  info: <CheckCircleFilled className="event-list__icon event-list__icon--info" />,
  warning: <ExclamationCircleFilled className="event-list__icon event-list__icon--warning" />,
  error: <CloseCircleFilled className="event-list__icon event-list__icon--error" />,
};

const eventTypeLabel: Record<SystemEvent['type'], string> = {
  heartbeat_timeout: '节点心跳超时',
  node_reconnected: '节点恢复连接',
  cluster_degraded: '集群状态异常',
  node_joined: '节点加入',
  task_created: '任务创建',
  task_succeeded: '任务执行完成',
  task_failed: '任务执行失败',
  task_canceled: '任务已取消',
  task_timed_out: '任务执行超时',
  unknown: '其他事件',
};

interface EventListProps {
  events: SystemEvent[];
}

export function EventList({ events }: EventListProps) {
  if (events.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无事件" />;
  }

  return (
    <List
      className="event-list"
      dataSource={events}
      renderItem={(event) => (
        <List.Item key={event.id} className="event-list__item" data-event-type={event.type}>
          <div className="event-list__content">
            {eventIcon[event.level]}
            <div className="event-list__body">
              {event.targetType === 'task' && event.targetId ? (
                <Link className="event-list__message" to={taskDetailUrl(event.targetId)}>
                  {event.message}
                </Link>
              ) : (
                <span className="event-list__message">{event.message}</span>
              )}
              <span className="event-list__type">{eventTypeLabel[event.type]}</span>
            </div>
          </div>
          <time className="event-list__time" dateTime={event.occurredAt}>
            {dayjs(event.occurredAt).format('HH:mm')}
          </time>
        </List.Item>
      )}
    />
  );
}
