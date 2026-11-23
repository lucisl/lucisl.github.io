## 适用范围

这是一份<strong>运维部署 runbook</strong>：从一台空服务器到可用的 WorkHub。假设：

- Linux 服务器（Ubuntu / Debian / CentOS 均可）
- Node.js 22+、pnpm 9+
- PostgreSQL 14+，并安装 pgvector
- 一个可用的 opencode server（执行器）
- 可选：域名、Nginx、飞书应用、executor-bridge、Appium Agent

命令里的路径以 `/home/ecs-user/work/lita-work` 为例，实际按你的部署目录替换。

## 部署拓扑

```text
用户浏览器
   │ HTTPS/HTTP
   ▼
Nginx
   ├── /            → frontend/dist（静态）
   ├── /api/        → backend:3000（含 SSE / WebSocket Upgrade）
   ├── /images/     → DIR_IMAGE_WEBROOT
   ├── /export-files/ → DIR_EXPORT_WEBROOT
   └── /files/      → DIR_FILE_WEBROOT

backend（NestJS）
   ├── PostgreSQL（业务库 + pgvector 知识库）
   ├── opencode server（执行器 A）
   ├── executor-bridge（执行器 B，可选）
   └── 飞书开放平台（OAuth / 长连接 / 消息）

工位机（可与 backend 同机）
   └── WORKER_BASE_DIR/worker/{id}
```

## 前置条件清单

| 项 | 要求 |
| --- | --- |
| CPU / 内存 | 4C8G 起步；执行器与 backend 同机建议 8C16G |
| 磁盘 | 系统盘之外，给工位、图片、导出产物留足空间 |
| Node | 22 LTS 及以上 |
| pnpm | 与仓库 `packageManager` 一致 |
| PostgreSQL | 14+，`vector` 扩展可用 |
| opencode | 能启动 server，记下地址/端口/密码 |
| 域名 | 可选；飞书 OAuth 需要可访问的 `APP_URL` |
| 飞书应用 | 可选；需要网页授权登录 + 文档/通讯录/消息权限 |

## 目录规划

```text
/home/ecs-user/work/
├── lita-work/              # 代码
│   ├── backend/
│   ├── frontend/
│   ├── executor-bridge/
│   └── appium-agent/
├── worker/                 # WORKER_BASE_DIR（production）
│   ├── 1000/
│   └── 1001/
├── worker-dev/             # 非 production
├── webroot-images/         # DIR_IMAGE_WEBROOT
├── export-files/           # DIR_EXPORT_WEBROOT
├── files/                  # DIR_FILE_WEBROOT
└── logs/
```

原则：<strong>代码、数据、日志分盘或分目录</strong>；工位和上传目录不要放在代码目录里，避免发布时被覆盖。

## 第一步：数据库

```sql
-- 用管理员账号
CREATE USER work_app WITH PASSWORD '<strong-password>';
CREATE DATABASE project OWNER work_app;
\c project
CREATE EXTENSION IF NOT EXISTS vector;
ALTER DATABASE project SET timezone TO 'Asia/Shanghai';
GRANT ALL ON SCHEMA public TO work_app;
```

如果知识库要独立实例：另建一个库，设置 `PROJECT_PG_*`，同样安装 pgvector。

检查：

```bash
psql -h 127.0.0.1 -U work_app -d project -c "select extname from pg_extension where extname='vector';"
```

## 第二步：后端

```bash
cd /home/ecs-user/work/lita-work
git pull
pnpm install

cd backend
cp .env.example .env
# 编辑 .env：数据库、JWT、飞书、执行器目录、静态目录
pnpm db:migration:run
pnpm build
node dist/main.js        # 先前台跑，确认无报错
```

最小 `.env`：

```dotenv
PORT=3000
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=work_app
DB_PASSWORD=<strong-password>
DB_NAME=project
APP_URL=https://work.example.com
API_URL=https://work.example.com/api
AUTH_JWT_SECRET=<64-hex>
COOKIE_SECURE=true
WORKER_BASE_DIR=/home/ecs-user/work
DIR_IMAGE_WEBROOT=/home/ecs-user/work/webroot-images
DIR_EXPORT_WEBROOT=/home/ecs-user/work/export-files
DIR_FILE_WEBROOT=/home/ecs-user/work/files
FEISHU_BOT_MASTER_KEY=<64-hex>
```

生成密钥：

```bash
openssl rand -hex 32   # AUTH_JWT_SECRET / FEISHU_BOT_MASTER_KEY
```

验证：

```bash
curl -i http://127.0.0.1:3000/api
# 预期 200，返回 Hello World!
```

### systemd

```ini
[Unit]
Description=Lita WorkHub Backend
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/home/ecs-user/work/lita-work/backend
EnvironmentFile=/home/ecs-user/work/lita-work/backend/.env
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lita-work
sudo journalctl -u lita-work -f
```

也可以直接用 PM2：

```bash
pm2 start dist/main.js --name lita-work --cwd /home/ecs-user/work/lita-work/backend
pm2 save
```

## 第三步：前端

```bash
cd /home/ecs-user/work/lita-work
pnpm -C frontend build
# 产物在 frontend/dist
```

Nginx 静态托管：

```nginx
root /home/ecs-user/work/lita-work/frontend/dist;
index index.html;
location / {
  try_files $uri $uri/ /index.html;
}
```

## 第四步：Nginx 反向代理

```nginx
server {
  listen 80;
  server_name work.example.com;

  client_max_body_size 80m;   # MCP base64 上传；普通接口仍受后端 100KB 限制

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE：必须关闭缓冲，拉长超时
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    # WebSocket（Appium Agent /api/ws）
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /images/ {
    alias /home/ecs-user/work/webroot-images/;
    add_header X-Content-Type-Options nosniff;
  }
  location /export-files/ {
    alias /home/ecs-user/work/export-files/;
  }
  location /files/ {
    alias /home/ecs-user/work/files/;
    add_header X-Content-Type-Options nosniff;
    add_header Content-Security-Policy "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'";
  }

  location / {
    root /home/ecs-user/work/lita-work/frontend/dist;
    try_files $uri $uri/ /index.html;
  }
}
```

HTTPS 时记得 `COOKIE_SECURE=true`；内网纯 HTTP 保持关闭，否则登录 Cookie 不会回传。

## 第五步：执行器

### opencode server

按 opencode 官方文档启动 server，记下：

- 地址与端口
- HTTP Basic 密码（平台 `executors.token`，用户名固定 `opencode`）
- 工作目录权限（能读写工位目录）

管理区「执行器」新增：

| 字段 | 值 |
| --- | --- |
| 名称 | opencode-agent-01 |
| 类型 | opencode |
| IP / 端口 | 执行器地址 |
| 密码 | opencode server 密码 |
| 启用 | 是 |

然后：

1. 点「检查」或 `POST /api/executors/:id/check` → `online=true`
2. 点「同步供应商」或 `POST /api/executors/:id/sync-providers` → `providersCache` 有模型
3. 机器人编辑页能选到供应商/模型

### executor-bridge（可选）

```bash
cd /home/ecs-user/work/lita-work/executor-bridge
pnpm install
pnpm build
KERNEL=kiro BRIDGE_PORT=16010 BRIDGE_TOKEN=<token> node dist/main.js
```

systemd：

```ini
[Unit]
Description=WorkHub Executor Bridge
After=network.target

[Service]
WorkingDirectory=/home/ecs-user/work/lita-work/executor-bridge
Environment=KERNEL=kiro
Environment=BRIDGE_PORT=16010
Environment=BRIDGE_TOKEN=<token>
Environment=BRIDGE_ROOT=/home/ecs-user/work
ExecStart=/usr/bin/node dist/main.js
Restart=always

[Install]
WantedBy=multi-user.target
```

端口约定：kiro 16010、devin 16020、droid 16030，统一在 16000–17000 段。

`/health` 检查：

```bash
curl -H "Authorization: Bearer <token>" http://127.0.0.1:16010/health
```

## 第六步：工位

```bash
mkdir -p /home/ecs-user/work/worker
chown -R ecs-user:ecs-user /home/ecs-user/work/worker
```

管理区创建机器人后点「初始化」，平台会：

1. 创建 `worker/{id}`
2. 写 `AGENTS.md`（角色 + 协同协议）
3. 写 `.agents/.env`：`LITA_WORK_TOKEN`、`LITA_PROJECT_TOKEN`、`LITA_USER_TOKEN`、`LITA_APP_URL`
4. 写 `.agents/mcp.json` 与内核 MCP 配置
5. 安装技能到 `.agents/skills`、规范到 `.agents/rules`
6. 生成 `docs/`

检查：

```bash
ls -la /home/ecs-user/work/worker/1000
cat /home/ecs-user/work/worker/1000/.agents/mcp.json
```

注意：

- `.agents/.env` 与内核 MCP 配置权限 600
- opencode 工位会注入 `permissions` deny `external_directory`；如需临时关闭用 `WORKER_DENY_EXTERNAL_DIRECTORY=false`
- 工位磁盘要按机器人数预留；每个工位会有会话文件、产物、日志

## 第七步：飞书

### 1. 创建应用

飞书开放平台 → 创建企业自建应用，开启：

- 网页授权登录（重定向 URL：`{APP_URL}/api/auth/feishu/callback`）
- 机器人能力
- 权限：文档、多维表格、通讯录、消息、群信息（按需）

### 2. 配置官方机器人

管理区「飞书配置」→ 平台官方机器人 → 填 App ID / App Secret。

- Secret 用 `FEISHU_BOT_MASTER_KEY` 加密落库
- 保存后检查 tenant token 是否成功
- 未配置官方机器人时，网页登录与文档同步都不可用

### 3. 长连接

飞书 Bot 优先 WebSocket 长连接，不需要公网回调地址；公开回调是可选通道。

### 4. 提测群

把官方机器人拉进提测群，取 `chat_id`，配置 `RELEASE_FEISHU_CHAT_ID`，重启后端。

### 5. 反馈群（可选）

「系统-反馈处理」机器人绑定应用 → 群策略页勾选「反馈采集」→ 话题自动收录为反馈并建任务。

### 6. 群消息止血

```dotenv
FEISHU_GROUP_SEND_PAUSED=true
```

重启后暂停所有群外发；平台名义发送（工单/提测/feishu_send_message）不受影响。

## 第八步：首次启动检查清单

| 检查项 | 命令/位置 | 预期 |
| --- | --- | --- |
| 后端存活 | `curl /api` | 200 |
| 数据库迁移 | `pnpm -C backend db:migration:run` | 无待执行 |
| 登录 | 浏览器访问 `/login` | 飞书授权后回到首页 |
| 当前用户 | `/api/auth/me` | 返回用户与 role |
| 执行器 | 管理区「执行器」 | 在线、有供应商 |
| 工位 | `worker/{id}` | AGENTS.md/.agents 齐全 |
| 机器人对话 | `/robots/{id}` | 流式回复 |
| 任务 | 创建任务 | 能派发/接受/执行 |
| 飞书 | 群里 @ 机器人 | 有回复 |
| 静态资源 | `/images/...` | 200 |

## 日常运维

### 日志

```bash
sudo journalctl -u lita-work -n 200 -f
# 或 pm2 logs lita-work
```

### 备份

```bash
# 数据库
pg_dump -Fc -h 127.0.0.1 -U work_app project > /backup/project-$(date +%F).dump

# 静态目录与工位
tar czf /backup/work-files-$(date +%F).tgz \
  /home/ecs-user/work/webroot-images \
  /home/ecs-user/work/export-files \
  /home/ecs-user/work/files

# 配置
cp /home/ecs-user/work/lita-work/backend/.env /backup/env-$(date +%F)
```

建议每天备份数据库，静态目录按周；备份文件加密并异地保存。

### 会话与数据清理

- `worker_debug_sessions` 7 天不活跃自动清理
- 导出产物、图片、文件不会自动清理，按保留策略定期归档
- 工位日志与临时文件按磁盘水位清理

### 磁盘监控

重点目录：`worker/`、`webroot-images/`、`export-files/`、`files/`、`logs/`。

## 升级与回滚

### 升级

```bash
cd /home/ecs-user/work/lita-work
git pull
pnpm install
pnpm -C backend db:migration:run
pnpm build
sudo systemctl restart lita-work
```

升级前先备份数据库；迁移先于重启执行。

### 回滚

1. 停止服务
2. `git checkout <previous-tag-or-commit>`
3. 回退迁移：`pnpm -C backend db:migration:revert`（按需多次）
4. `pnpm install && pnpm build`
5. 启动并做冒烟检查

注意：迁移回退不一定能恢复被删除的数据，回滚前先确认备份可用。

## 故障排查

| 现象 | 优先检查 |
| --- | --- |
| 登录跳回 `/login?error=...` | 官方机器人配置、App ID/Secret、重定向 URL、网页授权权限 |
| `/api/auth/me` 一直 401 | Cookie 域/`COOKIE_SECURE`、`AUTH_JWT_SECRET` 是否变更、反代是否丢 Cookie |
| 执行器离线 | 网络/端口、Basic 密码、opencode server 是否存活、`/check` 返回 |
| 机器人选不到模型 | `sync-providers`、执行器 `providersCache`、opencode 是否配置供应商 |
| 任务一直待接受 | 机器人是否启用、任务定义是否绑定、执行容量、LOOP 是否在跑 |
| 任务执行无输出 | 执行器事件流、session id、SSE 连接、opencode 日志 |
| 页面不实时 | Nginx `proxy_buffering off`、SSE 路径、`visibleEventSource` 是否断开 |
| 飞书发不出 | 官方机器人配置、`FEISHU_BOT_MASTER_KEY`、群开关、chat_id、应用权限 |
| 知识库搜索报错 | pgvector 扩展、embedding 配置、向量维度、数据库权限 |
| 迁移失败 | 数据库权限、扩展、锁、是否有备份 |
| 工位初始化失败 | `WORKER_BASE_DIR` 权限、执行器 shell 可用性、磁盘空间 |
| MCP 401 | 令牌是否正确、是否放在 `Authorization`/`X-Worker-Token`、是否被重置 |
| 磁盘满 | 工位、图片、导出、日志；先清理再扩容 |
| 任务卡住不推进 | LOOP 日志、`task_worker_inbox`、`wakeups`、外部事件回调 |

## 安全清单

- 生产必须 HTTPS，`COOKIE_SECURE=true`
- 数据库、执行器端口只对必要网段开放，不暴露公网
- `AUTH_JWT_SECRET`、`FEISHU_BOT_MASTER_KEY`、`GITHUB_PAT_MASTER_KEY` 只用强随机值，不写进仓库
- 机器人令牌泄露后立即在个人中心重置
- 数据库使用最小权限账号；备份加密
- 定期检查 MCP 调用审计、飞书官方消息审计
- 工位目录权限 600 的敏感文件不允许机器人读取/改写
- 上线前跑一遍「首次启动检查清单」

## 容量与扩容

| 维度 | 观察点 | 扩容方式 |
| --- | --- | --- |
| 机器人并发 | `maxParallelTasks`、执行器会话数 | 加执行器/提高上限 |
| SSE 连接 | Nginx 连接数、后端内存 | 调大 worker 连接、拆分实例 |
| 数据库 | 连接池、慢查询、磁盘 | 加从库/升配/归档 |
| 工位磁盘 | 每个机器人目录大小 | 独立数据盘/定期清理 |
| 飞书频率 | API 限流错误 | 降频/批量/加应用 |

## 常用命令速查

```bash
# 安装与构建
pnpm install
pnpm build

# 迁移
pnpm -C backend db:migration:run
pnpm -C backend db:migration:revert

# 启动
node backend/dist/main.js
pnpm -C backend start:prod

# 前端
pnpm -C frontend build

# 执行器桥
pnpm -C executor-bridge build
KERNEL=kiro BRIDGE_PORT=16010 BRIDGE_TOKEN=... node executor-bridge/dist/main.js

# 检查
curl http://127.0.0.1:3000/api
curl -H "Authorization: Bearer <token>" http://127.0.0.1:16010/health

# 备份
pg_dump -Fc -h 127.0.0.1 -U work_app project > backup.dump
```
