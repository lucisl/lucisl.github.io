/**
 * 把 projects/content/*.md 渲染成工作台页面。
 * Markdown 是唯一内容源；模板与元信息在这里维护，输出覆盖 projects/*.html。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from './vendor/marked.esm.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(root, 'scripts/templates/doc.html');

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

const TOPICS = [
  { key: 'overview', name: '总览', href: './lita.html' },
  { key: 'activities', name: '活动运营', href: './lita-activities.html' },
  { key: 'voice-room', name: '语音房与直播', href: './lita-voice-room.html' },
  { key: 'gifting', name: '送礼与虚拟礼物', href: './lita-gifting.html' },
  { key: 'companion', name: '陪玩与交易', href: './lita-companion.html' },
];

const PAGES = [
  {
    key: 'lita-work',
    source: 'projects/content/lita-work.md',
    output: 'projects/lita-work.html',
    title: 'AI 工作中心 WorkHub — 项目手册 — WorkSpace',
    description:
      '一个以 AI 为中心的项目管理平台手册：全链路领域模型、MCP 开放层、多执行器抽象、工位上下文工程与可靠异步。内容已匿名化。',
    robots: '',
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
    key: 'lita',
    source: 'projects/content/lita.md',
    output: 'projects/lita.html',
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
    key: 'activities',
    source: 'projects/content/lita-activities.md',
    output: 'projects/lita-activities.html',
    topic: 'activities',
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

function renderMeta(meta) {
  return meta
    .map(
      ([label, value]) =>
        `            <li><span>${label}</span><b>${value}</b></li>`,
    )
    .join('\n');
}

function renderSubpages(page) {
  if (!page.topic) return '';
  const items = TOPICS.map(
    (topic) => `          <li><a class="${topic.key === page.topic ? 'is-active' : ''}" href="${topic.href}">${topic.name}</a></li>`,
  ).join('\n');
  return `        <div class="ws-rail-subhead">业务专题</div>
        <ul class="ws-topic-list">
${items}
        </ul>`;
}

function renderActions(page) {
  if (!page.topic || page.topic === 'overview') return '';
  return `          <div class="ws-actions">
            <a class="ws-btn" href="./lita.html">← 返回 Lita 总览</a>
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
      .replaceAll('{{PROJECTS}}', renderProjects(page.key))
      .replaceAll('{{SUBPAGES}}', renderSubpages(page))
      .replaceAll('{{ACTIONS}}', renderActions(page))
      .replaceAll('{{TOC}}', toc)
      .replaceAll('{{CONTENT}}', content)
      .replaceAll('{{SOURCE_NAME}}', sourceName);

    await writeFile(path.join(root, page.output), `${output}\n`);
    console.log(`rendered ${page.output}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildPages();
}
