import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogFooter, Field, Input } from '@/shared/ui';
import { Switch } from '@/shared/ui/primitives';
import {
  detalleDeError,
  institutionsRepository,
} from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { toast } from '@/state/toast.store';
import type { Institucion } from '@/domain/schemas/institutions';

type Props = {
  /** Presente = editar; ausente = crear. */
  institucion?: Institucion | null;
  /** Nombre pedido por un docente, precargado al crear desde una solicitud. */
  nombreInicial?: string;
  /** Presente = crear vía `crearDesdeSolicitud` y vincular a este docente de una vez. */
  profesorId?: string;
  onClose: () => void;
};

/**
 * Alta y edición de un perfil institucional.
 *
 * Antes de guardar una institución nueva, consulta coincidencias por nombre,
 * sigla y alias: una coincidencia exacta bloquea el guardado (el mensaje pide
 * añadir el nombre como alias en vez de duplicar el perfil), una posible solo
 * avisa y exige una confirmación explícita. En edición no se comprueba: el
 * perfil ya existe, así que compararlo consigo mismo no dice nada.
 */
export function InstitutionFormDialog({ institucion, nombreInicial, profesorId, onClose }: Props) {
  const queryClient = useQueryClient();
  const editando = Boolean(institucion);

  const [nombre, setNombre] = useState(institucion?.nombre ?? nombreInicial ?? '');
  const [sigla, setSigla] = useState(institucion?.sigla ?? '');
  const [aliases, setAliases] = useState<string[]>(institucion?.aliases ?? []);
  const [aliasInput, setAliasInput] = useState('');
  const [activa, setActiva] = useState(institucion?.activa ?? true);
  const [confirmaPosible, setConfirmaPosible] = useState(false);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});

  const claveCoincidencias = useDebounce(`${nombre}|${sigla}|${aliases.join('|')}`, 400);

  const coincidencias = useQuery({
    queryKey: queryKeys.institutions.coincidencias(claveCoincidencias),
    queryFn: () =>
      institutionsRepository.coincidencias({
        nombre: nombre.trim() || undefined,
        sigla: sigla.trim() || undefined,
        aliases: aliases.filter(Boolean),
        excluir: institucion?.institutionId,
      }),
    enabled: !editando && (nombre.trim().length >= 3 || sigla.trim().length >= 2),
  });

  const exactas = (coincidencias.data ?? []).filter((c) => c.tipo === 'exacta');
  const posibles = (coincidencias.data ?? []).filter((c) => c.tipo === 'posible');
  const primeraExacta = exactas[0];
  const primeraPosible = posibles[0];

  function actualizarSigla(valor: string) {
    setSigla(valor.toUpperCase());
  }

  function agregarAlias() {
    const valor = aliasInput.trim();
    if (!valor || aliases.includes(valor)) {
      setAliasInput('');
      return;
    }
    setAliases((previos) => [...previos, valor]);
    setAliasInput('');
  }

  function quitarAlias(valor: string) {
    setAliases((previos) => previos.filter((a) => a !== valor));
  }

  const guardar = useMutation({
    mutationFn: async () => {
      const datosComunes = { nombre: nombre.trim(), sigla: sigla.trim().toUpperCase(), aliases, activa };
      if (editando && institucion) {
        return institutionsRepository.actualizar(institucion.id, datosComunes);
      }
      // El identificador lo genera el servidor a partir de la sigla.
      const nuevo = datosComunes;
      if (profesorId) {
        const resultado = await institutionsRepository.crearDesdeSolicitud(profesorId, nuevo);
        return resultado.item;
      }
      return institutionsRepository.crear(nuevo);
    },
    onSuccess(item) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
      toast.success(editando ? 'Institución actualizada' : 'Institución creada', item.nombre);
      onClose();
    },
    onError(causa) {
      const detalle = detalleDeError(causa);
      const campos: Record<string, string> = {};
      for (const error of detalle.errores) campos[error.campo] = error.mensaje;
      setErroresCampo(campos);
      toast.error(editando ? 'No se pudo actualizar' : 'No se pudo crear', detalle.mensaje);
    },
  });

  const bloqueadoPorExacta = !editando && exactas.length > 0;
  const requiereConfirmacion = !editando && exactas.length === 0 && posibles.length > 0 && !confirmaPosible;

  const puedeGuardar =
    nombre.trim().length >= 3 &&
    sigla.trim().length >= 2 &&
    !bloqueadoPorExacta &&
    !requiereConfirmacion;

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent
        title={editando ? `Editar ${institucion?.nombre ?? ''}` : 'Nueva institución'}
        description="Nombre, sigla y alias por los que se reconoce a la institución."
        className="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          <Field label="Nombre" error={erroresCampo.nombre} required>
            {(props) => (
              <Input
                {...props}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Universidad Industrial de Santander"
                autoFocus
              />
            )}
          </Field>

          <Field
            label="Sigla"
            error={erroresCampo.sigla ?? erroresCampo.institutionId}
            hint={
              editando && institucion
                ? `Se guarda en mayúsculas. Identificador interno: ${institucion.institutionId} (no cambia).`
                : 'Se guarda en mayúsculas. El identificador interno se genera solo a partir de ella.'
            }
            required
          >
            {(props) => (
              <Input {...props} value={sigla} onChange={(e) => actualizarSigla(e.target.value)} placeholder="UIS" maxLength={12} />
            )}
          </Field>

          <div className="flex flex-col gap-1.5">
            <p className="text-caption font-semibold text-muted">Alias</p>
            <div className="flex gap-2">
              <Input
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarAlias();
                  }
                }}
                placeholder="Otro nombre por el que se le conoce"
                aria-label="Nuevo alias"
              />
              <Button type="button" variant="secondary" onClick={agregarAlias}>
                <Plus className="size-4" aria-hidden />
                Añadir
              </Button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((valor) => (
                  <Badge key={valor} tone="neutral" className="gap-1">
                    {valor}
                    <button type="button" onClick={() => quitarAlias(valor)} aria-label={`Quitar alias ${valor}`}>
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-surface-alt p-3">
            <div>
              <p className="text-body font-medium text-text">Institución activa</p>
              <p className="text-caption text-muted">Inactiva deja de ofrecerse en el registro de docentes.</p>
            </div>
            <Switch checked={activa} onCheckedChange={setActiva} aria-label="Institución activa" />
          </div>

          {primeraExacta && (
            <div className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-soft p-3 text-caption text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Ya existe: {primeraExacta.perfil.nombre}</p>
                <p>{primeraExacta.motivo} Si es la misma institución, añade el nombre como alias en vez de crear un perfil nuevo.</p>
              </div>
            </div>
          )}

          {!primeraExacta && primeraPosible && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-caption text-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">Se parece a {primeraPosible.perfil.nombre}</p>
                  <p>{primeraPosible.motivo}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-caption font-medium">
                <input
                  type="checkbox"
                  checked={confirmaPosible}
                  onChange={(e) => setConfirmaPosible(e.target.checked)}
                  className="size-4"
                />
                Confirmo que es una institución distinta
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => guardar.mutate()} disabled={!puedeGuardar || guardar.isPending} loading={guardar.isPending}>
            {editando ? 'Guardar cambios' : 'Crear institución'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
