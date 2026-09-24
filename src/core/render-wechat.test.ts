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

## 为什么值得读

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
    expect(result.title).toBe('一份值得读完的文章');
    expect(result.html).not.toContain('一份值得读完的文章');
    expect(result.html).toContain('章节 / 01');
    expect(result.html).toContain('font-size:12px');
    expect(result.html).toContain('data-zhijian-divider="short-rule"');
    expect(result.html).toContain('>&nbsp;</p>');
    expect(result.html).not.toContain('vertical-align:top;"></span>');
    expect(result.html).toContain('引文');
    expect(result.html).not.toContain('编者按');
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

  it('keeps safe Markdown line breaks inside tables without allowing other raw HTML', () => {
    const document = parseDocument('| 版本 | 说明 |\n| --- | --- |\n| 帛书 | 原文<br>补充说明 |');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('原文<br />补充说明');
    expect(result.plainText).toContain('原文\n补充说明');
    expect(result.warnings.map((warning) => warning.code)).not.toContain('raw-html');
  });

  it('keeps images local-first by rendering a styled insertion placeholder', () => {
    const document = parseDocument('![产品细节](https://example.com/product.jpg)');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('图｜产品细节');
    expect(result.html).not.toContain('<img');
    expect(result.warnings.map((warning) => warning.code)).toContain('image-placeholder');
  });

  it('embeds a managed local image as self-contained rich text', () => {
    const uri = 'zhijian-image://6e304f32-97fd-45ff-b803-630150761b44';
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const document = parseDocument(`![山水插图](${uri})`);
    const result = renderWechat(document, getWechatTheme('editorial-notes'), undefined, {
      imageSources: new Map([[uri, dataUrl]]),
    });

    expect(result.html).toContain('data-zhijian-image="local"');
    expect(result.html).toContain(`src="${dataUrl}"`);
    expect(result.html).toContain('alt="山水插图"');
    expect(result.html).not.toContain('图｜山水插图');
    expect(result.warnings.map((warning) => warning.code)).not.toContain('image-placeholder');
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
    expect(result.html).toContain('background-color:#f7f7f5;color:#2d2723');
  });

  it('renders card and numeral heading styles with escaped titles', () => {
    const document = parseDocument('## <b>小标题</b> & "引号"\n\n一段正文。');
    const forest = wechatStylePresets.find((preset) => preset.id === 'forest')!;
    const card = renderWechat(document, getWechatTheme('editorial-notes'), forest.config);

    expect(card.html).toContain('data-zhijian-heading="card"');
    expect(card.html).toContain('border-top:3px solid #5d7039;background-color:#f4f5f1;');
    expect(card.html).toContain('章节 / 01');
    expect(card.html).toContain('&amp; &quot;引号&quot;');
    expect(card.html).not.toContain('<b>');

    const magazine = wechatStylePresets.find((preset) => preset.id === 'magazine')!;
    const numeral = renderWechat(document, getWechatTheme('editorial-notes'), magazine.config);

    expect(numeral.html).toContain('data-zhijian-heading="numeral"');
    expect(numeral.html).toContain('font-size:40px;font-weight:700;line-height:1;letter-spacing:-0.02em;">01</p>');
    expect(numeral.html).not.toContain('<b>');
  });

  it('keeps every bundled preset valid and readable on white paper', () => {
    for (const preset of wechatStylePresets) {
      expect(() => renderWechat(parseDocument('## 标题\n\n**重点**'), getWechatTheme('editorial-notes'), preset.config)).not.toThrow();
    }
    expect(new Set(wechatStylePresets.map((preset) => preset.id)).size).toBe(wechatStylePresets.length);
  });

  it('renders a centered chapter band as a selectable heading style', () => {
    const document = parseDocument('## 小标题\n\n一段正文。');
    const classic = wechatStylePresets.find((preset) => preset.id === 'classic')!;
    const result = renderWechat(document, getWechatTheme('editorial-notes'), {
      ...classic.config,
      headingStyle: 'band',
    });

    expect(result.html).toContain('data-zhijian-heading="band"');
    expect(result.html).toContain('text-align:center');
    expect(result.html).toContain('padding:5px 14px');
    expect(result.html).toContain('章节 / 01');
  });

  it('keeps the copied article root transparent and lets the editor own its canvas spacing', () => {
    const document = parseDocument('# 标题\n\n正文');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));
    const rootTag = result.html.match(/^<section[^>]+>/u)?.[0] ?? '';

    expect(rootTag).toContain('padding:0');
    expect(rootTag).not.toContain('background-color');
  });

  it('keeps a leading article title outside copied WeChat body content', () => {
    const document = parseDocument('# 公众号标题\n\n## 正文小标题\n\n正文内容');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.title).toBe('公众号标题');
    expect(result.html).not.toContain('公众号标题');
    expect(result.plainText).toBe('正文小标题\n\n正文内容');
    expect(result.stats.headings).toBe(1);
  });

  it('uses restrained ink emphasis and open quotes in the oriental preset', () => {
    const document = parseDocument('**稳定的善意**\n\n> 圣人恒无心');
    const oriental = wechatStylePresets.find((preset) => preset.id === 'oriental')!;
    const theme = getWechatTheme('editorial-notes');
    const result = renderWechat(document, theme, oriental.config);

    expect(result.html).toContain(`<strong style="color:${theme.palette.ink};font-weight:700;">稳定的善意</strong>`);
    expect(result.html).not.toContain('text-decoration-thickness');
    expect(result.html).toContain(`border-top:1px solid ${theme.palette.line}`);
    expect(result.html).not.toContain(`background-color:${theme.palette.soft};`);
  });

  it('renders only explicit Obsidian-style highlights as a themed underline', () => {
    const document = parseDocument('我想到 ==《老子》里的“无心”==，以及 **自己的判断**。');
    const theme = getWechatTheme('editorial-notes');
    const result = renderWechat(document, theme);

    expect(result.html).toContain('data-zhijian-mark="underline"');
    expect(result.html).toContain(`border-bottom:3px solid ${theme.palette.accent}`);
    expect(result.html).toContain('《老子》里的“无心”');
    expect(result.html).not.toContain('data-zhijian-mark="underline" style="padding-bottom:3px;border-bottom:3px solid #b44735;">自己的判断');
    expect(result.plainText).toBe('我想到 《老子》里的“无心”，以及 自己的判断。');
  });

  it('uses a restrained hierarchy for third- and fourth-level headings', () => {
    const document = parseDocument('### 主章节\n\n#### 子标题');
    const theme = getWechatTheme('editorial-notes');
    const result = renderWechat(document, theme);

    expect(result.html).toContain(`border-left:2px solid ${theme.palette.accent}`);
    expect(result.html).toContain('font-size:18px');
    expect(result.html).toContain('font-size:16px');
    expect(result.html).not.toContain('章节 /');
  });

  it('rejects injected custom style colors at the renderer boundary', () => {
    const document = parseDocument('正文');
    const classic = wechatStylePresets.find((preset) => preset.id === 'classic')!.config;

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

    expect(result.html.indexOf('正文')).toBeLessThan(result.html.indexOf('注释 / note'));
    expect(result.plainText.startsWith('正文［note］。')).toBe(true);
    expect(result.plainText).not.toContain('主标题');
    expect(result.stats.headings).toBe(0);
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
