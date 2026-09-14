import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { SystemStatus } from './pages/SystemStatus';
import './index.css';

// ยังไม่ใส่ router — มีหน้าเดียว เพิ่มตอนมีหน้าที่สอง (docs/04 §1)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SystemStatus />
  </StrictMode>,
);
