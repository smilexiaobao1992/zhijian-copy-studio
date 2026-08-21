export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  source: string;
}

export const contentTemplates: readonly ContentTemplate[] = [
  {
    id: 'tutorial',
    name: '步骤教程',
    description: '从问题、步骤到检查结果',
    source: `# 把 AI 文案整理成小红书笔记

直接复制 AI 输出，经常会遇到段落太密、重点不清的问题。

## 先保留内容结构

1. 找出真正的标题
2. 把长段落拆成一个观点一段
3. 将操作步骤改成有序列表

> 排版不是增加装饰，而是让读者更快找到重点。

## 发布前检查

- 标题是否能一眼读懂
- 每段是否只表达一件事
- Emoji 是否真的帮助理解

#内容创作 #小红书排版`,
  },
  {
    id: 'checklist',
    name: '实用清单',
    description: '适合工具合集和发布前检查',
    source: `# 小红书发布前检查清单

## 内容

- [ ] 开头说明读者能获得什么
- [ ] 小标题可以独立看懂
- [ ] 删除重复表达

## 阅读体验

- [ ] 长段落已经拆开
- [ ] 列表项目保持同一种句式
- [ ] 话题放在正文末尾

> 先保证清楚，再考虑好看。

#运营工具 #内容清单`,
  },
  {
    id: 'review',
    name: '产品测评',
    description: '先结论，再展开适合与不适合',
    source: `# 我会继续使用这款写作工具吗

先说结论：它适合需要反复整理长文的人，但不适合追求复杂视觉设计的场景。

## 我喜欢的地方

- 输入和预览放在同一个页面
- 内容保存在本地
- 切换主题不会改动原文

## 使用时要注意

1. 自动排版不能替代内容判断
2. 发布前仍要在手机端检查
3. 不要为了好看堆叠太多符号

## 适合谁

经常写教程、清单和产品观点的创作者。

#产品测评 #写作工具`,
  },
];

export const defaultTemplate = contentTemplates[0]!;

export function getTemplate(templateId: string): ContentTemplate {
  return contentTemplates.find((template) => template.id === templateId) ?? defaultTemplate;
}
