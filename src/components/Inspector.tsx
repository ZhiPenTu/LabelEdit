import { LoaderCircle, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TextEdit, TextRegion } from '../api';
import type { Editor } from '../useEditor';

function draftFor(region: TextRegion, saved?: TextEdit): TextEdit {
  return saved ?? {
    id: region.id, page: region.page, rect: region.rect, text: region.text,
    font_family: /[\u3400-\u9fff]/.test(region.text) ? 'Noto Sans SC' : 'Arial',
    font_size: Math.round(Math.max(0.5, region.font_size) * 10) / 10,
    bold: region.bold, text_color: '#000000', background_color: '#ffffff', fit: true,
  };
}

function EditForm({ editor, region }: { editor: Editor; region: TextRegion }) {
  const [draft, setDraft] = useState<TextEdit>(() => draftFor(region, editor.selectedEdit));
  const busy = Boolean(editor.operation || editor.previewLoading);
  const lastSavedEditRef = useRef<TextEdit | undefined>(editor.selectedEdit);

  useEffect(() => {
    const prevSaved = lastSavedEditRef.current;
    lastSavedEditRef.current = editor.selectedEdit;

    if (editor.selectedEdit) {
      const nonRectChanged = !prevSaved ||
        prevSaved.text !== editor.selectedEdit.text ||
        prevSaved.font_family !== editor.selectedEdit.font_family ||
        prevSaved.font_size !== editor.selectedEdit.font_size ||
        prevSaved.bold !== editor.selectedEdit.bold ||
        prevSaved.text_color !== editor.selectedEdit.text_color ||
        prevSaved.background_color !== editor.selectedEdit.background_color ||
        prevSaved.fit !== editor.selectedEdit.fit;

      if (nonRectChanged) {
        setDraft(editor.selectedEdit);
      }
    } else if (prevSaved) {
      setDraft(draftFor(region));
    }
  }, [editor.selectedEdit, region]);

  useEffect(() => {
    setDraft(previous => ({ ...previous, rect: region.rect }));
  }, [region.rect]);

  const update = <K extends keyof TextEdit>(key: K, value: TextEdit[K]) => {
    editor.invalidateDownload();
    setDraft(previous => ({ ...previous, [key]: value }));
  };

  return <form className="edit-form" onSubmit={event => { event.preventDefault(); void editor.apply(draft); }}>
    <label className="field-label" htmlFor="original-text">原文字</label>
    <div id="original-text" className="original-text">{region.text || '手动框选区域'}</div>
    <label className="field-label" htmlFor="replacement-text">替换为</label>
    <textarea id="replacement-text" aria-label="替换为" value={draft.text} onChange={event => update('text', event.target.value)} disabled={busy} rows={3} />
    <label className="field-label" htmlFor="font-family">字体</label>
    <div className="font-controls">
      <select id="font-family" value={draft.font_family} onChange={event => update('font_family', event.target.value as TextEdit['font_family'])} disabled={busy}>
        <option value="Arial">Arial（兼容）</option>
        <option value="Noto Sans SC">Noto Sans SC</option>
      </select>
      <label className="check-field"><input type="checkbox" checked={draft.bold} onChange={event => update('bold', event.target.checked)} disabled={busy} />加粗</label>
    </div>
    <div className="size-field"><label className="field-label" htmlFor="font-size">字号</label>
      <div className="number-input"><input id="font-size" type="number" min="0.5" max="200" step="0.1" value={draft.font_size}
        onChange={event => update('font_size', Number(event.target.value))} disabled={busy} required /><span>pt</span></div>
    </div>
    <div className="color-fields">
      <label><span className="field-label">文字颜色</span><input aria-label="文字颜色" type="color" value={draft.text_color} onChange={event => update('text_color', event.target.value)} disabled={busy} /></label>
      <label><span className="field-label">背景颜色</span><input aria-label="背景颜色" type="color" value={draft.background_color} onChange={event => update('background_color', event.target.value)} disabled={busy} /></label>
    </div>
    <label className="check-field fit-field"><input type="checkbox" checked={draft.fit} onChange={event => update('fit', event.target.checked)} disabled={busy} />自动适应区域</label>
    <button type="submit" className="button button-primary apply-button" disabled={busy || !Number.isFinite(draft.font_size) || draft.font_size < 0.5}>
      {editor.operation === 'applying' ? <><LoaderCircle className="spinning" size={18} />正在应用</> : '应用修改'}
    </button>
    <p className="form-help">修改将作为新文字叠加到原稿上。</p>
    {editor.selectedEdit || region.source === 'manual' ? <button className="remove-button" type="button" disabled={busy} onClick={() => void editor.remove(region.id)}>
      <Trash2 size={15} />{editor.selectedEdit ? '移除此修改' : '移除框选区域'}
    </button> : null}
  </form>;
}

export function Inspector({ editor }: { editor: Editor }) {
  const busy = Boolean(editor.operation || editor.previewLoading);
  return <aside className="inspector">
    <h2>编辑文字</h2>
    {editor.selectedRegion ? <EditForm key={`${editor.page}-${editor.selectedRegion.id}`} editor={editor} region={editor.selectedRegion} /> :
      <div className="inspector-empty">选择左侧文字，或在页面中框选一个区域。</div>}
    <section className="history-section">
      <div className="history-heading"><h2>修改记录</h2>
        <button className="icon-button" onClick={() => void editor.undo()} disabled={!editor.canUndo || busy} title="撤销上一次修改（Ctrl / ⌘ + Z）" aria-label="撤销上一次修改"><Undo2 size={19} /></button>
      </div>
      {!editor.edits.length ? <p className="history-empty">暂无修改</p> : <ol className="history-list">
        {editor.edits.map(edit => <li key={edit.id}>
          <button onClick={() => { if (edit.page !== editor.page) void editor.changePage(edit.page).then(() => editor.select(edit.id)); else editor.select(edit.id); }} disabled={busy}>
            <span className="history-dot" /><span><strong>{edit.text || '清除区域文字'}</strong><small>第 {edit.page + 1} 页</small></span>
          </button>
        </li>)}
      </ol>}
    </section>
  </aside>;
}
