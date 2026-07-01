import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// 从源头屏蔽 ResizeObserver loop 无害警告
// 这是浏览器已知问题，不影响功能，但会触发 react-error-overlay
const OriginalResizeObserver = window.ResizeObserver;
window.ResizeObserver = class PatchedResizeObserver extends OriginalResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    super((entries, observer) => {
      // 使用 requestAnimationFrame 将回调推迟到下一帧，避免触发 loop 警告
      requestAnimationFrame(() => {
        callback(entries, observer);
      });
    });
  }
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
