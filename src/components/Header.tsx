import { Download, FileUp, LoaderCircle, Monitor, Moon, RefreshCw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IconAction } from './IconAction';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

interface HeaderProps { filename?: string; busy: boolean; exporting: boolean; onOpen: () => void; onExport: () => void; onCheckUpdates?: () => void }
export function Header({ filename, busy, exporting, onOpen, onExport, onCheckUpdates }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  return <header className="app-header">
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 34 44" aria-hidden="true"><path d="M3 1h18l11 11v29a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="currentColor" /><path d="M21 2v10h10M9 22h7M9 28h15M9 34h11" fill="none" stroke="white" strokeWidth="2.2" strokeLinejoin="round" /></svg>
      <span>LabelEdit</span>
    </div>
    <div className="filename" title={filename}>{filename ?? '本地 PDF 文字编辑'}</div>
    <div className="header-actions">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="切换主题" />}><ThemeIcon /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={theme} onValueChange={value => setTheme(value as Theme)}>
            <DropdownMenuRadioItem value="light"><Sun />浅色</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark"><Moon />深色</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><Monitor />跟随系统</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {onCheckUpdates ? <IconAction label="检查更新" onClick={onCheckUpdates}><RefreshCw /></IconAction> : null}
      <Button variant="outline" onClick={onOpen} disabled={busy}><FileUp data-icon="inline-start" />打开 PDF</Button>
      <Button onClick={onExport} disabled={!filename || busy}>
        {exporting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}{exporting ? '正在导出' : '导出 PDF'}
      </Button>
    </div>
  </header>;
}
