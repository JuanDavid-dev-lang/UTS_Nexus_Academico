import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  Input,
} from '@/shared/ui';
import { detalleDeError, institutionsRepository } from '@/infrastructure/repositories/institutions.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import type { Institucion } from '@/domain/schemas/institutions';

type FilaCorte = { numero: number; nombre: string; pesoPct: number };
type FilaComponente = { id: string; nombre: string; pesoPct: number };

/** Medio punto porcentual, equivalente a la tolerancia 0.001 (fracción) que valida el backend. */
const TOLERANCIA_PCT = 0.5;

function aPorcentaje(fraccion: number): number {
  return Math.round(fraccion * 1000) / 10;
}

function sumaPct(filas: { pesoPct: number }[]): number {
  return filas.reduce((total, fila) => total + (Number.isFinite(fila.pesoPct) ? fila.pesoPct : 0), 0);
}

/**
 * Cortes, componentes y escala de una institución.
 *
 * Sin configuración no se proponen valores por defecto: el editor arranca en
 * blanco y es el administrador quien añade cada fila a mano. Para las UTS la
 * configuración ya viene del backend con sus propios valores, así que este
 * diálogo nunca decide un número por su cuenta — solo convierte fracción a
 * porcentaje para que se lea, y de vuelta a fracción al guardar.
 */
export function InstitutionConfigDialog({ institucion, onClose }: { institucion: Institucion; onClose: () => void }) {
  const queryClient = useQueryClient();
  const configExistente = institucion.configuracionAcademica;

  const [editando, setEditando] = useState(Boolean(configExistente));
  const [cortes, setCortes] = useState<FilaCorte[]>(() =>
    (configExistente?.cortes ?? []).map((c) => ({ numero: c.numero, nombre: c.nombre, pesoPct: aPorcentaje(c.peso) })),
  );
  const [componentes, setComponentes] = useState<FilaComponente[]>(() =>
    (configExistente?.componentes ?? []).map((c) => ({ id: c.id, nombre: c.nombre, pesoPct: aPorcentaje(c.peso) })),
  );
  const [notaMinima, setNotaMinima] = useState(configExistente?.notaMinima ?? 0);
  const [notaMaxima, setNotaMaxima] = useState(configExistente?.notaMaxima ?? 5);
  const [notaAprobacion, setNotaAprobacion] = useState(configExistente?.notaAprobacion ?? 3);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const sumaCortes = useMemo(() => sumaPct(cortes), [cortes]);
  const sumaComponentes = useMemo(() => sumaPct(componentes), [componentes]);
  const cortesValidos = cortes.length > 0 && Math.abs(sumaCortes - 100) <= TOLERANCIA_PCT;
  const componentesValidos = componentes.length > 0 && Math.abs(sumaComponentes - 100) <= TOLERANCIA_PCT;

  function agregarCorte() {
    const numero = (cortes.at(-1)?.numero ?? 0) + 1;
    setCortes((previos) => [...previos, { numero, nombre: `Corte ${numero}`, pesoPct: 0 }]);
  }
  function quitarCorte(numero: number) {
    setCortes((previos) => previos.filter((c) => c.numero !== numero));
  }
  function agregarComponente() {
    setComponentes((previos) => [...previos, { id: '', nombre: '', pesoPct: 0 }]);
  }
  function quitarComponente(index: number) {
    setComponentes((previos) => previos.filter((_, i) => i !== index));
  }

  const guardar = useMutation({
    mutationFn: () =>
      institutionsRepository.configurar(institucion.id, {
        cortes: cortes.map((c) => ({ numero: c.numero, nombre: c.nombre.trim(), peso: c.pesoPct / 100 })),
        componentes: componentes.map((c) => ({ id: c.id.trim().toUpperCase(), nombre: c.nombre.trim(), peso: c.pesoPct / 100 })),
        notaMinima,
        notaMaxima,
        notaAprobacion,
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
      toast.success('Configuración académica guardada', institucion.nombre);
      onClose();
    },
    onError(causa) {
      const detalle = detalleDeError(causa);
      setErrorGuardado(detalle.mensaje);
      toast.error('No se pudo guardar la configuración', detalle.mensaje);
    },
  });

  const quitar = useMutation({
    mutationFn: () => institutionsRepository.configurar(institucion.id, null),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.institutions.all });
      toast.success('Configuración eliminada', 'La institución vuelve a quedar sin cortes ni ponderados.');
      setConfirmandoQuitar(false);
      onClose();
    },
    onError(causa) {
      toast.fromError(causa, 'No se pudo quitar la configuración');
      setConfirmandoQuitar(false);
    },
  });

  const puedeGuardar =
    cortesValidos &&
    componentesValidos &&
    notaMinima < notaMaxima &&
    notaAprobacion >= notaMinima &&
    notaAprobacion <= notaMaxima;

  return (
    <>
      <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
        <DialogContent
          title={`Configuración académica — ${institucion.nombre}`}
          description="Cortes, componentes y la escala con la que se califica."
          className="max-w-2xl"
        >
          {!editando ? (
            <div className="flex flex-col items-center gap-4">
              <EmptyState
                title="Sin cortes ni ponderados configurados"
                message="Los define un administrador. Sin esta configuración, la institución no puede tener notas."
              />
              <Button variant="primary" onClick={() => setEditando(true)}>
                <Settings2 className="size-4" aria-hidden />
                Configurar ahora
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-body font-semibold text-text">Cortes</p>
                  <Badge tone={cortesValidos ? 'success' : 'danger'}>{sumaCortes.toFixed(1)}%</Badge>
                </div>
                {cortes.length === 0 ? (
                  <p className="text-caption text-muted">Añade al menos un corte.</p>
                ) : (
                  cortes.map((corte, index) => (
                    <div key={corte.numero} className="flex items-center gap-2">
                      <Input
                        value={corte.nombre}
                        onChange={(e) =>
                          setCortes((prev) => prev.map((c, i) => (i === index ? { ...c, nombre: e.target.value } : c)))
                        }
                        placeholder={`Corte ${corte.numero}`}
                        aria-label={`Nombre del corte ${corte.numero}`}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={corte.pesoPct}
                          onChange={(e) =>
                            setCortes((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, pesoPct: Number(e.target.value) } : c)),
                            )
                          }
                          aria-label={`Peso del corte ${corte.numero}`}
                          className="w-20"
                        />
                        <span className="text-caption text-muted">%</span>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => quitarCorte(corte.numero)} aria-label={`Quitar ${corte.nombre}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ))
                )}
                <Button variant="secondary" size="sm" onClick={agregarCorte} className="self-start">
                  <Plus className="size-4" aria-hidden />
                  Añadir corte
                </Button>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-body font-semibold text-text">Componentes</p>
                  <Badge tone={componentesValidos ? 'success' : 'danger'}>{sumaComponentes.toFixed(1)}%</Badge>
                </div>
                {componentes.length === 0 ? (
                  <p className="text-caption text-muted">Añade al menos un componente.</p>
                ) : (
                  componentes.map((comp, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={comp.id}
                        onChange={(e) =>
                          setComponentes((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, id: e.target.value.toUpperCase() } : c)),
                          )
                        }
                        placeholder="TRABAJOS"
                        aria-label="Identificador del componente"
                        className="w-32 font-mono uppercase"
                      />
                      <Input
                        value={comp.nombre}
                        onChange={(e) =>
                          setComponentes((prev) =>
                            prev.map((c, i) => (i === index ? { ...c, nombre: e.target.value } : c)),
                          )
                        }
                        placeholder="Trabajos"
                        aria-label="Nombre del componente"
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={comp.pesoPct}
                          onChange={(e) =>
                            setComponentes((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, pesoPct: Number(e.target.value) } : c)),
                            )
                          }
                          aria-label="Peso del componente"
                          className="w-20"
                        />
                        <span className="text-caption text-muted">%</span>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => quitarComponente(index)} aria-label="Quitar componente">
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ))
                )}
                <Button variant="secondary" size="sm" onClick={agregarComponente} className="self-start">
                  <Plus className="size-4" aria-hidden />
                  Añadir componente
                </Button>
              </section>

              <section className="grid grid-cols-3 gap-3">
                <Field label="Nota mínima">
                  {(props) => (
                    <Input {...props} type="number" step="0.1" value={notaMinima} onChange={(e) => setNotaMinima(Number(e.target.value))} />
                  )}
                </Field>
                <Field label="Nota máxima">
                  {(props) => (
                    <Input {...props} type="number" step="0.1" value={notaMaxima} onChange={(e) => setNotaMaxima(Number(e.target.value))} />
                  )}
                </Field>
                <Field label="Aprobación">
                  {(props) => (
                    <Input {...props} type="number" step="0.1" value={notaAprobacion} onChange={(e) => setNotaAprobacion(Number(e.target.value))} />
                  )}
                </Field>
              </section>

              {errorGuardado && <p className="text-caption font-medium text-danger">{errorGuardado}</p>}
            </div>
          )}

          <DialogFooter>
            {configExistente && (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => setConfirmandoQuitar(true)}
                disabled={guardar.isPending || quitar.isPending}
              >
                Quitar configuración
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={guardar.isPending || quitar.isPending}>
              Cancelar
            </Button>
            {editando && (
              <Button onClick={() => guardar.mutate()} disabled={!puedeGuardar || guardar.isPending} loading={guardar.isPending}>
                Guardar configuración
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmandoQuitar}
        onOpenChange={setConfirmandoQuitar}
        title="Quitar la configuración académica"
        description={`${institucion.nombre} se quedará sin cortes ni ponderados. Sus notas dejarán de poder calcularse hasta que se configure de nuevo.`}
        confirmLabel="Quitar"
        loading={quitar.isPending}
        onConfirm={() => quitar.mutate()}
      />
    </>
  );
}
