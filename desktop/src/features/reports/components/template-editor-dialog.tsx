import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  Input,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { reportRepository } from '@/infrastructure/repositories/insights.repository';
import { profileRepository } from '@/infrastructure/repositories/profile.repository';
import { toast } from '@/state/toast.store';
import type {
  ReportColumnOption,
  ReportTemplate,
} from '@/domain/schemas/insights';

/**
 * Editor de la plantilla de reportes (solo ADMIN).
 *
 * Personaliza el membrete (institución, sigla, logo), los colores del
 * documento y qué columnas salen por tipo de reporte. Los colores de aquí son
 * contenido del PDF/Excel —el membrete del acta en papel—, no interfaz de la
 * app, por eso no pasan por los tokens del design system.
 *
 * El catálogo de columnas viaja desde el servidor: los checkboxes muestran
 * exactamente las columnas que existen, sin listas duplicadas.
 */

const TIPOS: { kind: 'consolidado' | 'grades' | 'attendance'; label: string }[] = [
  { kind: 'consolidado', label: 'Consolidado académico' },
  { kind: 'grades', label: 'Detalle de notas' },
  { kind: 'attendance', label: 'Asistencia' },
];

export function TemplateEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [borrador, setBorrador] = useState<ReportTemplate | null>(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);

  const template = useQuery({
    queryKey: queryKeys.reports.template(),
    queryFn: () => reportRepository.getTemplate(),
    enabled: open,
  });

  // El borrador parte de lo guardado cada vez que se abre con datos frescos.
  useEffect(() => {
    if (open && template.data) setBorrador(template.data.plantilla);
  }, [open, template.data]);

  const guardar = useMutation({
    mutationFn: (plantilla: ReportTemplate) => reportRepository.saveTemplate(plantilla),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.reports.all] });
      toast.success('Plantilla guardada', 'Los próximos reportes saldrán con este formato.');
      onOpenChange(false);
    },
    onError(error) {
      toast.fromError(error, 'No se pudo guardar la plantilla');
    },
  });

  async function subirLogo(file: File) {
    setSubiendoLogo(true);
    try {
      const url = await profileRepository.uploadImage(file);
      setBorrador((actual) => (actual ? { ...actual, logoUrl: url } : actual));
    } catch (error) {
      toast.fromError(error, 'No se pudo subir el logo');
    } finally {
      setSubiendoLogo(false);
    }
  }

  function toggleColumna(kind: 'consolidado' | 'grades' | 'attendance', key: string) {
    setBorrador((actual) => {
      if (!actual) return actual;
      const disponibles = template.data?.columnasDisponibles[kind] ?? [];
      // Sin selección guardada = todas visibles; el primer clic parte de ahí.
      const visibles = actual.columnas[kind] ?? disponibles.map((col) => col.key);
      const nuevas = visibles.includes(key)
        ? visibles.filter((k) => k !== key)
        : [...visibles, key];
      return { ...actual, columnas: { ...actual.columnas, [kind]: nuevas } };
    });
  }

  function columnaVisible(kind: 'consolidado' | 'grades' | 'attendance', key: string) {
    if (!borrador) return true;
    const visibles = borrador.columnas[kind];
    return !visibles || visibles.includes(key);
  }

  const cargando = template.isPending || !borrador;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Plantilla de reportes"
        description="Membrete, colores y columnas de los PDF y Excel exportados."
        className="max-w-2xl"
      >
        {cargando ? (
          <p className="text-body text-muted">Cargando plantilla…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field label="Institución">
                {(props) => (
                  <Input
                    {...props}
                    value={borrador.institucion}
                    onChange={(event) =>
                      setBorrador({ ...borrador, institucion: event.target.value })
                    }
                  />
                )}
              </Field>
              <Field label="Sigla del membrete">
                {(props) => (
                  <Input
                    {...props}
                    value={borrador.sigla}
                    maxLength={6}
                    onChange={(event) => setBorrador({ ...borrador, sigla: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <div className="flex items-end gap-3">
              <Field label="Logo (opcional)" className="flex-1">
                {(props) => (
                  <div className="flex items-center gap-2">
                    <input
                      id={props.id}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void subirLogo(file);
                        event.target.value = '';
                      }}
                    />
                    <Button
                      variant="secondary"
                      loading={subiendoLogo}
                      onClick={() => document.getElementById(props.id)?.click()}
                    >
                      <Upload aria-hidden />
                      {borrador.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                    </Button>
                    {borrador.logoUrl ? (
                      <Button
                        variant="ghost"
                        onClick={() => setBorrador({ ...borrador, logoUrl: null })}
                      >
                        Quitar
                      </Button>
                    ) : (
                      <span className="text-caption text-muted">
                        Sin logo se usa el recuadro con la sigla.
                      </span>
                    )}
                  </div>
                )}
              </Field>
            </div>

            <div className="grid gap-3 @md:grid-cols-3">
              <ColorField
                label="Color del membrete"
                value={borrador.colores.marca}
                onChange={(marca) =>
                  setBorrador({ ...borrador, colores: { ...borrador.colores, marca } })
                }
              />
              <ColorField
                label="Encabezado tablas PDF"
                value={borrador.colores.encabezadoTabla}
                onChange={(encabezadoTabla) =>
                  setBorrador({ ...borrador, colores: { ...borrador.colores, encabezadoTabla } })
                }
              />
              <ColorField
                label="Encabezado Excel"
                value={borrador.colores.encabezadoExcel}
                onChange={(encabezadoExcel) =>
                  setBorrador({ ...borrador, colores: { ...borrador.colores, encabezadoExcel } })
                }
              />
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-body font-semibold text-text">Columnas por reporte</p>
              <p className="text-caption text-muted">
                La cédula no se puede quitar: un acta sin forma de identificar al estudiante no
                sirve. Si una selección la pierde, el reporte sale completo.
              </p>
              {TIPOS.map(({ kind, label }) => (
                <ColumnPicker
                  key={kind}
                  label={label}
                  options={template.data?.columnasDisponibles[kind] ?? []}
                  isChecked={(key) => columnaVisible(kind, key)}
                  onToggle={(key) => toggleColumna(kind, key)}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => borrador && guardar.mutate(borrador)}
            loading={guardar.isPending}
            disabled={cargando}
          >
            Guardar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {(props) => (
        <div className="flex items-center gap-2">
          <input
            id={props.id}
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent"
          />
          <span className="text-caption text-muted">{value}</span>
        </div>
      )}
    </Field>
  );
}

function ColumnPicker({
  label,
  options,
  isChecked,
  onToggle,
}: {
  label: string;
  options: ReportColumnOption[];
  isChecked: (key: string) => boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-center gap-1.5 text-body text-text">
            <input
              type="checkbox"
              checked={isChecked(option.key)}
              disabled={option.key === 'code'}
              onChange={() => onToggle(option.key)}
              className="accent-[var(--accent)]"
            />
            {option.header}
          </label>
        ))}
      </div>
    </div>
  );
}
