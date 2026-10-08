import { LoaderCircle, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { IconAction } from './IconAction';
import type { TextEdit, TextRegion } from '../editor/types';
import type { useTextDraft } from '../editor/useTextDraft';
const FONTS = [{ value: 'Arial', label: 'Arial（兼容）' }, { value: 'Noto Sans SC', label: 'Noto Sans SC' }];
interface InspectorProps {
  region: TextRegion | null; saved?: TextEdit; draft: TextEdit | null; updateDraft: ReturnType<typeof useTextDraft>['update'];
  busy: boolean; applying: boolean; edits: TextEdit[]; canUndo: boolean; onUndo: () => void; onApply: (edit: TextEdit) => void; onRemove: (id: string) => void; onSelectEdit: (edit: TextEdit) => void;
}
export function Inspector({ region, saved, draft, updateDraft, busy, applying, edits, canUndo, onUndo, onApply, onRemove, onSelectEdit }: InspectorProps) {
  const invalidSize = !draft || !Number.isFinite(draft.font_size) || draft.font_size < 0.5 || draft.font_size > 200;
  return <aside className="inspector" aria-label="编辑文字">
    <h2>编辑文字</h2>
    {region && draft ? <form className="edit-form" onSubmit={event => { event.preventDefault(); if (!invalidSize) onApply(draft); }}>
      <FieldGroup>
        <Field><FieldLabel>原文字</FieldLabel><div className="original-text">{region.text || '手动框选区域'}</div></Field>
        <Field data-disabled={busy}><FieldLabel htmlFor="replacement-text">替换为</FieldLabel><Textarea id="replacement-text" aria-label="替换为" rows={3} value={draft.text} onChange={event => updateDraft('text', event.target.value)} disabled={busy} /></Field>
        <Field data-disabled={busy}><FieldLabel htmlFor="font-family">字体</FieldLabel><Select items={FONTS} value={draft.font_family} onValueChange={value => { if (value === 'Arial' || value === 'Noto Sans SC') updateDraft('font_family', value); }} disabled={busy}>
          <SelectTrigger id="font-family" className="w-full" aria-label="字体"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{FONTS.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select></Field>
        <Field orientation="horizontal" data-disabled={busy}><Checkbox id="font-bold" checked={draft.bold} onCheckedChange={value => updateDraft('bold', Boolean(value))} disabled={busy} /><FieldLabel htmlFor="font-bold">加粗</FieldLabel></Field>
        <Field data-invalid={invalidSize} data-disabled={busy}><FieldLabel htmlFor="font-size">字号</FieldLabel><InputGroup>
          <InputGroupInput id="font-size" type="number" min="0.5" max="200" step="0.1" value={draft.font_size} aria-invalid={invalidSize} onChange={event => updateDraft('font_size', Number(event.target.value))} disabled={busy} required /><InputGroupAddon align="inline-end"><InputGroupText>pt</InputGroupText></InputGroupAddon>
        </InputGroup></Field>
        <div className="color-fields">
          <Field data-disabled={busy}><FieldLabel htmlFor="text-color">文字颜色</FieldLabel><Input id="text-color" aria-label="文字颜色" type="color" value={draft.text_color} onChange={event => updateDraft('text_color', event.target.value)} disabled={busy} /></Field>
          <Field data-disabled={busy}><FieldLabel htmlFor="background-color">背景颜色</FieldLabel><Input id="background-color" aria-label="背景颜色" type="color" value={draft.background_color} onChange={event => updateDraft('background_color', event.target.value)} disabled={busy} /></Field>
        </div>
        <Field orientation="horizontal" data-disabled={busy}><Checkbox id="fit-region" checked={draft.fit} onCheckedChange={value => updateDraft('fit', Boolean(value))} disabled={busy} /><FieldLabel htmlFor="fit-region">自动适应区域</FieldLabel></Field>
        <Field><Button type="submit" disabled={busy || invalidSize}>{applying ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}{applying ? '正在应用' : '应用修改'}</Button><FieldDescription>修改将作为新文字叠加到原稿上。</FieldDescription></Field>
        {saved || region.source === 'manual' ? <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => onRemove(region.id)}><Trash2 data-icon="inline-start" />{saved ? '移除此修改' : '移除框选区域'}</Button> : null}
      </FieldGroup>
    </form> : <Empty className="inspector-empty"><EmptyHeader><EmptyDescription>选择左侧文字，或在页面中框选一个区域。</EmptyDescription></EmptyHeader></Empty>}
    <Separator className="my-5" />
    <section className="history-section"><div className="history-heading"><h2>修改记录</h2><IconAction label="撤销上一次修改" disabled={!canUndo || busy} onClick={onUndo}><Undo2 /></IconAction></div>
      {!edits.length ? <p className="history-empty">暂无修改</p> : <ol className="history-list">{edits.map(edit => <li key={edit.id}><Button variant="ghost" className="history-row" onClick={() => onSelectEdit(edit)} disabled={busy}><span className="history-dot" /><span className="min-w-0"><strong className="truncate">{edit.text || '清除区域文字'}</strong><small>第 {edit.page + 1} 页</small></span></Button></li>)}</ol>}
    </section>
  </aside>;
}
