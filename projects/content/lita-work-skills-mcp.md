## 三样东西的分工

机器人要「会干活」，靠三样东西配合：

```text
技能 Skill      → 怎么做一件事：步骤、脚本、注意事项
规范 Standard   → 必须遵守什么：代码规范、协作约定、边界
MCP             → 能调用什么：平台工具、数据库、飞书、外部服务
```

- <strong>技能</strong>是「操作手册 + 脚本」，回答「怎么做」
- <strong>规范</strong>是「约束」，回答「不能怎么做」
- <strong>MCP</strong>是「工具接口」，回答「能调用什么」

三者在工位里落地为：

```text
worker/{id}/
├── AGENTS.md
├── .agents/
│   ├── skills/<name>/SKILL.md     # 技能源
│   ├── rules/ + manifest          # 规范源
│   ├── .env                       # 令牌与平台地址
│   └── mcp.json                   # 内核无关 MCP 声明
└── 内核适配物（opencode/kiro/devin/droid）
```

## 技能库

### 地址

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 文档站 | <http://docs.cinta.team/skills/> | 浏览技能说明（VitePress） |
| 代码仓库 | <http://gitea.cinta.team/docs/skills> | 技能源文件、版本、CHANGELOG |

平台初始化机器人时的默认技能库地址是 `WORKER_SKILL_REPO_URL`，默认值就是 `http://gitea.cinta.team/docs/skills`。

### 目录结构

技能按业务方向组织：

```text
skills/
├── README.md          # 技能库总说明、版本规范、HTTP 安装规则
├── CHANGELOG.md
├── active/            # 活动：排行榜、充值榜、模板榜
├── admin/             # 后台：认证、道具发放、账户变更、封禁
├── data/              # 数据：统一查询入口（MySQL / MaxCompute）
├── game/              # 游戏：段位、水果机抽奖
├── other/             # 其他：API、可视化、文档迁移、MySQL 表同步
└── public/            # 公共：飞书、知识库、图表、Nacos、Excel
```

当前仓库共 <strong>33 个技能</strong>（以仓库为准）：

| 分组 | 技能 |
| --- | --- |
| active | `rank-module`、`recharge-rank`、`template-rank` |
| admin | `auth`、`forbid`、`itemReward`、`itemRewardTask`、`userAccount`、`userAccountTask` |
| data | `data`（统一入口，含 `QUICK-START.md` / `CHECKLIST.md`） |
| game | `game-grade`、`spin-draw` |
| other | `api-lita`、`data-viz-echarts`、`gdocs-to-feishu`、`lita-docs-update`、`mysql-table-sync`、`report-index-generator`、`self-improve`、`test-mysql-query` |
| public | `chart`、`feishu-chat`、`feishu-wiki`、`knowledge-learner`、`lita-api`、`lita-query`、`lita-redis`、`nacos`、`platform-token-getter`、`report-upload`、`table-doc-generator`、`to-excel`、`user-token` |

### 一个技能长什么样

```text
skills/<group>/<skill>/
├── SKILL.md          # 必需：技能说明（frontmatter + 步骤）
├── KNOWLEDGE.md      # 可选：业务知识（排行榜、游戏规则等）
├── script/           # 可选：可执行脚本
└── README.md         # 可选：更详细的说明
```

`SKILL.md` 的 frontmatter：

```yaml
---
name: active-rank-module
description: "排行榜技能，提供排行榜数据查询、业务知识定义"
version: 1.5.0
author: Lita R&D Team
tags:
  - active
  - rank
---
```

版本号规则（技能库 README 强制）：

| 位 | 用途 | 规则 |
| --- | --- | --- |
| 主版本 | 大更新 | 作者明确指定，重大功能/架构变更，记 CHANGELOG |
| 次版本 | 功能更新 | 新增或改进功能 |
| 修订号 | Bug 修复 | 修复问题 |

### HTTP 安装规则

通过 HTTP 安装技能时，不能只下载 `SKILL.md`，必须补齐：

1. 技能根目录的 `SKILL.md`（或 `README.md`）
2. 递归向上所有父目录的 `README.md`（`skills/README.md`、`skills/public/README.md`…）
3. `SKILL.md` 中引用的本地文件（脚本、模板、知识文件）
4. 保持原始目录结构，确保相对路径可用

### 环境变量

部分技能依赖 Lita 服务，需要在 `~/.env` 配置：

```bash
# Lita 用户个人 TOKEN（SQL 查询、接口调用）
export LITA_USER_TOKEN='your_token_here'
```

- 使用前 `source ~/.env`
- admin 类技能需要单独申请 token，禁止提交到代码仓库
- 部分技能是 Python 脚本，需要 `pip install pyyaml pymysql` 等依赖

### 平台怎么使用技能

1. 管理区机器人编辑页勾选技能，保存到 `workers.skills`
2. 初始化/派发时，平台把技能安装到工位 `.agents/skills/<name>`
3. 按执行内核镜像：
   - opencode：`.agents/skills` 原生读取
   - kiro：镜像到 `.kiro/skills/`
   - droid：镜像到 `.factory/skills/`
   - devin：`.agents/skills` 原生
4. 清单之外的旧技能目录会被移除
5. 机器人通过 `AGENTS.md` 里的指引读取技能；平台不把技能全文塞进 prompt

## 规范库

规范库与技能库是两套仓库：

| 项 | 技能库 | 规范库 |
| --- | --- | --- |
| 默认地址 | `http://gitea.cinta.team/docs/skills` | `http://gitea.cinta.team/docs/standard` |
| 环境变量 | `WORKER_SKILL_REPO_URL` | `WORKER_STANDARD_REPO_URL` |
| 工位位置 | `.agents/skills/` | `.agents/rules/` |
| 作用 | 告诉机器人「怎么做」 | 告诉机器人「必须怎么做」 |
| 清理 | 移除清单外的旧技能 | 按 `.standards-manifest.json` 只清理受管文件 |

规范镜像：

| 内核 | 规范位置 |
| --- | --- |
| opencode | `.opencode/rules/` |
| kiro | `.kiro/steering/` |
| droid | `.factory/rules/` |
| devin | 不镜像，靠 `AGENTS.md` 引导阅读 `.agents/rules/` |

注意：取消规范只清理 manifest 记录的文件，机器人自己写的文档不会被删。

## MCP

MCP 是平台对机器人开放工具的协议。WorkHub 有两类 MCP：

### 平台自己的 MCP 服务

| 服务 | 端点 | 用途 |
| --- | --- | --- |
| `lita-work` | `{APP_URL}/api/mcp/work` | 平台工具：项目/需求/迭代项/文档/知识/运行/缺陷/反馈/灵感/任务/工单/机器人/飞书会话 |
| `lita-bots` | `{APP_URL}/api/mcp/bots` | 把平台机器人当子 Agent 调用 |

鉴权：

```http
Authorization: Bearer <机器人令牌>
# 或
X-Worker-Token: <机器人令牌>
```

`lita-work` 工具按场景大致分组：

| 场景 | 代表工具 |
| --- | --- |
| 项目/需求 | `search_projects`、`get_project`、`update_project` |
| 迭代项 | `get_backlog`、`update_backlog_members`、`change_backlog_status`、`create_backlog_task` |
| 任务 | `create_task`、`get_task`、`reply_task_message`、`apply_task_acceptance`、`create_subtask` |
| 工单 | `create_ticket`、`get_ticket`、`accept_ticket`、`deliver_ticket_document` |
| 知识 | `search_knowledge`、`read_knowledge`、`create_knowledge`、`update_knowledge` |
| 运行 | `run_check`、`run_test`、`run_export`、`run_schedule` |
| 缺陷/反馈/灵感 | `list_defects`、`create_defect`、`list_feedbacks`、`create_idea` |
| 机器人 | `list_workers`、`get_worker`、`create_worker`、`update_worker` |
| 飞书 | `feishu_history`、`feishu_send_message` |
| 唤醒 | `schedule_task_wakeup`、`schedule_agent_wakeup` |

`lita-bots` 只有 6 个工具：

| 工具 | 作用 |
| --- | --- |
| `list_bots` | 可调用的机器人清单 |
| `bot_call` | 发起一轮对话/任务，支持多轮 `session_id` |
| `bot_answer` | 回答机器人提问并继续等待 |
| `bot_interrupt` | 中断当前轮，会话保留 |
| `bot_reset` | 重置会话，解绑 opencode 上下文 |
| `get_session` | 读取会话状态与最近消息（断线找回） |

### 外部 MCP

平台还支持机器人连接第三方 MCP：

1. 管理区「MCP 配置」新增服务（`mcp_servers` 表）
   - 类型：`remote`（Streamable HTTP）或 `local`（stdio 命令）
   - 鉴权：固定令牌（明文落盘）、环境变量占位 `{env:NAME}`、机器人自身 `LITA_WORK_TOKEN`
2. 机器人编辑页勾选，保存到 `workers.mcps`
3. 初始化/派发时写入：
   - `.agents/mcp.json`（内核无关声明）
   - 内核配置：opencode `.opencode/opencode.json`、kiro `.kiro/settings/mcp.json`、devin `.devin/mcp_config.json`、droid `.factory/mcp.json`
4. 权限 600，纳入受管文件，机器人不得读取/展示/改写

### MCP 安全约定

- 令牌只经服务端落盘，不进入 Prompt、SSE 进度或日志
- 每次调用写 MCP 审计（工具、身份、耗时、结果）
- 管理类工具在服务端校验管理员；机器人动作校验当前执行机器人
- opencode 工位注入 `permissions` deny `external_directory`，限制读写工位外路径
- 外部 MCP 的凭据优先用 `{env:NAME}`，避免明文

## 一次任务里怎么组合

以「查一份充值数据并发到飞书」为例：

```text
1. 机器人读 AGENTS.md，找到 data 技能
2. 按 SKILL.md 读 QUICK-START.md / CHECKLIST.md
3. 通过 lita-query 技能执行 SQL（用 LITA_USER_TOKEN）
4. 需要发飞书时：
   - 技能：public/feishu-chat 或 feishu-wiki
   - 或 MCP：lita-work 的 feishu_send_message
5. 结果写入任务 HANDOFF，申请验收
```

再比如「同步一张表到测试库」：

```text
1. 选 other/mysql-table-sync 技能
2. 按 SKILL.md 配 LITA_USER_TOKEN + 测试库连接
3. 技能脚本分页读取生产、单事务替换测试表
4. 校验行数、失败回滚
```

## 常见问题

| 现象 | 排查 |
| --- | --- |
| 技能不显示 | 机器人是否勾选、是否初始化、`.agents/skills` 是否有目录、内核镜像是否生成 |
| 技能版本不对 | 检查 `SKILL.md` frontmatter `version` 与 CHANGELOG |
| 技能脚本跑不起来 | 依赖是否安装、环境变量是否 `source`、脚本路径是否相对技能目录 |
| MCP 连不上 | URL 是否可达、`X-Worker-Token` 是否正确、内核配置路径是否存在 |
| MCP 工具没出现 | `tools/list` 是否有、MCP 是否 enabled、机器人是否重新初始化 |
| MCP 401 | 令牌被重置、头名不对（`Authorization` vs `X-Worker-Token`） |
| kiro 连不上 MCP | kiro 要求 remote MCP 用 HTTPS，生产 `APP_URL` 是 http 时需 HTTPS 入口或端口转发 |
| 规范没生效 | `.agents/rules/.standards-manifest.json` 与镜像目录是否一致 |
| 权限不足 | 机器人 `resourcePermission` / `githubPermission`，或工具本身的身份校验 |

## 相关链接

- 技能文档站：<http://docs.cinta.team/skills/>
- 技能仓库：<http://gitea.cinta.team/docs/skills>
- 规范库：<http://gitea.cinta.team/docs/standard>
- 平台 MCP 接入：仓库根 `MCP.md`、`docs/work-mcp.md`、`docs/MCP_BOTS.md`
- 工位目录规范：`docs/WORKER_STATION.md`
- 执行器协议：`docs/EXECUTOR_PROTOCOL.md`
- 管理区页面：`/admin/mcp-servers`（外部 MCP）、`/admin/workers`（机器人技能/规范/ MCP 勾选）
