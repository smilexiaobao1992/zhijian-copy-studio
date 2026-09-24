# 参与贡献

感谢你帮助纸间排版变得更清楚、更可靠。

## 开发流程

1. Fork 仓库并创建业务分支。
2. 运行 `npm install`。
3. 修改后运行 `npm run verify`。
4. 涉及交互时同时运行 `npm run test:e2e`。

## 新增小红书主题

主题定义位于 `src/core/themes.ts`，必须通过 `xhsThemeSchema` 校验。每个主题需要提供独立的结构指纹：标题、列表、引用、分隔线和强调规则不能只是换颜色。

提交前请确认：

- 输出仍然是普通文本。
- 不引入执行脚本或远程资源。
- Unicode 字符在 macOS、Windows、iOS 和 Android 常见字体中可以显示。
- 使用 `src/core/render-xhs.test.ts` 增加输出断言。
- 没有声称平台支持未经验证的样式或发布能力。

## 扩展 Markdown 语义

引用式链接和图片统一由 `src/core/markdown-references.ts` 建立定义索引。新增或修改 Markdown 节点支持时，必须同时检查小红书纯文本、公众号 HTML 与公众号纯文本回退，并在两个渠道的渲染测试中增加同一语义的断言。

## 新增公众号主题

主题定义位于 `src/core/wechat-themes.ts`，必须通过 `wechatThemeSchema` 校验。公众号主题只提供颜色与标签数据，不能拼接标签、事件属性或任意 CSS。

样式工坊配置位于 `src/core/wechat-style.ts`，字体、字号、行距、标题和代码样式必须使用受限枚举，主题色必须是六位十六进制值。新增版式气质时，同时在 `src/features/editor/EditorApp.module.css` 中补充对应的 `presetSample` 小样；新增标题样式时补充 `headingStyleGrid` 图标，并在 `ToolDrawer.tsx` 中加入按钮。预置主题色在白底上的对比度应不低于 4.5:1。新增控件时应继续由 `render-wechat.ts` 掌握最终标签与内联样式，不允许把用户输入直接拼进 CSS。

提交前请确认：

- 用户文字始终经过 HTML 转义。
- 链接协议继续受白名单约束。
- 原始 HTML 不会透传到预览或剪贴板。
- 不在预览中自动加载远程图片、字体或脚本。
- 使用 `src/core/render-wechat.test.ts` 增加输出和安全断言。
- 在公众号编辑器中实测富文本粘贴结果。

## 提交说明

提交说明请简明描述用户可见的变化，例如：`新增适合清单内容的步序主题`。
