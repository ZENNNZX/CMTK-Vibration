import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // ให้เครื่องอื่นในวง LAN เข้าได้
    // ตอน dev ยิง /api ไปที่ backend · ตอน production express.static เสิร์ฟทั้งคู่ที่ origin เดียวกัน
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: false,
  },
});
