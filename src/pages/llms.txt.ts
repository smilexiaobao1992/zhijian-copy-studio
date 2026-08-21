import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const pageUrl = (path: string) => (site ? new URL(path, site).href : path);
  const content = `# 纸间排版（Zhijian Copy Studio）

> 开源、本地优先的小红书图文文案排版器，将 Markdown 或普通文案转换为适合复制发布的结构化纯文本。

纸间排版在浏览器本地运行，不要求登录，不上传文案，不自动发布。当前提供四套排版主题、三个内容模板、实时左右对照预览、本地草稿保存和发布前统计提示。

## 主要页面

- [首页](${pageUrl('/')})：产品能力、设计原则、渠道路线与主题说明
- [排版工作台](${pageUrl('/studio/')})：输入、主题选择、实时预览与复制
- [隐私说明](${pageUrl('/privacy/')})：本地数据与隐私边界
- [使用说明](${pageUrl('/terms/')})：工具能力及使用限制
- [开源仓库](https://github.com/smilexiaobao1992/zhijian-copy-studio)：源代码、算法说明和贡献指南

## 技术概要

输入先由 unified、remark-parse 与 remark-gfm 解析为 mdast，再由独立的小红书渠道渲染器生成纯文本。微信公众号安全富文本渲染器处于规划阶段。
`;

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
