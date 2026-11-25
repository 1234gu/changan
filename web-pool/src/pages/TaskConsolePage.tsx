import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import TaskConsole from '../../../web/src/TaskConsole.jsx';
import { consolePage, consolePath } from '../routes/config';
import type { MainLayoutOutletContext } from '../layouts/MainLayout';

export default function TaskConsolePage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { updateCounts } = useOutletContext<MainLayoutOutletContext>();
  const page = consolePage(search);
  const task = page === 'detail' ? new URLSearchParams(search).get('task') : null;
  return <TaskConsole route={{ page, task }} navigatePage={(next, id) => navigate(consolePath(next, id))} onCounts={updateCounts} />;
}
