import type { CSSProperties } from 'react';
import { UserMinus, UserRoundCog } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardContent, Tooltip } from '@/shared/ui';
import { formatRelative } from '@/shared/lib/format';
import type { Role } from '@/domain/schemas/common';
import type { UsuarioPersonal } from '@/domain/schemas/users';

/** Tono del chip de cada rol. El color dice cuánta autoridad tiene. */
const TONO_ROL: Record<Role, 'danger' | 'primary' | 'info' | 'neutral'> = {
  ADMIN: 'danger',
  COORDINATOR: 'primary',
  SECRETARY: 'info',
  PROFESSOR: 'neutral',
  STUDENT: 'neutral',
};

/**
 * Estado del registro de un docente. Solo se pinta lo que pide atención:
 * una cuenta aprobada es lo normal y una insignia «Aprobado» en cada fila
 * sería ruido.
 */
const ESTADO_DOCENTE: Record<string, { texto: string; tono: 'warning' | 'danger' }> = {
  PENDIENTE: { texto: 'Registro por revisar', tono: 'warning' },
  RECHAZADO: { texto: 'Registro rechazado', tono: 'danger' },
};

/**
 * Una cuenta del personal: quién es, qué rol tiene, de dónde, cuándo entró por
 * última vez y qué se puede hacer con ella.
 *
 * El último acceso está a la vista porque es la pregunta que se hace antes de
 * dar de baja a alguien: una cuenta que nunca entró es casi siempre un alta
 * equivocada.
 */
export function FilaDePersonal({
  usuario,
  nombreRol,
  esPropia,
  className,
  style,
  onEditar,
  onDarDeBaja,
}: {
  usuario: UsuarioPersonal;
  nombreRol: string;
  esPropia: boolean;
  className?: string;
  style?: CSSProperties;
  onEditar: () => void;
  onDarDeBaja: () => void;
}) {
  const porPrograma = usuario.role === 'COORDINATOR' || usuario.role === 'SECRETARY';
  const sinAcotar = porPrograma && usuario.programas.length === 0;
  const estado = usuario.profesor ? ESTADO_DOCENTE[usuario.profesor.estado] : undefined;
  const ultimoAcceso = usuario.lastLoginAt
    ? `Último acceso ${formatRelative(usuario.lastLoginAt)}`
    : 'Nunca ha entrado';

  return (
    <Card className={className} style={style}>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <Avatar name={usuario.fullName} src={usuario.photoUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-body font-semibold text-text">
              {usuario.fullName}
              {esPropia && <span className="font-normal text-muted"> (tú)</span>}
            </p>
            <Badge tone={TONO_ROL[usuario.role]}>{nombreRol}</Badge>
            {usuario.role === 'ADMIN' ? (
              <span className="text-caption text-muted">Todas las instituciones</span>
            ) : usuario.institucion ? (
              <Badge tone="neutral" title={usuario.institucion.nombre}>
                {usuario.institucion.sigla}
              </Badge>
            ) : (
              <Badge tone="warning">Sin institución</Badge>
            )}
            {estado && <Badge tone={estado.tono}>{estado.texto}</Badge>}
            {usuario.profesor?.esDirectorTrabajoGrado && (
              <Badge tone="neutral">Dirige trabajos de grado</Badge>
            )}
          </div>

          <p className="truncate text-caption text-muted">
            {usuario.email}
            <span aria-hidden> · </span>
            {ultimoAcceso}
          </p>

          {porPrograma &&
            (sinAcotar ? (
              // La advertencia va en la fila, no escondida en el formulario: es
              // el estado en el que la cuenta ve más de lo que probablemente se
              // pretendía.
              <p className="mt-1 text-caption text-warning">
                Sin carreras asignadas: ve toda la institución. Pulsa «Editar» para acotarla.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {/* Por carrera, no por título: dos insignias —«Sistemas» y
                    «Sistemas»— no dicen nada, y la marca de «solo un ciclo» es
                    lo que hay que ver. */}
                {usuario.areas.map((area) => (
                  <Badge key={area.id} tone={area.completa ? 'neutral' : 'warning'}>
                    {area.nombre}
                    {!area.completa && ' · un solo ciclo'}
                  </Badge>
                ))}
              </div>
            ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="secondary" size="sm" onClick={onEditar}>
            <UserRoundCog aria-hidden />
            Editar
          </Button>
          {/* La propia cuenta no se da de baja (el servidor lo rechaza con un
              409): ofrecer el botón para luego decir que no es peor que no
              ofrecerlo. */}
          {!esPropia && (
            <Tooltip content="Dar de baja">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDarDeBaja}
                aria-label={`Dar de baja a ${usuario.fullName}`}
              >
                <UserMinus aria-hidden />
              </Button>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
