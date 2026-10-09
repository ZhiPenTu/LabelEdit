import { LoaderCircle, RotateCw, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import type { Language, TextEdit, TextRegion } from '../editor/types';
const LANGUAGES = [{ value: 'latin', label: '拉丁文字 / 英文' }, { value: 'chinese', label: '中文 + 英文' }];
interface SidebarProps { regions: TextRegion[]; edits: TextEdit[]; selectedId: string | null; language: Language; busy: boolean; recognizing: boolean; onSelect: (id: string) => void; onLanguage: (language: Language) => void; onRecognize: () => void }
export function TextSidebar({ regions, edits, selectedId, language, busy, recognizing, onSelect, onLanguage, onRecognize }: SidebarProps) {
  const [search, setSearch] = useState('');
  const filter = useDeferredValue(search.trim().toLocaleLowerCase());
  const editById = useMemo(() => new Map(edits.map(edit => [edit.id, edit])), [edits]);
  const displayed = regions.filter(region => `${region.text} ${editById.get(region.id)?.text ?? ''}`.toLocaleLowerCase().includes(filter));
  return <aside className="text-sidebar" aria-label="文字区域">
    <div className="sidebar-heading"><h2>文字区域<span className="region-count">{regions.length} 个区域</span></h2><p>点击文字开始修改</p>
      <InputGroup><InputGroupInput aria-label="搜索文字" placeholder="搜索文字" value={search} onChange={event => setSearch(event.target.value)} /><InputGroupAddon><Search /></InputGroupAddon></InputGroup>
    </div>
    <div className="region-list" aria-label="识别到的文字">
      {displayed.map((region, index) => {
        const edit = editById.get(region.id);
        return <Button key={region.id} variant={selectedId === region.id ? 'secondary' : 'ghost'} className={cn('region-row', selectedId === region.id && 'region-selected')} disabled={busy} onClick={() => onSelect(region.id)} aria-pressed={selectedId === region.id} title={region.text || '手动框选区域'}>
          <span className="region-number" aria-hidden="true">{index + 1}</span><span className="truncate">{edit ? edit.text || '已清除文字' : region.text || '手动框选区域'}</span>{edit ? <span className="edit-dot" aria-label="已修改" /> : null}
        </Button>;
      })}
      {!displayed.length ? <Empty className="list-empty"><EmptyHeader>{recognizing ? <LoaderCircle className="animate-spin" /> : null}<EmptyDescription>{recognizing ? '正在识别文字…' : filter ? '没有匹配的文字' : '使用「框选区域」选择需要修改的位置。'}</EmptyDescription></EmptyHeader></Empty> : null}
    </div>
    <div className="sidebar-footer">
      <Field><FieldLabel htmlFor="recognition-language">识别语言</FieldLabel><Select items={LANGUAGES} value={language} disabled={busy} onValueChange={value => { if (value === 'latin' || value === 'chinese') onLanguage(value); }}>
        <SelectTrigger id="recognition-language" className="w-full" aria-label="识别语言"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{LANGUAGES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
      </Select></Field>
      <Button variant="outline" disabled={busy} className="w-full" onClick={onRecognize}>{recognizing ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RotateCw data-icon="inline-start" />}{recognizing ? '正在识别' : '重新识别'}</Button>
      <p>文件仅在本机处理</p>
    </div>
  </aside>;
}
