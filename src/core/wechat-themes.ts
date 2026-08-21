import { wechatThemeSchema, type WechatTheme } from './wechat-theme-schema';

const themeDefinitions = [
  {
    schemaVersion: 1,
    id: 'editorial-notes',
    name: '编辑部手记',
    description: '宋体标题、朱砂批注与温暖纸张，适合观点和深度内容',
    swatch: '#b44735',
    palette: {
      paper: '#fffdf8',
      ink: '#2d2723',
      accent: '#b44735',
      muted: '#82756b',
      line: '#d9ccbf',
      soft: '#f4ede3',
      codeBackground: '#302a26',
      codeText: '#f7efe5',
    },
    rules: {
      headingLabel: 'SECTION',
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
