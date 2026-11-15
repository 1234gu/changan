import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import { Empty, List } from 'antd';
import dayjs from 'dayjs';
import type { SystemEvent } from '../types/event';

const eventIcon = {
  info: <CheckCircleFilled className="event-list__icon event-list__icon--info" />,
  warning: <ExclamationCircleFilled className="event-list__icon event-list__icon--warning" />,
  error: <CloseCircleFilled className="event-list__icon event-list__icon--error" />,
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
        <List.Item key={event.id} className="event-list__item">
          <div className="event-list__content">
            {eventIcon[event.level]}
            <div className="event-list__body">
              <span className="event-list__message">{event.message}</span>
              <span className="event-list__type">{event.type.replace(/_/g, ' ')}</span>
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
