import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { App } from './App';
import { connectSocket } from './state/store';
import './styles/app.css';

connectSocket();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Tooltip.Provider delayDuration={300}>
      <App />
    </Tooltip.Provider>
  </React.StrictMode>,
);
