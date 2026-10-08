import { useEffect, useState } from 'react';
import type { TextEdit, TextRegion } from './types';

function draftFor(region: TextRegion, saved?: TextEdit): TextEdit {
  return saved ?? { id: region.id, page: region.page, rect: region.rect, text: region.text,
    font_family: /[\u3400-\u9fff]/.test(region.text) ? 'Noto Sans SC' : 'Arial', font_size: Math.round(Math.max(0.5, region.font_size) * 10) / 10,
    bold: region.bold, text_color: '#000000', background_color: '#ffffff', fit: true };
}
export function useTextDraft(key: string, region: TextRegion | null, saved: TextEdit | undefined, invalidate: () => void) {
  const [stored, setStored] = useState<{ key: string; draft: TextEdit | null }>({ key, draft: region ? draftFor(region, saved) : null });
  // Position-only changes must preserve text/font changes still being typed.
  const signature = JSON.stringify(saved && [saved.text, saved.font_family, saved.font_size, saved.bold, saved.text_color, saved.background_color, saved.fit]);
  useEffect(() => { setStored({ key, draft: region ? draftFor(region, saved) : null }); }, [key, signature]);
  const draft = stored.key === key ? stored.draft : region ? draftFor(region, saved) : null;
  function update<K extends keyof TextEdit>(field: K, value: TextEdit[K]) {
    if (!region) return;
    invalidate();
    setStored(previous => ({ key, draft: { ...(previous.key === key && previous.draft ? previous.draft : draftFor(region, saved)), [field]: value } }));
  }
  return { draft: draft && region ? { ...draft, rect: region.rect } : null, update };
}
