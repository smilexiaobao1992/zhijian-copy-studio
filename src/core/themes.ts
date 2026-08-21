import { xhsThemeSchema, type XhsTheme } from './theme-schema';

const themeDefinitions = [
  {
    schemaVersion: 1,
    id: 'clear-note',
    name: '清简',
    description: '留白充足，适合知识和观点',
    swatch: '#C6533D',
    rules: {
      heading: { style: 'numbered', separator: '｜' },
      unorderedBullet: '•',
      orderedStyle: 'circled',
      quotePrefix: '摘录｜',
      divider: '······',
      strongOpen: '「',
      strongClose: '」',
      emphasisOpen: '〔',
      emphasisClose: '〕',
      codePrefix: '命令｜',
    },
  },
  {
    schemaVersion: 1,
    id: 'signal-tech',
    name: '信号',
    description: '硬朗明确，适合 AI 和数码教程',
    swatch: '#25666B',
    rules: {
      heading: { style: 'symbol', symbol: '▌' },
      unorderedBullet: '→',
      orderedStyle: 'filled',
      quotePrefix: '⌁ 提示｜',
      divider: '─── NOTE ───',
      strongOpen: '【',
      strongClose: '】',
      emphasisOpen: '〈',
      emphasisClose: '〉',
      codePrefix: '⌨ 指令｜',
    },
  },
  {
    schemaVersion: 1,
    id: 'paper-journal',
    name: '纸间',
    description: '柔和松弛，适合生活方式记录',
    swatch: '#B67A3C',
    rules: {
      heading: { style: 'symbol', symbol: '✦' },
      unorderedBullet: '·',
      orderedStyle: 'circled',
      quotePrefix: '纸间记｜',
      divider: '𓂃 𓈒𓏸',
      strongOpen: '﹝',
      strongClose: '﹞',
      emphasisOpen: '（',
      emphasisClose: '）',
      codePrefix: '小记｜',
    },
  },
  {
    schemaVersion: 1,
    id: 'guided-steps',
    name: '步序',
    description: '步骤清楚，适合清单和操作教程',
    swatch: '#4D647E',
    rules: {
      heading: { style: 'labelled', label: '步骤', separator: '｜' },
      unorderedBullet: '✓',
      orderedStyle: 'keycap',
      quotePrefix: '注意｜',
      divider: '— 操作分隔 —',
      strongOpen: '重点「',
      strongClose: '」',
      emphasisOpen: '提示「',
      emphasisClose: '」',
      codePrefix: '操作｜',
    },
  },
] as const;

export const xhsThemes: readonly XhsTheme[] = themeDefinitions.map((theme) =>
  xhsThemeSchema.parse(theme),
);

export const defaultThemeId = 'clear-note';

export function getTheme(themeId: string): XhsTheme {
  return xhsThemes.find((theme) => theme.id === themeId) ?? xhsThemes[0]!;
}
