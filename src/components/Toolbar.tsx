import { Eye, EyeOff, Minus, MousePointer2, Plus, Scan, Undo2 } from 'lucide-react';
import type { Editor } from '../useEditor';

export type Tool = 'select' | 'region';
interface ToolbarProps {
  editor: Editor;
  tool: Tool;
  setTool: (tool: Tool) => void;
  showRegions: boolean;
  setShowRegions: (show: boolean) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}

export function Toolbar({ editor, tool, setTool, showRegions, setShowRegions, zoom, setZoom }: ToolbarProps) {
  const busy = Boolean(editor.operation || editor.previewLoading);
  const page = editor.document?.pages[editor.page];
  const format = (value: number) => Number(value.toFixed(1)).toString();
  return <div className="toolbar">
    <div className="tool-group">
      <button className={`tool-button ${tool === 'select' ? 'active' : ''}`} onClick={() => setTool('select')} disabled={!editor.document || busy} aria-pressed={tool === 'select'}><MousePointer2 size={22} />选择文字</button>
      <button className={`tool-button ${tool === 'region' ? 'active' : ''}`} onClick={() => setTool('region')} disabled={!editor.document || busy} aria-pressed={tool === 'region'}><Scan size={22} />框选区域</button>
      <button className={`tool-button region-toggle ${showRegions ? '' : 'muted'}`} onClick={() => setShowRegions(!showRegions)} disabled={!editor.document} aria-pressed={showRegions}>{showRegions ? <Eye size={23} /> : <EyeOff size={23} />}<span>显示识别框</span></button>
    </div>
    <div className="zoom-controls">
      <button className="icon-button" aria-label="缩小" onClick={() => setZoom(Math.max(50, zoom - 25))} disabled={!editor.document || zoom <= 50}><Minus size={19} /></button>
      <button className="zoom-reset" onClick={() => setZoom(100)} disabled={!editor.document} title="恢复适合页面的大小">{zoom}%</button>
      <button className="icon-button" aria-label="放大" onClick={() => setZoom(Math.min(300, zoom + 25))} disabled={!editor.document || zoom >= 300}><Plus size={20} /></button>
    </div>
    <div className="toolbar-meta">
      <button className="icon-button toolbar-undo" aria-label="撤销" title="撤销上一次修改" onClick={() => void editor.undo()} disabled={!editor.canUndo || busy}><Undo2 size={19} /></button>
      <span>{page ? `${format(page.width_mm)} × ${format(page.height_mm)} mm` : '保留原稿尺寸'}</span>
    </div>
  </div>;
}
