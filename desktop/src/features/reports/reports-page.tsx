import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, FileSpreadsheet, FileText, FolderOpen, Palette } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  NativeSelect,
  PageContainer,
  PageHeader,
} from '@/shared/ui';
import { reportRepository } from '@/infrastructure/repositories/insights.repository';
import { AttendancePreviewDialog } from '@/features/reports/components/attendance-preview-dialog';
import { TemplateEditorDialog } from '@/features/reports/components/template-editor-dialog';
import { useSubjects } from '@/features/subjects/hooks/use-subjects';
import { useUserRole } from '@/state/session.store';
import { platform } from '@/core/platform/tauri';
import { toast } from '@/state/toast.store';
import { currentPeriod, recentPeriods, toIsoDate } from '@/shared/lib/format';
import type { ReportFormat, ReportKind } from '@/domain/repositories/ports';

const REPORTS: { kind: ReportKind; title: string; description: string }[] = [
  {
    kind: 'consolidado',
    title: 'Consolidado académico',
    description: 'Nota final por estudiante con el desglose de los tres cortes.',
  },
  {
    kind: 'grades',
    title: 'Detalle de notas',
    description: 'Todas las notas capturadas por componente y corte.',
  },
  {
    kind: 'attendance',
    title: 'Asistencia',
    description: 'Registro de asistencia con porcentajes ponderados por minutos.',
  },
  {
    kind: 'combined',
    title: 'Informe combinado',
    description: 'Notas, asistencia y nivel de riesgo en un solo documento.',
  },
];

const EXTENSIONS: Record<ReportFormat, string> = { pdf: 'pdf', excel: 'xlsx' };

/**
 * Report exports.
 *
 * The file is written straight to the Downloads folder and the toast offers to
 * open it - no save dialog, no "where did it go?". The teacher's goal is having
 * the file, not choosing a path.
 */
export default function ReportsPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [subjectId, setSubjectId] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const role = useUserRole();

  const subjects = useSubjects();

  const periodSubjects = useMemo(
    () => (subjects.data ?? []).filter((subject) => subject.period === period),
    [subjects.data, period],
  );

  const download = useMutation({
    mutationFn: async ({ format, kind }: { format: ReportFormat; kind: ReportKind }) => {
      const blob = await reportRepository.download(format, kind, {
        period,
        subjectId: subjectId || undefined,
      });

      const subjectSuffix = subjectId
        ? `-${periodSubjects.find((subject) => subject._id === subjectId)?.code ?? 'materia'}`
        : '';
      const fileName = `UTS-${kind}-${period}${subjectSuffix}-${toIsoDate()}.${EXTENSIONS[format]}`;

      return { path: await platform.files.saveDownload(fileName, blob), fileName };
    },

    onSuccess({ path, fileName }) {
      toast.withAction('success', 'Reporte descargado', fileName, {
        label: 'Abrir carpeta',
        onClick: () => void platform.files.reveal(path),
      });
    },

    onError(error) {
      toast.fromError(error, 'No se pudo generar el reporte');
    },

    onSettled() {
      setPending(null);
    },
  });

  function handleDownload(format: ReportFormat, kind: ReportKind) {
    setPending(`${kind}-${format}`);
    download.mutate({ format, kind });
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reportes"
        subtitle="Exporta la información académica en PDF o Excel"
        actions={
          role === 'ADMIN' ? (
            <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
              <Palette aria-hidden />
              Plantilla
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Alcance del reporte</CardTitle>
          <CardDescription>
            Los documentos se generan con los datos que tienes autorizados a ver.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field label="Periodo" className="w-40">
            {(props) => (
              <NativeSelect
                {...props}
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value);
                  setSubjectId('');
                }}
              >
                {recentPeriods(6).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          <Field label="Materia" className="min-w-64 flex-1 max-w-sm">
            {(props) => (
              <NativeSelect
                {...props}
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                <option value="">Todas las materias</option>
                {periodSubjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name} ({subject.code})
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </CardContent>
      </Card>

      <div className="grid gap-4 @2xl:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.kind}>
            <CardHeader>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => handleDownload('pdf', report.kind)}
                loading={pending === `${report.kind}-pdf`}
                disabled={download.isPending}
              >
                <FileText aria-hidden />
                PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDownload('excel', report.kind)}
                loading={pending === `${report.kind}-excel`}
                disabled={download.isPending}
              >
                <FileSpreadsheet aria-hidden />
                Excel
              </Button>
              {report.kind === 'attendance' ? (
                <Button variant="ghost" onClick={() => setPreviewOpen(true)}>
                  <Eye aria-hidden />
                  Vista previa
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="flex items-center gap-2 text-caption text-muted">
        <FolderOpen className="size-3.5" aria-hidden />
        Los archivos se guardan en tu carpeta de Descargas.
      </p>

      <AttendancePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        scope={{ period, subjectId: subjectId || undefined }}
        onDownload={(format) => handleDownload(format, 'attendance')}
        downloading={download.isPending}
      />

      <TemplateEditorDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </PageContainer>
  );
}
