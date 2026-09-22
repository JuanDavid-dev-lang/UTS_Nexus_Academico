import { useMemo, useState } from 'react';
import { Check, Copy, Plus, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  NativeSelect,
} from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import {
  useApplyStructure,
  useDeleteTemplate,
  useGradeTemplates,
  useRemoveStructure,
  useSaveTemplate,
  useStructures,
} from '@/features/grades/hooks/use-grade-templates';
import type {
  ComponentType,
  ComponentePlantilla,
  CutNumber,
  EstructuraNotas,
  EstructuraNotasInput,
  NotaPlantilla,
  PlantillaNotas,
  PlantillaNotasInput,
} from '@/domain/schemas/academic';

/**
 * Plantillas de corte.
 *
 * Un docente que siempre pone tres talleres, un parcial teórico al 60 % y
 * uno práctico al 40 % lo escribe aquí una vez y lo aplica a la materia y al
 * grupo que quiera. Desde entonces el desglose de cada estudiante propone lo
 * que falta y la nota se guarda con el peso de la plantilla sin teclearlo.
 *
 * Nada de esto escribe una nota: la plantilla es una propuesta con pesos. Una
 * nota fuera de la plantilla sigue valiendo, con peso 1 o el que se indique.
 *
 * El contenido se monta solo con el diálogo abierto y el editor va con `key`
 * de la plantilla elegida: así cada uno arranca con su estado y no hace falta
 * ningún efecto que lo reinicie.
 */

const COMPONENTES: { tipo: ComponentType; label: string; peso: string; ejemplo: string }[] = [
  { tipo: 'TRABAJOS', label: 'Trabajos', peso: '30 %', ejemplo: 'Taller 1' },
  { tipo: 'PARCIALES', label: 'Parciales', peso: '60 %', ejemplo: 'Parcial teórico' },
  { tipo: 'AUTOEVALUACION', label: 'Autoevaluación', peso: '10 %', ejemplo: 'Autoevaluación' },
];

const CORTES: CutNumber[] = [1, 2, 3];

type Materia = { _id: string; name: string; code: string };
type Grupo = { _id: string; name: string; subjectId?: string };

type Borrador = { name: string; componentes: ComponentePlantilla[] };

function borradorDe(plantilla: PlantillaNotas | null): Borrador {
  return {
    name: plantilla?.name ?? '',
    componentes: COMPONENTES.map((c) => ({
      tipo: c.tipo,
      notas: plantilla?.componentes.find((x) => x.tipo === c.tipo)?.notas ?? [],
    })),
  };
}

/** «3 trabajos · 2 parciales · 1 autoevaluación», para reconocerla en la lista. */
function resumenDe(componentes: ComponentePlantilla[]): string {
  return COMPONENTES.map((c) => {
    const n = componentes.find((x) => x.tipo === c.tipo)?.notas.length ?? 0;
    return `${n} ${c.label.toLocaleLowerCase('es')}`;
  }).join(' · ');
}

function porcentajes(notas: NotaPlantilla[]): number[] {
  const suma = notas.reduce((total, n) => total + (n.weight > 0 ? n.weight : 0), 0);
  return notas.map((n) => (suma > 0 ? Math.round((n.weight / suma) * 100) : 0));
}

function validar(borrador: Borrador): string | undefined {
  if (!borrador.name.trim()) return 'Ponle un nombre a la plantilla.';
  for (const componente of borrador.componentes) {
    const nombre = componente.tipo.toLocaleLowerCase('es');
    const vistas = new Set<string>();
    for (const nota of componente.notas) {
      const etiqueta = nota.label.trim();
      if (!etiqueta) return `Hay una nota sin nombre en ${nombre}.`;
      const clave = etiqueta.toLocaleLowerCase('es');
      if (vistas.has(clave)) return `«${etiqueta}» está repetida en ${nombre}.`;
      vistas.add(clave);
      if (!Number.isFinite(nota.weight) || nota.weight <= 0) return `El peso de «${etiqueta}» debe ser mayor que 0.`;
    }
  }
  return undefined;
}

export function GradeTemplatesDialog({
  open,
  onOpenChange,
  ...contexto
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: string;
  subjects: Materia[];
  groups: Grupo[];
  /** Materia y grupo que la pantalla tiene elegidos: se proponen al aplicar. */
  subjectId?: string;
  groupId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Plantillas de corte"
        description="Cómo repartes las notas de cada componente y con qué peso. Se aplica a una materia y, si quieres, a un solo grupo."
        className="max-w-4xl"
      >
        {open ? <Contenido {...contexto} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({
  period,
  subjects,
  groups,
  subjectId,
  groupId,
}: {
  period: string;
  subjects: Materia[];
  groups: Grupo[];
  subjectId?: string;
  groupId?: string;
}) {
  const plantillas = useGradeTemplates();
  const estructuras = useStructures(period);
  const borrar = useDeleteTemplate();
  const aplicar = useApplyStructure();
  const retirar = useRemoveStructure();

  // `null` = «la primera que haya»; 'nueva' = editor vacío.
  const [seleccion, setSeleccion] = useState<string | 'nueva' | null>(null);
  const [borrando, setBorrando] = useState<PlantillaNotas | null>(null);

  const lista = plantillas.data ?? [];
  const activa: string | 'nueva' =
    seleccion === 'nueva' ? 'nueva' : ((lista.find((p) => p._id === seleccion) ?? lista[0])?._id ?? 'nueva');
  const plantillaActual = activa === 'nueva' ? null : (lista.find((p) => p._id === activa) ?? null);

  return (
    <>
      {/* `@container`: el diálogo no lo es, y sin él el corte `@2xl` no se aplica nunca. */}
      <div className="@container">
      <div className="grid gap-5 @2xl:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-1">
          <Button variant="secondary" size="sm" onClick={() => setSeleccion('nueva')} className="mb-1 justify-start">
            <Plus className="size-3.5" aria-hidden />
            Nueva plantilla
          </Button>
          {plantillas.isSuccess && lista.length === 0 ? (
            <p className="px-2 py-3 text-caption text-muted">
              Todavía no tienes plantillas. Crea la primera con tu forma de calificar.
            </p>
          ) : null}
          {lista.map((plantilla) => (
            <button
              key={plantilla._id}
              type="button"
              onClick={() => setSeleccion(plantilla._id)}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                activa === plantilla._id ? 'bg-primary-soft text-primary' : 'text-text hover:bg-surface-alt',
              )}
            >
              <span className="text-body font-medium">{plantilla.name}</span>
              <span className="text-caption text-muted">{resumenDe(plantilla.componentes)}</span>
            </button>
          ))}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          <EditorPlantilla
            key={`editor-${activa}`}
            plantilla={plantillaActual}
            onSaved={(item) => setSeleccion(item._id)}
            {...(plantillaActual ? { onDelete: () => setBorrando(plantillaActual) } : {})}
          />

          {plantillaActual ? (
            <AplicarPlantilla
              key={`aplicar-${plantillaActual._id}`}
              plantilla={plantillaActual}
              period={period}
              subjects={subjects}
              groups={groups}
              {...(subjectId ? { subjectId } : {})}
              {...(groupId ? { groupId } : {})}
              onApply={(input) => aplicar.mutate(input)}
              loading={aplicar.isPending}
            />
          ) : null}

          <EstructurasAplicadas
            estructuras={estructuras.data ?? []}
            subjects={subjects}
            groups={groups}
            onRemove={(id) => retirar.mutate(id)}
            loading={retirar.isPending}
          />
        </section>
      </div>
      </div>

      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={(next) => !next && setBorrando(null)}
        title="¿Eliminar esta plantilla?"
        description={
          borrando
            ? `Se elimina «${borrando.name}». Los grupos donde ya está aplicada conservan su estructura: aplicar copia, no enlaza.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={borrar.isPending}
        onConfirm={() => {
          if (!borrando) return;
          borrar.mutate(borrando._id, {
            onSuccess: () => {
              setBorrando(null);
              setSeleccion(null);
            },
          });
        }}
      />
    </>
  );
}

/** Nombre y notas por componente. Su estado nace de la plantilla que recibe. */
function EditorPlantilla({
  plantilla,
  onSaved,
  onDelete,
}: {
  plantilla: PlantillaNotas | null;
  onSaved: (item: PlantillaNotas) => void;
  onDelete?: () => void;
}) {
  const guardar = useSaveTemplate();
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(plantilla));
  const [error, setError] = useState<string>();

  function editarComponente(tipo: ComponentType, cambio: (notas: NotaPlantilla[]) => NotaPlantilla[]) {
    setBorrador((actual) => ({
      ...actual,
      componentes: actual.componentes.map((c) => (c.tipo === tipo ? { ...c, notas: cambio(c.notas) } : c)),
    }));
  }

  function guardarPlantilla() {
    const problema = validar(borrador);
    if (problema) return setError(problema);
    setError(undefined);
    const datos: PlantillaNotasInput = {
      name: borrador.name.trim(),
      componentes: borrador.componentes.map((c) => ({
        tipo: c.tipo,
        notas: c.notas.map((n) => ({ label: n.label.trim(), weight: n.weight })),
      })),
    };
    guardar.mutate({ ...(plantilla ? { id: plantilla._id } : {}), datos }, { onSuccess: onSaved });
  }

  return (
    <>
      <div className="flex items-end gap-2">
        <Field label="Nombre" className="flex-1">
          {(props) => (
            <Input
              {...props}
              value={borrador.name}
              onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
              placeholder="Mi forma de calificar"
            />
          )}
        </Field>
        {onDelete ? (
          <Button variant="ghost" size="icon" aria-label={`Eliminar la plantilla ${plantilla?.name ?? ''}`} onClick={onDelete}>
            <Trash2 className="size-4 text-danger" aria-hidden />
          </Button>
        ) : null}
      </div>

      {borrador.componentes.map((componente) => {
        const meta = COMPONENTES.find((c) => c.tipo === componente.tipo)!;
        const pct = porcentajes(componente.notas);
        return (
          <div key={componente.tipo} className="rounded-lg border border-border bg-surface-alt/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-caption font-semibold text-text">
                {meta.label}
                <span className="ml-1.5 font-normal text-muted">{meta.peso} del corte</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => editarComponente(componente.tipo, (notas) => [...notas, { label: '', weight: 1 }])}
              >
                <Plus className="size-3.5" aria-hidden />
                Nota
              </Button>
            </div>
            {componente.notas.length === 0 ? (
              <p className="text-caption text-subtle">Sin notas fijas: se registran libremente, con peso 1.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {componente.notas.map((nota, indice) => (
                  <li key={indice} className="flex items-center gap-2">
                    <Input
                      value={nota.label}
                      onChange={(event) =>
                        editarComponente(componente.tipo, (notas) =>
                          notas.map((n, i) => (i === indice ? { ...n, label: event.target.value } : n)),
                        )
                      }
                      placeholder={meta.ejemplo}
                      aria-label={`Nombre de la nota ${indice + 1} de ${meta.label}`}
                      className="h-8 flex-1 text-caption"
                    />
                    <Input
                      value={String(nota.weight)}
                      onChange={(event) =>
                        editarComponente(componente.tipo, (notas) =>
                          notas.map((n, i) =>
                            i === indice ? { ...n, weight: Number(event.target.value.replace(',', '.')) } : n,
                          ),
                        )
                      }
                      inputMode="decimal"
                      aria-label={`Peso de la nota ${indice + 1} de ${meta.label}`}
                      title="Peso relativo. Ejemplo: 60 y 40, o 3 y 2."
                      className="h-8 w-16 text-caption"
                    />
                    <span className="w-10 text-right font-mono text-caption tabular-nums text-muted">
                      {pct[indice] ?? 0}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar esta nota"
                      onClick={() =>
                        editarComponente(componente.tipo, (notas) => notas.filter((_, i) => i !== indice))
                      }
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {error ? <p className="text-caption text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={guardarPlantilla} loading={guardar.isPending}>
          <Check className="size-4" aria-hidden />
          {plantilla ? 'Guardar cambios' : 'Crear plantilla'}
        </Button>
      </div>
    </>
  );
}

/** Elegir materia, grupo y cortes, y aplicar. */
function AplicarPlantilla({
  plantilla,
  period,
  subjects,
  groups,
  subjectId,
  groupId,
  onApply,
  loading,
}: {
  plantilla: PlantillaNotas;
  period: string;
  subjects: Materia[];
  groups: Grupo[];
  subjectId?: string;
  groupId?: string;
  onApply: (input: EstructuraNotasInput) => void;
  loading: boolean;
}) {
  const [materia, setMateria] = useState(subjectId ?? subjects[0]?._id ?? '');
  const [grupo, setGrupo] = useState(groupId ?? '');
  const [cortes, setCortes] = useState<CutNumber[]>(CORTES);

  const gruposDeMateria = useMemo(
    () =>
      groups
        .filter((g) => g.subjectId === materia)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [groups, materia],
  );
  const grupoElegido = gruposDeMateria.some((g) => g._id === grupo) ? grupo : '';

  function alternarCorte(corte: CutNumber) {
    setCortes((actual) =>
      actual.includes(corte) ? actual.filter((c) => c !== corte) : [...actual, corte].sort(),
    );
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary-soft/40 p-3">
      <p className="mb-2 flex items-center gap-2 text-caption font-semibold text-text">
        <Copy className="size-3.5 text-primary" aria-hidden />
        Aplicar «{plantilla.name}» en {period}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Materia" className="min-w-52 flex-1">
          {(props) => (
            <NativeSelect
              {...props}
              value={materia}
              onChange={(event) => {
                setMateria(event.target.value);
                setGrupo('');
              }}
            >
              {subjects.map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.code})
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Grupo" className="w-44">
          {(props) => (
            <NativeSelect {...props} value={grupoElegido} onChange={(event) => setGrupo(event.target.value)}>
              <option value="">Todos los grupos</option>
              {gruposDeMateria.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-medium text-text">Cortes</span>
          <div className="flex gap-1">
            {CORTES.map((corte) => (
              <button
                key={corte}
                type="button"
                aria-pressed={cortes.includes(corte)}
                onClick={() => alternarCorte(corte)}
                className={cn(
                  'h-9 w-9 rounded-md border text-caption font-semibold transition-colors',
                  cortes.includes(corte)
                    ? 'border-primary bg-primary text-on-primary'
                    : 'border-border bg-surface text-muted hover:bg-surface-alt',
                )}
              >
                {corte}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="primary"
          disabled={!materia || cortes.length === 0}
          loading={loading}
          onClick={() =>
            onApply({
              subjectId: materia,
              groupId: grupoElegido || null,
              period,
              plantillaId: plantilla._id,
              nombre: plantilla.name,
              cortes: cortes.map((corte) => ({ corte, componentes: plantilla.componentes })),
            })
          }
        >
          Aplicar
        </Button>
      </div>
      <p className="mt-2 text-caption text-muted">
        {subjects.length === 0
          ? `No tienes materias en ${period}: elige otro periodo en la pantalla de notas para aplicarla.`
          : 'Aplicar copia la plantilla al grupo: cambiarla después no altera lo ya aplicado. Una estructura de grupo manda sobre la de la materia.'}
      </p>
    </div>
  );
}

/** Lo que ya está aplicado en el periodo, con opción de retirarlo. */
function EstructurasAplicadas({
  estructuras,
  subjects,
  groups,
  onRemove,
  loading,
}: {
  estructuras: EstructuraNotas[];
  subjects: Materia[];
  groups: Grupo[];
  onRemove: (id: string) => void;
  loading: boolean;
}) {
  if (estructuras.length === 0) {
    return (
      <EmptyState
        title="Ninguna plantilla aplicada en este periodo"
        message="Elige una plantilla y aplícala a una materia para que el desglose te proponga las notas que faltan."
      />
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-semibold text-text">Aplicadas en este periodo</span>
      <ul className="flex flex-col gap-1">
        {estructuras.map((estructura) => {
          const materia = subjects.find((s) => s._id === estructura.subjectId);
          const grupo = estructura.groupId ? groups.find((g) => g._id === estructura.groupId) : null;
          return (
            <li key={estructura._id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-caption text-text">
                {materia ? `${materia.name} (${materia.code})` : 'Materia'}
                <span className="text-muted"> · {grupo ? grupo.name : 'todos los grupos'}</span>
                {estructura.nombre ? <span className="text-muted"> · {estructura.nombre}</span> : null}
              </span>
              <Badge tone="neutral">cortes {estructura.cortes.map((c) => c.corte).join(', ')}</Badge>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Retirar esta plantilla del grupo"
                disabled={loading}
                onClick={() => onRemove(estructura._id)}
              >
                <Trash2 className="size-3.5 text-danger" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
