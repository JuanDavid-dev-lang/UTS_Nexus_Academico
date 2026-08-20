import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, Send, Sparkles, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardContent,
  NativeSelect,
  PageContainer,
  PageHeader,
  Textarea,
  Rubri,
  type RubriEmotion,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { assistantRepository } from '@/infrastructure/repositories/insights.repository';
import { subjectRepository } from '@/infrastructure/repositories/subjects.repository';
import { toast } from '@/state/toast.store';
import { cn } from '@/shared/lib/cn';
import type { ChatMessage, QuickQueryType } from '@/domain/schemas/insights';

const SUGGESTIONS = [
  '¿Quiénes están en riesgo y por qué?',
  '¿Cuál es el promedio general de mis grupos?',
  '¿Qué estudiante tiene la peor asistencia?',
  'Dame recomendaciones para los que van mal',
];

/**
 * Consultas rápidas: la pregunta de todos los días sin escribirla.
 *
 * Van contra `/ai/quick`, que responde con números del motor canónico y del
 * modelo de predicción —nunca con el modelo conversacional—, así que el botón
 * da la misma respuesta con y sin Ollama. Las etiquetas coinciden con la
 * `pregunta` que devuelve el backend para que burbuja y respuesta hablen de
 * lo mismo.
 */
const CONSULTAS: { tipo: QuickQueryType; etiqueta: string }[] = [
  { tipo: 'estado', etiqueta: '¿Cómo va el grupo?' },
  { tipo: 'riesgo', etiqueta: '¿Quiénes están en riesgo?' },
  { tipo: 'asistencia', etiqueta: '¿Cómo está la asistencia?' },
  { tipo: 'aprobacion', etiqueta: '¿Cuántos van aprobando?' },
  { tipo: 'necesita', etiqueta: '¿Cuánto necesitan para aprobar?' },
];

/**
 * AI assistant.
 *
 * The model runs locally through Ollama and is grounded in the teacher's real
 * academic data by the backend. The reply always shows whether it came from the
 * model or from the deterministic rule fallback: the teacher has a right to
 * know when the answer was generated versus computed.
 */
export default function AssistantPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const context = (location.state as { rubriContext?: { page?: string; courseId?: string; groupId?: string } } | null)
    ?.rubriContext;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [lastSource, setLastSource] = useState<'ollama' | 'ml' | 'datos' | 'rules' | 'intent-model' | null>(null);
  const [emotion, setEmotion] = useState<RubriEmotion>('neutral');
  const [action, setAction] = useState<{ route: string; label: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // La materia elegida acota las consultas rápidas; vacío = todo el alcance.
  const [materiaId, setMateriaId] = useState('');

  const status = useQuery({
    queryKey: queryKeys.assistant.status(),
    queryFn: () => assistantRepository.status(),
    staleTime: 60_000,
  });

  const subjects = useQuery({
    queryKey: queryKeys.subjects.list(),
    queryFn: () => subjectRepository.list(),
    staleTime: 60_000,
  });

  const chat = useMutation({
    mutationFn: (message: string) => assistantRepository.chat({ message, history: messages, context }),

    onSuccess(response) {
      setMessages((current) => [...current, { role: 'assistant', content: response.answer }]);
      setLastSource(response.source);
      setEmotion(response.emotion);
      setAction(response.rubri?.action ?? null);
    },

    onError(error) {
      toast.fromError(error, 'El asistente no pudo responder');
      // The failed question stays visible so the user can retry without retyping.
      setMessages((current) => current.slice(0, -1));
      setEmotion('sad');
      setAction(null);
    },
  });

  const quick = useMutation({
    mutationFn: (tipo: QuickQueryType) =>
      assistantRepository.quick({ tipo, ...(materiaId ? { subjectId: materiaId } : {}) }),

    onMutate(tipo) {
      const etiqueta = CONSULTAS.find((consulta) => consulta.tipo === tipo)?.etiqueta ?? tipo;
      const materia = subjects.data?.find((subject) => subject._id === materiaId)?.name;
      setMessages((current) => [
        ...current,
        { role: 'user', content: materia ? `${etiqueta} — ${materia}` : etiqueta },
      ]);
    },

    onSuccess(response) {
      setMessages((current) => [...current, { role: 'assistant', content: response.answer }]);
      setLastSource(response.source);
      setEmotion('neutral');
      setAction(null);
    },

    onError(error) {
      toast.fromError(error, 'La consulta no pudo responderse');
      setMessages((current) => current.slice(0, -1));
      setEmotion('sad');
      setAction(null);
    },
  });

  const ocupado = chat.isPending || quick.isPending;

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, ocupado]);

  function send(text: string) {
    const message = text.trim();
    if (!message || ocupado) return;

    setMessages((current) => [...current, { role: 'user', content: message }]);
    setDraft('');
    chat.mutate(message);
  }

  const available = status.data?.available ?? false;
  const enabled = status.data?.enabled ?? false;

  return (
    <PageContainer className="!overflow-hidden">
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        <PageHeader
          title="Rubri"
          subtitle="Asistente de UTS Nexus · tus datos permanecen en la infraestructura institucional"
          actions={
            status.isPending ? (
              <Badge>Verificando…</Badge>
            ) : !enabled ? (
              <Badge tone="neutral">IA desactivada</Badge>
            ) : available ? (
              <Badge tone="success">
                <Sparkles className="size-3" aria-hidden />
                {status.data?.model || 'Modelo local'}
              </Badge>
            ) : status.data?.ml?.available ? (
              <Badge tone="success">
                <Sparkles className="size-3" aria-hidden />
                Modelo de predicción activo
              </Badge>
            ) : status.data?.rubri?.available ? (
              <Badge tone="success">NLP interno activo</Badge>
            ) : (
              <Badge tone="warning">Servicio interno sin conexión</Badge>
            )
          }
        />

        {enabled && !available && !status.isPending ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-caption text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Ollama no responde en <code className="font-mono">{status.data?.baseUrl}</code>.
              {status.data?.ml?.available
                ? ' Las preguntas académicas las responde el modelo interno de predicción (ML en Python); solo falta la redacción conversacional.'
                : ' El asistente contestará con reglas hasta que vuelva.'}{' '}
              Para recuperar la conversación, inicia Ollama y descarga el modelo con{' '}
              <code className="font-mono">ollama pull {status.data?.model}</code>.
            </p>
          </div>
        ) : null}

        <Card className="flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="scrollbar-slim flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <Rubri emotion={status.data?.rubri?.available === false ? 'offline' : emotion} size="large" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-body font-semibold text-text">
                    Hola, soy Rubri
                  </h3>
                  <p className="max-w-md text-body text-muted">
                    Tengo acceso a tus notas, asistencia y niveles de riesgo reales. No invento
                    cifras: si un dato no está, te lo digo.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-full border border-border px-3.5 py-1.5 text-caption text-muted transition-colors hover:border-primary hover:text-primary"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <AnimatePresence initial={false}>
                  {messages.map((message, index) => (
                    <motion.div
                      key={`${index}-${message.role}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        'flex gap-3',
                        message.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg',
                          message.role === 'user'
                            ? 'bg-surface-alt text-muted'
                            : 'bg-transparent',
                        )}
                      >
                        {message.role === 'user' ? (
                          <User className="size-4" aria-hidden />
                        ) : (
                          <Rubri emotion={emotion} size="small" animated={false} />
                        )}
                      </span>

                      <div
                        data-selectable
                        className={cn(
                          'max-w-[75%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-body leading-relaxed',
                          message.role === 'user'
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-alt text-text',
                        )}
                      >
                        {message.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {ocupado ? (
                  <div className="flex gap-3">
                    <Rubri emotion="neutral" size="small" />
                    <div className="flex items-center gap-1.5 rounded-xl bg-surface-alt px-4 py-3">
                      {[0, 1, 2].map((dot) => (
                        <motion.span
                          key={dot}
                          className="size-1.5 rounded-full bg-muted"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2 }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}

                {lastSource === 'ml' && !ocupado ? (
                  <p className="text-center text-caption text-muted">
                    Análisis del modelo interno de predicción, sin IA conversacional.
                  </p>
                ) : null}

                {lastSource === 'datos' && !ocupado ? (
                  <p className="text-center text-caption text-muted">
                    Cálculo directo sobre tus datos académicos.
                  </p>
                ) : null}

                {lastSource === 'rules' && !ocupado ? (
                  <p className="text-center text-caption text-muted">
                    Respuesta generada por reglas, sin el modelo de IA.
                  </p>
                ) : null}

                {action && !ocupado ? (
                  <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => navigate(action.route)}>
                      {action.label}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <CardContent className="border-t border-border pt-4">
            {/*
              Botones antes que teclado: las preguntas de todos los días no
              deberían exigir redactarlas. El selector acota a una materia; el
              resto del alcance lo impone el backend igual que en el chat.
            */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <NativeSelect
                value={materiaId}
                onChange={(event) => setMateriaId(event.target.value)}
                aria-label="Materia de las consultas rápidas"
                className="h-8 w-auto max-w-56 py-0 text-caption"
              >
                <option value="">Todas mis materias</option>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name}
                  </option>
                ))}
              </NativeSelect>
              {CONSULTAS.map((consulta) => (
                <button
                  key={consulta.tipo}
                  type="button"
                  onClick={() => quick.mutate(consulta.tipo)}
                  disabled={ocupado}
                  className="rounded-full border border-border px-3.5 py-1.5 text-caption text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {consulta.etiqueta}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter adds a line - the convention every
                  // chat app uses, so it needs no explanation.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
                placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para salto de línea)"
                rows={2}
                aria-label="Mensaje para el asistente"
                className="flex-1"
              />
              <Button
                variant="primary"
                size="icon"
                onClick={() => send(draft)}
                disabled={!draft.trim() || ocupado}
                aria-label="Enviar mensaje"
                className="size-10"
              >
                <Send aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
