import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// globals: false จึงต้องล้าง DOM เอง ไม่งั้น DOM ของเทสต์ก่อนค้างจนหา element เจอซ้ำซ้อน
afterEach(cleanup);
