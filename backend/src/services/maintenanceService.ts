import { NotFoundError } from '../middlewares/errorHandler.js';
import type { MaintenanceRepository, MaintenanceRow } from '../repositories/maintenanceRepository.js';

export interface MaintenanceLog {
  id: number;
  motorId: number;
  tag: string;
  motorName: string;
  alarmEventId: number | null;
  cause: string;
  description: string | null;
  performedBy: number;
  performedName: string | null;
  performedAt: string;
  resetRunHours: boolean;
}

const toLog = (r: MaintenanceRow): MaintenanceLog => ({
  id: Number(r.id),
  motorId: Number(r.motor_id),
  tag: r.tag,
  motorName: r.motor_name,
  alarmEventId: r.alarm_event_id === null ? null : Number(r.alarm_event_id),
  cause: r.cause,
  description: r.description,
  performedBy: Number(r.performed_by),
  performedName: r.performed_name,
  performedAt: new Date(r.performed_at).toISOString(),
  resetRunHours: r.reset_run_hours,
});

export function createMaintenanceService(repo: MaintenanceRepository) {
  return {
    async list(motorId?: number): Promise<MaintenanceLog[]> {
      return (await repo.list(motorId)).map(toLog);
    },

    async create(p: {
      motorId: number;
      cause: string;
      description?: string;
      alarmEventId?: number;
      resetRunHours: boolean;
      performedBy: number;
    }): Promise<MaintenanceLog> {
      const id = await repo.insert(p);
      if (p.resetRunHours) await repo.resetRunHours(p.motorId);
      const row = await repo.findById(id);
      if (!row) throw new NotFoundError('บันทึกงานซ่อม');
      return toLog(row);
    },
  };
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>;
