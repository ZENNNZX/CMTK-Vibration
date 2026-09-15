import { useState } from 'react';

import { Shell, type Screen } from './components/Shell';
import { Admin } from './pages/Admin';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Maintenance } from './pages/Maintenance';
import { MonthlySummary } from './pages/MonthlySummary';
import { MotorDetail } from './pages/MotorDetail';
import { clearToken, getRole, getToken } from './services/api';

/** ยังไม่ต้องมี router — เพิ่มตอนต้องมี URL ที่แชร์กันได้ (docs/04 §1) */
export function App() {
  const [signedIn, setSignedIn] = useState(() => getToken() !== null);
  const [role, setRoleState] = useState(getRole);
  const [screen, setScreen] = useState<Screen>('dash');
  const [motorId, setMotorId] = useState<number | null>(null);

  if (!signedIn)
    return (
      <Login
        onSignedIn={(user) => {
          setRoleState(user.role);
          setSignedIn(true);
        }}
      />
    );

  const signOut = () => {
    clearToken();
    setMotorId(null);
    setScreen('dash');
    setSignedIn(false);
  };

  const go = (s: Screen) => {
    setMotorId(null);
    setScreen(s);
  };

  const page = () => {
    if (screen === 'history') return <History role={role} />;
    if (screen === 'month') return <MonthlySummary />;
    if (screen === 'maint') return <Maintenance role={role} />;
    if (screen === 'admin') return <Admin role={role} />;
    if (motorId !== null)
      return <MotorDetail motorId={motorId} onBack={() => setMotorId(null)} role={role} />;
    return <Dashboard onSignedOut={signOut} onOpenMotor={setMotorId} />;
  };

  return (
    <Shell onSignOut={signOut} screen={screen} onScreen={go}>
      {page()}
    </Shell>
  );
}
