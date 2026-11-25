## 术语速查

### Agent / 运行时

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Agent（智能体）** | LLM + 规划 + 工具 + 记忆 + 循环，能自己决定下一步 | AI 机器人、任务执行方 |
| **Agent Runtime（智能体运行时）** | 管会话、状态机、工具调用、队列、超时、恢复的底座 | `task-dispatch`、`executor-run`、`executor-bridge` |
| **Harness（执行框架 / 测试夹具）** | 包在模型外面的执行框架：prompt、工具、上下文、循环、评测、权限 | executor-bridge + 任务状态机 + MCP |
| **Session（会话）** | 一次持续的多轮上下文，有 id、状态、消息历史 | opencode session、任务会话、群话题会话 |
| **Tool Calling / Function Calling（工具调用）** | 模型输出结构化调用，平台执行后把结果回填给模型 | MCP 工具调用 |
| **MCP（Model Context Protocol，模型上下文协议）** | 标准化 Agent 与工具 / 资源 / 提示词的协议；管工具发现、schema、鉴权、传输 | lita-work / lita-bots / lita-proxy |
| **Sub-agent（子智能体）** | 被主 Agent 调用的另一个 Agent，用来分工 | `lita-bots` 的 `bot_call` |
| **Human-in-the-loop（人在回路）** | 关键步骤必须人工确认 / 接管 | 任务验收、生产写审批 |
| **Prompt Injection（提示词注入）** | 恶意内容诱导模型忽略系统指令、越权或泄密 | Guardrails 防护对象 |

### RAG / 知识库

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **RAG（Retrieval-Augmented Generation，检索增强生成）** | 先检索资料，再让模型基于资料回答 | 知识库问答、需求摘要 |
| **Embedding（向量化）** | 把文本变成一串数字向量，便于算相似度 | `knowledge-embedding.service.ts` |
| **Vector DB（向量数据库）** | 存向量并做相似度检索 | PGVector |
| **Chunking（切块）** | 把长文档切成小块再向量化 | 按 Markdown 标题切片 |
| **Hybrid Retrieval（混合检索）** | 向量检索 + 全文 / BM25 检索一起用 | 全文 + PGVector |
| **RRF（Reciprocal Rank Fusion，倒数排名融合）** | 按排名融合多路召回，不用归一化分数 | `knowledge.store.ts` |
| **Rerank（重排）** | 对召回结果二次打分排序，提高准确率 | WorkHub 目前主要是 RRF，没有 cross-encoder rerank |
| **Recall@K（前 K 召回率）** | 前 K 条里有没有命中正确文档 | RAG 评测指标 |
| **Faithfulness（忠实度）** | 回答是否严格基于检索内容，不瞎编 | RAG 评测指标 |
| **Hallucination（幻觉）** | 模型编造不存在的事实 | RAG 要控制的核心问题 |

### Eval / 评测

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Eval（Evaluation，评测）** | 用测试集评估 AI 输出质量，而不是靠感觉 | `backend/src/eval/*` |
| **Golden Set（黄金集）** | 人工确认过的标准测试集 | `eval_suite` / `eval_case` |
| **Test Case（用例）** | 一个输入 + 期望要点 | `eval_case` |
| **Rubric / Point（评分要点）** | 判断输出是否满足的条目，可设必需 / 权重 | `eval_case_point` |
| **LLM-as-a-Judge（大模型当裁判）** | 用另一个模型按 Rubric 打分 | `eval-judge.service.ts` |
| **Evidence Validation（证据校验）** | 要求裁判引用原文，平台校验引用是否真实存在 | evidence 必须是交付内容子串 |
| **Pass Threshold（通过阈值）** | 分数达到多少算通过，默认 80 | `passThreshold` |
| **Regression Gate（回归门禁）** | 评测不通过就不允许发布 / 合并 | 评测批次 + 报告 |
| **Rework（返工）** | 第一次不通过，给一次修改机会 | `reworkCount` |
| **Intervention Count（干预次数）** | 提问 + 返工 + 人工介入的总次数 | `interventionCount` |
| **Eval Sandbox（评测沙箱）** | 隔离环境跑被测 Agent，不污染真实工位 | `eval-sandbox.service.ts` |
| **Config Snapshot（配置快照）** | 冻结被测 Agent 的 prompt / 技能 / 规则 / MCP / 模型 | `eval_worker_snapshot` |

### Guardrails / 安全边界

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Guardrails（护栏 / 安全边界）** | 限制 Agent 能做什么：工具白名单、只读、审批、输出校验 | `eval-policy`、`eval-shield`、`lita-proxy` 权限 |
| **Least Privilege（最小权限）** | 只给完成任务所需的最小权限 | 机器人令牌按 read / write / none |
| **Allowlist（白名单）** | 只允许指定工具 / 域名 / 命令 | MCP 工具策略 |
| **Read-only（只读）** | 生产只能读，写操作走审批 | lita-proxy 生产只读 |
| **Scope（作用域）** | 令牌只能操作当前任务 / 租户 | 评估令牌只能操作当前评估任务 |
| **Audit Log（审计日志）** | 记录谁在什么时候调用了什么 | 工具调用审计 |
| **Eval Token（评测令牌）** | 短期 JWT，限定身份 / 作用域 / 有效期 | `eval-token.service.ts`，30 分钟 |
| **Eval Shield（评测拦截）** | 评测模式下拦截写操作 / 子任务 / 越权 | `eval-shield.service.ts` |

### Observability / 可观测性

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Observability（可观测性）** | 通过日志 / 指标 / 追踪理解系统内部状态 | 评估事件流、任务 trace、运行统计 |
| **Tracing（链路追踪）** | 一次请求 / 会话经过哪些步骤、工具、模型 | task trace、eval event |
| **Span（跨度）** | Trace 里的一个步骤 | 一次工具调用 / 一次模型调用 |
| **Metrics（指标）** | 成功率、延迟、Token、成本、错误率 | 评估汇总、运行统计 |
| **Logging（日志）** | 结构化记录事件 | 任务事件、评估事件 |
| **Session Replay（会话回放）** | 重放一次 Agent 会话，排查问题 | 任务会话 / 评估项详情 |
| **Token Usage（Token 用量）** | 输入 / 输出 token 数 | 模型调用统计 |
| **P95 Latency（P95 延迟）** | 95% 请求的延迟上限 | 性能指标 |
| **Cost per Task（单任务成本）** | 一次任务平均花多少钱 | 成本归因 |
| **Drift（漂移）** | 模型 / 数据 / 效果随时间变化 | 评测回归要发现 |

### Feedback Loop / 反馈闭环

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Feedback Loop（反馈闭环）** | 用户反馈 → 分类 → 处理 → 验证 → 回流改进 | 飞书反馈群 + 任务 ID=8 |
| **Triage（分诊）** | 判断反馈类型 / 紧急度 / 归属 | AI 判断 BUG / 建议 / 紧急度 |
| **Dedupe（去重）** | 同一条反馈 / 消息只处理一次 | 按消息 id / topic root 去重 |
| **Topic / Thread（话题 / 线程）** | 飞书群里的讨论串 | 一个话题 = 一条 feedback |
| **Root ID（根消息 ID）** | 话题的根消息标识，用来归并同话题消息 | `root_id` 归一 |
| **Batch（批处理）** | 多条消息合并后一次处理，降低打扰 / 成本 | 5 秒 / 10 条批量投递 |

### Model Gateway / 模型网关

| 术语 | 一句话解释 | WorkHub 里的对应 |
|---|---|---|
| **Model Gateway（模型网关）** | 统一接入多模型 / 多供应商，做路由、限流、降级、计费 | `model-availability` + executor |
| **Fallback（降级 / 兜底）** | 主模型失败切备用模型 | 主备模型 |
| **Cooldown（冷却）** | 失败模型在一段时间内不再使用 | 30 分钟共享冷却 |
| **Circuit Breaker（熔断）** | 连续失败后快速失败，避免雪崩 | 可扩展 |
| **Routing（路由）** | 按任务 / 成本 / 延迟 / 上下文长度选模型 | 可扩展 |
| **Quota（配额）** | 供应商的调用 / Token 限额 | 限额错误识别 |
| **Rate Limit（限流）** | 单位时间调用次数限制 | 429 / rate limit |
| **Canary（金丝雀）** | 小流量先试新模型 / 新版本 | 可扩展 |
| **A/B Test（A/B 测试）** | 两组对比效果 | 评估批次 baseline / candidate |
| **Token Budget（Token 预算）** | 单任务最多花多少 token | 可扩展 |

---

## AI 落地面试题

### A. Agent 运行时与自动交付

**Q1. 你们 AI 自动交付的完整链路是什么？**

- 需求 → 任务定义（Agent Runtime，智能体运行时里的任务模板）→ AI 机器人 → Executor（执行器）会话 → Tool Calling（工具调用）改代码 / 建 PR / 跑检查 → HANDOFF（交付文档）→ 人工验收（Human-in-the-loop，人在回路）。
- 任务定义：ID=7「技术-项目开发交付」、ID=9「迭代-Backlog交付」、ID=16「技术-迭代-交付」。

**Q2. 任务状态机怎么设计？为什么需要？**

- 等待中：待分配 / 待接受 / 待反馈 / 待继续 / 待申请验收 / 待验收。
- 进行中：执行中；已结束：完成 / 拒绝 / 失败 / 取消。
- 作用：AI 不能「自己说完成」，必须显式申请验收；提问、返工、取消都有状态。

**Q3. executor-bridge 解决什么问题？**

- 把 kiro / codex / claude-code 统一成 HTTP + SSE 协议；opencode 直连。
- 统一 Session（会话）、prompt、interrupt、question、SSE；能力协商（capability negotiation）。
- 价值：平台不绑死一个内核，换模型 / 换 Agent 内核不改平台。

**Q4. 多轮会话怎么保证顺序、不丢消息、断线能找回？**

- 每 session 一个 prompt 队列，忙时排队、不并发。
- 平台不维护发送队列，依赖 bridge 的 `promptQueueing`。
- `GET /sessions/:id` 幂等；outcome 有粘性，用本轮消息时间判断新鲜度。
- SSE 心跳 + 断线重连；`/sessions/:id/wait`。

**Q5. 多 Agent 怎么协作？**

- 父子任务：父机器人拆子任务，子任务事件通过 inbox 唤醒父机器人。
- `lita-bots` 把平台机器人当子 Agent 调用（bot_call / bot_answer / bot_interrupt）。
- 上下文隔离：子 Agent 只看自己的任务；通过结构化结果 / 摘要回传。
- 防止无限委派：父子层级、状态机、超时。

**Q6. 长任务、等待人工确认怎么做？**

- `wakeups`：AI 自己设置「多久后唤醒我」。
- 15 秒扫描到期；回合在跑直投会话，回合结束转「待继续」由 LOOP 恢复。
- 等待状态按 2 / 10 / 30 分钟退避，不空转。

**Q7. 怎么防 AI 重复执行 / 重复交付 / 失控？**

- 任务状态机 + 显式验收。
- HANDOFF 版本号 + 冲突 409。
- 工具幂等键 / 去重。
- max steps、超时、预算、权限、人工接管。

### B. MCP 与工具安全

**Q8. MCP 是什么？为什么用它？**

- Model Context Protocol：标准化 Agent 与工具 / 资源 / 提示词的协议。
- 工具发现、schema、鉴权、传输（stdio / Streamable HTTP）。
- 好处：一套工具暴露给 opencode / Claude Code / Codex / Cursor 多客户端复用。

**Q9. lita-work / lita-bots / lita-proxy 分工？**

- `lita-work`：102 个平台工具（需求 / 迭代 / 任务 / 工单 / 知识 / 脚本 / 飞书）。
- `lita-bots`：6 个工具，把机器人当子 Agent 调用。
- `lita-proxy`：31 个运维工具（MySQL / ClickHouse / ODPS / Redis / SLS / Nacos / XXL-JOB / Firebase / GitHub PR / 工单）。

**Q10. AI 怎么防止误操作生产？**

- 机器人令牌 + 真人绑定 + 身份边界。
- `read` 只能读只读资源；`write` 测试可写，生产只读；生产写必须走工单 + 人工审批。
- 敏感列 `select:false`，审计不落原始 Token / PAT。
- 飞书群发有止血开关。

**Q11. 工具调用怎么幂等？**

- 工具调用 id / 业务幂等键。
- 去重表 / 唯一键。
- 执行前查状态，执行后写结果。
- 失败重试不重复产生副作用。

**Q12. 如何防 Prompt Injection（提示词注入）？**

- 检索内容 / 工具结果视为不可信。
- system / user / tool 角色隔离。
- 工具白名单、最小权限。
- 写操作人工审批；不把密钥放 prompt。
- 输出校验。

### C. AI 反馈闭环

**Q13. 飞书反馈群怎么自动变成平台反馈？**

- 一个飞书话题 = 一条 feedback（`root_id` 归一，防同话题误建）。
- 首帖自动建 feedback + 自动创建任务定义 ID=8「用户反馈处理」。
- 后续消息写 `feedback_replies`，按消息 id 去重。
- 图片转存 `/images`。

**Q14. AI 怎么判断要不要回复？**

- 群策略：`smart` / `at` / `record` / `feedback`。
- `smart`：监听全部消息，AI 判断；不需要就输出 `[不回复]`。
- `at`：仅 @ 才回复，补拉最近消息作为上下文。
- 智能反馈按 5 秒 / 10 条批量投递，`>>> 消息ID` 定向回复。

**Q15. 怎么防刷屏 / 重复回复？**

- 同话题独立会话；按消息 id 去重。
- 同一机器人同一时刻一个一次性会话。
- 批量投递 + 群策略。
- 机器人自身消息不回传，防回声。

**Q16. 反馈处理任务怎么闭环？**

- AI 读 feedback + 跟帖，判断真实性 / 类型 / 紧急度。
- 定位项目 / 系统；能处理直接处理，不能处理给结论和转派建议。
- 写 HANDOFF，申请验收。
- 处理不了的转人工 / 工单。

### D. AI 线上巡检

**Q17. 为什么用脚本 + 定时任务，而不是让 AI 直接查？**

- 检查逻辑确定性、可重复、可审计。
- 只读生产库 + 活动 API + 奖励配置。
- AI 可以生成 / 修改检查脚本、看结果、转缺陷 / 工单，但不直接写生产。

**Q18. PK 活动巡检具体检查什么？**

- `mod_common_round` 结算状态 `status=200`。
- 活动 API 拉前 N 名榜单。
- 奖励配置文档解析。
- `mod_common_award_record` 发奖记录。
- 按 rank 区间、奖励类型、发放对象核对，输出缺失项。

**Q19. 怎么保证巡检不影响生产？**

- 生产只读数据源 / 只读事务。
- 查询带条件 + LIMIT。
- 超时控制。
- 检查脚本不写业务库。
- 运行隔离、失败只记录。

**Q20. 定时任务怎么设计？**

- cron 5 / 6 段；启用 / 停用；`nextRunAt` 实时计算。
- 到点触发 `ChecksService.startRun`。
- SSE 实时输出、运行历史、成功 / 失败统计。
- 停用任务仍可手动触发。

### E. RAG / 知识库

**Q21. RAG 完整链路？**

- 解析 → 清洗 → 切分 → Embedding → 索引 → 召回（向量 + 全文）→ RRF → 生成 → 引用 → 评估。

**Q22. 为什么用 RRF，而不是加权分数？**

- 全文和向量分数尺度不同，归一化麻烦。
- RRF 只看排名：`score = Σ 1/(k + rank)`。
- 低相似纯向量候选先过滤，不进入 RRF。
- 向量不可用时降级全文。

**Q23. Chunking 怎么切？**

- 按 Markdown 标题 / 段落 / 语义。
- 控制大小 + overlap；保留 metadata。
- 太大召回不准，太小上下文断裂。

**Q24. 怎么评估 RAG？**

- Retrieval：Recall@K、MRR、NDCG。
- Generation：faithfulness、answer relevance、citation accuracy。
- 业务：人工验收、任务成功率。

**Q25. 幻觉 / 权限怎么控制？**

- 只依据检索内容回答，引用原文。
- 检索不到就拒答 / 转人工。
- chunk 带 ACL / tenant，检索前过滤。
- 引用时校验权限。

### F. Eval 评测体系

**Q26. 为什么 AI 需要 eval？和传统测试区别？**

- 传统测试断言确定输出；AI 输出不确定。
- 需要测试集、要点、评分、LLM-as-judge、证据校验。
- 用于回归、选模型、选配置、发布门禁。

**Q27. 你们的 eval 体系结构？**

- `eval_suite` 测试集 → `eval_case` 用例 → `eval_case_point` 要点。
- `eval_run` 批次 → `eval_run_item` 评估项（用例 × 重复）。
- `eval_judgement` 判定记录；`eval_event` 事件流。
- `eval_worker_snapshot` 配置快照；沙箱隔离执行。

**Q28. 用例 / 要点怎么设计？**

- 用例 = Prompt + 补充信息 + 要点清单。
- 要点有 `required`（必需项）和 `weight`。
- 测试集分 train（优化可见）/ validation（优化不可见）。
- 通过阈值默认 80，超时 1800s，最多 3 次提问。

**Q29. 评分算法？**

- 每条要点 hit = 0 / 0.5 / 1。
- `score = round(100 × Σ(w×h) / Σw)`。
- `pass = 必需项全 hit=1 且 score ≥ 阈值`。
- 一次返工；记录 firstScore / finalScore。

**Q30. 怎么防 judge 瞎判 / 幻觉？**

- 判定要求逐条给 `evidence` 原文摘录。
- 平台校验 evidence 必须是交付内容子串（规范化后长度 ≥4）。
- 证据不合法 → hit 改为 0。
- 必需项全命中才通过。

**Q31. 沙箱怎么隔离？**

- 复制真实工位，剔除 `docs/`、`.env`、MCP 配置。
- 注入评估令牌；独立 HOME。
- 评估项结束销毁；启动清理孤儿沙箱。
- bridge 校验沙箱必须在执行器工作区内。

**Q32. 权限 / 并发 / 恢复怎么设计？**

- eval token：JWT 30 分钟，评估项结束吊销；judge token 只能调 2 个判定工具。
- eval shield：拦截写操作、子任务、需求方动作、越权任务。
- 并发：全局 5、判定 3、单批次 3、单项上限 200。
- tick 每 2 秒推进；失败续跑 30s / 3min；判定最多 3 次。

### G. 模型降级 / 模型网关

**Q33. 模型降级怎么实现？**

- 主模型 + 备用模型；配额 / 限流 / 余额错误识别。
- 按 `executor + provider + model` 共享冷却 30 分钟。
- 同 session `switchModel` + continue prompt 续跑。
- 每轮最多切一次；备用也失败走原失败流程。

**Q34. 为什么排除上下文超长？**

- `context length / max tokens / too many tokens` 不是限额。
- 换模型解决不了，可能还是超。
- 应该裁剪上下文或换长上下文模型。

**Q35. 备用也限额怎么办？**

- 主模型冷却 + 备用也冷却 → 回到主模型，保持原失败行为。
- 不无限切换；失败流程 / 人工接管。

**Q36. 怎么升级成模型网关？**

- 冷却状态放 Redis，多实例共享。
- 多级 fallback 链。
- 按任务类型 / 成本 / 延迟 / 上下文长度路由。
- 配额、限流、缓存、成本归因、指标。
- 灰度 / A-B、质量评估。

### H. 可观测性 / 成本 / 效果

**Q37. AI 可观测性怎么做？**

- 每次 session / tool call 的 trace / span。
- token、latency、cost、错误率。
- 任务事件流、评估事件流、SSE。
- 审计日志、会话回放。

**Q38. 成本怎么控？**

- 模型分级 / 备用模型。
- 上下文裁剪、工具结果截断。
- 缓存 / 去重。
- max steps / token budget。
- 按任务 / 租户成本归因。

**Q39. 怎么衡量 AI 落地 ROI？**

- 任务成功率、一次验收通过率、返工率。
- 人工接管率、平均耗时。
- 节省人力 / 缩短交付周期。
- 成本 / 任务、token / 任务。

---

## 不要夸大的边界

1. **WorkHub 仓库如果你 0 提交**：说「基于 / 推动 / 落地 WorkHub」，不要说「我开发了 WorkHub」。
2. **AI 自动交付不是全自动**：只到 PR，不自动合并；生产写要审批。
3. **AI 巡检不是 AI 直接修生产**：脚本只读检查，异常转缺陷 / 工单。
4. **RAG 没有 rerank / GraphRAG**：是 PGVector + 全文 + RRF；不要说自己做了 cross-encoder rerank。
5. **Eval 是平台能力**：如果你没直接写 eval 代码，说「平台有这套评测体系，我参与使用 / 推动」，不要说「我从 0 设计」。
6. **没有 fine-tuning / vLLM / 多模态**：不要为了匹配 JD 硬说自己做过。

---

## 面试表达模板

**「你们 AI 落地整体怎么做？」**

> 我们不是做一个聊天窗口，而是把 AI 做成研发流程里的执行角色：需求 → 任务定义 → Agent 运行时 → 工具调用 → 交付文档 → 人工验收。Agent 有状态机、有权限、有审计，能接任务、能提问、能返工，但生产写和验收必须过人。

**「模型降级怎么实现？」**

> 主备模型 + 限额错误识别 + 30 分钟共享冷却 + 同会话续跑。主模型 429 / 配额 / 余额不足时，先按 executor + provider + model 标记冷却，然后在同一 session 里 switchModel 到备用模型，用 continue prompt 续跑，每轮最多切一次；上下文超长这类非限额错误不切，因为换模型解决不了。备用也限额就回到原失败流程。

**「Eval 怎么做？」**

> 测试集冻结成 Golden Set，每条用例有 Rubric；用 LLM-as-a-Judge 打分，但要求 Evidence 必须引用交付原文，平台做 Evidence Validation，证据不合法直接判 0；必需项全命中且分数过阈值才算通过，失败给一次返工。整个执行在沙箱里，权限用 eval token + shield 限制。

**「Guardrails 怎么做？」**

> 三层：工具层用 MCP policy 和最小权限；执行层用 eval token + shield 拦写 / 子任务 / 越权；业务层生产只读、写操作走工单 + 人工审批。所有调用留审计，不落原始 Token。
