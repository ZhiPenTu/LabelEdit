import React from 'react';
import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';
import Platform from './platform/Platform';
const LabelEdit = lazy(() => import('./App'));
import { ThemeProvider } from './theme/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><TooltipProvider>{window.commercePlugin?.id === 'official.labeledit' ? <Suspense fallback={<p>正在打开 LabelEdit…</p>}><LabelEdit /></Suspense> : <Platform />}</TooltipProvider></ThemeProvider></React.StrictMode>,
);
