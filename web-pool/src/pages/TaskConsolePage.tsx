import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import TaskConsole from '../../../web/src/TaskConsole.jsx';
import { consolePage, consolePath, ROUTES } from '../routes/config';
import type { MainLayoutOutletContext } from '../layouts/MainLayout';

export default function TaskConsolePage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { updateCounts } = useOutletContext<MainLayoutOutletContext>();
  const page = consolePage(search);
  // The former task-side node page duplicated node administration; nodes live in the pool menu.
  if (page === 'nodes') return <Navigate to={ROUTES.nodes} replace />;
  const task = page === 'detail' ? new URLSearchParams(search).get('task') : null;
  return <TaskConsole route={{ page, task }} navigatePage={(next, id) => navigate(consolePath(next, id))} onCounts={updateCounts} />;
}
