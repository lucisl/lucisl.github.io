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
