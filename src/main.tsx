import React from 'react';
import ReactDOM from 'react-dom/client';
import Platform from './platform/Platform';
import { ThemeProvider } from './theme/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><TooltipProvider><Platform /></TooltipProvider></ThemeProvider></React.StrictMode>,
);
