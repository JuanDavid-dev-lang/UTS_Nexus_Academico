import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { Badge, Button, Dialog, DialogContent, DialogFooter } from '@/shared/ui';
import { agendaRepository } from '@/infrastructure/repositories/agenda.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import type { InstitutionalImportRow, InstitutionalPreview } from '@/domain/schemas/agenda';

const tone = { VALID: 'success', CONFLICT: 'warning', DUPLICATE: 'neutral', SKIPPED: 'neutral', ERROR: 'danger' } as const;
const label = { VALID: 'Válida', CONFLICT: 'Conflicto', DUPLICATE: 'Duplicada', SKIPPED: 'Omitida', ERROR: 'Error' } as const;

export function InstitutionalCalendarImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const input = useRef<HTMLInputElement>(null); const queryClient = useQueryClient();
  const [preview, setPreview] = useState<InstitutionalPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const scan = useMutation({ mutationFn: agendaRepository.previewInstitutional, onSuccess(data) { setPreview(data); setSelected(new Set(data.rows.filter(r => r.status === 'VALID').map(r => r.externalKey))); }, onError(error) { toast.fromError(error, 'No se pudo validar el calendario'); } });
  const confirm = useMutation({ mutationFn: (rows: InstitutionalImportRow[]) => agendaRepository.confirmInstitutional(rows.map(({ title, description, startDate, endDate, location, period }) => ({ title, description, startDate, endDate, location, period }))), onSuccess(data) { void queryClient.invalidateQueries({ queryKey: queryKeys.agenda.all }); toast.success('Calendario importado', `${data.created} evento(s) creados; ${data.omitted} omitidos.`); close(); }, onError(error) { toast.fromError(error, 'No se pudo confirmar la importación'); } });
  function close() { setPreview(null); setSelected(new Set()); onOpenChange(false); }
  const rows = preview?.rows ?? []; const validSelected = rows.filter(r => r.status === 'VALID' && selected.has(r.externalKey));
  return <Dialog open={open} onOpenChange={next => !next && close()}>
    <DialogContent title="Importar calendario institucional · Beta" description="Primero validamos el archivo. Nada se guarda hasta que confirmes la selección." className="max-w-4xl">
      <input ref={input} type="file" accept=".csv,.xlsx,.pdf" className="sr-only" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) scan.mutate(file); }} />
      {!preview ? <button type="button" disabled={scan.isPending} onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 hover:border-primary">
        <FileSpreadsheet className="size-7 text-muted" aria-hidden/><span className="text-body font-medium text-text">{scan.isPending ? 'Validando el archivo…' : 'Elegir CSV o Excel'}</span><span className="text-caption text-muted">Columnas: titulo, fecha_inicio, fecha_fin, descripcion, lugar y periodo. PDF muestra un diagnóstico y nunca se interpreta automáticamente.</span>
      </button> : <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">{Object.entries(preview.summary).map(([status,count]) => <Badge key={status} tone={tone[status as keyof typeof tone] ?? 'neutral'}>{label[status as keyof typeof label] ?? status}: {count}</Badge>)}</div>
        {!preview.capability.pdf && <p className="flex items-center gap-2 text-caption text-muted"><TriangleAlert className="size-4" aria-hidden/>{preview.capability.pdfMessage}</p>}
        <div className="max-h-96 overflow-auto rounded-lg border border-border"><table className="w-full text-caption"><thead className="sticky top-0 bg-surface-alt text-left"><tr><th className="p-2">Importar</th><th className="p-2">Estado</th><th className="p-2">Evento</th><th className="p-2">Fechas</th><th className="p-2">Detalle</th></tr></thead><tbody className="divide-y divide-border">{rows.map(row => <tr key={`${row.row}-${row.externalKey}`}><td className="p-2"><input aria-label={`Importar fila ${row.row}`} type="checkbox" checked={selected.has(row.externalKey)} disabled={row.status !== 'VALID'} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(row.externalKey); else next.delete(row.externalKey); return next; })}/></td><td className="p-2"><Badge tone={tone[row.status]}>{label[row.status]}</Badge></td><td className="p-2"><span className="block font-medium text-text">{row.title || `Fila ${row.row}`}</span><span className="text-muted">{row.location || 'Sin lugar'}</span></td><td className="p-2 tabular-nums text-text">{row.startDate || '—'}{row.endDate && row.endDate !== row.startDate ? ` → ${row.endDate}` : ''}</td><td className="max-w-64 p-2 text-muted">{row.messages.join(' ') || row.description || 'Lista para importar'}</td></tr>)}</tbody></table></div>
        <DialogFooter><Button variant="ghost" onClick={() => { setPreview(null); setSelected(new Set()); }}>Elegir otro archivo</Button><Button variant="primary" disabled={!validSelected.length || confirm.isPending} loading={confirm.isPending} onClick={() => confirm.mutate(validSelected)}><CalendarCheck aria-hidden/>Confirmar {validSelected.length} evento(s)</Button></DialogFooter>
      </div>}
    </DialogContent>
  </Dialog>;
}


