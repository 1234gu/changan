export interface TaskSummary {
  waiting: number;
  running: number;
  success: number;
  failed: number;
}

export type TaskStatus = keyof TaskSummary;
