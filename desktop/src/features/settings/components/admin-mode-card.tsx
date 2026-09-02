import { Shield, ShieldAlert, ShieldCheck, UserCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';
import { useUserRole } from '@/state/session.store';
import { useAdminModeStore } from '@/state/admin-mode.store';
import { cn } from '@/shared/lib/cn';

/**
 * Tarjeta de control de Modo de Interfaz para administradores.
 *
 * Solo visible para cuentas con rol ADMIN. Permite cambiar entre la vista
 * normal de docencia y el modo de administración global con supervisión de
 * cuentas, docentes y herramientas institucionales.
 */
export function AdminModeCard() {
  const role = useUserRole();
  const { adminMode, setAdminMode } = useAdminModeStore();

  if (role !== 'ADMIN') return null;

  return (
    <Card className="border-primary/40 bg-gradient-to-br from-primary-soft/30 via-surface to-surface">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary">
              <Shield className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Modo de Interfaz Administrador
                <Badge tone={adminMode ? 'primary' : 'neutral'}>
                  {adminMode ? 'MODO ADMIN ACTIVO' : 'MODO NORMAL'}
                </Badge>
              </CardTitle>
              <CardDescription>
                Exclusivo para tu cuenta con rol de Administrador. Alterna entre la experiencia normal de docencia y la supervisión administrativa global.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Opción Modo Normal */}
          <button
            type="button"
            onClick={() => setAdminMode(false)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
              !adminMode
                ? 'border-primary bg-surface shadow-sm ring-2 ring-primary/20'
                : 'border-border bg-surface/60 hover:border-border-strong hover:bg-surface',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-text">
                <UserCheck className="size-4 text-primary" aria-hidden />
                <span>Modo Normal</span>
              </div>
              {!adminMode && <Badge tone="primary">Activo</Badge>}
            </div>
            <p className="text-caption text-muted">
              Interfaz limpia de trabajo académico (materias, notas, agenda y estudiantes), sin herramientas pesadas de gestión institucional en el menú.
            </p>
          </button>

          {/* Opción Modo Admin */}
          <button
            type="button"
            onClick={() => setAdminMode(true)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
              adminMode
                ? 'border-primary bg-primary-soft/40 shadow-sm ring-2 ring-primary/20'
                : 'border-border bg-surface/60 hover:border-border-strong hover:bg-surface',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-text">
                <ShieldCheck className="size-4 text-primary" aria-hidden />
                <span>Modo Administrador</span>
              </div>
              {adminMode && <Badge tone="success">Activo</Badge>}
            </div>
            <p className="text-caption text-muted">
              Acceso total al centro de supervisión institucional, catálogo de profesores con su carga académica, auditoría profunda, gestión de cuentas y control de periodos.
            </p>
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-alt/70 p-3 text-caption text-muted">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="size-4 text-primary shrink-0" aria-hidden />
            La preferencia se guarda en este dispositivo y puedes cambiarla en cualquier momento.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAdminMode(!adminMode)}
          >
            Cambiar a {adminMode ? 'Modo Normal' : 'Modo Admin'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
