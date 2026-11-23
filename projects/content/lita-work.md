## 这份文档怎么用

这是一份<strong>可重建说明书</strong>：目标是让一个没有参与过项目的 AI，读完本文 + 仓库代码后，能按同样的架构搭出一个功能等价的平台。

阅读顺序建议：

1. 先读「产品定位」「技术栈」「进程与部署」，建立全局图
2. 再读「身份与鉴权」「数据模型」，把底座搭起来
3. 然后按「核心流程」逐个实现：任务 → 工单 → 知识库 → MCP → 飞书
4. 最后看「从零重建路线」和「验收清单」，按里程碑推进
5. 附录里有完整的实体清单、路由清单、MCP 工具、枚举和目录树，实现时直接查

<strong>重建目标</strong>：一个以 AI 为中心的项目管理平台，真人和 AI 机器人都是执行者；机器人有工位、角色、模型、权限，可以接任务、执行、交付、被验收；平台对 Agent 开放 MCP。

<strong>非目标</strong>：像素级还原现有 UI、迁移历史数据、复刻具体业务活动、接入特定公司基础设施。这些都可以按同一套接口替换。

## 延伸阅读

如果准备真的动手重建，再配合这两份材料：

<div class="ws-topic-grid">
  <a class="ws-topic-card" href="./lita-work-skeleton.html">
    <span class="ws-topic-index">01 / SKELETON</span>
    <b>最小代码骨架</b>
    <small>文件级清单：每个文件放什么、先建哪张表、按什么顺序跑通</small>
  </a>
  <a class="ws-topic-card" href="./lita-work-prompts.html">
    <span class="ws-topic-index">02 / PROMPT PACK</span>
    <b>分阶段提示词</b>
    <small>把 M0–M8 拆成可直接投给 AI 的 9 段提示词</small>
  </a>
  <a class="ws-topic-card" href="./lita-work-ops.html">
    <span class="ws-topic-index">03 / RUNBOOK</span>
    <b>运维部署手册</b>
    <small>进程拓扑、环境变量、执行器与工位、飞书配置、备份回滚与排障</small>
  </a>
  <a class="ws-topic-card" href="./lita-work-skills-mcp.html">
    <span class="ws-topic-index">04 / SKILLS &amp; MCP</span>
    <b>技能与 MCP</b>
    <small>技能库、规范库、平台 MCP 与外部 MCP 的配置与注入</small>
  </a>
</div>

## 一、产品定位与功能地图

### 一句话

Lita 工作中心（WorkHub）是一个以 AI 为中心的项目管理平台：需求、迭代、任务、工单、提测、缺陷全链路在线，AI 机器人作为「员工」参与执行，平台通过 MCP 把能力开放给外部 Agent。

### 使用者

| 角色 | 用平台做什么 |
| --- | --- |
| 管理员 | 配置机器人、执行器、模型、飞书应用、MCP，管理用户与工作流 |
| 研发 / 测试 / 产品 | 提需求、排迭代、建任务、验收、提测、报缺陷、讨论 |
| AI 机器人 | 接任务、执行、提问、交付、申请验收；在飞书群里回复 |
| 真人机器人 | 代表真人接受任务、在操作台执行、交付 |
| 外部 Agent | 通过 MCP 读写平台数据，或把平台机器人当子 Agent 调用 |

### 功能地图

| 能力 | 作用 | 重建优先级 |
| --- | --- | --- |
| 用户与登录 | 飞书 OAuth、成员/管理员、通讯录同步 | P0 |
| 机器人 | AI / 真人 / 个人 AGENT，工位、角色、技能、规范、MCP、权限 | P0 |
| 执行器 | opencode 直连 + executor-bridge 多内核，会话、事件流、提问 | P0 |
| 任务处理中心 | 状态机、派发、多轮对话、交付文档、验收、子任务 | P0 |
| 工单与工作流 | 定义、发布版本、运行时、审批/验收/判断/飞书消息节点 | P0 |
| 知识库 | 目录/文章树、全文 + 向量混合检索、Embedding 队列 | P1 |
| 话题 | 挂在任务/工单/需求/迭代项/缺陷下的讨论串，飞书双向同步 | P1 |
| 定时唤醒 | 机器人设置「多久后唤醒我」，等待人工/外部结果 | P1 |
| MCP 开放层 | lita-work 平台工具、lita-bots 调用机器人 | P1 |
| 飞书集成 | 官方机器人、长连接、群策略、任务群、话题、反馈采集 | P1 |
| 需求池 / 迭代 / Backlog | 飞书需求池同步、T0/T7/Tx 迭代、迭代项 | P2 |
| 提测与缺陷 | 提测工单、提测记录、缺陷状态机、脚本回归自动关闭 | P2 |
| 用户反馈 / 灵感 | 全员 BUG REPORT、想法收集与采纳 | P2 |
| 模型配置 | 固定场景的 OpenAI 兼容连接、标题生成、需求摘要/描述 | P2 |
| SSO | 平台作为 OAuth2 IdP 给其它站点登录 | P2 |
| Appium / GitHub | 移动端远程运行、仓库/分支/提交事件、凭证网关 | P2 |

### 业务主链路

```
需求池（飞书单向同步）
  → 迭代（T0 / T7 / Tx）
    → 迭代项 Backlog（成员=机器人，负责人）
      → 交付任务（状态机 + 执行器会话）
        → 工单（工作流：操作/审批/验收/判断/飞书消息）
          → 提测（批量建提测工单 + 提测记录）
            → 缺陷（测试脚本回归成功自动关闭）
```

横切能力：话题、知识库、定时唤醒、MCP、飞书。

### 术语

| 术语 | 含义 |
| --- | --- |
| 机器人 worker | 平台执行者：AI 机器人、真人机器人、个人 AGENT |
| 真人机器人 | 每个用户唯一的 human runtime 机器人，代表本人在任务里执行 |
| 个人 AGENT | 只服务「我的 AI」对话的机器人，不承接任务 |
| 工位 | 每个机器人的独立工作目录，含 AGENTS.md、技能、规范、MCP 配置 |
| 执行器 executor | 跑执行内核的进程/机器，如 opencode server 或 executor-bridge |
| 会话 session | 执行内核里的一次上下文；一个任务固定一个会话 |
| 任务定义 | task_templates，规定任务包与默认处理机器人 |
| 工单定义 | workflow_definitions，含草稿与不可变发布版本 |
| Backlog | 迭代项，独立于需求的交付单元 |
| `.md` 端点 | 面向 Agent 的 Markdown 视图/操作入口，带 YAML frontmatter |

## 二、技术栈与工程结构

### 后端

| 项 | 选型 |
| --- | --- |
| 框架 | NestJS 11（strict TypeScript） |
| ORM | TypeORM 1.1 |
| 数据库 | PostgreSQL（业务库）+ pgvector（知识库） |
| 鉴权 | jsonwebtoken（HttpOnly Cookie）+ 机器人令牌 |
| 飞书 | `@larksuiteoapi/node-sdk`（OAuth、长连接、文档、消息） |
| MCP | `@modelcontextprotocol/sdk`（Streamable HTTP） |
| 参数校验 | zod（MCP 工具 schema）、class-validator/DTO |
| 定时 | `@nestjs/schedule` + `cron` |
| 模板 | handlebars（工单飞书消息模板） |
| 其它 | axios、rxjs、ws、pinyin-pro、pg |

精确依赖（backend/package.json）：

```text
@larksuiteoapi/node-sdk ^1.76.0, @modelcontextprotocol/sdk ^1.32.2,
@nestjs/common ^11.0.1, @nestjs/config ^4.0.4, @nestjs/core ^11.0.1,
@nestjs/platform-express ^11.0.1, @nestjs/schedule ^6.1.3,
@nestjs/typeorm ^11.0.3, axios ^1.19.0, cron 4.4.0, dotenv ^17.4.1,
express ^5.2.1, handlebars ^4.7.10, jsonwebtoken ^9.0.3, pg ^8.23.1,
pinyin-pro ^3.29.5, reflect-metadata ^0.2.2, rxjs ^7.8.1,
typeorm ^1.1.0, ws ^8.18.0, zod ^4.6.7
```

### 前端

| 项 | 选型 |
| --- | --- |
| 构建 | Vite 8 + React 19 |
| UI | Appica UI（`@appica/ui-react`）+ Tailwind CSS v4 |
| 路由 | react-router-dom 7（Hash 不参与，普通路径） |
| Markdown | react-markdown + remark-gfm；编辑器用 Milkdown Crepe |
| 图表 | mermaid |
| 动画 | framer-motion |
| AI 聊天 | `@assistant-ui/react` |
| 搜索 | pinyin-pro（拼音匹配） |

精确依赖（frontend/package.json）：

```text
@appica/icons-react ^1.0.0, @appica/ui-react ^1.3.0,
@assistant-ui/react ^0.15.31, @assistant-ui/react-markdown ^0.14.24,
@codemirror/language ^6.13.1, @codemirror/language-data ^6.5.2,
@milkdown/crepe 7.22.3, @tailwindcss/vite ^4.3.3,
framer-motion ^14.6.0, github-slugger ^2.0.0, mermaid ^12.2.0,
pinyin-pro ^3.29.5, react ^19.2.8, react-dom ^19.2.8,
react-markdown 10.1.0, react-router-dom ^7.18.2,
remark-gfm ^4.0.1, tailwindcss ^4.3.3
```

### 目录结构

```text
work/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/             # 飞书 OAuth、会话、用户同步、令牌
│   │   ├── sso/              # OAuth2 IdP
│   │   ├── workers/          # 机器人、工位、个人 AGENT、技能/规范
│   │   ├── executors/        # opencode 客户端、bridge、事件中心
│   │   ├── tasks/            # 任务状态机、派发、协同、文档、工作台
│   │   ├── tickets/          # 工单与工作流运行时
│   │   ├── workflows/        # 工作流定义与发布
│   │   ├── iterations/       # 迭代与 Backlog
│   │   ├── projects/         # 需求池（复用 projects 表）
│   │   ├── documents/        # 项目文档
│   │   ├── knowledge/        # 知识库
│   │   ├── topics/           # 话题
│   │   ├── wakeups/          # 定时唤醒
│   │   ├── feedbacks/        # 用户反馈
│   │   ├── ideas/            # 灵感
│   │   ├── defects/          # 缺陷
│   │   ├── releases/         # 提测
│   │   ├── checks/ tests/ exports/ schedules/ scripts/  # 脚本与运行
│   │   ├── feishu/ feishu-bot/  # 飞书导入与机器人
│   │   ├── github/ github-gateway/ # 代码托管与凭证
│   │   ├── agent/ remote-run/ app-versions/ # Appium
│   │   ├── model-config/     # 模型场景与 LLM 调用
│   │   ├── mcp/              # MCP 服务（lita-work / lita-bots）
│   │   ├── mcp-servers/      # 外部 MCP 配置
│   │   ├── settings/ files/ images/  # 设置与上传
│   │   ├── common/           # 枚举、路径、frontmatter、拼音搜索
│   │   └── migrations/       # TypeORM 迁移
│   └── package.json
├── frontend/                 # React 19 SPA
│   ├── src/
│   │   ├── App.tsx           # 路由与守卫
│   │   ├── components/       # 布局、编辑器、详情、任务协作
│   │   ├── pages/            # 页面
│   │   ├── lib/api.ts        # API 客户端与类型
│   │   ├── lib/event-source.ts # SSE 封装
│   │   └── context/AuthContext.tsx
│   └── package.json
├── executor-bridge/          # 工位侧多内核桥（kiro/devin/droid）
├── appium-agent/             # 移动端自动化 Agent
├── docs/                     # 设计文档（执行器协议、SSO、工位规范）
├── AGENTS.md                 # 跨模块不变量（必读）
└── pnpm-workspace.yaml
```

### 常用命令

| 操作 | 命令 |
| --- | --- |
| 安装 | `pnpm install` |
| 启动后端 | `pnpm dev:backend` → `http://localhost:3100/api` |
| 启动前端 | `pnpm dev:frontend` → `http://localhost:5273` |
| 构建 | `pnpm build` |
| Lint | `pnpm lint` |
| 单测 | `pnpm test` |
| E2E | `pnpm -C backend test:e2e` |
| 迁移 | `pnpm -C backend db:migration:run` |
| 回退迁移 | `pnpm -C backend db:migration:revert` |

### 数据库约定

- 业务库使用 `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`
- 知识库可独立配置 `PROJECT_PG_*`，缺省复用业务库，需装 pgvector
- 所有时间列用 `timestamptz`；纯日期用 `date`；会话时区 `Asia/Shanghai`
- **不使用物理外键与数据库级联删除**，关系与清理由应用层维护
- 生产结构变更必须新增 migration；`synchronize` 仅非生产开启

## 三、进程与部署

### 进程图

```text
浏览器
  │  HTTP / SSE
  ▼
Nginx（可选） ── /api → backend:3000，/images /files /export-files → 静态目录
  │
  ▼
backend（NestJS）
  ├── PostgreSQL（业务库；知识库可用同库或独立 PG + pgvector）
  ├── 执行器 A：opencode server（HTTP Basic + SSE /api/event）
  ├── 执行器 B：executor-bridge（HTTP + SSE /events，内核 kiro/devin/droid）
  ├── 飞书开放平台（OAuth、tenant token、WebSocket 长连接、消息/文档 API）
  ├── Appium Agent（WebSocket /api/ws）
  └── GitHub / OP Gateway（仓库事件、短租凭证）
```

### 最小可运行拓扑

1. 一个 PostgreSQL（装 pgvector）
2. 一个 backend 进程
3. 一个 opencode server 进程（作为执行器）
4. 一个前端静态站点（或 Vite dev server）
5. 飞书可选：不接飞书也能用账号/密码以外的本地用户（需自行加登录方式）

### 完整拓扑

- 多个执行器：opencode 与 bridge 混合
- 多个机器人工位目录（`WORKER_BASE_DIR`）
- 飞书官方机器人应用（OAuth + 长连接 + 消息）
- Appium Agent（移动端）
- GitHub 集成与凭证网关
- 独立知识库 PostgreSQL

### 部署要点

- 生产 `NODE_ENV=production`，工位目录 `{WORKER_BASE_DIR}/worker/{id}`；其他环境 `worker-dev/{id}`
- 静态目录：`/images`、`/export-files`、`/files`，由 `main.ts` 挂载，不走 `/api`
- `/files` 公开下载，带 CSP sandbox 与 nosniff
- 迁移在发布时执行；回退用 `db:migration:revert`
- 生产必须配置 `AUTH_JWT_SECRET`；HTTPS 时 `COOKIE_SECURE=true`

## 四、身份与鉴权

### 身份类型

| 身份 | 存储 | 能力 |
| --- | --- | --- |
| 用户 | `users`，飞书 OAuth | 网页登录，管理员/成员 |
| AI 机器人 | `workers`，`runtime=opencode` | 接任务、执行、对话、MCP |
| 真人机器人 | `workers.humanUserId` 唯一绑定，`runtime=human` | 代表真人执行，可并行 |
| 个人 AGENT | `workers.personalAgentUserId` 唯一绑定 | 只服务「我的 AI」，不接任务 |
| 公共 Agent | `PUBLIC_AGENT_TOKEN` 虚拟管理员 | MCP/`.md` 高权限调用 |

### 令牌模型（关键）

- **系统只有机器人令牌，没有用户级 Agent 令牌**
- 个人中心「机器人令牌」= 该用户真人机器人的 `workers.agentToken`
- 真人机器人令牌命中时，同时挂载 `req.worker` 与 `req.user`（真人身份唯一来源）
- 个人 AGENT 共用其主人真人机器人的令牌
- AI 机器人使用自身令牌，操作记为机器人身份
- 未绑定真人的 AI 机器人，在 `lita-bots` 会话里用负 ID 隔离

### 网页会话

- 飞书 OAuth 授权码 → 后端换用户信息 → 签发 JWT → HttpOnly Cookie（7 天）
- 全局 `AuthGuard` 保护 JSON API；`@Public()` 例外（登录流程）
- 角色：管理员 / 成员；管理接口必须服务端校验管理员

### `.md` 端点

- 返回 `text/markdown`，以 YAML Frontmatter 开头（至少含北京时间 `update`）
- 鉴权优先级：
  1. `X-Worker-Token`（机器人）
  2. `X-Agent-Token` 或 `?token=`（机器人令牌 / 公共 Agent）
  3. 网页会话 Cookie
- 显式提供错误令牌时直接 401，不回退 Cookie
- 浏览器导航打开实体 `.md` 时 302 到对应网页视图；带令牌或非导航请求返回 Markdown
- 静态路由和 `.md` 路由必须声明在 `:id` 前

### 权限边界

- 管理接口校验管理员
- 机器人动作校验当前执行机器人
- 需求方动作校验需求方身份
- 个人 AGENT 仅本人/管理员可访问
- 机器人令牌不得出现在响应、日志、`.md` 详情中

### SSO（可选）

- 平台作为 OAuth2 授权码 IdP：`/api/sso/authorize`、`/api/sso/token`、`/api/sso/userinfo`
- 接入方在管理区登记 `clientId/clientSecret`，回调白名单精确匹配
- 授权码一次性、10 分钟；access_token 2 小时，独立 JWT（`typ=sso_access`）
- `userinfo` 返回登录真人绑定的真人机器人身份

## 五、数据模型

### 关系总览（应用层软引用，无物理外键）

```text
users 1─1 workers(humanUserId)          # 真人机器人
users 1─1 workers(personalAgentUserId)  # 个人 AGENT
executors 1─n workers
task_templates 1─n tasks
tasks 1─n tasks (parentId/rootId 树)
tasks 1─n task_messages
tasks 1─n task_worker_inbox
workers 1─n wakeups
projects 1─n documents / releases / defects / feedbacks? 
projects 1─n backlogs
iterations 1─n backlogs
backlogs 1─n backlog_events / backlog_documents
tickets 1─n ticket_documents / ticket_workflow_runs
workflow_definitions 1─n workflow_definition_versions
topics 1─n topic_posts / topic_follows / topic_worker_inbox
knowledge_nodes 1─n knowledge_chunks
feishu_bot_configs 1─n feishu_bot_groups / feishu_bot_group_records
```

### 核心表详解

<strong>users</strong>：`id, feishuOpenId, unionId, name, avatarUrl, email, department, role, enabled, lastLoginAt, feishuAccessToken/refresh/expiresAt, createdAt, updatedAt`。首个登录用户自动管理员；通讯录同步按 union_id 优先认人。

<strong>workers</strong>：机器人主表。
`id, name, systemKey, intro, avatarUrl, role(工作者/调度器), runtime(opencode/human/kiro/devin/droid...), executorId, providerId, modelId, variant, backupProviderId/backupModelId/backupVariant, prompt, skills, standards, mcps, taskDefs, humanUserId/humanUserName, personalAgentUserId, ownerUserId/ownerName, agentToken, githubPermission, resourcePermission, maxParallelTasks, enabled`。

<strong>executors</strong>：`id, name, ip, port, type(opencode/codex/claude-code/kiro/devin/droid), token, enabled, online, version, defaultLocation, providersCache, capabilitiesCache, providersSyncedAt, lastCheckedAt`。

<strong>tasks</strong>：任务核心表（字段见附录 A）。
关键：`code, title, type, templateId, projectId, parentId, rootId, sortOrder, description, input, content, outputSpec, missingItems, status, subStatus, requesterType/requesterId, resumePrompt, assignedAt, offerAttemptAt, offerStallRemindCount, workPlan, remindCount, firstRemindedAt/lastRemindedAt, agentId, schedulerId, executorId, opencodeSessionId, result, handoffPath, handoffVersion, handoffSubmittedVersion, handoffUpdatedAt/By, acceptedAt/By, deliveredAt, acceptRejectCount, ownerTakeoverAt/UserId/Name, archivedAt, refusedAt/By/Reason, dispatchSuggestion, failedAt/By/Reason, canceledAt, createdById, planRef`。

<strong>task_messages</strong>：任务对话持久化。`taskId, messageKey(唯一), role, sender, content, reasoning, status, kind, tools, question`。用户消息由任务反馈事件承载，机器人消息在此落库。

<strong>task_templates</strong>：任务定义。`id, name, description, agentIds, ...`；系统定义 `<1000`（6 未知、7 项目交付、8 用户反馈、9 迭代交付、16 技术-迭代-交付）。

<strong>tickets</strong>：工单。`code, category, title, description, createdById/Name, assigneeType/Id/Name, taskId, backlogId, workflowDefinitionId/VersionId/Version, initiatorWorkerId/Name, inputValues, workflowStatus, currentNodeKey/Name`。

<strong>workflow_definitions / workflow_definition_versions</strong>：定义保存草稿与最新发布版本号；版本不可变，创建工单固定用最新发布版本。

<strong>iterations / backlogs</strong>：迭代（T0/T7/Tx）与迭代项。Backlog 字段：`code, iterationId, projectId, title, status, ownerWorkerId/Name, expectedOnlineAt, members[{role,workerId,name}], taskId, statusBy, startedAt/testingAt/releasingAt/completedAt/canceledAt`。

<strong>projects</strong>：需求池复用项目实体。`name, type, status(读时推导), expectedReleaseAt, priority, iterationCycle, owner, involvedParties, remark, feishuRecordId, description, summary, scriptsPath, feishuWebhook`。

<strong>documents</strong>：项目文档。`title, fileName, type, source, description, content, remark, knowledgeId, feishuUrl, feishuToken, apipostUrl, url, projectId`。外部导入正文只读，只能重新同步。

<strong>topics / topic_posts / topic_follows / topic_worker_inbox</strong>：话题挂在 `subjectType + subjectId`；帖子 append-only，`replyToPostId` 引用；关注与机器人收件箱。

<strong>wakeups</strong>：`kind, taskId, userId, scope, workerId, note, wakeAt, status, attempts, lastAttemptAt, nextRetryAt, lastError, deliveredAt, canceledAt/Reason, processedAt`。

<strong>knowledge_nodes / knowledge_chunks</strong>：见「知识库」一节，物理表由 `knowledge.store.ts` 启动时建。

<strong>model_scenarios</strong>：`scenario(唯一), baseUrl, apiKey(select:false), model, thinkingLevel`。场景来自代码注册表：`title-naming`、`requirement-summary`、`requirement-description`。

<strong>feishu_bot_configs</strong>：`kind(official/worker), workerId, name, appId, botOpenId, secretCiphertext/iv/authTag, keyVersion, verificationToken*, encryptKey*, policy, enabled, boundAt, lastVerifiedAt, lastError`。Secret 用 AES-256-GCM 加密落库。

完整 69 张表见<strong>附录 A</strong>。

## 六、后端模块与接口

### 模块职责

| 模块 | 职责 |
| --- | --- |
| auth | 飞书 OAuth、JWT Cookie、用户同步、机器人令牌、全局鉴权 |
| sso | OAuth2 IdP（authorize/token/userinfo） |
| workers | 机器人 CRUD、工位初始化、技能/规范目录、个人 AGENT |
| executors | opencode client、bridge-client、事件中心、模型可用性 |
| tasks | 任务状态机、派发、协同、文档、工作台、实时流、唤醒 |
| tickets | 工单、工单文档、工作流运行时 |
| workflows | 工作流定义、发布版本、飞书群消息模板 |
| iterations | 迭代与 Backlog、成员、事件、提测入口 |
| projects | 需求池、项目交付任务、状态推导 |
| documents | 文档 CRUD、飞书/APIPOST 同步 |
| knowledge | 知识树、切片、混合检索、Embedding 队列 |
| topics | 话题、帖子、关注、机器人收件箱、飞书同步 |
| wakeups | 定时唤醒扫描与投递 |
| feedbacks | 用户反馈与跟帖、飞书群采集 |
| ideas | 灵感与采纳 |
| defects | 缺陷状态机、变更记录、自动关闭 |
| releases | 提测记录 |
| checks/tests/exports/schedules/scripts | 脚本登记、导入、运行、定时任务 |
| feishu | 只读导入、OAuth、tenant token |
| feishu-bot | 应用配置、长连接、群策略、任务群/项目群、官方消息 |
| github/github-gateway | 仓库/分支/提交、凭证网关、资源验权 |
| agent/remote-run/app-versions | Appium Agent、远程运行、APP 包 |
| model-config | 模型场景、LlmService |
| mcp | MCP HTTP 端点与工具注册 |
| mcp-servers | 外部 MCP 服务配置 |
| settings/files/images | 设置、上传、静态资源 |
| common | 枚举、路径、frontmatter、拼音搜索、Markdown 重定向 |

### API 约定

- 所有 JSON API 带 `/api` 前缀
- `.md` 视图/操作端点返回 Markdown + Frontmatter
- 长任务：立即返回运行记录 + SSE 推送快照/增量/终态
- SSE 端点示例：`/api/tasks/stream`、`/api/tasks/:id/stream?`、`/api/workbench/agent/stream`、`/api/worker-chats/:workerId/stream`、`/api/workers/:id/initialize/stream`、`/api/checks/runs/:runId/stream`
- 删除实体时应用层清理关联数据，不依赖级联

完整 313 条路由见<strong>附录 B</strong>。

## 七、核心流程

### 7.1 任务状态机

主状态三态，子状态严格对应：

| 主状态 | 子状态 | 含义 |
| --- | --- | --- |
| 等待中 | 待分配 | 已创建，等待平台分配机器人 |
| 等待中 | 待接受 | 已邀约机器人，等待接受/拒绝 |
| 等待中 | 待反馈 | 机器人提问，等待需求方答复 |
| 等待中 | 待继续 | 会话结束或排队，等待恢复执行 |
| 等待中 | 待申请验收 | 本轮完成，执行方尚未申请验收（不占容量） |
| 等待中 | 待验收 | 已申请验收，等待需求方验收 |
| 进行中 | 执行中 | 机器人正在执行 |
| 已结束 | 完成 / 已拒绝 / 失败 / 取消 | 终态 |

关键转移：

```text
创建 → 待分配
待分配 → 待接受（派发邀约）
待接受 → 执行中（机器人接受并 claimExecution）
待接受 → 已拒绝（拒绝需理由+分发建议）
执行中 → 待反馈（提问）
待反馈 → 待继续（答复/跳过）
待继续 → 执行中（有执行容量时恢复）
执行中 → 待申请验收（会话成功结束）
待申请验收 → 待验收（执行方显式申请验收）
待验收 → 完成（验收通过）
待验收 → 执行中（验收不通过，退回原机器人）
待验收 → 失败（需求方判失败）
任意未结束 → 已结束-取消（需求方/管理员停止，级联取消子任务）
```

规则：

- 会话成功 ≠ 任务完成，必须显式申请验收
- 验收不通过始终退回原执行机器人
- 曾申请过验收的任务，返工后需求方仍可直接验收；从未申请验收的任务不可直接完成
- 待验收时需求方发普通消息按验收不通过处理

### 7.2 派发与执行器会话

```text
LOOP（每秒）
  → 待分配：按任务定义分配机器人
  → 待接受：发送邀约（offer），等待接受/拒绝
  → 待继续：机器人有执行容量时恢复
  → 待反馈/待验收：只提醒，不占容量

机器人接受
  → claimExecution：按机器人行锁原子占用执行容量
  → dispatch：
      1. mkdir 工位
      2. 复用/创建 opencode 会话（一个任务固定一个会话）
      3. 写 .agents/.env、.agents/mcp.json、内核 MCP 配置
      4. prompt 投递任务输入与输出要求
      5. 订阅执行器事件流（按 sessionId 路由）
      6. 终态 execution.completed → 取最终回复 → 存 result
      7. 释放机器人 → 待申请验收
  → 执行方申请验收 → 待验收 + 通知需求方
```

关键实现点：

- `claimExecution` 所有入口（接受、答复恢复、返工、LOOP 恢复）共用同一机器人行锁
- AI 机器人按 `maxParallelTasks` 限制并发；真人机器人不限
- 一个任务一个 opencode session；执行中继续发的消息直接投递该 session，平台不维护队列
- 事件中心按执行器复用一条 `/api/event` SSE，引用归零后延迟断开
- 会话终态必须匹配当前 session，不能只凭进程/连接状态判断
- 主模型限额时在同一会话 `switchModel` 切备用模型，每轮最多一次

### 7.3 提问、答复、唤醒、外部事件

- 执行中提问：opencode `question.asked` → 任务转待反馈 → 生成问答卡片 → 通知需求方
- 答复：`POST /api/tasks/:id/questions/:questionId/answer.md` → 转发 opencode → 恢复执行
- 子任务事件：写 `task_worker_inbox` 唤醒父机器人；queued/delivered 超时、会话失败、缺失事件由 LOOP 按 2/10/30 分钟退避恢复
- 定时唤醒：机器人 MCP `schedule_task_wakeup` / `schedule_agent_wakeup`，`WakeupsService` 每 15 秒扫描到期投递
- 外部事件：`POST /api/tasks/:id/external-event`（纯内网免鉴权），按任务+工单+状态幂等落 `task_external_events`

### 7.4 交付文档 HANDOFF

- 目录 `/task/{yyyyMMdd}/{task.code}/`，知识路径不带 `.md`，阅读名 `X.md`
- 不在创建任务时生成；执行方开始处理后显式创建，首次 `baseVersion=0`
- 更新必须提交完整 `content + baseVersion`，冲突返回 409
- 申请验收只校验有效正文并锁定 `handoffSubmittedVersion`
- 待验收期间文档锁定；撤销交付或返工后才可编辑
- `REVIEW` 在验收通过后异步生成，固定覆盖同一路径

### 7.5 工单与工作流

定义与发布：

- `workflow_definitions` 存草稿与最新发布版本号
- `workflow_definition_versions` 存不可变发布版本
- 创建工单固定使用最新发布版本，实例继续引用创建时版本
- 发布前校验引用存在、机器人启用且非个人 AGENT、节点可达并保证路径可结束

节点类型：

| 类型 | 行为 |
| --- | --- |
| start | 起始节点，收集输入字段 |
| operation | 创建任务中心任务，按任务定义分配机器人 |
| approval | 创建审批任务，真人可一键通过/驳回，飞书卡片可操作 |
| acceptance | 验收节点，仅发起机器人（或其绑定用户）可操作 |
| condition | 不创建任务，按输入字段条件自动分流 |
| feishu-message | 不创建任务，平台官方机器人发 Markdown 卡片，失败不阻断 |

流转结果：`succeeded/failed/approved/rejected`；`$end` 是虚拟结束节点。

判断节点规则：

- 条件 = 字段 + 运算符 + 值，多条件「且」
- 必须恰好配置一条默认（无条件）分支兜底
- 连续判断节点有循环上限保护
- 多选只支持 `contains` / `empty` / `notEmpty`

运行时：

- 创建工单 → 起始节点校验输入 → 按节点类型创建任务或流转
- 节点任务终态由轮询/事件推进，不反向依赖任务模块
- 审批驳回直接结束记为工单失败；验收驳回不可直接结束
- 节点拒绝/失败必须按当前节点和流转规则推进，不得只改展示状态

### 7.6 提测与缺陷

- 提测 = 创建 `ProjectRelease` 记录；重复提测追加；不改变需求状态
- 提测入口 `POST /api/backlogs/release[.md]`：批量迭代项，每个迭代项建一张提测工单 + 一条提测记录
- 提测工单内置「提测群通知」`feishu-message` 节点，平台官方机器人发送
- 提测状态：待冒烟/进行中/已通过/未通过；真实状态变化记录判定人/时间
- 缺陷状态：开放/修复/关闭；优先级高/中/低；端前端/后端/APP端/未知
- 缺陷变更记录 append-only；改开放清空修复/验证时间，改关闭记验证时间
- 同项目、同脚本且修复态的缺陷在测试脚本成功后自动关闭

### 7.7 反馈、灵感、话题

<strong>反馈</strong>：全员 BUG REPORT，独立于缺陷；类型 BUG/建议/其它；状态待处理/处理中/已解决/已关闭。飞书反馈群按话题采集：一个话题=一条反馈，首帖建反馈并回执链接，同时建「用户反馈处理」任务（定义 ID=8）。

<strong>灵感</strong>：想法/创意/待办/建议；状态构思/废弃/采纳；构思期任何登录用户可编辑；采纳时新建或关联需求。

<strong>话题</strong>：挂在迭代项/缺陷/任务/工单/需求下；帖子 append-only；@ 机器人写 `topic_worker_inbox`，由一次性会话读 `/api/topics/{id}.md` 后经 MCP `reply_topic` 回帖；飞书群双向同步，机器人自身消息不回传防回声。

### 7.8 知识库

物理表（启动时由 `knowledge.store.ts` 建）：

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_nodes (
  id uuid PRIMARY KEY,
  path text UNIQUE NOT NULL,
  parent_path text,
  kind text NOT NULL,          -- 目录 / 文章
  name text NOT NULL,
  title text,
  content text,                -- 文章正文
  source_document_id int,      -- 项目文档镜像
  created_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY,
  node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  path text NOT NULL,
  title text,
  heading_path text,
  content text NOT NULL,
  embedding vector(1024),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(path,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(heading_path,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(content,'')), 'C')
  ) STORED
);
CREATE INDEX knowledge_chunks_search_idx ON knowledge_chunks USING gin (search_vector);
```

检索：

- 全文 + 向量并行召回，RRF 融合（支持 path/page/pageSize，pageSize ≤ 100）
- 向量不可用时降级全文；低于 `PROJECT_KNOWLEDGE_SEARCH_VECTOR_MIN_SIMILARITY`（默认 0.65）的纯向量候选不进入 RRF
- `/project/**` 与 `/task/**` 为系统镜像，通用知识写接口只读

### 7.9 机器人、工位与执行器

工位目录（内核无关）：

```text
worker/{id}/
├── AGENTS.md                  # 角色定义 + 平台协同协议
├── .agents/
│   ├── skills/<name>/SKILL.md
│   ├── rules/ + .standards-manifest.json
│   ├── .env                   # LITA_WORK_TOKEN / LITA_PROJECT_TOKEN / LITA_USER_TOKEN / LITA_APP_URL
│   └── mcp.json               # 内核无关 MCP 声明
├── docs/                      # 机器人自有文档
└── 内核适配物                  # opencode/kiro/devin/droid
```

内核 MCP 配置：

| 内核 | 路径 |
| --- | --- |
| opencode | `.opencode/opencode.json` |
| kiro | `.kiro/settings/mcp.json` |
| devin | `.devin/mcp_config.json` |
| droid | `.factory/mcp.json` |

- 固定注入 `lita-work`（`{APP_URL}/api/mcp/work` + 机器人令牌）与机器人勾选的自定义 MCP
- 令牌只经服务端落盘，权限 600；机器人不得读取/展示/改写
- opencode 注入 `permissions` deny `external_directory` 限制工作区边界（bridge 内核暂无强制拦截）

执行器：

- `ExecutorClient` 统一接口：会话、prompt、interrupt、事件流、提问
- opencode 直连 `/api/session`、`/api/session/:id/prompt`、`/api/event`
- bridge 协议：`/health`、`/sessions`、`/sessions/:id/prompt`、`/sessions/:id/interrupt`、`/events` 等（见 `docs/EXECUTOR_PROTOCOL.md`）
- 事件中心按执行器维护一条 SSE，断线 5 秒重连，空闲 30 秒断开

### 7.10 MCP 开放层

两套服务：

| 服务 | 端点 | 用途 |
| --- | --- | --- |
| `lita-work` | `POST /api/mcp/work` | 平台工具：项目/需求/迭代项/文档/知识/运行/缺陷/反馈/灵感/任务协同/工单/机器人/飞书会话 |
| `lita-bots` | `POST /api/mcp/bots` | 把平台机器人当子 Agent：`list_bots`、`bot_call`、`bot_answer`、`bot_interrupt`、`bot_reset`、`get_session` |

鉴权：`Authorization: Bearer <机器人令牌>`，也接受 `X-Worker-Token` / `X-Agent-Token` / `?token=`。

实现要点：

- MCP Streamable HTTP + JSON-RPC；`initialize`、`tools/list`、`tools/call`
- 工具参数用 zod schema；工具内部复用现有 service，不复制业务逻辑
- `bot_call` 会话复用 WorkerDebugService，scope `mcp:{sessionId}`；忙时排队、终态返回 content/tools/todos
- 每次调用写 MCP 审计日志；敏感操作服务端校验权限

完整 113 个工具见<strong>附录 C</strong>。

### 7.11 飞书集成

- 统一使用数据库配置的「平台官方机器人」应用凭据（`feishu_bot_configs kind=official`），Secret 加密落库
- tenant token 定时刷新；网页 OAuth 登录也用同一应用
- WebSocket 长连接优先，公开回调可选；事件校验并去重
- 群策略：默认仅被 @ 回复；可逐群覆盖「智能反馈」「仅记录」；反馈处理机器人支持「反馈采集」
- 任务群：一个真人 + 一个 AI 机器人的根任务；项目交付任务用独立项目沟通群
- 平台名义发送：`POST /api/feishu-bot/messages`（管理员）/ `.md`（机器人令牌）/ MCP `feishu_send_message`
- 群消息止血开关 `FEISHU_GROUP_SEND_PAUSED`；平台名义发送不受限制

### 7.12 模型配置与 LLM

- `model_scenarios` 按场景保存 OpenAI 兼容连接：`baseUrl/apiKey/model/thinkingLevel`
- 场景来自代码注册表，新增场景无需迁移
- `LlmService.ask`：非流式、20s 超时、全局并发 3；失败返回 null，调用方降级
- 标题生成：工单/根任务 `T-{id}`、话题 `TP-{id}`、迭代项 `BL-{id}`、灵感 `I-{id}`
- 机器人备用模型：主模型限额时自动切换，冷却 30 分钟（进程内）

## 八、前端

### 路由（主要）

| 路径 | 页面 |
| --- | --- |
| `/` → `/requirements` | 需求池 |
| `/requirements/:id` | 需求详情（详情/资料/讨论/操作） |
| `/iterations`、`/iterations/:id` | 迭代列表/详情 |
| `/backlogs/:id` | 迭代项详情（信息/文档/任务/缺陷/话题/事件/成员） |
| `/ideas`、`/ideas/:id` | 灵感 |
| `/feedback`、`/feedback/:id` | 反馈 |
| `/tasks`、`/tasks/list`、`/tasks/:id` | 任务列表/看板/详情 |
| `/tasks/definitions` | 任务定义 |
| `/tickets`、`/tickets/mine`、`/tickets/:id` | 工单 |
| `/workbench` | 工作台 |
| `/robots`、`/robots/:workerId` | 机器人对话 |
| `/docs/detail`、`/docs/scripts` | 知识库/脚本库 |
| `/admin/*` | 管理区（用户、机器人、执行器、工作流、MCP、模型等） |
| `/profile`、`/profile/robot` | 个人中心/助理配置 |

完整路由见 `frontend/src/App.tsx`。

### 布局规范

- 顶部导航 + 左侧分区导航（`NAV_SECTIONS`）
- 详情页只有两种布局：单栏；或「内容区 + 右侧 AI 区」（`DetailPageLayout`）
- 任务/工单详情的对话在正文「会话」分区，右侧 AI 区只放「我的助理」
- tab 分区与 URL hash 一一对应（`useTabHash`）
- 按钮反馈用 Popover：成功 2 秒、失败 5 秒；禁止 Toast/alert
- Markdown 编辑器/展示区外框 `rounded-none`

### 实时流

- 统一 `visibleEventSource`：标签页隐藏断开、恢复重连
- 订阅先收快照，再收增量；终态快照支持晚订阅
- 任务看板/详情不恢复定时轮询

## 九、配置与运维

### 环境变量（核心）

| 变量 | 用途 |
| --- | --- |
| `PORT` | 后端端口（dev 3100，prod 3000） |
| `NODE_ENV` | production 时工位用 `worker/`，否则 `worker-dev/` |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | 业务库 |
| `DB_SSL` | 云端 PG TLS |
| `PROJECT_PG_*` | 独立知识库 |
| `PROJECT_KNOWLEDGE_EMBEDDING_*` | Embedding 接口、模型、维度 |
| `PROJECT_KNOWLEDGE_SEARCH_VECTOR_MIN_SIMILARITY` | 向量最低相似度 |
| `APP_URL` / `API_URL` | 平台外网地址/API 地址 |
| `AUTH_JWT_SECRET` | 会话 JWT 密钥 |
| `COOKIE_SECURE` | HTTPS Cookie |
| `SSO_JWT_SECRET` | SSO access_token 密钥 |
| `PUBLIC_AGENT_TOKEN` | 公共 Agent 令牌 |
| `FEISHU_BOT_MASTER_KEY` | 飞书 Secret 加密主密钥 |
| `FEISHU_GROUP_SEND_PAUSED` | 群消息止血开关 |
| `RELEASE_FEISHU_CHAT_ID` | 提测群 chat_id |
| `WORKER_BASE_DIR` | 工位根目录 |
| `WORKER_SKILL_REPO_URL` / `WORKER_STANDARD_REPO_URL` | 技能/规范库 |
| `GITHUB_TOKEN` / `GITHUB_ORG` | GitHub 集成 |
| `OP_GATEWAY_SHARED_TOKEN` / `GITHUB_PAT_MASTER_KEY` | 凭证网关 |
| `DIR_IMAGE_WEBROOT` / `DIR_EXPORT_WEBROOT` / `DIR_FILE_WEBROOT` | 静态目录 |
| `AGENT_TOKEN` / `APP_RUN_TIMEOUT_MS` | Appium |
| `LITA_USER_TOKEN` / `WORKER_LITA_USER_TOKEN` / `LITA_API_HOST` | 外部 Lita 平台 |

完整示例见 `backend/.env.example`。

### 迁移与数据

- 93 个迁移，按时间戳递增命名
- 生产必须 `db:migration:run`；回退 `db:migration:revert`
- 不使用物理外键；删除由应用层清理
- 历史 MySQL 可一次性导入（`db:migrate:mysql`）

### 止血开关

| 开关 | 作用 |
| --- | --- |
| `FEISHU_GROUP_SEND_PAUSED` | 暂停所有飞书群外发（平台名义发送除外） |
| `WORKER_DENY_EXTERNAL_DIRECTORY=false` | 关闭 opencode 工作区边界 |
| `TASK_PENDING_FEEDBACK_NOTIFY_PAUSED` | 暂停「任务待反馈」飞书推送 |

## 十、从零重建路线

### M0 骨架（1–2 天）

- pnpm workspace：`backend` + `frontend`
- NestJS + TypeORM + PostgreSQL，`/api` 前缀、全局异常/日志
- `health` 端点；Vite + React + 路由壳
- 验收：前后端能起、健康检查 200

### M1 用户与登录（2–3 天）

- `users` 表 + 飞书 OAuth + JWT Cookie + 管理员/成员
- 管理区用户列表
- 验收：登录、角色、401/403 正确

### M2 机器人与执行器（3–5 天）

- `executors`、`workers` 表
- opencode client、事件中心、会话/prompt/interrupt
- 工位初始化：目录、AGENTS.md、技能/规范、MCP 配置
- 机器人对话页（SSE）
- 验收：能和一个机器人多轮对话，流式输出，中断/重置可用

### M3 任务中心（5–7 天）

- `task_templates`、`tasks`、`task_messages`、`task_worker_inbox`
- 状态机 + LOOP + claimExecution + dispatch + 提问/答复
- HANDOFF 版本控制、申请验收、验收/返工/判失败
- 任务列表/看板/详情 SSE
- 验收：创建任务→机器人接受→执行→提问→答复→交付→验收全链路

### M4 工单与工作流（4–6 天）

- `workflow_definitions`、`versions`、`tickets`、`ticket_workflow_runs`
- 节点类型 start/operation/approval/acceptance/condition/feishu-message
- 条件求值、审批通过/驳回、验收
- 验收：配置一条含审批+判断的流程，跑通

### M5 知识库（2–3 天）

- pgvector 建表、切片、Embedding 队列
- 全文+向量 RRF 检索、`.md` 视图
- 验收：写入文章→检索命中→MCP 可查

### M6 MCP（3–4 天）

- `lita-work` 工具注册（先做项目/任务/知识/机器人）
- `lita-bots` 调机器人
- 令牌鉴权、审计
- 验收：外部 Agent 能创建任务、查知识、调机器人

### M7 飞书（4–6 天）

- 官方机器人配置（加密）、tenant token、OAuth
- WebSocket 长连接、群策略、任务群/项目群
- 话题双向同步、平台名义发送、反馈采集
- 验收：群里 @ 机器人能回复；任务群状态同步

### M8 业务扩展（按需）

- 需求池/迭代/Backlog、提测/缺陷、反馈/灵感、模型配置、SSO、Appium、GitHub

## 十一、MVP 裁剪建议

必须保留：

- 用户登录、机器人、执行器、任务状态机、HANDOFF、验收
- 任务详情 SSE、工单基础节点
- 知识库检索（哪怕先只做全文）

可以延后：

- 迭代/Backlog、提测/缺陷、反馈/灵感
- 多内核 bridge（先只接 opencode）
- 飞书话题双向同步、反馈采集
- SSO、Appium、GitHub 凭证网关
- 模型标题生成（可先用结构化标题）

## 十二、验收清单

功能：

- 创建任务 → 分配 → 接受 → 执行 → 提问/答复 → 交付 → 验收通过
- 验收不通过退回原机器人；返工后可再次验收
- 停止任务级联取消未结束子任务
- 工单审批通过/驳回、判断节点分流、飞书消息节点失败不阻断
- 知识库写入后能被全文/向量检索命中
- MCP 外部 Agent 能创建任务、读知识、调机器人

权限：

- 未登录 401；非管理员访问管理接口 403
- 错误机器人令牌 401，不回退 Cookie
- 机器人只能操作自己执行的任务；需求方才能验收

数据：

- 迁移可重复执行；无物理外键；删除后无孤儿数据
- 时间列均为 timestamptz；SQL 查询无时区偏差

并发与故障：

- 同一机器人不超 `maxParallelTasks`
- 执行器断线重连后能补终态
- 子任务事件丢失能由 LOOP 补建
- 飞书群开关能止血

## 附录说明

以下附录由代码自动抽取，随代码变化会有差异；重建时以仓库为准。

- 附录 A：69 个实体与字段
- 附录 B：313 条路由
- 附录 C：113 个 MCP 工具
- 附录 D：枚举值
- 附录 E：目录速查


## 附录 A：实体清单

> 由 `backend/src/**/*.entity.ts` 自动抽取；`?` 表示可空。

| 实体 | 表 | 字段 |
| --- | --- | --- |
| AppVersion | `app_versions` | id:number, projectId:number, platform:string, appTarget:string, version:string, remark?:string / null, createdAt:Date, updatedAt:Date |
| User | `users` | id:number, feishuOpenId:string, unionId?:string / null, name:string, avatarUrl?:string / null, email?:string / null, department?:string / null, role:UserRole, enabled:boolean, lastLoginAt?:Date / null, feishuAccessToken?:string / null, feishuRefreshToken?:string / null, feishuTokenExpiresAt?:Date / null, createdAt:Date, updatedAt:Date |
| CheckRun | `check_runs` | id:number, status:'queued' / 'running' / 'success' / 'fail' / 'error', total?:number / null, current:number, success?:number / null, fail?:number / null, skip?:number / null, message?:string / null, durationMs?:number / null, items?:CheckRunItem[] / null, logs?:string[] / null, output?:string[] / null, startedAt:Date, finishedAt?:Date / null, queuedAt?:Date / null, appVersionId?:number / null, agentName?:string / null, checkId:number, scheduleId?:number / null |
| Check | `checks` | id:number, code:string, description?:string / null, scriptPath:string, device?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| DefectChangeRecord | `defect_change_records` | id:number, defectId:number, projectId:number, content:string, remark?:string / null, status:string, source:string, operator?:string / null, createdAt:Date |
| Defect | `defects` | id:number, platform?:string / null, priority:string, expected:string, actual:string, images?:string[] / null, status:string, testScript?:string / null, fixedAt?:Date / null, verifiedAt?:Date / null, releaseId?:number / null, followupTaskId?:number / null, backlogId?:number / null, projectId:number, createdAt:Date, updatedAt:Date |
| Document | `documents` | id:number, title:string, fileName?:string / null, type:DocumentType, source:DocumentSource, description?:string / null, content?:string / null, remark?:string / null, knowledgeId?:string / null, feishuUrl?:string / null, feishuToken?:string / null, apipostUrl?:string / null, url?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| Executor | `executors` | id:number, name:string, ip:string, port:number, type:ExecutorType, description?:string / null, token?:string / null, enabled:boolean, online:boolean, version?:string / null, defaultLocation?:string / null, providersCache?:ExecutorProvider[] / null, capabilitiesCache?:ExecutorCapabilities / null, providersSyncedAt?:Date / null, lastCheckedAt?:Date / null, createdAt:Date, updatedAt:Date |
| ExportRun | `export_runs` | id:number, status:'running' / 'success' / 'fail' / 'error', total?:number / null, current:number, success?:number / null, fail?:number / null, skip?:number / null, message?:string / null, durationMs?:number / null, items?:ExportRunItem[] / null, logs?:string[] / null, output?:string[] / null, files?:ExportRunFile[] / null, startedAt:Date, finishedAt?:Date / null, exportId:number |
| Export | `exports` | id:number, code:string, description?:string / null, scriptPath:string, projectId:number, createdAt:Date, updatedAt:Date |
| FeedbackReply | `feedback_replies` | id:number, feedbackId:number, senderName?:string / null, senderUserId?:number / null, senderOpenId?:string / null, content:string, images?:string[] / null, sourceMessageId?:string / null, sourceThreadId?:string / null, createdAt:Date |
| Feedback | `feedbacks` | id:number, title:string, type:FeedbackType, source:FeedbackSource, sourceChatId?:string / null, sourceThreadId?:string / null, sourceMessageId?:string / null, status:FeedbackStatus, content:string, images?:string[] / null, reporterId?:number / null, reporterName?:string / null, handlerName?:string / null, taskId?:number / null, handleNote?:string / null, resolvedAt?:Date / null, createdAt:Date, updatedAt:Date |
| FeishuBotApprovalCard | `feishu_bot_approval_cards` | id:number, configId:number, ticketId:number, taskId:number, messageId?:string / null, state:FeishuBotApprovalCardState, actedById?:number / null, actedByName?:string / null, actedAt?:Date / null, createdAt:Date, updatedAt:Date |
| FeishuBotBacklogChat | `feishu_bot_backlog_chats` | id:number, backlogId:number, officialConfigId:number, chatId?:string / null, state:FeishuBotBacklogChatState, name:string, backlogTitle:string, memberUserIds:number[], memberWorkerIds:number[], memberNames:string[], botIds:string[], lastStatus?:string / null, finishedAt?:Date / null, finishedNotified:boolean, destroyAfter?:Date / null, attempts:number, lastError?:string / null, createdAt:Date, updatedAt:Date |
| FeishuBotCard | `feishu_bot_cards` | id:number, configId:number, userId:number, workerId:number, scope:string, chatId?:string / null, messageId?:string / null, questionId:string, state:FeishuBotCardState, questions:FeishuBotCardQuestion[], createdAt:Date, updatedAt:Date |
| FeishuBotConfig | `feishu_bot_configs` | id:number, kind:FeishuBotConfigKind, workerId?:number / null, name?:string / null, appId:string, botOpenId?:string / null, secretCiphertext:string, secretIv:string, secretAuthTag:string, keyVersion:string, verificationTokenCiphertext?:string / null, verificationTokenIv?:string / null, verificationTokenAuthTag?:string / null, encryptKeyCiphertext?:string / null, encryptKeyIv?:string / null, encryptKeyAuthTag?:string / null, policy:Record<string, unknown>, enabled:boolean, boundAt?:Date / null, lastVerifiedAt?:Date / null, lastError?:string / null, createdAt:Date, updatedAt:Date |
| FeishuBotEvent | `feishu_bot_events` | id:number, eventId:string, configId:number, type?:string / null, createdAt:Date |
| FeishuBotGroupRecord | `feishu_bot_group_records` | id:number, configId:number, groupId:number, kind:FeishuBotGroupRecordKind, messageId?:string / null, threadId?:string / null, senderOpenId?:string / null, senderName?:string / null, senderUserId?:number / null, messageType?:string / null, content?:string / null, decision?:FeishuBotGroupRecordDecision / null, error?:string / null, createdAt:Date |
| FeishuBotGroup | `feishu_bot_groups` | id:number, configId:number, chatId:string, name?:string / null, policy?:FeishuBotGroupPolicy / null, joinedAt:Date, leftAt?:Date / null, lastMessageAt?:Date / null, messageCount:number, createdAt:Date, updatedAt:Date |
| FeishuBotIdentity | `feishu_bot_identities` | id:number, configId:number, openId:string, unionId?:string / null, userId:number, createdAt:Date, updatedAt:Date |
| FeishuBotOfficialMessage | `feishu_bot_official_messages` | id:number, senderType:FeishuOfficialMessageSenderType, senderId:number, senderName:string, targetType:FeishuOfficialMessageTargetType, targetId:string, targetUserId?:number / null, targetName?:string / null, title?:string / null, content:string, contentLength:number, replyToMessageId?:string / null, messageIds?:string[] / null, status:FeishuOfficialMessageStatus, error?:string / null, createdAt:Date |
| FeishuBotProjectChat | `feishu_bot_project_chats` | id:number, projectId:number, taskId:number, officialConfigId:number, chatId?:string / null, state:FeishuBotProjectChatState, name:string, projectName:string, memberUserIds:number[], memberNames:string[], botIds:string[], lastStatuses:Record<string, string>, finishedAt?:Date / null, finishedNotified:boolean, destroyAfter?:Date / null, attempts:number, lastError?:string / null, createdAt:Date, updatedAt:Date |
| FeishuBotTaskChat | `feishu_bot_task_chats` | id:number, taskId:number, officialConfigId:number, chatId?:string / null, state:FeishuBotTaskChatState, aiSide:FeishuBotTaskChatAiSide, humanUserId:number, humanName:string, aiWorkerId:number, aiWorkerName:string, taskCode:string, taskTitle:string, finishedAt?:Date / null, finishedNotified:boolean, destroyAfter?:Date / null, attempts:number, lastError?:string / null, createdAt:Date, updatedAt:Date |
| GatewayCredentialAudit | `gateway_credential_audits` | id:number, leaseId?:string / null, workerId:number, credentialId?:number / null, credentialType:string, resource:string, action:string, allowed:boolean, denyReason?:string / null, requestId?:string / null, createdAt:Date |
| GithubPermissionCredential | `github_permission_credentials` | id:number, permission:WorkerGithubPermission, githubAccount?:string / null, patCiphertext:string, patIv:string, patAuthTag:string, keyVersion:string, enabled:boolean, rotatedAt?:Date / null, createdAt:Date, updatedAt:Date |
| CodeEvent | `code_events` | id:number, repo:string, branch:string, sha:string, message:string, author?:string / null, isMerge:boolean, url?:string / null, committedAt:Date, createdAt:Date |
| ProjectBranch | `project_branches` | id:number, repo:string, branch:string, category:CodeBranchCategory, remark?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| Repo | `repos` | id:number, name:string, fullName:string, description?:string / null, htmlUrl?:string / null, defaultBranch?:string / null, language?:string / null, platform:RepoPlatform, status:RepoStatus, lastUpdatedAt?:Date / null, remark?:string / null, createdAt:Date, updatedAt:Date |
| Idea | `ideas` | id:number, title:string, type:IdeaType, status:IdeaStatus, content:string, images?:string[] / null, creatorId?:number / null, creatorName?:string / null, projectId?:number / null, adoptedAt?:Date / null, createdAt:Date, updatedAt:Date |
| BacklogDocument | `backlog_documents` | id:number, backlogId:number, documentId:number, createdAt:Date |
| BacklogEvent | `backlog_events` | id:number, backlogId:number, type:string, payload?:Record<string, unknown> / null, operator?:string / null, createdAt:Date |
| Backlog | `backlogs` | id:number, code:string, iterationId:number, projectId:number, title:string, status:BacklogStatus, ownerWorkerId?:number / null, ownerName?:string / null, expectedOnlineAt?:Date / null, members?:BacklogMember[] / null, taskId?:number / null, statusBy?:string / null, startedAt?:Date / null, testingAt?:Date / null, releasingAt?:Date / null, completedAt?:Date / null, canceledAt?:Date / null, createdAt:Date, updatedAt:Date |
| Iteration | `iterations` | id:number, code:string, type:IterationType, description?:string / null, startAt?:string / null, endAt?:string / null, status:IterationStatus, createdAt:Date, updatedAt:Date |
| McpServer | `mcp_servers` | id:number, name:string, type:McpServerType, url?:string / null, command?:string[] / null, authMode:McpAuthMode, authHeader:string, authPrefix?:string / null, authSecret?:string / null, enabled:boolean, remark?:string / null, createdAt:Date, updatedAt:Date |
| McpCallLog | `mcp_call_logs` | id:number, userId:number, userName:string, workerId:number, workerName:string, sessionId:string, tool:string, status:string, durationMs:number, messageLength:number, contentLength?:number / null, error?:string / null, createdAt:Date |
| Milestone | `milestones` | id:number, date:string, achieved:MilestoneAchieved, achievedAt?:string / null, content:string, remark?:string / null, deliverer?:string / null, acceptor?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| ModelScenario | `model_scenarios` | id:number, scenario:string, baseUrl?:string / null, apiKey?:string / null, model?:string / null, thinking:ModelThinkingLevel, createdAt:Date, updatedAt:Date |
| Project | `projects` | id:number, name:string, type:ProjectType, status:ProjectStatus, expectedReleaseAt?:string / null, priority?:string / null, iterationCycle?:string / null, owner?:string / null, involvedParties?:string[] / null, remark?:string / null, feishuRecordId?:string / null, description?:string / null, summary?:string / null, scriptsPath?:string / null, feishuWebhook?:string / null, createdAt:Date, updatedAt:Date |
| SyncState | `sync_states` | lastSyncAt:Date |
| ProjectRelease | `project_releases` | id:number, projectId:number, content?:string / null, urls?:string[] / null, branches?:ReleaseBranch[] / null, testers:string[], ends?:string[] / null, ticketId?:number / null, ticketCode?:string / null, operator?:string / null, workerId?:number / null, sourceTaskId?:number / null, status:string, verifier?:string / null, verifiedAt?:Date / null, createdAt:Date |
| Resource | `resources` | id:number, type:ResourceType, title:string, status:string, description?:string / null, url?:string / null, documentId?:number / null, prefix?:string / null, content?:string / null, remark?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| Schedule | `schedules` | id:number, title:string, cron:string, projectId:number, checkId:number, enabled:boolean, lastRunAt?:Date / null, runCount:number, createdAt:Date, updatedAt:Date |
| ScriptLibraryDescription | `script_library_descriptions` | id:number, scriptPath:string, description?:string / null, contentHash?:string / null, status:ScriptDescriptionStatus, error?:string / null, attempts:number, generatedAt?:Date / null, createdAt:Date, updatedAt:Date |
| ScriptLibraryRun | `script_library_runs` | id:number, scriptPath:string, kind:ScriptLibraryKind, revision?:string / null, status:'running' / 'success' / 'fail' / 'error', total?:number / null, current:number, success?:number / null, fail?:number / null, skip?:number / null, message?:string / null, durationMs?:number / null, items?:ScriptLibraryRunItem[] / null, logs?:string[] / null, output?:string[] / null, files?:ScriptLibraryRunFile[] / null, startedAt:Date, finishedAt?:Date / null |
| SsoClient | `sso_clients` | id:number, name:string, clientId:string, clientSecret:string, redirectUris:string[], enabled:boolean, remark?:string / null, createdAt:Date, updatedAt:Date |
| SsoCode | `sso_codes` | id:number, code:string, clientId:string, userId:number, redirectUri:string, expiresAt:Date, usedAt?:Date / null, createdAt:Date |
| DispatchPlan | `dispatch_plans` | id:number, taskId:number, schedulerId?:number / null, plan:DispatchPlanContent, status:DispatchPlanStatus, operator?:string / null, operatedAt?:Date / null, createdAt:Date |
| TaskEvent | `task_events` | id:number, taskId:number, type:string, content:string, meta?:Record<string, unknown> / null, operator?:string / null, createdAt:Date |
| TaskExternalEvent | `task_external_events` | id:number, taskId:number, source:string, externalTicketId:number, eventType:string, externalStatus:string, payload?:Record<string, unknown> / null, deliveryStatus:TaskExternalEventDeliveryStatus, attempts:number, lastAttemptAt?:Date / null, nextRetryAt?:Date / null, lastError?:string / null, deliveredAt?:Date / null, processedAt?:Date / null, createdAt:Date, updatedAt:Date |
| TaskMessage | `task_messages` | id:number, taskId:number, messageKey:string, role:TaskChatMessage['role'], sender:TaskChatSender, content:string, reasoning?:string / null, status:TaskChatMessage['status'], kind:TaskChatMessage['kind'], tools?:TaskChatTool[] / null, question?:TaskChatQuestion / null, meta?:Record<string, unknown> / null, createdAt:Date, updatedAt:Date |
| TaskTemplateFollow | `task_template_follows` | id:number, templateId:number, userId:number, createdAt:Date |
| TaskTemplate | `task_templates` | id:number, name:string, description?:string / null, agentIds:number[], createdById?:number / null, createdByName?:string / null, createdAt:Date, updatedAt:Date |
| TaskWorkerInbox | `task_worker_inbox` | id:number, parentTaskId:number, workerId:number, childTaskId:number, kind:TaskWorkerInboxKind, referenceId?:string / null, payload?:Record<string, unknown> / null, status:TaskWorkerInboxStatus, attempts:number, lastAttemptAt?:Date / null, nextRetryAt?:Date / null, lastError?:string / null, deliveredAt?:Date / null, processedAt?:Date / null, createdAt:Date, updatedAt:Date |
| Task | `tasks` | id:number, code:string, title:string, type:TaskType, templateId?:number / null, templateName?:string / null, projectId?:number / null, parentId?:number / null, rootId:number, sortOrder:number, description?:string / null, input?:string / null, content?:string / null, outputSpec?:string / null, missingItems?:TaskMissingItem[] / null, status:TaskStatus, subStatus:TaskSubStatus, requesterType?:'user' / 'worker' / null, requesterId?:number / null, resumePrompt?:string / null, assignedAt?:Date / null, offerAttemptAt?:Date / null, offerStallRemindCount:number, workPlan?:string / null, remindCount:number, firstRemindedAt?:Date / null, lastRemindedAt?:Date / null, agentId?:number / null, schedulerId?:number / null, executorId?:number / null, opencodeSessionId?:string / null, result?:string / null, handoffPath?:string / null, handoffVersion:number, handoffSubmittedVersion?:number / null, handoffUpdatedAt?:Date / null, handoffUpdatedBy?:string / null, acceptedAt?:Date / null, acceptedBy?:string / null, deliveredAt?:Date / null, acceptRejectCount:number, ownerTakeoverAt?:Date / null, ownerTakeoverUserId?:number / null, ownerTakeoverName?:string / null, archivedAt?:Date / null, refusedAt?:Date / null, refusedBy?:string / null, refusalReason?:string / null, dispatchSuggestion?:string / null, failedAt?:Date / null, failedBy?:string / null, failureReason?:string / null, canceledAt?:Date / null, createdById?:number / null, planRef?:TaskPlanRef / null, createdAt:Date, updatedAt:Date |
| TestRun | `test_runs` | id:number, status:'queued' / 'running' / 'success' / 'fail' / 'error', total?:number / null, current:number, success?:number / null, fail?:number / null, skip?:number / null, message?:string / null, durationMs?:number / null, items?:TestRunItem[] / null, logs?:string[] / null, output?:string[] / null, startedAt:Date, finishedAt?:Date / null, queuedAt?:Date / null, appVersionId?:number / null, agentName?:string / null, testId:number |
| Test | `tests` | id:number, code:string, description?:string / null, scriptPath:string, device?:string / null, projectId:number, createdAt:Date, updatedAt:Date |
| TicketConfig | `ticket_configs` | defaultTemplateId:number, allowedTemplateIds:number[], enabled:boolean, createdAt:Date, updatedAt:Date |
| TicketDocument | `ticket_documents` | id:number, ticketId:number, sourceTaskId:number, sourceTaskCode:string, title:string, format:TicketDocumentFormat, url?:string / null, content?:string / null, createdByWorkerId:number, createdByName:string, updatedByName?:string / null, createdAt:Date, updatedAt:Date |
| TicketWorkflowRun | `ticket_workflow_runs` | id:number, ticketId:number, nodeKey:string, nodeName:string, nodeKind:string, attempt:number, taskTemplateId?:number / null, taskTemplateName?:string / null, agentId?:number / null, agentName?:string / null, taskId?:number / null, status:string, note?:string / null, outcome?:string / null, startedAt?:Date / null, finishedAt?:Date / null, createdAt:Date, updatedAt:Date |
| Ticket | `tickets` | id:number, code:string, category:string, title:string, description?:string / null, createdById?:number / null, createdByName:string, assigneeType:TicketAssigneeType, assigneeId:number, assigneeName:string, taskId?:number / null, backlogId?:number / null, workflowDefinitionId?:number / null, workflowVersionId?:number / null, workflowVersion?:number / null, initiatorWorkerId?:number / null, initiatorWorkerName?:string / null, inputValues?:Record<string, unknown> / null, workflowStatus?:string / null, currentNodeKey?:string / null, currentNodeName?:string / null, createdAt:Date, updatedAt:Date |
| TopicFollow | `topic_follows` | id:number, topicId:number, userId:number, createdAt:Date |
| TopicPost | `topic_posts` | id:number, topicId:number, replyToPostId?:number / null, authorUserId?:number / null, authorWorkerId?:number / null, authorName:string, content:string, mentions?:number[] / null, source:TopicPostSource, sourceMessageId?:string / null, createdAt:Date |
| TopicWorkerInbox | `topic_worker_inbox` | id:number, topicId:number, postId:number, workerId:number, status:TopicInboxStatus, attempts:number, lastAttemptAt?:Date / null, nextRetryAt?:Date / null, lastError?:string / null, deliveredAt?:Date / null, processedAt?:Date / null, createdAt:Date, updatedAt:Date |
| Topic | `topics` | id:number, subjectType:TopicSubjectType, subjectId:number, subjectTitle:string, title:string, priority:TopicPriority, status:TopicStatus, tags?:string[] / null, content:string, creatorUserId?:number / null, creatorWorkerId?:number / null, creatorName:string, mentions?:number[] / null, feishuChatId?:string / null, feishuRootMessageId?:string / null, feishuThreadId?:string / null, postCount:number, lastPostAt?:Date / null, createdAt:Date, updatedAt:Date |
| Wakeup | `wakeups` | id:number, kind:WakeupKind, taskId?:number / null, userId?:number / null, scope?:string / null, workerId:number, note?:string / null, wakeAt:Date, status:WakeupStatus, attempts:number, lastAttemptAt?:Date / null, nextRetryAt?:Date / null, lastError?:string / null, deliveredAt?:Date / null, canceledAt?:Date / null, canceledReason?:string / null, processedAt?:Date / null, createdAt:Date, updatedAt:Date |
| WorkerDebugSession | `worker_debug_sessions` | id:number, userId:number, workerId:number, contextKey:string, activeAgent:WorkerDebugMode, executorId?:number / null, providerId?:string / null, modelId?:string / null, activeProviderId?:string / null, activeModelId?:string / null, activeVariant?:string / null, sessionId?:string / null, messages:WorkerDebugMessage[], todos:OpencodeTodo[], error?:string / null, createdAt:Date, updatedAt:Date |
| Worker | `workers` | id:number, name:string, systemKey?:string / null, intro?:string / null, avatarUrl?:string / null, role:WorkerRole, runtime:WorkerRuntime, executorId?:number / null, providerId?:string / null, modelId?:string / null, variant?:string / null, backupProviderId?:string / null, backupModelId?:string / null, backupVariant?:string / null, prompt?:string / null, skills?:WorkerSkill[] / null, standards?:WorkerStandard[] / null, mcps?:number[] / null, taskDefs?:WorkerTaskDef[] / null, humanUserId?:number / null, humanUserName?:string / null, personalAgentUserId?:number / null, ownerUserId?:number / null, ownerName?:string / null, agentToken?:string / null, githubPermission:WorkerGithubPermission, resourcePermission:WorkerResourcePermission, maxParallelTasks:number, enabled:boolean, createdAt:Date, updatedAt:Date |
| WorkflowDefinitionVersion | `workflow_definition_versions` | id:number, definitionId:number, version:number, name:string, description?:string / null, definition:WorkflowDefinitionJson, publishedById?:number / null, publishedByName?:string / null, publishedAt:Date |
| WorkflowDefinition | `workflow_definitions` | id:number, code:string, category:string, name:string, description?:string / null, builtIn:boolean, enabled:boolean, draftDefinition:WorkflowDefinitionJson, latestPublishedVersion:number, latestPublishedAt?:Date / null, draftUpdatedAt?:Date / null, createdAt:Date, updatedAt:Date |

## 附录 B：路由清单

> 由控制器装饰器自动抽取（已去重），按模块分组。

```text

# admin/model-config
  Post /api/admin/model-config/:scenario/fetch-models
  Put /api/admin/model-config/:scenario

# agent/apps
  Get /api/agent/apps/installed
  Get /api/agent/apps/simulators
  Post /api/agent/apps/install
  Post /api/agent/apps/uninstall

# app-versions
  Delete /api/app-versions/:id

# auth
  Get /api/auth/agent-token
  Get /api/auth/feishu
  Get /api/auth/feishu/callback
  Get /api/auth/me
  Get /api/auth/users
  Post /api/auth/agent-token/reset
  Post /api/auth/logout

# checks
  Delete /api/checks/:id
  Get /api/checks/:id
  Get /api/checks/:id/runs
  Get /api/checks/runs/:runId
  Get /api/checks/runs/:runId.md
  Get /api/checks/script-dirs
  Get /api/checks/scripts
  Patch /api/checks/:id
  Post /api/checks/:id/run.md
  Post /api/checks/:id/runs
  Post /api/checks/import

# code-branches
  Delete /api/code-branches/:id
  Patch /api/code-branches/:id

# defects
  Delete /api/defects/:id
  Get /api/defects/:id
  Get /api/defects/:id.md
  Get /api/defects/:id/records
  Patch /api/defects/:id
  Post /api/defects/:id/delete.md
  Post /api/defects/:id/records
  Post /api/defects/:id/records.md
  Post /api/defects/:id/status.md
  Post /api/defects/:id/update.md
  Post /api/defects/:id/verify
  Post /api/defects/create.md

# docs
  Delete /api/docs/nodes/:id
  Get /api/docs/detail
  Get /api/docs/detail/{*path}
  Get /api/docs/nodes/:id
  Get /api/docs/search
  Get /api/docs/search.md
  Patch /api/docs/nodes/:id
  Post /api/docs/nodes
  Post /api/docs/nodes/create.md
  Post /api/docs/nodes/delete.md
  Post /api/docs/nodes/update.md

# documents
  Delete /api/documents/:id
  Get /api/documents/:id
  Get /api/documents/:id.md
  Patch /api/documents/:id/content
  Patch /api/documents/:id/remark
  Post /api/documents/sync-apipost
  Post /api/documents/sync-feishu
  Post /api/documents/upsert.md

# executors
  Delete /api/executors/:id
  Get /api/executors/:id
  Get /api/executors/:id/providers
  Patch /api/executors/:id
  Post /api/executors/:id/check
  Post /api/executors/:id/sync-providers

# exports
  Delete /api/exports/:id
  Get /api/exports/:id
  Get /api/exports/:id/runs
  Get /api/exports/runs/:runId
  Get /api/exports/runs/:runId.md
  Get /api/exports/scripts
  Patch /api/exports/:id
  Post /api/exports/:id/run.md
  Post /api/exports/:id/runs
  Post /api/exports/import

# feedbacks
  Delete /api/feedbacks/:id
  Get /api/feedbacks/:id
  Get /api/feedbacks/:id.md
  Get /api/feedbacks/:id/replies
  Patch /api/feedbacks/:id
  Post /api/feedbacks/:id/status

# feishu
  Get /api/feishu/read
  Get /api/feishu/read.md

# feishu-bot
  Delete /api/feishu-bot/:id
  Get /api/feishu-bot/:configId/groups
  Get /api/feishu-bot/:configId/groups/:groupId/records
  Get /api/feishu-bot/messages
  Post /api/feishu-bot/:id/test
  Post /api/feishu-bot/callback/:configId
  Post /api/feishu-bot/messages
  Post /api/feishu-bot/messages.md
  Put /api/feishu-bot/:configId/feedback-groups
  Put /api/feishu-bot/:configId/groups/:groupId/policy
  Put /api/feishu-bot/:configId/groups/default-policy
  Put /api/feishu-bot/official
  Put /api/feishu-bot/workers/:workerId

# files
  Post /api/files/upload.md

# github
  Get /api/github/branches
  Get /api/github/repos

# ideas
  Delete /api/ideas/:id
  Get /api/ideas/:id
  Get /api/ideas/:id.md
  Patch /api/ideas/:id
  Post /api/ideas/:id/status

# internal/gateway/v1/credentials
  Delete /api/internal/gateway/v1/credentials/:permission
  Post /api/internal/gateway/v1/credentials/acquire

# internal/gateway/v1/resource-permissions
  Post /api/internal/gateway/v1/resource-permissions/verify

# iterations
  Get /api/iterations/:id
  Get /api/iterations/:id.md
  Get /api/iterations/:id/documents
  Get /api/iterations/:id/events
  Get /api/iterations/:id/tasks
  Patch /api/iterations/:id
  Patch /api/iterations/:id/members
  Post /api/iterations/:id/backlogs
  Post /api/iterations/:id/feishu-chat
  Post /api/iterations/:id/move
  Post /api/iterations/:id/status
  Post /api/iterations/:id/tasks
  Post /api/iterations/release
  Post /api/iterations/release.md

# mcp/servers
  Delete /api/mcp/servers/:id
  Get /api/mcp/servers/options
  Patch /api/mcp/servers/:id
  Post /api/mcp/servers/:id/test

# milestones
  Delete /api/milestones/:id
  Get /api/milestones/:id
  Patch /api/milestones/:id

# projects
  Delete /api/projects/:id
  Get /api/projects/:id
  Get /api/projects/:id/releases
  Get /api/projects/:id/tickets
  Get /api/projects/iterations
  Get /api/projects/page
  Patch /api/projects/:id
  Patch /api/projects/:id/status
  Post /api/projects/:id/delivery-task
  Post /api/projects/:id/status.md
  Post /api/projects/sync-feishu

# repos
  Patch /api/repos/:id
  Post /api/repos/sync

# requirements
  Get /api/requirements/:id.md
  Get /api/requirements/search.md
  Post /api/requirements/:id/update.md

# resources
  Delete /api/resources/:id
  Get /api/resources/:id
  Get /api/resources/:id.md
  Patch /api/resources/:id
  Post /api/resources/:id/sync

# schedules
  Delete /api/schedules/:id
  Get /api/schedules/:id
  Get /api/schedules/:id/runs
  Patch /api/schedules/:id
  Post /api/schedules/:id/run
  Post /api/schedules/:id/run.md

# script-library
  Get /api/script-library/runs
  Get /api/script-library/runs/:runId
  Get /api/script-library/script
  Get /api/script-library/scripts
  Get /api/script-library/status
  Post /api/script-library/descriptions/regenerate
  Post /api/script-library/runs
  Post /api/script-library/sync

# settings
  Post /api/settings/scripts/pull
  Post /api/settings/scripts/pull.md

# sso
  Delete /api/sso/clients/:id
  Get /api/sso/authorize
  Get /api/sso/clients
  Get /api/sso/userinfo
  Patch /api/sso/clients/:id
  Post /api/sso/clients
  Post /api/sso/clients/:id/secret-reset
  Post /api/sso/token

# task-templates
  Delete /api/task-templates/:id
  Delete /api/task-templates/:id/follow
  Get /api/task-templates/:id
  Get /api/task-templates/:id.md
  Get /api/task-templates/:id/tasks
  Patch /api/task-templates/:id
  Post /api/task-templates/:id/delete.md
  Post /api/task-templates/:id/follow
  Post /api/task-templates/:id/update.md
  Post /api/task-templates/create.md

# tasks
  Delete /api/tasks/:id
  Get /api/tasks/:id
  Get /api/tasks/:id.md
  Get /api/tasks/:id/chat
  Get /api/tasks/:id/documents
  Get /api/tasks/:id/documents.md
  Get /api/tasks/:id/documents/:name
  Get /api/tasks/:id/handoff
  Get /api/tasks/:id/handoff.md
  Get /api/tasks/:id/recognize.md
  Get /api/tasks/:id/review
  Get /api/tasks/defines.md
  Get /api/tasks/overview
  Patch /api/tasks/:id
  Post /api/tasks/:id/accept
  Post /api/tasks/:id/accept-task.md
  Post /api/tasks/:id/assign
  Post /api/tasks/:id/cancel
  Post /api/tasks/:id/deliver/apply.md
  Post /api/tasks/:id/deliver/reply.md
  Post /api/tasks/:id/documents.md
  Post /api/tasks/:id/external-event
  Post /api/tasks/:id/fail
  Post /api/tasks/:id/fail.md
  Post /api/tasks/:id/feedback
  Post /api/tasks/:id/handoff
  Post /api/tasks/:id/handoff/accept.md
  Post /api/tasks/:id/handoff/apply.md
  Post /api/tasks/:id/handoff/refuse.md
  Post /api/tasks/:id/handoff/update.md
  Post /api/tasks/:id/interrupt
  Post /api/tasks/:id/messages
  Post /api/tasks/:id/messages/reply.md
  Post /api/tasks/:id/missing
  Post /api/tasks/:id/questions/:questionId/answer.md
  Post /api/tasks/:id/questions/:questionId/reply
  Post /api/tasks/:id/questions/ask.md
  Post /api/tasks/:id/recognize.md
  Post /api/tasks/:id/refuse.md
  Post /api/tasks/:id/reject
  Post /api/tasks/:id/submit
  Post /api/tasks/:id/subtasks/create.md

# tasks.md
  Post /api/tasks.md/create.md

# tests
  Delete /api/tests/:id
  Get /api/tests/:id
  Get /api/tests/:id/runs
  Get /api/tests/runs/:runId
  Get /api/tests/runs/:runId.md
  Get /api/tests/scripts
  Patch /api/tests/:id
  Post /api/tests/:id/run.md
  Post /api/tests/:id/runs
  Post /api/tests/import

# ticket-workflow-definitions
  Delete /api/ticket-workflow-definitions/:id
  Get /api/ticket-workflow-definitions/:id
  Get /api/ticket-workflow-definitions/feishu-chats
  Post /api/ticket-workflow-definitions/:id/publish
  Put /api/ticket-workflow-definitions/:id/draft

# tickets
  Get /api/tickets/:id
  Get /api/tickets/:id.md
  Get /api/tickets/:id/ticket-documents.md
  Get /api/tickets/:id/ticket-documents/:documentId.md
  Get /api/tickets/:id/ticket.md
  Post /api/tickets/:id/approval/approve
  Post /api/tickets/:id/approval/reject
  Post /api/tickets/:id/reject.md
  Post /api/tickets/:id/ticket-documents.md
  Post /api/tickets/:id/ticket-documents/:documentId/delete.md
  Post /api/tickets/:id/ticket-documents/:documentId/update.md
  Post /api/tickets/:id/ticket-route.md
  Post /api/tickets/:id/workflow/accept
  Post /api/tickets/:id/workflow/approval-reject
  Post /api/tickets/:id/workflow/approve
  Post /api/tickets/:id/workflow/reject

# topics
  Delete /api/topics/:id
  Delete /api/topics/:id/follow
  Delete /api/topics/:id/posts/:postId
  Get /api/topics/:id
  Get /api/topics/:id.md
  Get /api/topics/:id/follow
  Get /api/topics/:id/posts
  Get /api/topics/following
  Get /api/topics/tags
  Patch /api/topics/:id
  Post /api/topics/:id/follow
  Post /api/topics/:id/posts
  Post /api/topics/:id/posts.md

# workbench
  Get /api/workbench/agent
  Get /api/workbench/agent/models
  Get /api/workbench/agent/snapshot
  Get /api/workbench/tasks
  Get /api/workbench/tasks/:id
  Get /api/workbench/tasks/:id/handoff
  Patch /api/workbench/tasks/:id/handoff
  Post /api/workbench/agent/interrupt
  Post /api/workbench/agent/messages
  Post /api/workbench/agent/model
  Post /api/workbench/agent/questions/:questionId/reply
  Post /api/workbench/agent/reset
  Post /api/workbench/tasks/:id/accept
  Post /api/workbench/tasks/:id/cancel
  Post /api/workbench/tasks/:id/fail
  Post /api/workbench/tasks/:id/handoff/accept
  Post /api/workbench/tasks/:id/handoff/apply
  Post /api/workbench/tasks/:id/handoff/reject
  Post /api/workbench/tasks/:id/handoff/revoke
  Post /api/workbench/tasks/:id/messages
  Post /api/workbench/tasks/:id/questions
  Post /api/workbench/tasks/:id/questions/:questionId/reply
  Post /api/workbench/tasks/:id/refuse
  Post /api/workbench/tasks/:id/subtasks

# worker-chats
  Get /api/worker-chats/:workerId
  Get /api/worker-chats/sessions
  Get /api/worker-chats/workers
  Post /api/worker-chats/:workerId/messages
  Post /api/worker-chats/:workerId/questions/:questionId/reply
  Post /api/worker-chats/:workerId/reset

# workers
  Delete /api/workers/:id
  Get /api/workers/:id
  Get /api/workers/:id/initialize
  Get /api/workers/live
  Get /api/workers/optimize-prompt/:runId
  Get /api/workers/skill-catalog
  Get /api/workers/standard-catalog
  Patch /api/workers/:id
  Post /api/workers/:id/initialize
  Post /api/workers/optimize-prompt

# workers.md
  Get /api/workers.md/:id.md
  Post /api/workers.md/:id/delete.md
  Post /api/workers.md/:id/update.md
  Post /api/workers.md/create.md
```

## 附录 C：MCP 工具

> 由 `backend/src/mcp/**` 的 `registerTool` 自动抽取，共 113 个。

```text
accept_task accept_task_handoff accept_ticket add_defect_record answer_task_question 
apply_task_acceptance ask_task_question bot_answer bot_call bot_interrupt bot_reset 
cancel_agent_wakeup cancel_task_wakeup change_backlog_status change_defect_status 
change_idea_status create_backlog_release create_backlog_task create_defect create_idea 
create_knowledge create_subtask create_task create_task_template create_ticket create_topic 
create_worker delete_code_branch delete_defect delete_idea delete_knowledge delete_task_template 
delete_ticket_document delete_worker deliver_ticket_document fail_task feishu_history 
feishu_send_message get_backlog get_defect get_feedback get_idea get_iteration get_project get_run 
get_session get_settings get_task get_task_callback_url get_task_template get_task_ticket 
get_ticket get_topic get_worker import_scripts list_bots list_code_branches list_code_events 
list_defects list_feedbacks list_github_branches list_ideas list_knowledge_dir list_my_tasks 
list_runs list_task_defines list_task_documents list_task_templates list_ticket_defines 
list_ticket_documents list_topics list_worker_skill_catalog list_worker_standard_catalog 
list_workers move_backlog pull_scripts read_document read_feishu_doc read_knowledge 
read_task_handoff read_ticket_document refuse_task refuse_task_handoff register_code_branch 
reject_ticket_node reply_task_message reply_topic route_task_ticket run_check run_export 
run_schedule run_test schedule_agent_wakeup schedule_task_wakeup search_github_repos 
search_knowledge search_projects sync_apipost_document update_backlog update_backlog_members 
update_code_branch update_defect update_idea update_knowledge update_project update_task_handoff 
update_task_template update_ticket_document update_topic update_worker upload_file upsert_document 
upsert_task_document 
```

## 附录 D：枚举值

```text
DocumentType: 需求 / 功能 / 测试 / 技术 / 接口 / 配置 / 设计
DocumentSource: 飞书 / apipost / -
ProjectType: 活动 / 功能 / 游戏 / 数据 / 后台 / 技术 / 其它
ProjectStatus: 待分配 / 开发中 / 已关闭 / 已发布
ReleaseStatus: 待冒烟 / 进行中 / 已通过 / 未通过
DefectStatus: 开放 / 修复 / 关闭
DefectPriority: 高 / 中 / 低
FeedbackType: BUG / 建议 / 其它
FeedbackSource: 平台 / 飞书群
FeedbackStatus: 待处理 / 处理中 / 已解决 / 已关闭
IdeaType: 想法 / 创意 / 待办 / 建议 / 其它
IdeaStatus: 构思 / 废弃 / 采纳
RunDevice: h5 / android / ios / server
AppTarget: lita / lita lite
ResourceType: 配置 / 多语言 / 文件资源 / UI / 其它
I18nSheet: Activity / Frontend / FE / Backend
ResourceStatus: 缺失 / 草稿 / 确认 / 废弃
MilestoneAchieved: no / yes / cancel
MilestoneStatus: 准备中 / 提前达成 / 达成 / 延期 / 取消
UserRole: 管理员 / 成员
CodeBranchCategory: 后端 / H5 / 安卓 / IOS / 其它
RepoPlatform: 前端 / 后端 / 安卓 / 苹果 / 其它
RepoStatus: 有效 / 忽略
ExecutorType: opencode / codex / claude-code / kiro / devin / droid
WorkerRole: 工作者 / 调度器
WorkerRuntime: opencode / human / codex / claude-code / kiro / devin / droid / pi
WorkerGithubPermission: none / develop / release
WorkerResourcePermission: none / read / write
McpServerType: remote / local
McpAuthMode: none / fixed / env / work-token
WorkerLiveStatus: 空闲中 / 工作中 / 等待中 / 验收中
TaskType: 普通 / 审批
TaskStatus: 等待中 / 进行中 / 已结束
TaskSubStatus: 待分配 / 待接受 / 待反馈 / 待继续 / 待申请验收 / 待验收 / 执行中 / 完成 / 已拒绝 / 失败 / 取消 / 待识别 / 识别中
DispatchPlanStatus: 待确认 / 已确认 / 已驳回
ModelThinkingLevel: off / low / medium / high
IterationType: T0 / T7
IterationStatus: 进行中 / 已结束
BacklogStatus: 等待 / 执行 / 测试 / 发布 / 完成 / 取消
BacklogMemberRole: 产品 / 业务 / 项目 / 前端 / 后端 / 测试 / 客户端 / 负责人 / 需求方
TopicSubjectType: 迭代项 / 缺陷 / 任务 / 工单 / 需求
TopicPriority: 高 / 中 / 低
TopicStatus: 开放 / 已解决 / 已关闭
TopicPostSource: 平台 / 飞书群
```

## 附录 E：目录速查

```text
backend/src:
agent apipost app-versions auth checks common defects documents executors exports feedbacks feishu-bot feishu files github-gateway github ideas images iterations knowledge mcp-servers mcp migrations milestones model-config projects releases remote-run resources schedules scripts settings sso tasks tests tickets topics wakeups workers workflows 

frontend/src:
App.tsx
components
context
index.css
lib
main.tsx
pages

frontend/src/pages:
AppsPage BacklogDetailPage CheckRunPage ChecksPage CommitsPage DefectDetailPage DefectsPage DocumentDetailPage DocumentsPage ExecutorsPage ExportRunPage ExportsPage FeedbackDetailPage FeedbackPage FeishuBotConfigPage FeishuBotGroupPolicyPage GithubAccessPage IdeaDetailPage IdeaEditPage IdeasPage IterationDetailPage IterationEditPage IterationsPage KnowledgeBrowserPage LoginPage McpLogsPage McpServersPage MilestonesPage ModelConfigPage OverviewPage ProfilePage ProfileTaskDefinitionsPage ProjectDefectsPage ProjectTestsPage ReposPage RequirementDetailPage RequirementsPage ResourcesPage RobotChatPage ScheduleDetailPage SchedulesPage ScriptLibraryDetailPage ScriptLibraryPage SettingsPage SsoClientsPage TaskCenterPage TaskCreatePage TaskDefinitionDetailPage TaskDefinitionsPage TaskPackageDetailPage TaskTemplateEditPage TaskTemplatesPage TasksPage TestRunPage TestsPage TicketCreatePage TicketDefinitionEditPage TicketDefinitionsPage TicketDetailPage TicketHomePage TicketsPage TopicsPage UserListPage WorkbenchPage WorkerEditPage WorkersLivePage WorkersPage 

frontend/src/components:
ApipostDocViewer.tsx BacklogPicker.tsx BacklogReleaseDialog.tsx BacklogSelection.tsx BacklogStatusDialog.tsx ChatMarkdown.tsx CountRow.tsx DefectImagesField.tsx DeleteRequirementButton.tsx DocToc.tsx DocumentDialogs.tsx FeedbackFormDialog.tsx IterationDescription.tsx IterationPicker.tsx KnowledgeSearchDialog.tsx Layout.tsx MarkdownEditor.tsx MarkdownField.tsx MarkdownViewer.tsx MermaidDiagram.tsx MotionProvider.tsx NewDefectDialog.tsx PageBreadcrumb.tsx PageTransition.tsx ProjectBadges.tsx ProjectFilterSelect.tsx QuestionCard.tsx RunStats.tsx ScheduleDialogs.tsx StatusBadge.tsx TaskTemplateTable.tsx Terminal.tsx TestActionButtons.tsx TestFormDialog.tsx TransferToIterationButton.tsx WorkbenchOverview.tsx WorkflowFieldInput.tsx agent-chat detail task-detail ticket-detail topics useProjectIdParam.ts ```
