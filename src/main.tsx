import './plugins/install'; // window.floorplanStudio before providers register
import './examples/ha-devices'; // bundled example device source (self-registers)
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
