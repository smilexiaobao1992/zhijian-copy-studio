import { z } from 'zod';

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu, '必须使用六位十六进制颜色');
const labelSchema = z.string().trim().min(1).max(24);

export const wechatThemeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/u),
  name: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(80),
  swatch: hexColorSchema,
  palette: z.object({
    paper: hexColorSchema,
    ink: hexColorSchema,
    accent: hexColorSchema,
    muted: hexColorSchema,
    line: hexColorSchema,
    soft: hexColorSchema,
    codeBackground: hexColorSchema,
    codeText: hexColorSchema,
  }).strict(),
  rules: z.object({
    headingLabel: labelSchema,
    quoteLabel: labelSchema,
    divider: labelSchema,
  }).strict(),
}).strict();

export type WechatTheme = z.infer<typeof wechatThemeSchema>;
