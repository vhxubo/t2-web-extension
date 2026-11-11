import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ReadItemsProvider } from '@/components/ReadItems';
import { bootstrapTheme } from '@/lib/theme';
import '@/styles/theme.css';
import '@/components/components.css';
import './popup.css';

async function mount() {
  // 先套用存储里的浅色 / 深色 / 跟随系统偏好，再挂载界面，避免首屏闪白。
  await bootstrapTheme();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ReadItemsProvider>
        <App />
      </ReadItemsProvider>
    </React.StrictMode>,
  );
}

void mount();
