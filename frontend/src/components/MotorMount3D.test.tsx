import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MotorMount3D } from './MotorMount3D';

const props = {
  mount: 'DE-H',
  offset: null,
  canEdit: true,
  onMount: vi.fn(),
  onOffset: vi.fn(),
};

afterEach(() => vi.clearAllMocks());

describe('MotorMount3D', () => {
  it('jsdom ไม่มี WebGL → ต้องไม่พัง และยังเลือกจุดได้ด้วย dropdown (docs/02 §4)', () => {
    render(<MotorMount3D {...props} />);
    expect(screen.getByLabelText('จุดวัด')).toHaveValue('DE-H');
    expect(screen.getByText(/แสดงโมเดล 3 มิติไม่ได้/)).toBeInTheDocument();
  });

  it('เลือกจุดจาก dropdown → ส่งค่าออกไป', async () => {
    render(<MotorMount3D {...props} />);
    await userEvent.selectOptions(screen.getByLabelText('จุดวัด'), 'NDE-V');
    expect(props.onMount).toHaveBeenCalledWith('NDE-V');
  });

  it('อธิบายว่าจุดที่เลือกใช้จับอาการอะไร ไม่ใช่โชว์แค่รหัส', () => {
    render(<MotorMount3D {...props} />);
    expect(screen.getByText(/imbalance/)).toBeInTheDocument();
  });

  it('role manager → dropdown ถูกล็อก', () => {
    render(<MotorMount3D {...props} canEdit={false} />);
    expect(screen.getByLabelText('จุดวัด')).toBeDisabled();
  });

  it('ยังไม่ได้ลากปรับ → ไม่มีปุ่มคืนค่ามาตรฐานมากวน', () => {
    render(<MotorMount3D {...props} />);
    expect(screen.queryByRole('button', { name: /คืนค่าตำแหน่งมาตรฐาน/ })).not.toBeInTheDocument();
  });

  it('ลากปรับแล้ว → บอกว่าปรับเอง และคืนค่ามาตรฐานได้', async () => {
    render(<MotorMount3D {...props} offset={[0.9, 0.3, 0.6]} />);
    expect(screen.getByText(/ปรับตำแหน่งเองแล้ว/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /คืนค่าตำแหน่งมาตรฐาน/ }));
    expect(props.onOffset).toHaveBeenCalledWith(null);
  });

  it('NFR-09 · โมเดลเป็น WebGL อ่านด้วยคีย์บอร์ดไม่ได้ ต้องบอกว่าใช้ dropdown แทนได้', () => {
    render(<MotorMount3D {...props} />);
    expect(screen.getByText(/dropdown ด้านบนใช้คีย์บอร์ดได้/)).toBeInTheDocument();
  });
});
