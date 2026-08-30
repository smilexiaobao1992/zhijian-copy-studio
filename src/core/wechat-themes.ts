import { wechatThemeSchema, type WechatTheme } from './wechat-theme-schema';

const themeDefinitions = [
  {
    schemaVersion: 1,
    id: 'editorial-notes',
    name: '编辑部手记',
    description: '素白长文、宋体标题与朱砂批注，适合观点和深度内容',
    swatch: '#b44735',
    palette: {
      paper: '#ffffff',
      ink: '#2d2723',
      accent: '#b44735',
      muted: '#82756b',
      line: '#dedbd7',
      soft: '#f7f7f5',
      codeBackground: '#302a26',
      codeText: '#f7efe5',
    },
    rules: {
      headingLabel: '章节',
      quoteLabel: '编者按',
      divider: '·  ·  ·',
    },
  },
] as const;

export const wechatThemes: readonly WechatTheme[] = themeDefinitions.map((theme) =>
  wechatThemeSchema.parse(theme),
);

export const defaultWechatThemeId = 'editorial-notes';

export function getWechatTheme(themeId: string): WechatTheme {
  return wechatThemes.find((theme) => theme.id === themeId) ?? wechatThemes[0]!;
}
