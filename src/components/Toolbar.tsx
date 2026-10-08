import { Eye, Minus, MousePointer2, PanelLeft, PanelRight, Plus, Scan, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Separator } from '@/components/ui/separator';
import { IconAction } from './IconAction';
import type { PageInfo, Tool } from '../editor/types';
export type { Tool } from '../editor/types';
interface ToolbarProps { page: PageInfo; busy: boolean; canUndo: boolean; onUndo: () => void; tool: Tool; setTool: (tool: Tool) => void; showRegions: boolean; setShowRegions: (show: boolean) => void; zoom: number; setZoom: (zoom: number) => void; narrow: boolean; onShowRegions: () => void; onShowInspector: () => void }
export function Toolbar({ page, busy, canUndo, onUndo, tool, setTool, showRegions, setShowRegions, zoom, setZoom, narrow, onShowRegions, onShowInspector }: ToolbarProps) {
  return <div className="toolbar" aria-label="编辑工具">
    <div className="tool-group">
      {narrow ? <IconAction label="打开文字列表" onClick={onShowRegions}><PanelLeft /></IconAction> : null}
      <ToggleGroup value={[tool]} onValueChange={values => { if (values[0]) setTool(values[0] as Tool); }} disabled={busy} aria-label="编辑工具选择">
        <ToggleGroupItem value="select"><MousePointer2 /><span>选择文字</span></ToggleGroupItem>
        <ToggleGroupItem value="region"><Scan /><span>框选区域</span></ToggleGroupItem>
      </ToggleGroup>
      <Toggle aria-label="显示识别框" pressed={showRegions} onPressedChange={setShowRegions}><Eye /><span className="region-toggle-label">识别框</span></Toggle>
    </div>
    <div className="zoom-controls">
      <IconAction label="缩小" disabled={zoom <= 50} onClick={() => setZoom(Math.max(50, zoom - 25))}><Minus /></IconAction>
      <Button variant="ghost" size="sm" onClick={() => setZoom(100)} aria-label="恢复缩放">{zoom}%</Button>
      <IconAction label="放大" disabled={zoom >= 300} onClick={() => setZoom(Math.min(300, zoom + 25))}><Plus /></IconAction>
    </div>
    <div className="toolbar-meta">
      <IconAction label="撤销" disabled={!canUndo || busy} onClick={onUndo}><Undo2 /></IconAction>
      {!narrow ? <><Separator orientation="vertical" className="h-4" /><span>{Number(page.width_mm.toFixed(1))} × {Number(page.height_mm.toFixed(1))} mm</span></> : null}
      {narrow ? <IconAction label="打开编辑面板" onClick={onShowInspector}><PanelRight /></IconAction> : null}
    </div>
  </div>;
}
