/**
 * 把 projects/content/*.md 渲染成工作台页面。
 * Markdown 是唯一内容源；模板与元信息在这里维护，输出覆盖 projects/*.html。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from './vendor/marked.esm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'scripts/templates/doc.html');
const interviewTemplatePath = path.join(
  root,
  'scripts/templates/interview.html',
);

const PROJECTS = [
  {
    key: 'lita-work',
    index: '001',
    name: 'AI 工作中心',
    sub: 'WorkHub · 手册',
    href: './lita-work.html',
  },
  {
    key: 'lita',
    index: '002',
    name: 'Lita 生态',
    sub: '海外社交平台 · 手册',
    href: './lita.html',
  },
];

const TOPIC_GROUPS = {
  'lita-work': {
    overview: { name: 'AI 工作中心', href: './lita-work.html' },
    items: [
      { key: 'overview', name: '总览', href: './lita-work.html' },
      {
        key: 'skeleton',
        name: '最小代码骨架',
        href: './lita-work-skeleton.html',
      },
      {
        key: 'prompts',
        name: '分阶段提示词',
        href: './lita-work-prompts.html',
      },
      {
        key: 'ops',
        name: '运维部署手册',
        href: './lita-work-ops.html',
      },
      {
        key: 'skills-mcp',
        name: '技能与 MCP',
        href: './lita-work-skills-mcp.html',
      },
    ],
  },
  lita: {
    overview: { name: 'Lita 总览', href: './lita.html' },
    items: [
      { key: 'overview', name: '总览', href: './lita.html' },
      {
        key: 'metrics',
        name: '关键指标',
        href: './lita-metrics.html',
      },
      {
        key: 'activities',
        name: '活动运营',
        href: './lita-activities.html',
      },
      {
        key: 'voice-room',
        name: '语音房与直播',
        href: './lita-voice-room.html',
      },
      {
        key: 'gifting',
        name: '送礼与虚拟礼物',
        href: './lita-gifting.html',
      },
      {
        key: 'companion',
        name: '陪玩与交易',
        href: './lita-companion.html',
      },
    ],
  },
};

const PAGES = [
  {
    key: 'lita-work',
    project: 'lita-work',
    topic: 'overview',
    source: 'projects/content/lita-work.md',
    output: 'projects/lita-work.html',
    title: 'AI 工作中心 WorkHub — 项目手册 — WorkSpace',
    description:
      '一个以 AI 为中心的项目管理平台手册：从产品定位、数据模型、接口到核心流程的可重建说明。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 001',
    breadcrumb: '001',
    h1: 'AI 工作中心',
    h1Note: 'WorkHub',
    tagline: '让 AI 机器人像同事一样接任务、干活、交付，而不是一个聊天窗口。',
    meta: [
      ['周期', '约 3 个月'],
      ['规模', '约 18 万行'],
      ['数据模型', '69 个实体'],
      ['MCP 工具', '113 个'],
      ['协作方式', '单人主导 + AI'],
    ],
  },
  {
    key: 'work-skeleton',
    project: 'lita-work',
    topic: 'skeleton',
    source: 'projects/content/lita-work-skeleton.md',
    output: 'projects/lita-work-skeleton.html',
    title: '最小代码骨架 — AI 工作中心 — WorkSpace',
    description:
      'WorkHub 的文件级最小实现清单：后端/前端目录、每个文件职责、建表与启动顺序。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 001 · SKELETON',
    breadcrumb: '001 / 最小代码骨架',
    h1: '最小代码骨架',
    h1Note: 'Skeleton',
    tagline:
      '按文件搭出 MVP：先跑通登录 → 机器人 → 任务 → 验收，再扩展工单、知识库、MCP 与飞书。',
    meta: [
      ['目标', 'MVP'],
      ['后端文件', '约 40 个'],
      ['前端文件', '约 20 个'],
      ['参考路线', 'M0–M3'],
    ],
  },
  {
    key: 'work-prompts',
    project: 'lita-work',
    topic: 'prompts',
    source: 'projects/content/lita-work-prompts.md',
    output: 'projects/lita-work-prompts.html',
    title: '分阶段提示词 — AI 工作中心 — WorkSpace',
    description:
      '给 AI 编码 Agent 的分阶段提示词：从项目初始化到任务中心、工单、知识库、MCP 与飞书。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 001 · PROMPTS',
    breadcrumb: '001 / 分阶段提示词',
    h1: '分阶段提示词',
    h1Note: 'Prompt Pack',
    tagline:
      '按阶段复制给 AI，每个阶段都有范围、交付物、约束和验收标准。',
    meta: [
      ['阶段', '9 个'],
      ['用法', '顺序执行'],
      ['节奏', '每阶段自测'],
      ['参考', '第十节'],
    ],
  },
  {
    key: 'work-ops',
    project: 'lita-work',
    topic: 'ops',
    source: 'projects/content/lita-work-ops.md',
    output: 'projects/lita-work-ops.html',
    title: '运维部署手册 — AI 工作中心 — WorkSpace',
    description:
      'WorkHub 的部署与运维 runbook：进程拓扑、环境变量、迁移、执行器、工位、飞书配置、备份回滚与故障排查。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 001 · RUNBOOK',
    breadcrumb: '001 / 运维部署手册',
    h1: '运维部署手册',
    h1Note: 'Runbook',
    tagline:
      '从一台空服务器到可用的 WorkHub：依赖、配置、执行器、工位、飞书、备份与排障。',
    meta: [
      ['部署', '单机 / 多机'],
      ['数据库', 'PostgreSQL + pgvector'],
      ['执行器', 'opencode / bridge'],
      ['形态', 'Runbook'],
    ],
  },
  {
    key: 'work-skills-mcp',
    project: 'lita-work',
    topic: 'skills-mcp',
    source: 'projects/content/lita-work-skills-mcp.md',
    output: 'projects/lita-work-skills-mcp.html',
    title: '技能与 MCP — AI 工作中心 — WorkSpace',
    description:
      'WorkHub 的技能库、规范库与 MCP 说明：机器人如何获得能力、工位如何注入、平台与外部 MCP 如何配置。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 001 · SKILLS & MCP',
    breadcrumb: '001 / 技能与 MCP',
    h1: '技能与 MCP',
    h1Note: 'Skills & MCP',
    tagline:
      '机器人怎么获得能力：技能库给操作手册，规范库给约束，MCP 给工具。',
    meta: [
      ['技能库', 'docs/skills'],
      ['规范库', 'docs/standard'],
      ['平台 MCP', 'lita-work / lita-bots'],
      ['外部 MCP', '管理区配置'],
    ],
  },
  {
    key: 'lita',
    source: 'projects/content/lita.md',
    output: 'projects/lita.html',
    project: 'lita',
    topic: 'overview',
    title: 'Lita 生态总览 — 项目手册 — WorkSpace',
    description:
      'Lita 海外社交平台 40+ 仓库的个人整理手册：产品、架构、业务域、服务目录、数据体系、工程机制与阅读路线。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002',
    breadcrumb: '002',
    h1: 'Lita 生态',
    h1Note: '海外语音社交平台',
    tagline:
      '40+ 个独立仓库组成的海外社交平台：语音房、直播、陪玩交易、虚拟礼物、游戏化活动、数据平台与基础中台。这份文档是个人整理的总览手册，按「产品 → 架构 → 业务 → 服务 → 数据 → 工程 → 演进」组织。',
    meta: [
      ['仓库', '40+'],
      ['Java 文件', '22,873'],
      ['Java 行数', '约 179 万'],
      ['数据表文档', '2,451'],
      ['API 文档', '188'],
      ['统计截止', '2026-11-23'],
    ],
  },
  {
    key: 'metrics',
    source: 'projects/content/lita-metrics.md',
    output: 'projects/lita-metrics.html',
    topic: 'metrics',
    project: 'lita',
    title: '关键指标 — Lita 生态 — WorkSpace',
    description:
      'Lita 关键指标快照：DAU/MAU、月获客、注册率、QPS、延迟、充值、送礼与工程规模。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002 · METRICS',
    breadcrumb: '002 / 关键指标',
    h1: '关键指标',
    h1Note: 'Metrics Snapshot',
    tagline:
      '把业务指标和技术指标放在同一张快照里：日活、月获客、收入、送礼、QPS、延迟与数据规模。',
    meta: [
      ['业务快照', '2026-11-23'],
      ['DAU', '22,166'],
      ['实时 QPS', '884.9'],
      ['数据源', 'Prometheus + lita_stats'],
    ],
  },
  {
    key: 'activities',
    source: 'projects/content/lita-activities.md',
    output: 'projects/lita-activities.html',
    topic: 'activities',
    project: 'lita',
    title: '活动运营 — Lita 生态 — WorkSpace',
    description:
      'Lita 活动体系手册：运营/产品/游戏活动分类、活动服务三代演进、配置与结算链路、代表玩法与数据口径。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002 · ACTIVITIES',
    breadcrumb: '002 / 活动运营',
    h1: '活动运营',
    h1Note: 'Activities',
    tagline:
      '拉收、拉活、拉留存的主战场：签到、任务、PK、榜单、抽奖、召回与节日活动。',
    meta: [
      ['核心服务', 'active-main / v3 / lita-active'],
      ['接口文档', '177 份'],
      ['活动库', '213 张表'],
      ['状态', '活跃'],
    ],
  },
  {
    key: 'voice-room',
    source: 'projects/content/lita-voice-room.md',
    output: 'projects/lita-voice-room.html',
    topic: 'voice-room',
    project: 'lita',
    title: '语音房与直播 — Lita 生态 — WorkSpace',
    description:
      'Lita 语音房与直播手册：建房、麦位、连麦、PK、KTV、榜单、声网转推与停留/上麦数据。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002 · VOICE ROOM',
    breadcrumb: '002 / 语音房与直播',
    h1: '语音房与直播',
    h1Note: 'Voice Room & Live',
    tagline:
      '产品的主场景：用户进房、上麦、连麦、送礼、打榜，大房间再转推成直播。',
    meta: [
      ['核心服务', 'litalive / litaroom'],
      ['业务模块', '34 + 52'],
      ['RTC', 'Agora 声网'],
      ['数据', '停留 / 上麦 / 观看'],
    ],
  },
  {
    key: 'gifting',
    source: 'projects/content/lita-gifting.md',
    output: 'projects/lita-gifting.html',
    topic: 'gifting',
    project: 'lita',
    title: '送礼与虚拟礼物 — Lita 生态 — WorkSpace',
    description:
      'Lita 送礼手册：礼物配置、送礼链路、特效广播、宝箱盲盒、榜单与家族积分、送礼数据口径。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002 · GIFTING',
    breadcrumb: '002 / 送礼与虚拟礼物',
    h1: '送礼与虚拟礼物',
    h1Note: 'Gifting',
    tagline:
      '平台最核心的消费动作：从礼物配置到送出、广播、开箱、打榜与分成。',
    meta: [
      ['核心服务', 'lita-basic / litaroom'],
      ['关键模块', '礼物 / 宝箱 / 盲盒'],
      ['场景', '语音房 / 直播'],
      ['数据', '送礼明细 / 宝箱开启'],
    ],
  },
  {
    key: 'companion',
    source: 'projects/content/lita-companion.md',
    output: 'projects/lita-companion.html',
    topic: 'companion',
    project: 'lita',
    title: '陪玩与交易 — Lita 生态 — WorkSpace',
    description:
      'Lita 陪玩与交易手册：陪玩师技能、下单接单、充值支付、订单结算与风控。',
    robots: '<meta name="robots" content="noindex,nofollow">',
    eyebrow: 'PROJECT HANDBOOK / 002 · COMPANION',
    breadcrumb: '002 / 陪玩与交易',
    h1: '陪玩与交易',
    h1Note: 'Companion & Payment',
    tagline:
      '从浏览陪玩师技能到下单、支付、服务完成与平台结算的完整交易链路。',
    meta: [
      ['核心服务', 'lita-earth / lita-payment / lita-basic'],
      ['充值渠道', 'IPA / 第三方'],
      ['数据', '订单 / 充值'],
      ['风控', 'risk 模块'],
    ],
  },
];

const INTERVIEW_SECTIONS = {
  ai: {
    index: '001',
    name: 'AI 落地',
    sub: 'Agent · RAG · MCP · Eval',
    href: '/interview/ai/',
    subhead: 'AI 文档',
    items: [
      { key: 'overview', name: '题库', href: '/interview/ai/' },
      {
        key: 'highlights',
        name: '落地亮点',
        href: '/interview/ai/highlights/',
      },
    ],
  },
  activity: {
    index: '002',
    name: '活动专项',
    sub: '活动引擎 · 一致性 · 高并发',
    href: '/interview/activity/',
    subhead: '活动专题',
    items: [
      { key: 'overview', name: '题库', href: '/interview/activity/' },
      { key: 'rank', name: '排行榜', href: '/interview/activity/rank/' },
      { key: 'scanner', name: '扫表', href: '/interview/activity/scanner/' },
      { key: 'pipeline', name: '管道', href: '/interview/activity/pipeline/' },
      {
        key: 'reward',
        name: '奖励一致性',
        href: '/interview/activity/reward/',
      },
      {
        key: 'concurrency',
        name: '高并发玩法',
        href: '/interview/activity/concurrency/',
      },
    ],
  },
};

const INTERVIEW_PAGES = [
  {
    section: 'ai',
    topic: 'overview',
    source: 'interview/content/ai.md',
    output: 'interview/ai/index.html',
    title: 'AI 落地 — 面试题库 — Interview',
    description:
      '按 WorkHub 真实实现整理的 AI 落地面试题：Agent 运行时、MCP、RAG、Eval、Guardrails、Observability、模型降级。',
    eyebrow: 'INTERVIEW / AI LANDING',
    breadcrumb: '001 / AI 落地',
    h1: 'AI 落地',
    tagline:
      'Agent 运行时、MCP、RAG、Eval、模型降级，按 WorkHub 真实实现整理。',
    sourceHref: '../content/ai.md',
    sourceName: 'ai.md',
  },
  {
    section: 'ai',
    topic: 'highlights',
    source: 'interview/content/ai-highlights.md',
    output: 'interview/ai/highlights/index.html',
    title: 'AI 落地亮点 — 面试题库 — Interview',
    description:
      'WorkHub 的 AI 落地技术亮点：Agent 运行时、MCP 工具生态、反馈闭环、线上巡检、RAG、Eval、模型降级与 Guardrails。',
    eyebrow: 'INTERVIEW / AI HIGHLIGHTS',
    breadcrumb: '001 / AI 落地 / 亮点',
    h1: 'AI 落地亮点',
    tagline: 'WorkHub 里真正有技术含量的 8 个 AI 落地设计。',
    sourceHref: '../../content/ai-highlights.md',
    sourceName: 'ai-highlights.md',
  },
  {
    section: 'activity',
    topic: 'overview',
    source: 'interview/content/activity.md',
    output: 'interview/activity/index.html',
    title: '活动专项 — 面试题库 — Interview',
    description:
      '按 Lita 活动系统整理的面试题：配置驱动活动引擎、组件化、时间策略、奖励幂等/回收、捕鱼并发、余额锁、多区域与高并发。',
    eyebrow: 'INTERVIEW / ACTIVITY',
    breadcrumb: '002 / 活动专项',
    h1: '活动专项',
    tagline:
      '活动引擎、组件化、奖励一致性与高并发，按 Lita 真实实现整理。',
    sourceHref: '../content/activity.md',
    sourceName: 'activity.md',
  },
  {
    section: 'activity',
    topic: 'rank',
    source: 'interview/content/activity-rank.md',
    output: 'interview/activity/rank/index.html',
    title: '排行榜 — 活动专项 — Interview',
    description:
      'mod_common_rank_record 的设计：六维坐标覆盖所有榜单、append-only 账本、唯一键幂等、Redis 时间 tie-break、贡献者关系图与可重建。',
    eyebrow: 'ACTIVITY / RANK',
    breadcrumb: '002 / 活动 / 排行榜',
    h1: '排行榜',
    tagline:
      '一张表 + 六维坐标，支撑 PK/房间/家族/用户/CP 所有榜单。',
    sourceHref: '../../content/activity-rank.md',
    sourceName: 'activity-rank.md',
  },
  {
    section: 'activity',
    topic: 'scanner',
    source: 'interview/content/activity-scanner.md',
    output: 'interview/activity/scanner/index.html',
    title: '扫表器 — 活动专项 — Interview',
    description:
      'basic-scanner 的设计：游标 checkpoint、正扫/倒扫、Kafka 消息、@ScannerMessage 注解消费。',
    eyebrow: 'ACTIVITY / SCANNER',
    breadcrumb: '002 / 活动 / 扫表',
    h1: '扫表器',
    tagline: 'ScannerMessage：把 DB 变更变成 Kafka 事件。',
    sourceHref: '../../content/activity-scanner.md',
    sourceName: 'activity-scanner.md',
  },
  {
    section: 'activity',
    topic: 'pipeline',
    source: 'interview/content/activity-pipeline.md',
    output: 'interview/activity/pipeline/index.html',
    title: '管道 — 活动专项 — Interview',
    description:
      '配置驱动的活动流：Nacos YAML、模块注册、Pipeline 并行、故障隔离、零代码边界。',
    eyebrow: 'ACTIVITY / PIPELINE',
    breadcrumb: '002 / 活动 / 管道',
    h1: '管道',
    tagline: '配置驱动的活动流：模块 + Pipeline + YAML。',
    sourceHref: '../../content/activity-pipeline.md',
    sourceName: 'activity-pipeline.md',
  },
  {
    section: 'activity',
    topic: 'reward',
    source: 'interview/content/activity-reward.md',
    output: 'interview/activity/reward/index.html',
    title: '奖励一致性 — 活动专项 — Interview',
    description:
      '活动奖励一致性：GET/USE 双流水、唯一键幂等、宝箱多级结算、回收与补偿、对账。',
    eyebrow: 'ACTIVITY / REWARD',
    breadcrumb: '002 / 活动 / 奖励一致性',
    h1: '奖励一致性',
    tagline: '奖励不是发个奖，是资金一致性。',
    sourceHref: '../../content/activity-reward.md',
    sourceName: 'activity-reward.md',
  },
  {
    section: 'activity',
    topic: 'concurrency',
    source: 'interview/content/activity-concurrency.md',
    output: 'interview/activity/concurrency/index.html',
    title: '高并发玩法 — 活动专项 — Interview',
    description:
      '活动高并发：捕鱼条件更新、宝箱状态机、余额单写者锁、Redis 多实例、事件驱动与峰值治理。',
    eyebrow: 'ACTIVITY / CONCURRENCY',
    breadcrumb: '002 / 活动 / 高并发玩法',
    h1: '高并发玩法',
    tagline: '条件更新、唯一索引、锁、缓存分层与事件驱动。',
    sourceHref: '../../content/activity-concurrency.md',
    sourceName: 'activity-concurrency.md',
  },
];

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderMarkdown(markdown) {
  let html = marked.parse(markdown, { gfm: true, breaks: false });

  // 架构图使用专用的深色样式
  html = html.replace(
    /<pre><code class="language-diagram">/g,
    '<pre class="ws-diagram"><code>',
  );

  // 宽表格统一加横向滚动容器
  html = html
    .replace(/<table>/g, '<div class="ws-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');

  // 按二级标题切分，每个章节一张卡片，并生成目录
  const chunks = html.split(/(?=<h2>)/).filter((chunk) => chunk.trim());
  const toc = [];
  const sections = [];

  for (const chunk of chunks) {
    const heading = chunk.match(/^<h2>([\s\S]*?)<\/h2>/);
    if (!heading) {
      sections.push(`<section class="ws-card ws-prose">${chunk}</section>`);
      continue;
    }
    const index = sections.length + 1;
    const id = `chapter-${index}`;
    const label = decodeEntities(heading[1].replace(/<[^>]+>/g, '')).trim();
    const body = chunk.replace(
      /^<h2>[\s\S]*?<\/h2>/,
      `<h2 id="${id}">${heading[1]}</h2>`,
    );
    toc.push(`            <li><a href="#${id}">${escapeHtml(label)}</a></li>`);
    sections.push(
      `<section class="ws-card ws-prose" id="${id}">${body}</section>`,
    );
  }

  return { content: sections.join('\n\n'), toc: toc.join('\n') };
}

function renderProjects(pageKey) {
  return PROJECTS.map(
    (project) => `          <li>
            <a class="ws-project-link${project.key === pageKey ? ' is-active' : ''}" href="${project.href}">
              <span class="ws-project-index">${project.index}</span>
              <span>
                <b>${project.name}</b>
                <small>${project.sub}</small>
              </span>
            </a>
          </li>`,
  ).join('\n');
}

function renderInterviewRail(page) {
  return Object.entries(INTERVIEW_SECTIONS)
    .map(([key, section]) => {
      const active = key === page.section ? ' is-active' : '';
      return `          <li>
            <a class="ws-project-link${active}" href="${section.href}">
              <span class="ws-project-index">${section.index}</span>
              <span>
                <b>${section.name}</b>
                <small>${section.sub}</small>
              </span>
            </a>
          </li>`;
    })
    .join('\n');
}

function renderInterviewSubnav(page) {
  const section = INTERVIEW_SECTIONS[page.section];
  if (!section) return '';
  const activeTopic = page.topic ?? 'overview';
  const items = section.items
    .map(
      (item) => `          <li><a class="${item.key === activeTopic ? 'is-active' : ''}" href="${item.href}">${item.name}</a></li>`,
    )
    .join('\n');
  return `        <div class="ws-rail-subhead">${section.subhead}</div>
        <ul class="ws-topic-list">
${items}
        </ul>`;
}

function renderMeta(meta) {
  return meta
    .map(
      ([label, value]) =>
        `            <li><span>${label}</span><b>${value}</b></li>`,
    )
    .join('\n');
}

function renderSubpages(page) {
  const group = TOPIC_GROUPS[page.project];
  if (!group || !page.topic) return '';
  const items = group.items.map(
    (topic) => `          <li><a class="${topic.key === page.topic ? 'is-active' : ''}" href="${topic.href}">${topic.name}</a></li>`,
  ).join('\n');
  const label = page.project === 'lita-work' ? 'WorkHub 文档' : '业务专题';
  return `        <div class="ws-rail-subhead">${label}</div>
        <ul class="ws-topic-list">
${items}
        </ul>`;
}

function renderActions(page) {
  const group = TOPIC_GROUPS[page.project];
  if (!group || !page.topic || page.topic === 'overview') return '';
  return `          <div class="ws-actions">
            <a class="ws-btn" href="${group.overview.href}">← 返回 ${group.overview.name}</a>
          </div>`;
}

export async function buildPages() {
  const template = await readFile(templatePath, 'utf8');

  for (const page of PAGES) {
    const markdown = await readFile(path.join(root, page.source), 'utf8');
    const { content, toc } = renderMarkdown(markdown);
    const sourceName = path.basename(page.source);

    const output = template
      .replaceAll('{{TITLE}}', escapeHtml(page.title))
      .replaceAll('{{DESCRIPTION}}', escapeHtml(page.description))
      .replaceAll('{{ROBOTS}}', page.robots)
      .replaceAll('{{EYEBROW}}', page.eyebrow)
      .replaceAll('{{BREADCRUMB}}', page.breadcrumb)
      .replaceAll('{{H1}}', escapeHtml(page.h1))
      .replaceAll('{{H1_NOTE}}', escapeHtml(page.h1Note))
      .replaceAll('{{TAGLINE}}', escapeHtml(page.tagline))
      .replaceAll('{{META_ITEMS}}', renderMeta(page.meta))
      .replaceAll('{{PROJECTS}}', renderProjects(page.project))
      .replaceAll('{{SUBPAGES}}', renderSubpages(page))
      .replaceAll('{{ACTIONS}}', renderActions(page))
      .replaceAll('{{TOC}}', toc)
      .replaceAll('{{CONTENT}}', content)
      .replaceAll('{{SOURCE_NAME}}', sourceName);

    await writeFile(path.join(root, page.output), `${output}\n`);
    console.log(`rendered ${page.output}`);
  }

  const interviewTemplate = await readFile(interviewTemplatePath, 'utf8');

  for (const page of INTERVIEW_PAGES) {
    const markdown = await readFile(path.join(root, page.source), 'utf8');
    const { content, toc } = renderMarkdown(markdown);
    const sourceName = page.sourceName ?? path.basename(page.source);
    const sourceHref = page.sourceHref ?? `./content/${sourceName}`;

    const output = interviewTemplate
      .replaceAll('{{TITLE}}', escapeHtml(page.title))
      .replaceAll('{{DESCRIPTION}}', escapeHtml(page.description))
      .replaceAll('{{EYEBROW}}', escapeHtml(page.eyebrow))
      .replaceAll('{{BREADCRUMB}}', escapeHtml(page.breadcrumb))
      .replaceAll('{{H1}}', escapeHtml(page.h1))
      .replaceAll('{{TAGLINE}}', escapeHtml(page.tagline))
      .replaceAll('{{RAIL}}', renderInterviewRail(page))
      .replaceAll('{{SUBNAV}}', renderInterviewSubnav(page))
      .replaceAll('{{TOC}}', toc)
      .replaceAll('{{CONTENT}}', content)
      .replaceAll('{{SOURCE_HREF}}', sourceHref)
      .replaceAll('{{SOURCE_NAME}}', sourceName);

    const outputPath = path.join(root, page.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${output}\n`);
    console.log(`rendered ${page.output}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildPages();
}
