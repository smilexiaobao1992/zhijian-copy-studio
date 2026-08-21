# 纸间排版（Zhijian Copy Studio）

一个开源、本地优先的小红书与微信公众号文案排版器。输入 Markdown 或普通文案，即时切换渠道和主题，复制可直接发布的小红书纯文本或公众号富文本。

![纸间排版首页](./docs/homepage.png)

## 当前能力

- Markdown 与普通文案输入，编辑与预览左右并列
- 清简、信号、纸间、步序四套结构化排版主题
- 微信公众号“编辑部手记”富文本主题
- 步骤教程、实用清单、产品测评三个内容模板
- 标题、列表、任务列表、引用、重点、代码、链接和话题转换
- 字数、段落、标题、话题统计及发布前提示
- 本地自动保存，刷新页面后继续编辑
- 桌面、平板与移动端响应式工作区
- 纯客户端运行，不需要账号、服务端或 API Key

公众号输出使用经过约束的内联样式 HTML，剪贴板同时写入 `text/html` 与 `text/plain`，可直接粘贴到公众号编辑器继续调整。

![公众号编辑部手记主题](./docs/wechat-editorial-desktop.png)

<details>
  <summary>查看 375px 移动端公众号预览</summary>
  <img src="./docs/wechat-editorial-mobile.png" width="375" alt="纸间排版移动端公众号主题预览" />
</details>

## 快速开始

```bash
git clone git@github.com:smilexiaobao1992/zhijian-copy-studio.git
cd zhijian-copy-studio
npm install
npm run dev
```

打开 `http://localhost:4321`，排版工作台位于 `http://localhost:4321/studio/`。

## 排版算法与数据流

纸间排版不是用正则直接替换 Markdown，而是先建立语法树，再由渠道渲染器递归生成目标内容：

```mermaid
flowchart LR
  A[Markdown / 普通文案] --> B[remark-parse + remark-gfm]
  B --> C[mdast Root]
  C --> D[小红书渲染器]
  C --> E[公众号渲染器]
  D --> F[纯文本 + 统计提示]
  E --> G[安全 HTML + 纯文本回退]
  F --> H[剪贴板]
  G --> H
```

### 1. 解析为 mdast

`parseDocument(source)` 使用 `unified`、`remark-parse` 和 `remark-gfm`，返回稳定的文档对象：

```ts
type ContentDocument = {
  schemaVersion: 1;
  source: string;
  ast: Root;
};
```

保留原始 `source`，主题切换只重新渲染 AST，不改写用户输入。`schemaVersion` 为以后迁移本地草稿或扩充文档协议提供版本边界。

### 2. 按源码顺序递归渲染

`renderXiaohongshu(document, theme)` 从根节点开始调用 `renderBlock`，按原文顺序遍历块级节点：

| mdast 节点 | 小红书输出规则 |
| --- | --- |
| `heading` | 根据主题生成标题前缀，再渲染行内内容 |
| `paragraph` | 渲染文字、重点、链接、行内代码等行内节点 |
| `list` / `listItem` | 根据有序、无序、任务状态选择主题标记，并保持嵌套缩进 |
| `blockquote` | 给引用内容的每一行添加主题引用前缀 |
| `table` | 将单元格渲染为以 `｜` 分隔的纯文本行 |
| `code` | 在代码块前添加主题代码标记，再保留代码正文 |
| `thematicBreak` | 输出主题分隔线 |
| `html` | 丢弃 HTML 标签，并记录安全提示 |

行内渲染器支持 `text`、`strong`、`emphasis`、`delete`、`inlineCode`、`break`、`link`、`image` 和脚注节点。链接保留可见文字和 URL；图片退化为可读的图片说明，不尝试上传或嵌入资源。

公众号由 `renderWechat(document, theme)` 遍历同一棵 mdast，生成带内联样式的标题、段落、步骤、引用、表格和代码块。用户文字先进行 HTML 转义，链接仅允许 `http`、`https`、`mailto`、`tel` 和页内锚点协议，原始 HTML 一律丢弃。远程图片不会在预览阶段加载，而是保留为插图位置说明，避免破坏本地优先的隐私边界。

### 3. 主题是经过校验的规则对象

主题不是一组页面颜色，而是一份可执行的排版协议。小红书主题通过 Zod 的 `xhsThemeSchema` 校验，包括标题、列表、引用、分隔线、强调和代码标记：

```ts
{
  heading: { style: 'symbol', symbol: '▌' },
  unorderedBullet: '→',
  orderedStyle: 'filled',
  quotePrefix: '⌁ 提示｜',
  divider: '— · — · —'
}
```

公众号主题则通过 `wechatThemeSchema` 校验颜色、标题标签、引用标签和分隔符。主题只能提供经过验证的数据，不能注入标签或任意样式；HTML 结构始终由渲染器掌握。

### 4. 输出归一化

块级结果先用两个换行连接，然后依次：

1. 删除换行前的尾随空格；
2. 将三个及以上连续换行压缩为两个；
3. 清理首尾空白。

小红书最终得到普通文本。公众号同时得到安全 HTML 和归一化纯文本，分别作为剪贴板的富文本与回退格式。

### 5. 统计与发布提示

两个渠道都会计算字符数、标题数、段落数和话题数。小红书会针对内容为空、字符数超过 1000、第一行超过 28 个字符、话题超过 10 个和原始 HTML 给出提示；公众号则提示空内容、已移除的原始 HTML、图片插入位置和不安全链接协议。

这些是编辑辅助信息，不会阻止复制，也不会擅自修改文案。

### 复杂度

设 AST 节点与文本总量为 `n`，树深为 `d`：解析、HTML 检查、递归渲染与统计都是线性遍历，整体时间复杂度为 `O(n)`；输出及 AST 占用 `O(n)` 空间，递归调用栈为 `O(d)`。

## 双渠道架构

解析层只负责把输入变成通用 mdast，渠道差异集中在独立渲染器中：

```text
Markdown ──> mdast ──┬──> render-xhs.ts     ──> 纯文本
                     └──> render-wechat.ts  ──> 安全内联样式 HTML
```

两个渲染器共享解析器、mdast 文档树、编辑器和内容模板，但保留各自的结果类型、主题协议与复制方式。编辑器只计算当前渠道的结果，小红书写入纯文本，公众号写入富文本和纯文本两种 MIME。新增渠道时无需改变 Markdown 解析规则。

## 技术架构

| 层级 | 技术与职责 |
| --- | --- |
| 页面外壳 | Astro：静态首页、路由和轻量页面装配 |
| 编辑器 | React Island：输入、主题、模板、预览与复制交互 |
| 文档核心 | TypeScript + unified/remark：解析 mdast 和渠道渲染 |
| 主题协议 | Zod：运行时校验主题配置与本地草稿结构 |
| 性能策略 | `useDeferredValue` + `useMemo`：避免输入时重复计算 |
| 本地存储 | `localStorage`：420ms 防抖保存，不上传文案 |
| 样式系统 | CSS Modules + 全局设计 Token |
| 质量保障 | Vitest + Astro Check + Playwright |

选择 mdast 而不是自行实现字符串解析，是为了保留标准 Markdown 语义，并让小红书纯文本与公众号富文本共享同一棵文档树。

## 项目结构

```text
docs/                     README 截图等仓库资料
src/core/                 文档解析、双渠道主题协议、渲染器与测试
src/features/editor/      React 编辑工作台、模板和本地草稿
src/layouts/              SEO/GEO 元数据与页面壳
src/pages/                Astro 页面、静态路由与发现文件
src/styles/               全局 Token 与页面样式
tests/e2e/                桌面与移动端关键流程测试
```

## 开发与验证

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run test` | 运行核心单元测试 |
| `npm run check` | 执行 Astro / TypeScript 检查 |
| `npm run build` | 类型检查并构建生产版本 |
| `npm run verify` | 依次运行单元测试和生产构建 |
| `npm run test:e2e` | 运行桌面与移动端 Playwright 测试 |

首次运行端到端测试需要安装 Chromium：

```bash
npx playwright install chromium
npm run test:e2e
```

如果测试目标不是默认本地地址，可设置 `PLAYWRIGHT_BASE_URL`。

## 部署与 SEO/GEO

生产构建前必须提供最终公开域名，canonical、Open Graph URL、结构化数据、`robots.txt` 和 `sitemap.xml` 都会从同一个地址生成：

```bash
SITE_URL=https://example.com npm run build
```

部署平台应将 `SITE_URL` 设置为不含路径的站点根地址。项目同时提供面向搜索引擎的 JSON-LD、面向 AI 检索的 `/llms.txt`，以及标准 `/robots.txt`、`/sitemap.xml`。域名未配置时，本地构建仍可运行，但不会输出可能错误的 canonical URL。

## 设计与隐私边界

- 主题只改变输出，不修改原始文案。
- 小红书结果是普通文本，不声称平台支持真正的颜色、字号或粗体。
- 公众号结果只包含渲染器生成的标签与内联样式，用户原始 HTML 不会透传。
- 原始 HTML 会被移除，不进入复制结果。
- 草稿仅保存在当前浏览器的 `localStorage`。
- 当前版本不自动发布、不上传文案、不接入 AI 或违禁词接口。

视觉系统和响应式规则见 [DESIGN.md](./DESIGN.md)，主题贡献方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## Roadmap

- 更多公众号主题与段落组件
- 本地图片插入与发布前替换流程
- 更多可组合主题与内容模板
- 主题配置导入、导出与社区共享

## License

[MIT](./LICENSE)
