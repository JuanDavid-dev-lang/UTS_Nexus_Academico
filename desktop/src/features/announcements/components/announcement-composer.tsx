import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Megaphone, Users } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
  NativeSelect,
  Textarea,
} from '@/shared/ui';
import { avisoRepository, registroRepository } from '@/infrastructure/repositories/academic.repository';
import type { FacultadId, SedeId, TipoAviso } from '@/domain/schemas/academic';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/** Mínimos que exige el backend. Repetirlos aquí es lo que permite decirlos antes. */
const MINIMO_TITULO = 4;
const MINIMO_CUERPO = 10;

const VACIO = {
  titulo: '',
  cuerpo: '',
  tipo: 'INFORMATIVO' as TipoAviso,
  sedes: [] as SedeId[],
  facultades: [] as FacultadId[],
  programas: [] as string[],
  fijado: false,
};

/**
 * Redacción de un aviso.
 *
 * El alcance se acota por sede, facultad y programa, y los tres se combinan
 * con Y. Dejar un criterio sin marcar significa «cualquiera», que es lo que
 * hace que un aviso sin filtros llegue a toda la institución. Se dice en la
 * pantalla en vez de dejarlo a la intuición: la diferencia entre avisar a una
 * facultad y avisar a todo el mundo no debería descubrirse después de enviar.
 */
export function AnnouncementComposer({ open, onOpenChange }: Props) {
  const [valores, setValores] = useState(VACIO);
  const queryClient = useQueryClient();

  const catalogo = useQuery({
    queryKey: ['registro', 'catalogo'],
    queryFn: () => registroRepository.catalogo(),
    enabled: open,
  });

  const programasVisibles = useMemo(() => {
    if (!catalogo.data) return [];
    if (valores.facultades.length === 0) return catalogo.data.programas;
    return catalogo.data.programas.filter(p => valores.facultades.includes(p.facultad));
  }, [catalogo.data, valores.facultades]);

  const publicar = useMutation({
    mutationFn: () => avisoRepository.create(valores),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
      toast.success('Aviso publicado');
      setValores(VACIO);
      onOpenChange(false);
    },
    onError: causa => toast.fromError(causa, 'No se pudo publicar'),
  });

  const alcance = useMemo(() => {
    const partes: string[] = [];
    if (valores.sedes.length) partes.push(`${valores.sedes.length} sede(s)`);
    if (valores.facultades.length) partes.push(`${valores.facultades.length} facultad(es)`);
    if (valores.programas.length) partes.push(`${valores.programas.length} programa(s)`);
    return partes.length === 0 ? 'Toda la institución' : partes.join(' + ');
  }, [valores]);

  // Cuántos docentes cumplen de verdad los tres criterios. Contar sedes,
  // facultades y programas marcados no dice nada: se combinan con Y, así que
  // marcar más casillas puede reducir el alcance a cero.
  const destinatarios = useQuery({
    queryKey: [
      ...queryKeys.announcements.all,
      'destinatarios',
      valores.sedes,
      valores.facultades,
      valores.programas,
    ],
    queryFn: () =>
      avisoRepository.destinatarios({
        sedes: valores.sedes,
        facultades: valores.facultades,
        programas: valores.programas,
      }),
    enabled: open,
    // Cada casilla que se marca cambia la clave. Sin conservar el recuento
    // anterior, la línea desaparece y reaparece en cada clic y el bloque salta.
    placeholderData: previo => previo,
  });

  const tituloCorto = valores.titulo.trim().length < MINIMO_TITULO;
  const cuerpoCorto = valores.cuerpo.trim().length < MINIMO_CUERPO;

  /**
   * Por qué no se puede publicar todavía.
   *
   * El botón se deshabilitaba sin decir nada y el motivo real —el contenido no
   * llega al mínimo— no estaba escrito en ninguna parte de la pantalla.
   */
  const impedimento = tituloCorto
    ? `El título necesita al menos ${MINIMO_TITULO} caracteres.`
    : cuerpoCorto
      ? `El contenido necesita al menos ${MINIMO_CUERPO} caracteres.`
      : null;

  function alternar<T extends string>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor];
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Publicar un aviso"
        description="Lo verán los docentes que cumplan todos los criterios que marques."
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          {/* El requisito se enseña desde el principio como pista y solo pasa a
              error cuando ya se escribió algo: señalar en rojo un campo que
              todavía no se ha tocado es regañar por no haber empezado. */}
          <Field
            label="Título"
            required
            hint={`Mínimo ${MINIMO_TITULO} caracteres.`}
            error={valores.titulo.length > 0 && tituloCorto ? `Faltan caracteres: mínimo ${MINIMO_TITULO}.` : undefined}
          >
            {props => (
              <Input
                {...props}
                value={valores.titulo}
                onChange={e => setValores(v => ({ ...v, titulo: e.target.value }))}
                placeholder="Cierre de notas del segundo corte"
              />
            )}
          </Field>

          <Field
            label="Contenido"
            required
            hint={`Mínimo ${MINIMO_CUERPO} caracteres.`}
            error={valores.cuerpo.length > 0 && cuerpoCorto ? `Faltan caracteres: mínimo ${MINIMO_CUERPO}.` : undefined}
          >
            {props => (
              <Textarea
                {...props}
                rows={5}
                value={valores.cuerpo}
                onChange={e => setValores(v => ({ ...v, cuerpo: e.target.value }))}
                placeholder="Escribe aquí el aviso completo…"
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              {props => (
                <NativeSelect
                  {...props}
                  value={valores.tipo}
                  onChange={e => setValores(v => ({ ...v, tipo: e.target.value as TipoAviso }))}
                >
                  <option value="INFORMATIVO">Informativo</option>
                  <option value="IMPORTANTE">Importante</option>
                  <option value="URGENTE">Urgente</option>
                </NativeSelect>
              )}
            </Field>

            <label className="flex items-end gap-2 pb-2 text-body">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={valores.fijado}
                onChange={e => setValores(v => ({ ...v, fijado: e.target.checked }))}
              />
              Fijar arriba del listado
            </label>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 flex items-center gap-2 text-caption font-semibold text-text">
              <Users className="size-4" aria-hidden />
              Quién lo va a ver: <span className="font-normal text-primary">{alcance}</span>
            </p>
            <p className="mb-3 text-caption text-muted">
              Sin marcar nada llega a todos. Cada criterio que marcas lo restringe más, y se
              combinan entre sí: sede <em>y</em> facultad, no sede <em>o</em> facultad.
            </p>

            {destinatarios.data && (
              <p
                className={`mb-3 flex items-center gap-1.5 text-caption ${
                  destinatarios.data.alcanzados === 0 ? 'text-danger' : 'text-muted'
                }`}
              >
                {destinatarios.data.alcanzados === 0 ? (
                  <>
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                    Con este alcance no lo recibiría ningún docente. Suelta algún criterio.
                  </>
                ) : (
                  <>
                    Lo recibirán <strong className="font-semibold text-text">
                      {destinatarios.data.alcanzados}
                    </strong>{' '}
                    de {destinatarios.data.total} docentes.
                  </>
                )}
              </p>
            )}

            {catalogo.data && (
              <div className="flex flex-col gap-3">
                <Grupo titulo="Sedes">
                  {catalogo.data.sedes.map(s => (
                    <Casilla
                      key={s.id}
                      etiqueta={s.nombre}
                      marcada={valores.sedes.includes(s.id as SedeId)}
                      onChange={() =>
                        setValores(v => ({ ...v, sedes: alternar(v.sedes, s.id as SedeId) }))
                      }
                    />
                  ))}
                </Grupo>

                <Grupo titulo="Facultades">
                  {catalogo.data.facultades.map(f => (
                    <Casilla
                      key={f.id}
                      etiqueta={f.nombre}
                      marcada={valores.facultades.includes(f.id as FacultadId)}
                      onChange={() =>
                        setValores(v => {
                          const facultades = alternar(v.facultades, f.id as FacultadId);
                          // Al cambiar de facultad se sueltan los programas que
                          // ya no pertenecen a ninguna de las marcadas.
                          const validos = catalogo.data.programas
                            .filter(p => facultades.length === 0 || facultades.includes(p.facultad))
                            .map(p => p.id);
                          return {
                            ...v,
                            facultades,
                            programas: v.programas.filter(id => validos.includes(id)),
                          };
                        })
                      }
                    />
                  ))}
                </Grupo>

                <Grupo titulo={`Programas (${programasVisibles.length})`}>
                  <div className="flex max-h-40 w-full flex-col gap-1 overflow-y-auto">
                    {programasVisibles.map(p => (
                      <Casilla
                        key={p.id}
                        etiqueta={p.nombre}
                        marcada={valores.programas.includes(p.id)}
                        onChange={() =>
                          setValores(v => ({ ...v, programas: alternar(v.programas, p.id) }))
                        }
                      />
                    ))}
                  </div>
                </Grupo>
              </div>
            )}
          </div>

          <DialogFooter>
            {impedimento && (
              <p className="mr-auto flex items-center gap-1.5 text-caption text-muted">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                {impedimento}
              </p>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={publicar.isPending}
              disabled={publicar.isPending || impedimento !== null}
              onClick={() => publicar.mutate()}
            >
              <Megaphone className="size-4" aria-hidden />
              Publicar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-caption font-semibold text-muted">{titulo}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function Casilla({
  etiqueta,
  marcada,
  onChange,
}: {
  etiqueta: string;
  marcada: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body">
      <input type="checkbox" className="size-4 accent-primary" checked={marcada} onChange={onChange} />
      {etiqueta}
    </label>
  );
}
