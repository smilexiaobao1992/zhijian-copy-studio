import { z } from 'zod';
import { defaultTemplate } from '../../core/templates';
import { defaultThemeId } from '../../core/themes';

const STORAGE_KEY = 'social-copy-studio:draft:v1';

const draftSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string(),
  themeId: z.string(),
});

export interface DraftSnapshot {
  schemaVersion: 1;
  source: string;
  themeId: string;
}

export const defaultDraft: DraftSnapshot = {
  schemaVersion: 1,
  source: defaultTemplate.source,
  themeId: defaultThemeId,
};

export function loadDraft(): DraftSnapshot {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return defaultDraft;
    const result = draftSnapshotSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : defaultDraft;
  } catch {
    return defaultDraft;
  }
}

export function saveDraft(snapshot: DraftSnapshot): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}
