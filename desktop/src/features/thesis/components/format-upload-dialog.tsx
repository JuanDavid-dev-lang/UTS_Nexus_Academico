import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Upload } from 'lucide-react';
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
import { thesisRepository } from '@/infrastructure/repositories/academic.repository';
import { queryKeys } from '@/core/api/query-keys';
import { toast } from '@/state/toast.store';
import {
  ETAPA_TG_LABEL,
  etapaTrabajoGrado,
  type EtapaTrabajoGrado,
} from '@/domain/schemas/academic';

/**
 * Subida de un formato oficial (solo administración).
 *
 * Word o PDF, con su etapa y la lista de campos que hay que diligenciar: eso
 * último es lo que convierte el repositorio en una guía y no en una carpeta.
 */
export function FormatUploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [etapa, setEtapa] = useState<EtapaTrabajoGrado>('PROPUESTA');
  const [campos, setCampos] = useState('');
  const [version, setVersion] = useState('1');
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const subir = useMutation({
    mutationFn: () =>
      thesisRepository.upload({
        archivo: archivo as File,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        etapa,
        camposALlenar: campos
          .split(/\r?\n/)
          .map((campo) => campo.trim())
          .filter(Boolean),
        version: version.trim() || '1',
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.thesisFormats.all] });
      toast.success('Formato publicado', 'Los directores ya lo ven en su sección.');
      close();
    },
    onError: (causa) => toast.fromError(causa, 'No se pudo subir'),
  });

  function close() {
    setArchivo(null);
    setNombre('');
    setDescripcion('');
    setCampos('');
    setVersion('1');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : close())}>
      <DialogContent
        title="Subir formato oficial"
        description="Word o PDF. El archivo solo se descarga desde la sección autenticada."
        className="max-w-xl"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                setArchivo(file);
                // El nombre del archivo suele SER el nombre del formato
                // (F-DC-124 Propuesta…): se propone y se puede corregir.
                if (file && !nombre.trim()) {
                  setNombre(file.name.replace(/\.(pdf|docx?)$/i, '').trim());
                }
              }}
            />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <FileUp aria-hidden />
              {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
            </Button>
            <span className="min-w-0 truncate text-caption text-muted">
              {archivo ? archivo.name : 'Ningún archivo elegido'}
            </span>
          </div>

          <Field label="Nombre del formato">
            {(props) => (
              <Input
                {...props}
                value={nombre}
                maxLength={160}
                placeholder="F-DC-124 Propuesta de trabajo de grado"
                onChange={(event) => setNombre(event.target.value)}
              />
            )}
          </Field>

          <div className="grid gap-3 @md:grid-cols-2">
            <Field label="Etapa">
              {(props) => (
                <NativeSelect
                  {...props}
                  value={etapa}
                  onChange={(event) => setEtapa(event.target.value as EtapaTrabajoGrado)}
                >
                  {etapaTrabajoGrado.options.map((option) => (
                    <option key={option} value={option}>
                      {ETAPA_TG_LABEL[option]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Versión">
              {(props) => (
                <Input {...props} value={version} maxLength={20} onChange={(event) => setVersion(event.target.value)} />
              )}
            </Field>
          </div>

          <Field label="Descripción (opcional)">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                maxLength={1000}
                placeholder="Cuándo se usa y a qué modalidad aplica."
                value={descripcion}
                onChange={(event) => setDescripcion(event.target.value)}
              />
            )}
          </Field>

          <Field
            label="Campos a diligenciar (opcional)"
            hint="Uno por línea. Se muestran como guía antes de abrir el documento."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={4}
                placeholder={'Título del trabajo\nNombres de los autores\nDirector propuesto'}
                value={campos}
                onChange={(event) => setCampos(event.target.value)}
              />
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={subir.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={subir.isPending}
            disabled={!archivo || nombre.trim().length < 4}
            onClick={() => subir.mutate()}
          >
            <Upload aria-hidden />
            Publicar formato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
