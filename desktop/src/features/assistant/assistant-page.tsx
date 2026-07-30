import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, CircleAlert, Send, Sparkles, User } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  PageContainer,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import { queryKeys } from '@/core/api/query-keys';
import { assistantRepository } from '@/infrastructure/repositories/insights.repository';
import { toast } from '@/state/toast.store';
import { cn } from '@/shared/lib/cn';
import type { ChatMessage } from '@/domain/schemas/insights';

const SUGGESTIONS = [
  '¿Quiénes están en riesgo y por qué?',
  '¿Cuál es el promedio general de mis grupos?',
  '¿Qué estudiante tiene la peor asistencia?',
  'Dame recomendaciones para los que van mal',
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [lastSource, setLastSource] = useState<'ollama' | 'rules' | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: queryKeys.assistant.status(),
    queryFn: () => assistantRepository.status(),
    staleTime: 60_000,
  });

  const chat = useMutation({
    mutationFn: (message: string) => assistantRepository.chat({ message, history: messages }),

    onSuccess(response) {
      setMessages((current) => [...current, { role: 'assistant', content: response.answer }]);
      setLastSource(response.source);
    },

    onError(error) {
      toast.fromError(error, 'El asistente no pudo responder');
      // The failed question stays visible so the user can retry without retyping.
      setMessages((current) => current.slice(0, -1));
    },
  });

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chat.isPending]);

  function send(text: string) {
    const message = text.trim();
    if (!message || chat.isPending) return;

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
          title="Asistente IA"
          subtitle="Pregunta sobre tus estudiantes en lenguaje natural"
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
            ) : (
              <Badge tone="warning">Modo reglas</Badge>
            )
          }
        />

        {enabled && !available && !status.isPending ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-caption text-warning">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Ollama no responde en <code className="font-mono">{status.data?.baseUrl}</code>. El
              asistente contestará con reglas deterministas hasta que el modelo esté disponible.
              Inicia Ollama y descarga el modelo con{' '}
              <code className="font-mono">ollama pull {status.data?.model}</code>.
            </p>
          </div>
        ) : null}

        <Card className="flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="scrollbar-slim flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Bot className="size-7" aria-hidden />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-body font-semibold text-text">
                    Pregúntame sobre tus estudiantes
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
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {message.role === 'user' ? (
                          <User className="size-4" aria-hidden />
                        ) : (
                          <Bot className="size-4" aria-hidden />
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

                {chat.isPending ? (
                  <div className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="size-4" aria-hidden />
                    </span>
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

                {lastSource === 'rules' && !chat.isPending ? (
                  <p className="text-center text-caption text-muted">
                    Respuesta generada por reglas, sin el modelo de IA.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <CardContent className="border-t border-border pt-4">
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
                disabled={!draft.trim() || chat.isPending}
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
