import { LoaderCircle, RotateCw, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import type { Editor } from '../useEditor';
import type { Language } from '../api';

export function TextSidebar({ editor }: { editor: Editor }) {
  const [search, setSearch] = useState('');
  const filter = useDeferredValue(search.trim().toLocaleLowerCase());
  const busy = Boolean(editor.operation || editor.previewLoading);
  const displayed = editor.regions.filter(region => {
    const edit = editor.edits.find(item => item.id === region.id);
    return `${region.text} ${edit?.text ?? ''}`.toLocaleLowerCase().includes(filter);
  });

  return <aside className="text-sidebar">
    <div className="sidebar-heading">
      <h2>文字区域</h2>
      <p>点击文字开始修改</p>
      <label className="search-field">
        <Search size={19} aria-hidden="true" />
        <input aria-label="搜索文字" placeholder="搜索文字" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
    </div>
    <div className="region-list" aria-label="识别到的文字">
      {displayed.map(region => {
        const edit = editor.edits.find(item => item.id === region.id);
        return <button key={region.id} className={`region-row ${editor.selectedId === region.id ? 'selected' : ''}`}
          onClick={() => editor.select(region.id)} disabled={busy}
          title={`${region.text || '手动框选区域'}${region.source === 'ocr' ? ` · 识别置信度 ${Math.round(region.confidence > 1 ? region.confidence : region.confidence * 100)}%` : ''}`}>
          <span>{edit ? edit.text || '已清除文字' : region.text || '手动框选区域'}</span>
          {edit ? <span className="edit-dot" aria-label="已修改" /> : null}
        </button>;
      })}
      {!displayed.length ? <div className="list-empty">
        {editor.operation === 'recognizing' ? <><LoaderCircle size={21} className="spinning" />正在识别文字…</> :
          filter ? '没有匹配的文字' : '使用「框选区域」选择需要修改的位置。'}
      </div> : null}
    </div>
    <div className="sidebar-footer">
      <label className="language-field"><span>识别语言</span>
        <select aria-label="识别语言" value={editor.language} onChange={event => editor.setLanguage(event.target.value as Language)} disabled={busy}>
          <option value="latin">拉丁文字 / 英文</option>
          <option value="chinese">中文 + 英文</option>
        </select>
      </label>
      <button className="button button-light re-recognize" disabled={busy} onClick={() => void editor.recognize()}>
        {editor.operation === 'recognizing' ? <LoaderCircle className="spinning" size={20} /> : <RotateCw size={20} />}
        {editor.operation === 'recognizing' ? '正在识别' : '重新识别'}
      </button>
      <p>文件仅在本机处理</p>
    </div>
  </aside>;
}
