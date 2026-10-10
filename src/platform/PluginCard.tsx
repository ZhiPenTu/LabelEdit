import { lazy, Suspense } from 'react';
import { ArrowRight, Check, ChevronDown, FileText, Image, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import gte from 'semver/functions/gte';
const ReleaseNotes = lazy(() => import('@/components/ReleaseNotes'));

export interface ToolEntry {
  id: string; title: string; description: string; category?: string; version: string; releaseNotes?: string; api?: string; compatible?: boolean;
}
export interface Plugin extends ToolEntry {
  enabled: boolean; source: string; local: boolean; missing: string[]; settings?: { title: string }; error?: string;
}
export function toolCategory(tool: ToolEntry) { return tool.category || '其他工具'; }
interface PluginCardProps {
  entry: ToolEntry; installed?: Plugin; mode: 'home' | 'market' | 'plugins'; disabled: boolean; ready: boolean;
  onOpen: (settings?: boolean) => void; onAction: (method: string, args: unknown) => void;
}
export function PluginCard({ entry, installed, mode, disabled, ready, onOpen, onAction }: PluginCardProps) {
  const isLabel = entry.id === 'official.labeledit';
  const isCutout = entry.id === 'official.removebg';
  const Icon = isLabel ? FileText : isCutout ? Image : Puzzle;
  // A stale catalog must not offer a downgrade of a newer bundled/local tool.
  const current = installed ? gte(installed.version, entry.version) : false;
  return <Card className={cn('plugin-card', mode !== 'market' && 'plugin-row', isCutout && 'plugin-image')}>
    <CardHeader>
      <span className="commerce-tool-icon"><Icon /></span>
      <div className="plugin-info">
        <span className="plugin-category">{toolCategory(entry)}</span>
        <CardTitle role="heading" aria-level={2}>{entry.title}</CardTitle>
        <CardDescription>{entry.description}</CardDescription>
      </div>
    </CardHeader>
    <CardContent>
      {entry.compatible === false ? <p role="alert">请先升级轻作，此插件需要 API {entry.api}。</p> : null}
      {mode === 'market' ? <>
        {isLabel ? <p className="plugin-capabilities">离线识别<span>·</span>原尺寸导出</p> : isCutout ? <p className="plugin-capabilities">使用你自己的 remove.bg API 密钥</p> : null}
        {entry.releaseNotes ? <details className="plugin-notes"><summary>版本说明<ChevronDown /></summary><Suspense fallback={<span>加载更新说明…</span>}><ReleaseNotes body={entry.releaseNotes} /></Suspense></details> : null}
      </> : <p className="plugin-state">v{entry.version} · {installed?.enabled ? '已启用' : '已停用'}{installed?.missing.length ? ' · 缺少服务依赖' : ''} · {({ bundled: '内置插件', local: '本地导入', market: '市场签名验证' }[installed?.source ?? ''] ?? installed?.source)}</p>}
      {mode === 'plugins' && entry.releaseNotes ? <details className="plugin-notes"><summary>版本说明<ChevronDown /></summary><Suspense fallback={<span>加载更新说明…</span>}><ReleaseNotes body={entry.releaseNotes} /></Suspense></details> : null}
      {installed?.error ? <p role="alert" className="text-destructive">{installed.error}</p> : null}
    </CardContent>
    <CardFooter>
      {mode === 'market' ? <><span className="plugin-version">v{entry.version}</span>{current ? <span className="plugin-installed"><Check />已安装</span> : null}<Button disabled={disabled || current || entry.compatible === false} onClick={() => onAction('market.install', { id: entry.id })}>{entry.compatible === false ? '需要升级轻作' : current ? '已安装' : installed ? '更新插件' : '安装插件'}</Button></> : mode === 'plugins' ? <>
        <Button variant="outline" disabled={disabled} onClick={() => onAction('plugins.enable', { id: entry.id, enabled: !installed?.enabled })}>{installed?.enabled ? '停用' : '启用'}</Button>
        {installed?.settings ? <Button variant="outline" disabled={disabled || !installed.enabled} onClick={() => onOpen(true)}>插件设置</Button> : null}
        <Button variant="ghost" disabled={disabled} onClick={() => onAction('plugins.rollback', { id: entry.id })}>恢复版本</Button>
        <Button variant="ghost" disabled={disabled} onClick={() => onAction('plugins.uninstall', { id: entry.id })}>卸载</Button>
      </> : <Button disabled={disabled || !ready || !installed?.enabled || Boolean(installed?.missing.length)} onClick={() => onOpen()}>打开工具<ArrowRight data-icon="inline-end" /></Button>}
    </CardFooter>
  </Card>;
}
