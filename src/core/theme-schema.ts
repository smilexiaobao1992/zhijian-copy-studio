import { z } from 'zod';

const numberedHeadingSchema = z.object({
  style: z.literal('numbered'),
  separator: z.string().min(1).max(4),
});

const symbolHeadingSchema = z.object({
  style: z.literal('symbol'),
  symbol: z.string().min(1).max(8),
});

const labelledHeadingSchema = z.object({
  style: z.literal('labelled'),
  label: z.string().min(1).max(8),
  separator: z.string().max(4),
});

export const xhsThemeSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(12),
  description: z.string().min(1).max(48),
  swatch: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rules: z.object({
    heading: z.discriminatedUnion('style', [
      numberedHeadingSchema,
      symbolHeadingSchema,
      labelledHeadingSchema,
    ]),
    unorderedBullet: z.string().min(1).max(8),
    orderedStyle: z.enum(['decimal', 'circled', 'filled', 'keycap']),
    quotePrefix: z.string().min(1).max(12),
    divider: z.string().min(3).max(32),
    strongOpen: z.string().max(8),
    strongClose: z.string().max(8),
    emphasisOpen: z.string().max(8),
    emphasisClose: z.string().max(8),
    codePrefix: z.string().min(1).max(12),
  }),
});

export type XhsTheme = z.infer<typeof xhsThemeSchema>;
