import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, Store, Puzzle, Settings, RefreshCw, ArrowUpRight, FileText, Image, Plus, X, Search, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
const ReleaseNotes = lazy(() => import('@/components/ReleaseNotes'));
import { useTheme } from '../theme/ThemeProvider';
import { cn } from '@/lib/utils';
type Page = 'home' | 'market' | 'plugins' | 'settings' | 'updates';
interface Plugin { id: string; title: string; description: string; category?: string; version: string; enabled: boolean; source: string; local: boolean; missing: string[]; releaseNotes?: string; settings?: { title: string }; error?: string }
interface Status { version: string; kernel: { ready: boolean; error: string | null; version: string; systems: { id: string; title: string; protected: boolean }[] }; plugins: Plugin[]; tabs: string[]; update: { status: string; version: string | null; notes: string; error: string | null; progress: number; delivery: 'manual' | 'automatic' } }
interface MarketEntry { id: string; title: string; description: string; version: string; releaseNotes?: string }
const navigation = [{ id: 'home', title: '工具中心', icon: Boxes }, { id: 'market', title: '插件市场', icon: Store }, { id: 'plugins', title: '插件管理', icon: Puzzle }, { id: 'settings', title: '设置', icon: Settings }, { id: 'updates', title: '更新', icon: RefreshCw }] as const;
const preview: Status = { version: '0.2.0', kernel: { ready: false, error: null, version: '0.2.1-alpha.1', systems: [] }, plugins: [{ id: 'official.labeledit', title: 'LabelEdit', description: '本地 PDF 标签编辑、文字识别与导出', category: '标签与文档', version: '0.1.0', enabled: true, source: 'bundled', local: true, missing: [] }], tabs: [], update: { status: 'idle', version: null, notes: '', error: null, progress: 0, delivery: 'manual' } };
export default function Platform() {
  const [status, setStatus] = useState<Status | null>(window.commerceDesktop ? null : preview);
  const [page, setPage] = useState<Page | string>('home');
  const [query, setQuery] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [market, setMarket] = useState<MarketEntry[]>([]); const [marketMessage, setMarketMessage] = useState('正在加载插件目录…');
  const surface = useRef<HTMLDivElement>(null); const { theme, setTheme } = useTheme();
  const desktop = Boolean(window.commerceDesktop);
  const refresh = useCallback(async () => { if (window.commerceDesktop) try { setStatus(await window.commerceDesktop.invoke<Status>('status')); } catch (e) { setError(String(e)); } }, []);
  useEffect(() => { void refresh(); return window.commerceDesktop?.onChanged(() => { void refresh(); }); }, [refresh]);
  const run = async (method: string, args?: unknown) => { setBusy(true); setError(null); try { const value = await window.commerceDesktop?.invoke(method, args); await refresh(); return value; } catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; } finally { setBusy(false); } };
  const act = (method: string, args?: unknown) => { void run(method, args).catch(() => {}); };
  async function navigate(next: string) {
    try { if (navigation.some(item => item.id === next)) await window.commerceDesktop?.invoke('view.hide'); else await run('view.open', { id: next }); setPage(next); setQuery(''); }
    catch { /* run already surfaces the operation error */ }
  }
  useEffect(() => {
    if (page !== 'market') return; let active = true;
    if (!window.commerceDesktop) { setMarketMessage('浏览器预览：线上插件目录将在发布后提供。'); return; }
    setMarketMessage('正在加载插件目录…');
    window.commerceDesktop.invoke<{ items: MarketEntry[]; message?: string }>('market.list').then(value => { if (active) { setMarket(value.items); setMarketMessage(value.message || ''); } }).catch(e => { if (active) setMarketMessage(e.message); });
    return () => { active = false; };
  }, [page]);
  useEffect(() => {
    const element = surface.current; if (!element || navigation.some(n => n.id === page)) return;
    const update = () => { const rect = element.getBoundingClientRect(); void window.commerceDesktop?.invoke('view.bounds', { x: rect.x, y: rect.y, width: rect.width, height: rect.height }); };
    const observer = new ResizeObserver(update); observer.observe(element); update(); return () => observer.disconnect();
  }, [page]);
  const plugins = status?.plugins ?? []; const enabled = plugins.filter(p => p.enabled);
  const results = (page === 'market' ? market : plugins).filter(p => (p.title + p.description).toLowerCase().includes(query.toLowerCase()));
  const title = navigation.find(n => n.id === page)?.title ?? plugins.find(p => p.id === page)?.title ?? '工具';
  return <div className="commerce-shell">
    <aside className="commerce-sidebar"><div className="commerce-brand"><span className="commerce-mark"><Boxes /></span><div><strong>电商工具中心</strong><span>你的插件服务入口</span></div></div>
      <nav aria-label="主导航">{navigation.map(({ id, title: label, icon: Icon }) => <Button key={id} variant={page === id ? 'secondary' : 'ghost'} className="commerce-nav" onClick={() => void navigate(id)}><Icon data-icon="inline-start" />{label}</Button>)}</nav>
      <div className="commerce-sidebar-footer"><ShieldCheck /><span>{desktop ? status?.kernel.ready ? 'Harness 内核已连接' : '等待内核启动' : '浏览器界面预览'}</span><small>v{status?.version ?? '0.2.0'}</small></div>
    </aside>
    <div className="commerce-main"><header className="commerce-topbar"><span>{title}</span><div className="flex items-center gap-3"><Badge variant="outline">{desktop ? '桌面工作台' : '浏览器预览'}</Badge><Button variant="outline" size="sm" disabled={!desktop || busy} onClick={() => act('plugins.import')}><Plus data-icon="inline-start" />导入插件</Button></div></header>
      {status?.tabs.length ? <div className="commerce-tool-tabs" role="tablist" aria-label="已打开的工具">{status.tabs.map(id => <div key={id} className="flex items-center gap-1"><Button role="tab" aria-selected={page === id} variant={page === id ? 'secondary' : 'ghost'} size="sm" onClick={() => void navigate(id)}>{plugins.find(p => p.id === id)?.title ?? id}</Button><Button variant="ghost" size="icon-sm" aria-label="关闭工具" onClick={() => { void run('view.close', { id }).then(() => { if (page === id) setPage('home'); }).catch(() => {}); }}><X /></Button></div>)}</div> : null}
      {error ? <Alert variant="destructive" className="commerce-alert"><AlertCircle /><AlertDescription>{error}</AlertDescription></Alert> : null}
      {status?.kernel.error ? <Alert variant="destructive" className="commerce-alert"><AlertCircle /><AlertDescription>{status.kernel.error}<Button variant="outline" size="sm" onClick={() => act('kernel.retry')}>重新启动内核</Button></AlertDescription></Alert> : null}
      {!status ? <main className="commerce-content"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></main> : navigation.some(n => n.id === page) ? <main className="commerce-content">
        {page === 'home' ? <><div className="commerce-heading"><div><p className="commerce-eyebrow">WORKSPACE</p><h1>把顺手的工具，放在一起。</h1><p>打开已安装的工具，或从插件市场为你的工作台增加新能力。</p></div><span className="commerce-heading-icon"><Puzzle /></span></div><div className="commerce-summary"><span><strong>{enabled.length}</strong> 个可用工具</span><span>独立安装与更新</span><span>本地插件隔离运行</span></div></> : <div className="commerce-heading"><div><p className="commerce-eyebrow">{page === 'market' ? 'DISCOVER' : page === 'plugins' ? 'MANAGE' : 'PREFERENCES'}</p><h1>{title}</h1><p>{page === 'market' ? '为电商日常工作，找到合适的小工具。' : page === 'plugins' ? '管理已安装工具的状态和版本。' : page === 'updates' ? '检查底座更新，查看最新版本的变更内容。' : '工作台与运行环境。'}</p></div></div>}
        {['home', 'market', 'plugins'].includes(page) ? <><div className="commerce-search"><Search /><Input aria-label="搜索工具" placeholder="搜索工具名称或用途" value={query} onChange={e => setQuery(e.target.value)} /></div>
          {page === 'market' && marketMessage ? <Alert><Store /><AlertDescription>{marketMessage}</AlertDescription></Alert> : null}
          <div className="commerce-grid">{results.map(p => { const installed = plugins.find(item => item.id === p.id); const plugin = installed; const Icon = p.id.includes('labeledit') ? FileText : Image; return <Card key={p.id}><CardHeader><div className="commerce-card-meta"><span className="commerce-tool-icon"><Icon /></span><Badge variant="outline">{'category' in p ? String(p.category ?? '电商工具') : '电商工具'}</Badge></div><CardTitle role="heading" aria-level={2}>{p.title}</CardTitle><CardDescription>{p.description}</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">v{p.version}{plugin ? ' · ' + (plugin.enabled ? '已启用' : '已停用') : ' · 可安装'}{plugin?.missing.length ? ' · 缺少服务依赖' : ''}{plugin ? ' · ' + ({ bundled: '内置插件', local: '本地导入', market: '市场签名验证' }[plugin.source] ?? plugin.source) : ''}</p>{(page === 'plugins' || page === 'market') && 'releaseNotes' in p ? <Suspense fallback={<span>加载更新说明…</span>}><ReleaseNotes body={p.releaseNotes || ''} /></Suspense> : null}{plugin?.error ? <p role="alert">{plugin.error}</p> : null}</CardContent><CardFooter className="flex flex-wrap gap-2">{page === 'market' ? <Button disabled={!desktop || busy || installed?.version === p.version} onClick={() => act('market.install', { id: p.id })}>{installed ? installed.version === p.version ? '已安装' : '更新插件' : '安装插件'}</Button> : page === 'plugins' ? <><Button variant="outline" disabled={!desktop || busy} onClick={() => act('plugins.enable', { id: p.id, enabled: !plugin?.enabled })}>{plugin?.enabled ? '停用' : '启用'}</Button>{plugin?.settings ? <Button variant="outline" disabled={!desktop || busy || !plugin.enabled} onClick={() => { void run('view.open', { id: p.id, settings: true }).then(() => setPage(p.id)).catch(() => {}); }}>插件设置</Button> : null}<Button variant="ghost" disabled={!desktop || busy} onClick={() => act('plugins.uninstall', { id: p.id })}>卸载</Button><Button variant="ghost" disabled={!desktop || busy} onClick={() => act('plugins.rollback', { id: p.id })}>恢复版本</Button></> : <Button disabled={!desktop || !status.kernel.ready || !plugin?.enabled || Boolean(plugin?.missing.length)} onClick={() => void navigate(p.id)}>打开工具<ArrowUpRight data-icon="inline-end" /></Button>}</CardFooter></Card>; })}</div>
          {!results.length && !(page === 'market' && marketMessage) ? <Empty><EmptyHeader><EmptyTitle>没有找到工具</EmptyTitle><EmptyDescription>换个关键词，或者导入一个新的插件。</EmptyDescription></EmptyHeader></Empty> : null}</> : null}
        {page === 'settings' ? <div className="commerce-settings"><Card><CardHeader><CardTitle role="heading" aria-level={2}>外观</CardTitle><CardDescription>为工作台选择舒适的显示方式。</CardDescription></CardHeader><CardContent><select aria-label="主题" value={theme} onChange={e => setTheme(e.target.value as 'system' | 'light' | 'dark')}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></CardContent></Card><Card><CardHeader><CardTitle role="heading" aria-level={2}>运行环境</CardTitle><CardDescription>DeepSeek Harness 内核与受保护的平台服务。</CardDescription></CardHeader><CardContent><p>底座 v{status.version}</p><p>Harness {status.kernel.version}</p><p>{status.kernel.ready ? '内核运行正常' : desktop ? '内核尚未就绪' : '浏览器预览不启动本地内核'}</p><div className="flex flex-wrap gap-2">{status.kernel.systems.map(s => <Badge key={s.id} variant="secondary">{s.title}</Badge>)}</div></CardContent></Card></div> : null}
        {page === 'updates' ? <Card><CardHeader><CardTitle role="heading" aria-level={2}>底座更新</CardTitle><CardDescription>当前版本 v{status.version}</CardDescription></CardHeader><CardContent><p>{status.update.status === 'unpublished' ? '尚无公开发布的底座版本。' : status.update.status === 'current' ? '当前已是最新版本。' : status.update.version ? '检测到版本 v' + status.update.version : '手动检查是否有新版本。'}</p>{status.update.delivery === 'manual' ? <p className="text-sm text-muted-foreground">从 GitHub 下载新版安装包后手动安装。</p> : null}{status.update.notes ? <Suspense fallback={<span>加载更新说明…</span>}><ReleaseNotes body={status.update.notes} /></Suspense> : null}{status.update.error ? <Alert variant="destructive"><AlertCircle /><AlertDescription>{status.update.error}</AlertDescription></Alert> : null}</CardContent><CardFooter className="flex flex-wrap gap-2"><Button disabled={!desktop || busy || status.update.status === 'checking'} onClick={() => act('updates.check')}>检查更新</Button>{status.update.status === 'available' ? <Button variant="outline" disabled={busy} onClick={() => act(status.update.delivery === 'manual' ? 'updates.openRelease' : 'updates.download')}>{status.update.delivery === 'manual' ? '打开 GitHub 下载页' : '下载更新'}</Button> : null}{status.update.delivery === 'automatic' && status.update.status === 'downloading' ? <span>下载 {Math.round(status.update.progress)}%</span> : null}{status.update.delivery === 'automatic' && status.update.status === 'downloaded' ? <Button disabled={busy} onClick={() => act('updates.install')}>安装并重启</Button> : null}</CardFooter></Card> : null}
      </main> : <div ref={surface} className={cn('commerce-plugin-surface', !status.kernel.ready && 'opacity-50')} />}
    </div>
  </div>;
}
