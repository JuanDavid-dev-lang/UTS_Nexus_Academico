import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/cn';
import { toIsoDate } from '@/shared/lib/format';
import { reportRepository } from '@/infrastructure/repositories/insights.repository';
import { platform } from '@/core/platform/tauri';
import { toast } from '@/state/toast.store';
import type { ReportFormat } from '@/domain/repositories/ports';

type Props = {
  /** Qué se exporta: el consolidado de notas o la asistencia. */
  kind: 'grades' | 'attendance';
  period: string;
  subjectId?: string | undefined;
  groupId?: string | undefined;
  /** Código de la materia, para el nombre del archivo. */
  subjectCode?: string | undefined;
};

const FORMATOS: { format: ReportFormat; label: string; ext: string; Icono: typeof FileText }[] = [
  { format: 'excel', label: 'Excel (.xlsx)', ext: 'xlsx', Icono: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', ext: 'pdf', Icono: FileText },
];

const itemClass = cn(
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text outline-none',
  'transition-colors data-[highlighted]:bg-surface-alt',
);

/**
 * Exportar lo que hay en pantalla, desde la propia pantalla.
 *
 * Es el mismo informe que la página de Reportes (`/reports/{pdf|excel}/...`),
 * con el periodo, la materia y el grupo ya elegidos. En la versión web es la
 * única forma de exportar: Reportes está en la aplicación, y los exportes de
 * notas y asistencia son lo único de ese módulo que la web deja pasar.
 */
export function ExportButton({ kind, period, subjectId, groupId, subjectCode }: Props) {
  const descarga = useMutation({
    mutationFn: async ({ format, ext }: { format: ReportFormat; ext: string }) => {
      const blob = await reportRepository.download(format, kind, { period, subjectId, groupId });
      const nombre = kind === 'grades' ? 'notas' : 'asistencia';
      const materia = subjectCode ? `-${subjectCode}` : '';
      const fileName = `UTS-${nombre}-${period}${materia}-${toIsoDate()}.${ext}`;
      return { path: await platform.files.saveDownload(fileName, blob), fileName };
    },
    onSuccess({ path, fileName }) {
      // En el navegador el archivo ya lo gestiona su barra de descargas: no
      // hay carpeta que abrir.
      if (!platform.isDesktop) {
        toast.success('Exportación lista', fileName);
        return;
      }
      toast.withAction('success', 'Exportación lista', fileName, {
        label: 'Abrir carpeta',
        onClick: () => void platform.files.reveal(path),
      });
    },
    onError(error) {
      toast.fromError(error, 'No se pudo exportar');
    },
  });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" loading={descarga.isPending}>
          <Download aria-hidden />
          Exportar
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-pop"
        >
          {FORMATOS.map(({ format, label, ext, Icono }) => (
            <DropdownMenu.Item
              key={format}
              className={itemClass}
              onSelect={() => descarga.mutate({ format, ext })}
            >
              <Icono className="size-4 text-muted" aria-hidden />
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
