# 资源池管理面来源

本目录、`agent/` 与 `web-pool/` 源自顾强强 `https://github.com/1234gu/changan_vehicular`
提交 `b964ad133e30673bbfcbfc1cc6e5bd62587632f4`（2026-11-15并入）。此后两人在本仓库协同开发，不再追随原仓库。

并入时的改动：
- 后端 `backend/app` → `app/pool`，同进程挂载 `/api/v1/*`，独立数据库 `data/pool.db`；
  `scheduler_sync` 的外部事件/快照写入路由不挂载，执行投影改由 `app/pool_routes.py` 从任务库直接查询。
- 身份新增 `machine_id_sha256`；GPU 新增 `memory_architecture`（Thor 统一内存）；采样时间超过阈值视为过期。
- Agent 上报带 `X-Pool-Agent-Token`，经网关 8311 只转发 register/heartbeat/resources。
- 前端以 `/pool/` 子路径托管；总览接入调度平台任务统计、可靠性和执行节点绑定；调度页可直接提交任务。
