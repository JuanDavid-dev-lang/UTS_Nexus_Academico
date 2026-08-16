import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button, DataTable, Dialog, DialogContent, DialogFooter, type Column } from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { reportRepository } from '@/infrastructure/repositories/insights.repository';
import type { ReportFormat, Scope } from '@/domain/repositories/ports';

/**
 * Vista previa del reporte de asistencia.
 *
 * Muestra EXACTAMENTE las filas que saldrán en el PDF/Excel: el backend las
 * construye con el mismo catálogo de columnas que usa para generar el archivo,
 * así que aquí no se mapea ni se recalcula nada — solo se pintan.
 */

type Fila = { id: string; celdas: string[] };

export function AttendancePreviewDialog({
  open,
  onOpenChange,
  scope,
  onDownload,
  downloading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: Scope;
  onDownload: (format: ReportFormat) => void;
  downloading: boolean;
}) {
  const preview = useQuery({
    queryKey: queryKeys.reports.previewAttendance(scope),
    queryFn: () => reportRepository.previewAttendance(scope),
    enabled: open,
  });

  const headers = preview.data?.headers ?? [];
  const filas: Fila[] = (preview.data?.rows ?? []).map((celdas, indice) => ({
    // El backend no manda un id por fila (son filas de un acta, no documentos);
    // el índice es estable dentro de una misma respuesta.
    id: String(indice),
    celdas,
  }));

  const columns: Column<Fila>[] = headers.map((header, indice) => ({
    key: `col-${indice}`,
    header,
    cell: (fila) => fila.celdas[indice] ?? '',
    sortValue: (fila) => fila.celdas[indice] ?? '',
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Vista previa de asistencia"
        description="Lo que ves aquí es exactamente lo que saldrá en el archivo."
        className="max-w-4xl"
      >
        {preview.isPending ? (
          <p className="text-body text-muted">Generando vista previa…</p>
        ) : preview.isError ? (
          <p className="text-body text-muted">No se pudo cargar la vista previa.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <DataTable
              rows={filas}
              columns={columns}
              getRowId={(fila) => fila.id}
              emptyTitle="Sin asistencia registrada"
              emptyMessage="No hay marcas de asistencia con los filtros elegidos."
              maxHeight="50vh"
            />
            {preview.data?.truncado ? (
              <p className="text-caption text-muted">
                Mostrando las primeras {filas.length} filas de {preview.data.total}. El archivo
                descargado incluye todas.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            variant="secondary"
            onClick={() => onDownload('pdf')}
            loading={downloading}
            disabled={preview.isPending || !filas.length}
          >
            <FileText aria-hidden />
            Descargar PDF
          </Button>
          <Button
            variant="secondary"
            onClick={() => onDownload('excel')}
            loading={downloading}
            disabled={preview.isPending || !filas.length}
          >
            <FileSpreadsheet aria-hidden />
            Descargar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
