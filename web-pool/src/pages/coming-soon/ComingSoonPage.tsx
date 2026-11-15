import { ArrowLeftOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../routes/config';

interface ComingSoonPageProps {
  title: string;
  description?: string;
}

export function ComingSoonPage({
  title,
  description = '该模块已预留入口，将在后续阶段接入真实业务能力。',
}: ComingSoonPageProps) {
  const navigate = useNavigate();

  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      <Result
        icon={<ToolOutlined />}
        title={<span id="coming-soon-title">{title}</span>}
        subTitle={description}
        extra={
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(ROUTES.dashboard)}
          >
            返回总览
          </Button>
        }
      />
    </section>
  );
}
