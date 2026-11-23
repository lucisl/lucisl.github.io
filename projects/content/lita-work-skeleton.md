## 这份清单解决什么问题

这是一份<strong>文件级最小实现清单</strong>：不追求功能全，只追求先跑通「登录 → 机器人 → 任务 → 验收」这条主链路。按本清单建文件、写最小实现，再按《分阶段提示词》逐段让 AI 补全。

目标版本只依赖：PostgreSQL + 一个 opencode 执行器。飞书、工单、知识库、MCP、Appium 都可以后加。

## 最小目录树

```text
work/
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── data-source.ts
│   │   ├── common/
│   │   │   ├── enums.ts
│   │   │   ├── frontmatter.ts
│   │   │   └── paths.ts
│   │   ├── auth/
│   │   │   ├── user.entity.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.guard.ts
│   │   │   └── public.decorator.ts
│   │   ├── workers/
│   │   │   ├── worker.entity.ts
│   │   │   ├── workers.module.ts
│   │   │   ├── workers.service.ts
│   │   │   ├── workers.controller.ts
│   │   │   └── worker-environment.service.ts
│   │   ├── executors/
│   │   │   ├── executor.entity.ts
│   │   │   ├── executors.module.ts
│   │   │   ├── executors.service.ts
│   │   │   ├── executors.controller.ts
│   │   │   ├── opencode-client.ts
│   │   │   └── opencode-event-hub.service.ts
│   │   ├── tasks/
│   │   │   ├── task.entity.ts
│   │   │   ├── task-template.entity.ts
│   │   │   ├── task-message.entity.ts
│   │   │   ├── task-event.entity.ts
│   │   │   ├── tasks.module.ts
│   │   │   ├── tasks.service.ts
│   │   │   ├── task-dispatch.service.ts
│   │   │   ├── task-loop.service.ts
│   │   │   ├── task-chat.service.ts
│   │   │   ├── task-handoff.service.ts
│   │   │   ├── tasks.controller.ts
│   │   │   └── task-templates.controller.ts
│   │   └── migrations/
│   │       └── 1-init.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── nest-cli.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── context/AuthContext.tsx
│   │   ├── components/Layout.tsx
│   │   ├── components/MarkdownViewer.tsx
│   │   ├── components/agent-chat/DebugChat.tsx
│   │   ├── lib/api.ts
│   │   ├── lib/event-source.ts
│   │   └── pages/
│   │       ├── LoginPage.tsx
│   │       ├── TaskListPage.tsx
│   │       ├── TaskDetailPage.tsx
│   │       ├── AdminWorkersPage.tsx
│   │       └── RobotChatPage.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── pnpm-workspace.yaml
```

## 后端文件清单

| 文件 | 职责 | 最小实现要点 | 完成标准 |
| --- | --- | --- | --- |
| `main.ts` | 启动入口 | 全局前缀 `/api`、CORS、静态目录、`ValidationPipe` | `GET /api/health` 返回 200 |
| `app.module.ts` | 根模块 | 注册 ConfigModule、TypeOrmModule、各业务模块、全局 AuthGuard | 启动无循环依赖 |
| `data-source.ts` | TypeORM 数据源 | 从 `DB_*` 读连接；生产 `synchronize:false` | 迁移命令可执行 |
| `common/enums.ts` | 全量枚举 | 先生成任务/机器人/身份相关枚举 | 前后端枚举字符串一致 |
| `common/frontmatter.ts` | Markdown 前置信息 | 生成 `update`（北京时间）、标题等 | `.md` 响应以 `---` 开头 |
| `common/paths.ts` | 静态目录 | 解析 `DIR_IMAGE_WEBROOT` 等 | 图片/文件路径可访问 |
| `auth/user.entity.ts` | 用户表 | `id, feishuOpenId, unionId, name, avatarUrl, department, role, enabled, lastLoginAt` | 表自动创建/迁移成功 |
| `auth/auth.service.ts` | 登录与用户 | 飞书 OAuth 换 token、按 union_id/open_id upsert、首个登录用户管理员、签发 JWT | 登录后 `users` 有记录 |
| `auth/auth.controller.ts` | 登录端点 | `GET /auth/feishu` 302、`GET /auth/feishu/callback`、`GET /auth/me`、`POST /auth/logout` | 浏览器能完成登录 |
| `auth/auth.guard.ts` | 全局守卫 | 读 HttpOnly Cookie → 校验 JWT → 挂 `req.user`；`.md` 端点走令牌分支；`@Public()` 放行 | 未登录 JSON 接口 401 |
| `auth/public.decorator.ts` | 放行标记 | `SetMetadata(IS_PUBLIC_KEY, true)` | 登录端点可匿名访问 |
| `workers/worker.entity.ts` | 机器人表 | 先做 `name, intro, runtime, executorId, providerId, modelId, prompt, enabled, maxParallelTasks, humanUserId, agentToken` | 能存两类机器人 |
| `workers/workers.service.ts` | 机器人 CRUD | 创建/编辑/删除；真人机器人唯一绑定；令牌生成与重置 | 能建 AI 机器人与真人机器人 |
| `workers/workers.controller.ts` | 管理接口 | `GET/POST/PATCH/DELETE /workers`；管理员校验 | 非管理员 403 |
| `workers/worker-environment.service.ts` | 工位初始化 | `mkdir` 工位；写 `AGENTS.md`、`.agents/.env`、`.agents/mcp.json`、内核 MCP 配置；同步技能/规范 | 工位目录结构正确 |
| `executors/executor.entity.ts` | 执行器表 | `name, ip, port, type, token, enabled, online` | 能登记 opencode |
| `executors/opencode-client.ts` | opencode 客户端 | HTTP Basic；`createSession/prompt/interrupt/messages/events` | 能建会话并收到事件 |
| `executors/opencode-event-hub.service.ts` | 事件中心 | 每个执行器一条 SSE；按需 connect；事件总线按 sessionId 分发 | 多任务事件不串 |
| `executors/executors.controller.ts` | 执行器管理 | CRUD + 健康检查 + 同步 providers | 管理区可配 |
| `tasks/task.entity.ts` | 任务主表 | 状态/子状态、父子树、需求方、执行机器人、会话 id、HANDOFF 版本等（见手册附录 A） | 能表达完整状态机 |
| `tasks/task-template.entity.ts` | 任务定义 | `name, description, agentIds` | 能选默认机器人 |
| `tasks/task-message.entity.ts` | 任务对话 | `taskId, messageKey, role, sender, content, reasoning, status, kind, tools, question` | 刷新后对话可恢复 |
| `tasks/tasks.service.ts` | 任务 CRUD/查询 | 创建任务、列表、详情、子任务、状态更新、权限校验 | 任务能被创建和读取 |
| `tasks/task-dispatch.service.ts` | 派发引擎 | `claimExecution` 行锁占容量；`offer/dispatch`；建/复用会话；prompt；事件终态；释放机器人；申请验收 | 机器人能执行并交付 |
| `tasks/task-loop.service.ts` | 调度循环 | 每秒扫描：待分配分配、待接受邀约、待继续恢复、待反馈/待验收提醒 | 任务能自动推进 |
| `tasks/task-chat.service.ts` | 对话聚合 | 合并任务事件与 `task_messages`；SSE 快照+增量 | 页面实时看到对话 |
| `tasks/task-handoff.service.ts` | 交付文档 | 首次 `baseVersion=0`；更新校验版本；409；申请验收锁定 | 并发更新不丢内容 |
| `tasks/tasks.controller.ts` | 任务 API | 创建、接受/拒绝、消息、提问答复、HANDOFF、申请验收、验收/驳回/判失败 | 主链路 API 完整 |
| `tasks/task-templates.controller.ts` | 任务定义 API | `GET/POST/PATCH/DELETE` | 管理区可配 |
| `migrations/1-init.ts` | 初始迁移 | 建上述表与索引 | 空库可迁移 |

### 后端最小 API

```text
GET    /api/health
GET    /api/auth/feishu
GET    /api/auth/feishu/callback
GET    /api/auth/me
POST   /api/auth/logout

GET    /api/workers
POST   /api/workers
PATCH  /api/workers/:id
DELETE /api/workers/:id
POST   /api/workers/:id/initialize

GET    /api/executors
POST   /api/executors
PATCH  /api/executors/:id

GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks/create.md
POST   /api/tasks/:id/accept-task.md
POST   /api/tasks/:id/refuse.md
POST   /api/tasks/:id/messages/reply.md
POST   /api/tasks/:id/questions/ask.md
POST   /api/tasks/:id/questions/:questionId/answer.md
POST   /api/tasks/:id/handoff/update.md
POST   /api/tasks/:id/deliver/apply.md
POST   /api/tasks/:id/handoff/accept.md
POST   /api/tasks/:id/handoff/refuse.md
POST   /api/tasks/:id/fail.md
GET    /api/tasks/stream
```

## 前端文件清单

| 文件 | 职责 | 最小实现要点 | 完成标准 |
| --- | --- | --- | --- |
| `main.tsx` | 入口 | ThemeProvider、AuthProvider、RouterProvider | 页面能渲染 |
| `App.tsx` | 路由 | `/login`、`/tasks`、`/tasks/:id`、`/admin/workers`；`RequireAuth` | 未登录跳登录 |
| `context/AuthContext.tsx` | 会话 | 启动请求 `/auth/me`；提供 user/refresh/logout | 刷新保持登录 |
| `components/Layout.tsx` | 布局 | 顶部导航 + 左侧分区；管理员才显示管理区 | 导航正确 |
| `lib/api.ts` | API 客户端 | `request()` 统一错误；任务/机器人/执行器类型 | 类型与后端一致 |
| `lib/event-source.ts` | SSE 封装 | `visibleEventSource`：隐藏断开、恢复重连 | 切换标签页不断流 |
| `pages/LoginPage.tsx` | 登录 | 跳 `/api/auth/feishu` | 能登录 |
| `pages/TaskListPage.tsx` | 任务列表 | 拉列表 + SSE 增量；状态筛选 | 实时更新 |
| `pages/TaskDetailPage.tsx` | 任务详情 | 基本信息、对话、HANDOFF、操作按钮 | 可完成验收 |
| `components/agent-chat/DebugChat.tsx` | 对话组件 | 消息列表、输入框、SSE 增量、提问卡片 | 机器人回复流式展示 |
| `components/MarkdownViewer.tsx` | Markdown 渲染 | react-markdown + remark-gfm + mermaid 回退 | HANDOFF 正常渲染 |
| `pages/AdminWorkersPage.tsx` | 机器人管理 | 列表/新建/编辑/初始化 | 能配模型与执行器 |
| `pages/RobotChatPage.tsx` | 机器人对话 | 选机器人、会话、流式回复 | 能多轮聊 |

## 最小数据库表

MVP 只需要 6 张表：

| 表 | 关键字段 |
| --- | --- |
| `users` | id, feishu_open_id, union_id, name, role, enabled, last_login_at |
| `executors` | id, name, ip, port, type, token, enabled, online |
| `workers` | id, name, runtime, executor_id, provider_id, model_id, prompt, enabled, max_parallel_tasks, human_user_id, agent_token |
| `task_templates` | id, name, description, agent_ids |
| `tasks` | id, code, title, template_id, parent_id, root_id, status, sub_status, requester_type/id, agent_id, executor_id, opencode_session_id, handoff_path, handoff_version, handoff_submitted_version |
| `task_messages` | id, task_id, message_key, role, sender, content, reasoning, status, kind, tools, question |

工单、知识库、话题、唤醒、反馈、灵感、提测、缺陷的表在后续里程碑再加。

## 建文件顺序

按这个顺序写，能保证每一步都可运行、可验证：

1. `pnpm-workspace.yaml` + 两个 `package.json` + tsconfig
2. `main.ts` / `app.module.ts` / `data-source.ts` + `health`
3. `common/enums.ts` + `auth/*`（先本地假登录也可以，后面换飞书）
4. `workers/*` + 管理页
5. `executors/*` + opencode 连通性验证
6. `worker-environment.service.ts` + 工位初始化
7. `tasks/*`（实体 → service → dispatch → loop → controller）
8. 前端任务列表/详情 + SSE
9. 对话/HANDOFF/验收
10. 迁移与测试

## 每一步的完成标准

| 阶段 | 完成标准 |
| --- | --- |
| 骨架 | 前后端能启动，`/api/health` 200，前端能打开 |
| 登录 | 飞书登录成功，`/auth/me` 返回用户，未登录 401 |
| 机器人 | 能建 AI 机器人，工位目录生成，`AGENTS.md` 与 `.agents/.env` 正确 |
| 执行器 | 能建会话、发 prompt、收到流式事件 |
| 任务 | 创建任务 → 分配 → 接受 → 执行 → 提问/答复 → 交付 → 验收 |
| 对话 | 刷新页面后对话与工具调用仍在 |
| 验收 | 通过/不通过/判失败都能推进状态机 |

## 不要做的事

- 不要先做飞书、工单、知识库；它们会拖慢主链路
- 不要为「以后可能用到」提前抽象；先按单执行器、单机器人写
- 不要在 MVP 做权限矩阵；先做管理员/成员两级
- 不要把业务逻辑放进 controller；controller 只做参数与权限
- 不要依赖数据库级联删除；删除时应用层清理

## 与完整手册的对应关系

| 本清单 | 完整手册章节 |
| --- | --- |
| 目录树/依赖 | 二、技术栈与工程结构 |
| 身份/令牌 | 四、身份与鉴权 |
| 表结构 | 五、数据模型 + 附录 A |
| 任务链路 | 七、7.1–7.4 |
| 工位/执行器 | 七、7.9 |
| 前端 | 八、前端 |
| 验收 | 十二、验收清单 |
