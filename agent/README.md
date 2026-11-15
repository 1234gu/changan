# Vehicular Node Agent

节点 Agent 负责采集本机身份、CPU、内存、存储、NVIDIA GPU 和网络状态，并使用现有注册、心跳及资源接口上报 Backend。NPU/DLA 在第一阶段仍明确上报 `supported=false`。

## 源码开发运行

```powershell
cd D:\coding\vehicular
python -m pip install -r agent\requirements.txt
python -m agent.main --config agent\config.yaml
```

仍兼容环境变量方式：

```powershell
$env:BACKEND_URL='http://192.168.1.100:8000'
python -m agent.main --config agent\config.yaml
```

旧的 `VEHICULAR_BACKEND_URL` 也继续兼容。Backend URL 的优先级是：`--server` > `BACKEND_URL` > `VEHICULAR_BACKEND_URL` > `.state/config.json` > 开发模式 `config.yaml`。

## Portable 程序

发布程序第一次运行且尚无配置时，只需在交互终端输入完整 Backend URL，例如 `http://192.168.1.100:8000`。Agent 会先调用 Backend 的 `GET /health`；成功后才原子写入 `.state/config.json` 并启动现有 Runtime。URL 或连接检查失败时会显示地址和具体原因，用户可以重新输入或输入 `q` 退出，双击启动的窗口不会再无提示关闭。

```text
vehicular-node-agent
vehicular-node-agent --server http://192.168.1.100:8000
vehicular-node-agent --configure
vehicular-node-agent --status
vehicular-node-agent --version
```

`--server` 会校验、保存并使用新地址；`--configure` 只修改 Backend URL，不修改 Node ID；`--status` 只显示 Node ID、Backend、hostname、架构和连通性，不启动心跳或资源循环；`--version` 不需要配置即可显示版本。无配置的非交互启动会直接报错，不会等待 `input()`。

状态位置始终相对于源码 Agent 目录或打包后的可执行文件目录，不依赖当前工作目录：

```text
.state/node_id
.state/config.json
.state/logs/agent.log
```

已有 `.state/node_id` 会被原样复用。切换工作目录、重启 Agent 或重新配置 Backend 都不会生成新 UUID。

## 构建

Windows x86_64（必须在 Windows x86_64 上执行）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_agent_windows.ps1
.\dist\vehicular-node-agent.exe --status
```

Linux x86_64（必须在 Linux x86_64 上执行）：

```bash
bash ./scripts/build_agent_linux.sh
chmod +x ./dist/linux-amd64/vehicular-node-agent
./dist/linux-amd64/vehicular-node-agent --status
```

通用 Linux ARM64（必须在 Linux ARM64 上执行）：

```bash
bash ./scripts/build_agent_linux_arm64.sh
chmod +x ./dist/linux-arm64/vehicular-node-agent
./dist/linux-arm64/vehicular-node-agent --status
```

Windows、Linux x86_64 和 Linux ARM64 的构建缓存分别位于 `.build/agent-windows`、`.build/linux-amd64` 与 `.build/linux-arm64`，产物目录互不重叠。Linux binary 必须在对应架构的真实 Linux 环境原生构建，不能从 Windows 交叉伪装生成。三个目标均为 PyInstaller one-file 程序，目标节点不需要安装 Python、pip 或 venv。

## Windows 开发机通过 GitHub Actions 构建 Linux

工作流位于 `.github/workflows/build-agent-linux.yml`。Windows 开发机不需要安装 WSL、Ubuntu 或 Docker：

1. 修改 Agent 源码并 push 到 GitHub 的 `main` 分支；
2. 打开仓库的 **Actions** 页面；
3. 选择 **build-agent-linux**，等待 push 自动构建，或点击 **Run workflow** 手动触发；
4. 从该次运行下载 `vehicular-node-agent-linux-amd64` 或 `vehicular-node-agent-linux-arm64`；
5. 使用 Artifact 内的 `SHA256SUMS.txt` 校验后运行 `vehicular-node-agent`。

两个 job 分别在真实 `ubuntu-22.04` x86_64 和 `ubuntu-22.04-arm` ARM64 runner 上完成测试、PyInstaller 构建、`file` ELF 架构校验、`--version`/`--status` 启动检查及 SHA256 生成。Artifact 只包含可执行文件和校验文件，不包含源码。

ARM64 Artifact 是通用 Linux ARM64 可执行文件，不代表已完成 NVIDIA THOR GPU/DLA 实机验证。当前没有 THOR 专用 Python 包或共享库启动硬依赖；普通 ARM64 环境缺少 NVIDIA 接口时，加速器会返回 unavailable/unsupported，CPU、内存、存储和网络采集仍可运行。

GPU 仍使用节点 NVIDIA 驱动提供的 `nvidia-smi`，该工具不会打包进 Agent；GitHub runner 或目标节点缺少它时 GPU 明确为不支持，但 Agent 的其它采集和上报继续运行。GitHub ARM64 构建不包含 THOR GPU/DLA 实机验证。

## 测试

```powershell
python -m pip install -r agent\requirements-dev.txt
python -m pytest -q agent\tests
```
