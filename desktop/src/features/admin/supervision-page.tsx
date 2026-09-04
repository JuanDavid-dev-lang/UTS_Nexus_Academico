import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Eye,
  GraduationCap,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  SkeletonTable,
  StatCard,
  type Column,
} from '@/shared/ui';
import { usersRepository } from '@/infrastructure/repositories/coordination.repository';
import { professorAdminRepository } from '@/infrastructure/repositories/professors.repository';
import { subjectRepository } from '@/infrastructure/repositories/subjects.repository';
import { useAdminModeStore } from '@/state/admin-mode.store';
import { useUserRole } from '@/state/session.store';
import { useDebounce } from '@/shared/hooks/use-debounce';
import type { UsuarioPersonal } from '@/domain/schemas/users';
import type { ProfesorAdmin } from '@/domain/schemas/academic';

export default function SupervisionAdminPage() {
  const role = useUserRole();
  const { adminMode, toggleAdminMode } = useAdminModeStore();

  const [activeTab, setActiveTab] = useState<'professors' | 'accounts'>('professors');
  const [profQuery, setProfQuery] = useState('');
  const [accQuery, setAccQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const debouncedProfQuery = useDebounce(profQuery, 200);
  const debouncedAccQuery = useDebounce(accQuery, 200);

  // Estados de previsualización
  const [previewProf, setPreviewProf] = useState<ProfesorAdmin | null>(null);
  const [previewUser, setPreviewUser] = useState<UsuarioPersonal | null>(null);

  // Consultas
  const accountsQuery = useQuery({
    queryKey: ['admin-supervision', 'accounts'],
    queryFn: () => usersRepository.list(),
    enabled: role === 'ADMIN',
  });

  const professorsQuery = useQuery({
    queryKey: ['admin-supervision', 'professors'],
    queryFn: () => professorAdminRepository.list(),
    enabled: role === 'ADMIN',
  });

  const subjectsQuery = useQuery({
    queryKey: ['admin-supervision', 'subjects'],
    queryFn: () => subjectRepository.list(),
    enabled: role === 'ADMIN',
  });

  // Métricas generales
  const stats = useMemo(() => {
    const allUsers = accountsQuery.data ?? [];
    const allProfs = professorsQuery.data ?? [];

    const totalAccounts = allUsers.length;
    const totalProfessors = allProfs.length;
    const activeProfessors = allProfs.filter((p) => p.estado === 'APROBADO').length;
    const pendingProfessors = allProfs.filter((p) => p.estado === 'PENDIENTE').length;
    const coordinators = allUsers.filter((u) => u.role === 'COORDINATOR').length;

    return { totalAccounts, totalProfessors, activeProfessors, pendingProfessors, coordinators };
  }, [accountsQuery.data, professorsQuery.data]);

  // Filtrado de profesores
  const filteredProfessors = useMemo(() => {
    const term = debouncedProfQuery.trim().toLowerCase();
    const list = professorsQuery.data ?? [];
    if (!term) return list;

    return list.filter(
      (p) =>
        p.nombres.toLowerCase().includes(term) ||
        p.apellidos.toLowerCase().includes(term) ||
        (p.cedula ? p.cedula.toLowerCase().includes(term) : false) ||
        (p.userId?.email ? p.userId.email.toLowerCase().includes(term) : false) ||
        p.programas.some((prog) => prog.toLowerCase().includes(term)),
    );
  }, [professorsQuery.data, debouncedProfQuery]);

  // Materias del profesor previsualizado
  const previewProfSubjects = useMemo(() => {
    if (!previewProf) return [];
    return (subjectsQuery.data ?? []).filter((s) => {
      if (s.professorId === previewProf._id) return true;
      return false;
    });
  }, [previewProf, subjectsQuery.data]);

  // Filtrado de cuentas
  const filteredAccounts = useMemo(() => {
    const term = debouncedAccQuery.trim().toLowerCase();
    let list = accountsQuery.data ?? [];
    if (roleFilter) {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (!term) return list;

    return list.filter(
      (u) =>
        u.fullName.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term) ||
        u.programas.some((prog) => prog.toLowerCase().includes(term)),
    );
  }, [accountsQuery.data, debouncedAccQuery, roleFilter]);

  // Columnas para tabla de profesores
  const professorColumns = useMemo<Column<ProfesorAdmin>[]>(() => [
    {
      key: 'docente',
      header: 'Docente / Cuenta',
      width: '2.5fr',
      sortValue: (row) => `${row.apellidos} ${row.nombres}`,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${row.nombres} ${row.apellidos}`} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-text">{row.apellidos}, {row.nombres}</span>
            <span className="truncate text-caption text-muted">
              {row.userId?.email ?? 'Sin correo vinculado'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'cedula',
      header: 'Cédula / Documento',
      width: '1.2fr',
      cell: (row) => <span className="font-mono text-caption tabular">{row.cedula || 'Sin cédula'}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '1fr',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.estado === 'APROBADO' ? 'success' : row.estado === 'PENDIENTE' ? 'warning' : 'danger'}>
          {row.estado}
        </Badge>
      ),
    },
    {
      key: 'programas',
      header: 'Programas',
      width: '1.5fr',
      cell: (row) => (
        <span className="truncate text-caption text-muted" title={row.programas.join(', ')}>
          {row.programas.length > 0 ? row.programas.join(', ') : 'Institucional'}
        </span>
      ),
    },
    {
      key: 'director',
      header: 'Director Grado',
      width: '1fr',
      align: 'center',
      cell: (row) => (
        <Badge tone={row.esDirectorTrabajoGrado ? 'primary' : 'neutral'}>
          {row.esDirectorTrabajoGrado ? 'Sí' : 'No'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      header: 'Previsualizar',
      width: '1fr',
      align: 'center',
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPreviewProf(row)}
          className="gap-1.5"
        >
          <Eye className="size-3.5" aria-hidden />
          Ver ficha
        </Button>
      ),
    },
  ], []);

  // Columnas para tabla de cuentas
  const accountColumns = useMemo<Column<UsuarioPersonal>[]>(() => [
    {
      key: 'usuario',
      header: 'Usuario',
      width: '2.5fr',
      sortValue: (row) => row.fullName,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.fullName} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-text">{row.fullName}</span>
            <span className="truncate text-caption text-muted">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol en Sistema',
      width: '1.5fr',
      align: 'center',
      cell: (row) => {
        const tone =
          row.role === 'ADMIN'
            ? 'danger'
            : row.role === 'COORDINATOR'
              ? 'primary'
              : row.role === 'PROFESSOR'
                ? 'success'
                : 'neutral';
        return (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Badge tone={tone}>{row.role}</Badge>
            {row.role !== 'ADMIN' && row.institucion && (
              <Badge tone="neutral" title={row.institucion.nombre}>
                {row.institucion.sigla}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'programas',
      header: 'Alcance / Programas',
      width: '2fr',
      cell: (row) => (
        <span className="truncate text-caption text-muted" title={row.programas.join(', ')}>
          {row.programas.length > 0 ? row.programas.join(', ') : 'Alcance total o sin programa'}
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Detalles',
      width: '1fr',
      align: 'center',
      cell: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPreviewUser(row)}
          className="gap-1.5"
        >
          <Eye className="size-3.5" aria-hidden />
          Ver cuenta
        </Button>
      ),
    },
  ], []);

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <span>Consola de Administración Central</span>
            <Badge tone="primary">MODO ADMIN ACTIVO</Badge>
          </div>
        }
        title="Supervisión Global: Cuentas y Docentes"
        subtitle="Previsualización integral de todas las cuentas institucionales, docentes registrados y asignaciones académicas."
        actions={
          <Button variant="secondary" onClick={toggleAdminMode} className="gap-2">
            <UserCheck className="size-4 text-primary" aria-hidden />
            Cambiar a {adminMode ? 'Modo Normal' : 'Modo Admin'}
          </Button>
        }
      />

      {/* Métricas clave */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          label="Total Cuentas"
          value={stats.totalAccounts}
          hint="Usuarios registrados en el sistema"
          icon={Users}
          tone="primary"
        />
        <StatCard
          index={1}
          label="Docentes Registrados"
          value={stats.totalProfessors}
          hint={`${stats.activeProfessors} activos · ${stats.pendingProfessors} pendientes`}
          icon={UserCog}
          tone="success"
        />
        <StatCard
          index={2}
          label="Coordinadores"
          value={stats.coordinators}
          hint="Gestión de programas académicos"
          icon={UsersRound}
          tone="primary"
        />
        <StatCard
          index={3}
          label="Total Materias Creadas"
          value={subjectsQuery.data?.length ?? 0}
          hint="En todos los periodos y docentes"
          icon={BookOpen}
          tone="neutral"
        />
      </div>

      {/* Selector de pestañas */}
      <div className="flex items-center gap-2 border-b border-border pb-2 pt-4">
        <Button
          variant={activeTab === 'professors' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('professors')}
          className="gap-2"
        >
          <GraduationCap className="size-4" aria-hidden />
          Profesores ({filteredProfessors.length})
        </Button>
        <Button
          variant={activeTab === 'accounts' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('accounts')}
          className="gap-2"
        >
          <Users className="size-4" aria-hidden />
          Cuentas y Usuarios ({filteredAccounts.length})
        </Button>
      </div>

      {/* Pestaña: Profesores */}
      {activeTab === 'professors' && (
        <div className="flex flex-col gap-4">
          <div className="surface-well flex flex-wrap items-center gap-3 p-3">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                value={profQuery}
                onChange={(e) => setProfQuery(e.target.value)}
                placeholder="Buscar docente por nombre, apellido, cédula o correo…"
                className="pl-9"
              />
            </div>
            <span className="text-caption text-muted">
              Mostrando {filteredProfessors.length} de {professorsQuery.data?.length ?? 0} docentes
            </span>
          </div>

          {professorsQuery.isPending ? (
            <SkeletonTable rows={6} columns={6} />
          ) : filteredProfessors.length === 0 ? (
            <Card>
              <EmptyState
                title="Sin profesores que coincidan"
                message="No se encontraron profesores registrados con ese criterio de búsqueda."
              />
            </Card>
          ) : (
            <DataTable
              rows={filteredProfessors}
              columns={professorColumns}
              getRowId={(row) => row._id}
            />
          )}
        </div>
      )}

      {/* Pestaña: Cuentas */}
      {activeTab === 'accounts' && (
        <div className="flex flex-col gap-4">
          <div className="surface-well flex flex-wrap items-center gap-3 p-3">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                value={accQuery}
                onChange={(e) => setAccQuery(e.target.value)}
                placeholder="Buscar cuenta por nombre, correo o programa…"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {['', 'ADMIN', 'COORDINATOR', 'PROFESSOR', 'SECRETARY', 'STUDENT'].map((r) => (
                <Button
                  key={r || 'ALL'}
                  variant={roleFilter === r ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setRoleFilter(r)}
                >
                  {r ? r : 'Todos los roles'}
                </Button>
              ))}
            </div>
          </div>

          {accountsQuery.isPending ? (
            <SkeletonTable rows={6} columns={4} />
          ) : filteredAccounts.length === 0 ? (
            <Card>
              <EmptyState
                title="Sin cuentas que coincidan"
                message="No se encontraron usuarios registrados con los filtros seleccionados."
              />
            </Card>
          ) : (
            <DataTable
              rows={filteredAccounts}
              columns={accountColumns}
              getRowId={(row) => row.id}
            />
          )}
        </div>
      )}

      {/* Diálogo de Previsualización de Docente */}
      <Dialog open={previewProf !== null} onOpenChange={(open) => !open && setPreviewProf(null)}>
        <DialogContent
          title={`Ficha del Docente: ${previewProf ? `${previewProf.nombres} ${previewProf.apellidos}` : ''}`}
          description="Previsualización detallada de datos personales, estado de cuenta y materias asignadas en el sistema."
          className="max-w-2xl"
        >
          {previewProf && (
            <div className="flex flex-col gap-4 py-2">
              {/* Resumen personal */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-alt/50 p-4 sm:grid-cols-2">
                <div>
                  <span className="text-caption text-muted">Nombre Completo:</span>
                  <p className="font-medium text-text">{previewProf.apellidos}, {previewProf.nombres}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Documento / Cédula:</span>
                  <p className="font-mono text-body text-text">{previewProf.cedula || 'Sin cédula'}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Correo Institucional:</span>
                  <p className="text-body text-text">{previewProf.userId?.email ?? 'No registrado'}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Estado de Aprobación:</span>
                  <div className="mt-0.5">
                    <Badge tone={previewProf.estado === 'APROBADO' ? 'success' : 'warning'}>
                      {previewProf.estado}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-caption text-muted">Director de Trabajo de Grado:</span>
                  <p className="text-body text-text">{previewProf.esDirectorTrabajoGrado ? 'Sí (Habilitado)' : 'No'}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Programas Asignados:</span>
                  <p className="text-body text-text">
                    {previewProf.programas.length > 0 ? previewProf.programas.join(', ') : 'Docente institucional'}
                  </p>
                </div>
              </div>

              {/* Materias del docente */}
              <div>
                <h4 className="flex items-center gap-2 text-body font-semibold text-text">
                  <BookOpen className="size-4 text-primary" aria-hidden />
                  Materias asignadas a este docente ({previewProfSubjects.length})
                </h4>
                {previewProfSubjects.length === 0 ? (
                  <p className="mt-2 text-caption text-muted italic">
                    Este docente no tiene materias registradas en la base de datos para este periodo.
                  </p>
                ) : (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-left text-caption">
                      <thead className="bg-surface-alt text-muted">
                        <tr>
                          <th className="p-2">Código</th>
                          <th className="p-2">Nombre</th>
                          <th className="p-2">Periodo</th>
                          <th className="p-2 text-center">Créditos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {previewProfSubjects.map((s) => (
                          <tr key={s._id} className="hover:bg-surface-alt/40">
                            <td className="p-2 font-mono font-medium text-text">{s.code}</td>
                            <td className="p-2 text-text">{s.name}</td>
                            <td className="p-2 text-muted">{s.period}</td>
                            <td className="p-2 text-center font-mono">{s.credits}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewProf(null)}>
              Cerrar previsualización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Previsualización de Cuenta */}
      <Dialog open={previewUser !== null} onOpenChange={(open) => !open && setPreviewUser(null)}>
        <DialogContent
          title={`Ficha de Cuenta: ${previewUser?.fullName ?? ''}`}
          description="Detalles de autenticación, rol de seguridad y alcance de la cuenta."
          className="max-w-lg"
        >
          {previewUser && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-alt/50 p-4">
                <div>
                  <span className="text-caption text-muted">Nombre de Usuario:</span>
                  <p className="font-semibold text-text">{previewUser.fullName}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Correo electrónico:</span>
                  <p className="font-mono text-body text-text">{previewUser.email}</p>
                </div>
                <div>
                  <span className="text-caption text-muted">Rol asignado:</span>
                  <div className="mt-1">
                    <Badge tone="primary">{previewUser.role}</Badge>
                  </div>
                </div>
                <div>
                  <span className="text-caption text-muted">Institución:</span>
                  <p className="text-body text-text">
                    {previewUser.role === 'ADMIN'
                      ? 'Todas las instituciones'
                      : (previewUser.institucion?.nombre ?? 'Sin institución asignada')}
                  </p>
                </div>
                <div>
                  <span className="text-caption text-muted">Programas con alcance:</span>
                  <p className="text-body text-text">
                    {previewUser.programas.length > 0
                      ? previewUser.programas.join(', ')
                      : 'Alcance total o sin restricción'}
                  </p>
                </div>
                <div>
                  <span className="text-caption text-muted">Identificador de cuenta:</span>
                  <p className="font-mono text-caption text-muted">{previewUser.id}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewUser(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
