import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/app/store';
import AppRouter from '@/app/router';
import { ThemeConfigProvider } from '@/components/theme/ThemeConfigProvider';
import '@/styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeConfigProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ThemeConfigProvider>
    </Provider>
  </React.StrictMode>,
);
