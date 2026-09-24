import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, '必须使用六位十六进制颜色');

export const wechatStyleConfigSchema = z.object({
  fontFamily: z.enum(['sans', 'serif', 'mono']),
  bodySize: z.union([z.literal(15), z.literal(16), z.literal(17), z.literal(18)]),
  lineHeight: z.union([z.literal(1.75), z.literal(1.9), z.literal(2.05)]),
  accentColor: hexColorSchema,
  headingStyle: z.enum(['editorial', 'band', 'side', 'underline', 'minimal', 'card', 'numeral']),
  codeTheme: z.enum(['ink', 'paper']),
}).strict();

export type WechatStyleConfig = z.infer<typeof wechatStyleConfigSchema>;

export interface WechatStylePreset {
  id: 'oriental' | 'classic' | 'elegant' | 'clean' | 'tech' | 'magazine' | 'forest' | 'lavender';
  name: string;
  description: string;
  config: WechatStyleConfig;
}

export const wechatStylePresets: readonly WechatStylePreset[] = [
  {
    id: 'classic',
    name: '经典手记',
    description: '宋黑混排，朱砂章节标记',
    config: {
      fontFamily: 'sans',
      bodySize: 16,
      lineHeight: 1.9,
      accentColor: '#b44735',
      headingStyle: 'editorial',
      codeTheme: 'ink',
    },
  },
  {
    id: 'oriental',
    name: '东方书页',
    description: '墨字朱砂细线，适合短篇随笔',
    config: {
      fontFamily: 'sans',
      bodySize: 16,
      lineHeight: 1.9,
      accentColor: '#a84535',
      headingStyle: 'underline',
      codeTheme: 'paper',
    },
  },
  {
    id: 'elegant',
    name: '雅致长文',
    description: '衬线正文，玫瑰金细分隔',
    config: {
      fontFamily: 'serif',
      bodySize: 17,
      lineHeight: 2.05,
      accentColor: '#a35f6f',
      headingStyle: 'underline',
      codeTheme: 'paper',
    },
  },
  {
    id: 'clean',
    name: '清爽简报',
    description: '紧凑无衬线，墨绿侧标题',
    config: {
      fontFamily: 'sans',
      bodySize: 15,
      lineHeight: 1.75,
      accentColor: '#2f6f68',
      headingStyle: 'side',
      codeTheme: 'paper',
    },
  },
  {
    id: 'tech',
    name: '技术蓝调',
    description: '蓝色章签，深色代码块',
    config: {
      fontFamily: 'sans',
      bodySize: 15,
      lineHeight: 1.75,
      accentColor: '#185687',
      headingStyle: 'band',
      codeTheme: 'ink',
    },
  },
  {
    id: 'magazine',
    name: '黑白杂志',
    description: '衬线大序号，适合评论专栏',
    config: {
      fontFamily: 'serif',
      bodySize: 16,
      lineHeight: 1.9,
      accentColor: '#363636',
      headingStyle: 'numeral',
      codeTheme: 'paper',
    },
  },
  {
    id: 'forest',
    name: '森林笔记',
    description: '橄榄绿卡片标题，适合生活分享',
    config: {
      fontFamily: 'sans',
      bodySize: 16,
      lineHeight: 1.9,
      accentColor: '#5d7039',
      headingStyle: 'card',
      codeTheme: 'paper',
    },
  },
  {
    id: 'lavender',
    name: '薰衣草信笺',
    description: '衬线留白，适合情感与读书',
    config: {
      fontFamily: 'serif',
      bodySize: 17,
      lineHeight: 2.05,
      accentColor: '#8d5c7d',
      headingStyle: 'minimal',
      codeTheme: 'paper',
    },
  },
] as const;

export const defaultWechatStyleConfig: WechatStyleConfig = wechatStylePresets[0]!.config;

export const wechatAccentColors = [
  { name: '陶朱红', value: '#a84535' },
  { name: '朱砂红', value: '#b44735' },
  { name: '经典蓝', value: '#185687' },
  { name: '翡翠绿', value: '#16836f' },
  { name: '琥珀黄', value: '#9a6a0f' },
  { name: '薰衣紫', value: '#8d5c7d' },
  { name: '玫瑰金', value: '#a35f6f' },
  { name: '橄榄绿', value: '#5d7039' },
  { name: '石墨黑', value: '#363636' },
] as const;

export function getWechatStyleName(config: WechatStyleConfig): string {
  const preset = wechatStylePresets.find((candidate) => (
    Object.entries(candidate.config).every(([key, value]) => (
      config[key as keyof WechatStyleConfig] === value
    ))
  ));
  return preset?.name ?? '自定义样式';
}
