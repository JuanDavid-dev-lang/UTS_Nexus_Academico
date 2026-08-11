import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import {
  Button,
  Card,
  ErrorState,
  NativeSelect,
  PageContainer,
  PageHeader,
  SkeletonList,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import { Kbd } from '@/shared/ui/primitives';
import { useHotkeys } from '@/shared/hooks/use-hotkeys';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { NextClassCard } from '@/features/agenda/components/next-class-card';
import { WeekView } from '@/features/agenda/components/week-view';
import { DayView } from '@/features/agenda/components/day-view';
import { MonthView } from '@/features/agenda/components/month-view';
import { UpcomingView } from '@/features/agenda/components/upcoming-view';
import { ItemDialog } from '@/features/agenda/components/item-dialog';
import { EventDialog, type EventoEditable } from '@/features/agenda/components/event-dialog';
import { useAgendaRange, useAhora } from '@/features/agenda/hooks/use-agenda';
import {
  agruparPorFecha,
  esHoy,
  fechaCampus,
  navegar,
  tituloDeVista,
  OFFSET_CAMPUS_POR_DEFECTO,
  type VistaAgenda,
} from '@/domain/agenda/calendar';
import type { AgendaItem } from '@/domain/schemas/agenda';

const VISTAS: { valor: VistaAgenda; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'proximas', etiqueta: 'Próximas' },
];

/**
 * Agenda académica.
 *
 * La vista semanal es la principal porque es como se piensa un horario docente:
 * "los martes a las diez". Las clases llegan del backend ya expandidas a
 * ocurrencias con fecha; esta pantalla nunca calcula a qué hora es una clase.
 */
export default function AgendaPage() {
  const [vista, setVista] = useState<VistaAgenda>('semana');
  const [ancla, setAncla] = useState(() => new Date());
  const [subjectId, setSubjectId] = useState('');
  const [seleccionado, setSeleccionado] = useState<AgendaItem | null>(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [eventoEditado, setEventoEditado] = useState<EventoEditable | undefined>();

  const [searchParams, setSearchParams] = useSearchParams();
  const ahora = useAhora(30_000);
  const subjects = useSubjects();

  const agenda = useAgendaRange(vista, ancla, subjectId ? { subjectId } : {});
  const items = useMemo(() => agenda.data?.items ?? [], [agenda.data]);
  const offset = agenda.data?.campusOffsetMinutes ?? OFFSET_CAMPUS_POR_DEFECTO;

  /**
   * Enlace profundo desde una notificación: `/agenda?item=class:<id>:<fecha>`.
   *
   * Al tocar el aviso del sistema, la pantalla tiene que abrir ESA clase, no la
   * agenda genérica; si no, el docente vuelve a buscar lo que el aviso ya sabía.
   */
  const itemBuscado = searchParams.get('item');
  useEffect(() => {
    if (!itemBuscado || items.length === 0) return;
    const encontrado = items.find((item) => item.id === itemBuscado);
    if (!encontrado) return;
    setSeleccionado(encontrado);
    // Se limpia el parámetro para que volver atrás no reabra el diálogo.
    const siguiente = new URLSearchParams(searchParams);
    siguiente.delete('item');
    setSearchParams(siguiente, { replace: true });
  }, [itemBuscado, items, searchParams, setSearchParams]);

  const irAHoy = useCallback(() => setAncla(new Date()), []);
  const mover = useCallback(
    (pasos: number) => setAncla((actual) => navegar(vista, actual, pasos, offset)),
    [vista, offset],
  );

  function abrirNuevo() {
    setEventoEditado(undefined);
    setEditorAbierto(true);
  }

  function editar(item: AgendaItem) {
    setSeleccionado(null);
    setEventoEditado({
      id: item.sourceId,
      title: item.title,
      description: item.description,
      type: item.type as EventoEditable['type'],
      startAt: item.startAt,
      endAt: item.durationMinutes > 0 ? item.endAt : null,
      subjectId: item.subjectId,
      location: item.classroom,
      priority: item.priority,
      reminderMinutes: item.reminderMinutes,
    });
    setEditorAbierto(true);
  }

  // Atajos: navegación con flechas, `t` para hoy, `n` para un evento nuevo, y
  // las iniciales de cada vista. No usan modificador porque no compiten con
  // ningún atajo del sistema y esta pantalla se recorre con una sola mano.
  useHotkeys({
    // `useHotkeys` normaliza con `event.key.toLowerCase()`, así que las teclas
    // se declaran en minúscula: 'ArrowLeft' no llegaría a coincidir nunca.
    arrowleft: () => mover(-1),
    arrowright: () => mover(1),
    t: irAHoy,
    n: abrirNuevo,
    d: () => setVista('dia'),
    s: () => setVista('semana'),
    m: () => setVista('mes'),
    p: () => setVista('proximas'),
  });

  const itemsDelDia = useMemo(() => {
    if (vista !== 'dia') return items;
    const clave = fechaCampus(ancla, offset);
    return agruparPorFecha(items).get(clave) ?? [];
  }, [vista, items, ancla, offset]);

  const titulo = tituloDeVista(vista, ancla, offset);
  const enHoy = vista === 'proximas' || esHoy(ancla, offset, ahora);

  return (
    <PageContainer>
      <PageHeader
        title="Agenda"
        subtitle="Tus clases, evaluaciones, entregas y eventos en un solo sitio"
        actions={
          <Button variant="primary" onClick={abrirNuevo}>
            <CalendarPlus aria-hidden />
            Nuevo evento
            <Kbd className="ml-1">N</Kbd>
          </Button>
        }
      />

      <NextClassCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mover(-1)}
            aria-label="Anterior"
            disabled={vista === 'proximas'}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => mover(1)}
            aria-label="Siguiente"
            disabled={vista === 'proximas'}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button variant={enHoy ? 'ghost' : 'secondary'} onClick={irAHoy} disabled={enHoy}>
            <RotateCcw aria-hidden />
            Hoy
          </Button>
          <h2 className="ml-1 text-h3 font-semibold capitalize text-text">{titulo}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            value={subjectId}
            onChange={(evento) => setSubjectId(evento.target.value)}
            aria-label="Filtrar por materia"
            className="w-56"
          >
            <option value="">Todas las materias</option>
            {(subjects.data ?? []).map((materia) => (
              <option key={materia._id} value={materia._id}>
                {materia.name} · {materia.period}
              </option>
            ))}
          </NativeSelect>

          <Tabs value={vista} onValueChange={(valor) => setVista(valor as VistaAgenda)}>
            <TabsList>
              {VISTAS.map((opcion) => (
                <TabsTrigger key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {agenda.isPending ? (
        <SkeletonList rows={6} />
      ) : agenda.isError ? (
        <Card>
          <ErrorState error={agenda.error} onRetry={() => void agenda.refetch()} />
        </Card>
      ) : vista === 'semana' ? (
        <WeekView items={items} ancla={ancla} offset={offset} ahora={ahora} onSelect={setSeleccionado} />
      ) : vista === 'mes' ? (
        <MonthView
          items={items}
          ancla={ancla}
          offset={offset}
          ahora={ahora}
          onSelect={setSeleccionado}
          onSelectDay={(fecha) => {
            setAncla(fecha);
            setVista('dia');
          }}
        />
      ) : vista === 'dia' ? (
        <DayView items={itemsDelDia} offset={offset} onSelect={setSeleccionado} />
      ) : (
        <UpcomingView items={items} offset={offset} ahora={ahora} onSelect={setSeleccionado} />
      )}

      <p className="text-caption text-muted">
        Atajos: <Kbd>←</Kbd> <Kbd>→</Kbd> navegar · <Kbd>T</Kbd> hoy · <Kbd>D</Kbd>/<Kbd>S</Kbd>/<Kbd>M</Kbd>/
        <Kbd>P</Kbd> cambiar de vista · <Kbd>N</Kbd> nuevo evento.
      </p>

      <ItemDialog
        item={seleccionado}
        offset={offset}
        onOpenChange={(abierto) => {
          if (!abierto) setSeleccionado(null);
        }}
        onEditar={editar}
      />

      <EventDialog
        open={editorAbierto}
        onOpenChange={setEditorAbierto}
        offset={offset}
        fechaSugerida={fechaCampus(ancla, offset)}
        evento={eventoEditado}
      />
    </PageContainer>
  );
}
