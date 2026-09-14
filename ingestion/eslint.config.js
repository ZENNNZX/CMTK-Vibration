// SOP Gate 1 · lint ต้อง 0 error
// recommended ล้วน — ปรับกฎเดียว: prefix _ = ตั้งใจไม่ใช้
// (error handler ของ express ต้องมี 4 พารามิเตอร์ถึงจะถูกเรียก ตัด _next ออกไม่ได้)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
