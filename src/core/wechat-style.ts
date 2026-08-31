import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, '必须使用六位十六进制颜色');

export const wechatStyleConfigSchema = z.object({
  fontFamily: z.enum(['sans', 'serif', 'mono']),
  bodySize: z.union([z.literal(15), z.literal(16), z.literal(17), z.literal(18)]),
  lineHeight: z.union([z.literal(1.75), z.literal(1.9), z.literal(2.05)]),
  accentColor: hexColorSchema,
  headingStyle: z.enum(['editorial', 'band', 'side', 'underline', 'minimal']),
  codeTheme: z.enum(['ink', 'paper']),
}).strict();

export type WechatStyleConfig = z.infer<typeof wechatStyleConfigSchema>;

export interface WechatStylePreset {
  id: 'oriental' | 'classic' | 'elegant' | 'clean';
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
] as const;

export const defaultWechatStyleConfig: WechatStyleConfig = wechatStylePresets[0]!.config;

export const wechatAccentColors = [
  { name: '陶朱红', value: '#a84535' },
  { name: '朱砂红', value: '#b44735' },
  { name: '经典蓝', value: '#185687' },
  { name: '翡翠绿', value: '#16836f' },
  { name: '柠檬黄', value: '#d59a18' },
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
