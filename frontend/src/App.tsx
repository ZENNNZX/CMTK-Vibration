import { useState } from 'react';

import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { getToken } from './services/api';

/** สองหน้า ยังไม่ต้องมี router — เพิ่มตอนมีหน้าที่สาม (docs/04 §1) */
export function App() {
  const [signedIn, setSignedIn] = useState(() => getToken() !== null);
  return signedIn ? (
    <Dashboard onSignedOut={() => setSignedIn(false)} />
  ) : (
    <Login onSignedIn={() => setSignedIn(true)} />
  );
}
