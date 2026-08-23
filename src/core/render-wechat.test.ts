import { describe, expect, it } from 'vitest';
import { parseDocument } from './document';
import { renderWechat } from './render-wechat';
import { wechatThemeSchema } from './wechat-theme-schema';
import { getWechatTheme } from './wechat-themes';
import { wechatStylePresets } from './wechat-style';

describe('renderWechat', () => {
  it('renders editorial headings, emphasis, quotes, lists, tables and code as inline-styled HTML', () => {
    const document = parseDocument(`# 一份值得读完的文章

这是 **真正重要** 的内容。

> 写作先照顾读者，再照顾形式。

1. 梳理观点
2. 删除重复

| 阶段 | 结果 |
| --- | --- |
| 初稿 | 可编辑 |

\`\`\`sh
npm run build
\`\`\``);
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('data-zhijian-theme="editorial-notes"');
    expect(result.html).toContain("font-family:-apple-system, BlinkMacSystemFont, 'PingFang SC'");
    expect(result.html).toContain('FEATURE / 01');
    expect(result.html).toContain('编者按');
    expect(result.html).toContain('真正重要');
    expect(result.html).toContain('<table');
    expect(result.html).toContain('CODE / SH');
    expect(result.plainText).toContain('1. 梳理观点');
    expect(result.stats.headings).toBe(1);
  });

  it('escapes user text, removes raw HTML and blocks unsafe link protocols', () => {
    const document = parseDocument('<script>alert("bad")</script>\n\n[打开](javascript:alert(1))\n\n普通 < 文本');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('普通 &lt; 文本');
    expect(result.warnings.map((warning) => warning.code)).toContain('raw-html');
    expect(result.warnings.map((warning) => warning.code)).toContain('unsafe-link');
  });

  it('keeps images local-first by rendering a styled insertion placeholder', () => {
    const document = parseDocument('![产品细节](https://example.com/product.jpg)');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('图｜产品细节');
    expect(result.html).not.toContain('<img');
    expect(result.warnings.map((warning) => warning.code)).toContain('image-placeholder');
  });

  it('rejects theme colors that could inject arbitrary inline CSS', () => {
    const theme = getWechatTheme('editorial-notes');

    expect(() => wechatThemeSchema.parse({
      ...theme,
      palette: { ...theme.palette, accent: 'red;position:fixed' },
    })).toThrow();
  });

  it('applies safe typography, spacing, accent, heading and code controls', () => {
    const document = parseDocument('## 小标题\n\n一段正文。\n\n```ts\nconst ready = true;\n```');
    const elegant = wechatStylePresets.find((preset) => preset.id === 'elegant')!;
    const result = renderWechat(document, getWechatTheme('editorial-notes'), elegant.config);

    expect(result.html).toContain('data-zhijian-heading="underline"');
    expect(result.html).toContain("font-family:'Songti SC'");
    expect(result.html).toContain('font-size:17px;line-height:2.05');
    expect(result.html).toContain('color:#a35f6f');
    expect(result.html).toContain('background-color:#f4ede3;color:#2d2723');
  });

  it('rejects injected custom style colors at the renderer boundary', () => {
    const document = parseDocument('正文');
    const classic = wechatStylePresets[0]!.config;

    expect(() => renderWechat(document, getWechatTheme('editorial-notes'), {
      ...classic,
      accentColor: '#fff;position:fixed',
    })).toThrow();
  });

  it('resolves safe reference links and images and renders footnote definitions', () => {
    const document = parseDocument(`参考[项目主页][site]、[帮助中心][]和[直接入口]。

![封面图][cover]

正文带脚注[^note]。

[site]: https://example.com/project
[帮助中心]: https://example.com/help
[直接入口]: https://example.com/start
[cover]: https://example.com/cover.jpg
[^note]: 这是脚注正文。`);
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('href="https://example.com/project"');
    expect(result.html).toContain('href="https://example.com/help"');
    expect(result.html).toContain('href="https://example.com/start"');
    expect(result.html).toContain('图｜封面图');
    expect(result.html).not.toContain('<img');
    expect(result.html).toContain('注释 / note');
    expect(result.html).toContain('这是脚注正文。');
    expect(result.plainText).toContain('［note］ 这是脚注正文。');
    expect(result.warnings.map((warning) => warning.code)).toContain('image-placeholder');
  });

  it('blocks unsafe URLs resolved through reference definitions', () => {
    const document = parseDocument('[危险链接][unsafe]\n\n[unsafe]: javascript:alert(1)');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('危险链接');
    expect(result.html).not.toContain('javascript:');
    expect(result.plainText).toBe('危险链接');
    expect(result.warnings.map((warning) => warning.code)).toContain('unsafe-link');
  });

  it('canonicalizes leading footnotes after the article without polluting stats', () => {
    const document = parseDocument('[^note]: 前置脚注。\n\n# 主标题\n\n正文[^note]。');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html.indexOf('FEATURE / 01')).toBeLessThan(result.html.indexOf('注释 / note'));
    expect(result.plainText.indexOf('主标题')).toBeLessThan(result.plainText.indexOf('［note］ 前置脚注。'));
    expect(result.stats.headings).toBe(1);
    expect(result.stats.paragraphs).toBe(1);
  });

  it('outputs only referenced footnotes in first-reference order', () => {
    const document = parseDocument(`正文[^second][^first]。

[^first]: 第一条。
[^unused]: 内部备注。
[^second]: 第二条。`);
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).not.toContain('内部备注');
    expect(result.html.indexOf('注释 / second')).toBeLessThan(result.html.indexOf('注释 / first'));
    expect(result.plainText).not.toContain('内部备注');
  });
});
