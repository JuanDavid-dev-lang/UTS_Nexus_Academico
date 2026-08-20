import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import '../../core/storage/offline_status.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/offline_banner.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/rubri.dart';
import './ai_service.dart';

class AiPage extends ConsumerStatefulWidget {
  const AiPage({super.key});

  @override
  ConsumerState<AiPage> createState() => _AiPageState();
}

class _AiPageState extends ConsumerState<AiPage> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  static const _suggestions = [
    '¿Quiénes están en riesgo y por qué?',
    '¿Cuál es el promedio del grupo?',
    '¿Qué estudiante tiene la peor asistencia?',
    'Dame recomendaciones para los estudiantes en riesgo',
  ];

  /// Consultas por botón: la pregunta de todos los días sin redactarla.
  ///
  /// El `tipo` es el contrato con `/ai/quick`, que responde con números del
  /// motor canónico y del modelo de predicción —nunca del conversacional—,
  /// así que el botón contesta lo mismo con y sin Ollama.
  static const _consultas = <({String tipo, String etiqueta})>[
    (tipo: 'estado', etiqueta: '¿Cómo va el grupo?'),
    (tipo: 'riesgo', etiqueta: '¿Quiénes están en riesgo?'),
    (tipo: 'asistencia', etiqueta: '¿Cómo está la asistencia?'),
    (tipo: 'aprobacion', etiqueta: '¿Cuántos van aprobando?'),
    (tipo: 'necesita', etiqueta: '¿Cuánto necesitan para aprobar?'),
  ];

  /// Materia que acota las consultas rápidas. Null = todo el alcance.
  Subject? _materia;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _send([String? preset]) {
    final text = preset ?? _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    ref.read(chatControllerProvider.notifier).send(text);
    _scrollToBottom();
  }

  void _consultar(({String tipo, String etiqueta}) consulta) {
    final materia = _materia;
    ref.read(chatControllerProvider.notifier).quick(
          consulta.tipo,
          materia == null
              ? consulta.etiqueta
              : '${consulta.etiqueta} — ${materia.name}',
          subjectId: materia?.id,
        );
    _scrollToBottom();
  }

  Future<void> _elegirMateria() async {
    final List<Subject> materias;
    try {
      materias = await ref.read(subjectsProvider.future);
    } catch (_) {
      // Sin materias no hay nada que elegir; la consulta sigue valiendo sin
      // acotar.
      return;
    }
    if (!mounted) return;

    // 'todas' como centinela: pop(null) es cerrar la hoja sin decidir, y
    // quitar el filtro es una decisión.
    final elegida = await showCompactSheet<Object>(
      context: context,
      titulo: 'Materia de la consulta',
      subtitulo: 'Acota las consultas rápidas a una materia',
      constructor: (contextoHoja) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.all_inclusive_outlined),
            title: const Text('Todas mis materias'),
            selected: _materia == null,
            onTap: () => Navigator.of(contextoHoja).pop('todas'),
          ),
          for (final materia in materias)
            ListTile(
              leading: const Icon(Icons.menu_book_outlined),
              title: Text(materia.name),
              subtitle: Text(materia.code),
              selected: _materia?.id == materia.id,
              onTap: () => Navigator.of(contextoHoja).pop(materia),
            ),
        ],
      ),
    );
    if (elegida == null) return;
    setState(() => _materia = elegida is Subject ? elegida : null);
  }

  /// Fila de consultas rápidas, encima del cuadro de texto.
  Widget _barraConsultas() {
    final enviando = ref.watch(chatControllerProvider).sending;
    final palette = context.palette;

    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.page,
          vertical: 6,
        ),
        children: [
          ActionChip(
            avatar: Icon(Icons.filter_list_outlined,
                size: 16, color: palette.primary),
            label: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 140),
              child: Text(
                _materia?.name ?? 'Todas mis materias',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            onPressed: enviando ? null : _elegirMateria,
          ),
          for (final consulta in _consultas) ...[
            const SizedBox(width: AppSpacing.gapSm),
            ActionChip(
              label: Text(consulta.etiqueta),
              onPressed: enviando ? null : () => _consultar(consulta),
            ),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(chatControllerProvider);
    // 'no fresco' = lo que se está viendo salió de la caché. El estado ya no
    // es nulo cuando hay conexión: ahora también lleva la hora de la última
    // sincronización, así que la comprobación va contra 'esFresco'.
    final sinConexion = !(ref.watch(offlineStatusProvider).valueOrNull?.esFresco ?? true);
    ref.listen(chatControllerProvider, (_, __) => _scrollToBottom());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Rubri'),
        actions: [
          if (chat.messages.isNotEmpty)
            IconButton(
              tooltip: 'Nueva conversación',
              icon: const Icon(Icons.delete_sweep_outlined),
              onPressed: () => ref.read(chatControllerProvider.notifier).clear(),
            ),
          const SessionMenuButton(),
        ],
      ),
      body: Column(
        children: [
          const _StatusBanner(),
          Expanded(
            // El asistente pregunta al servidor en cada mensaje: no hay nada
            // guardado que responder. Decirlo de frente es mejor que dejar que
            // el docente escriba una consulta y reciba un error de red.
            child: sinConexion
                ? const RequiereConexion(
                    que: 'Rubri',
                    detalle:
                        'Cada respuesta se calcula en el servidor con tus datos '
                        'académicos, así que necesita red. Lo demás que ya '
                        'habías consultado sí puedes seguir viéndolo.',
                  )
                : chat.messages.isEmpty
                ? _EmptyChat(onPick: _send)
                : ListView.builder(
                    controller: _scroll,
                    padding: AppSpacing.pagePadding,
                    itemCount: chat.messages.length + (chat.sending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= chat.messages.length) return const _TypingBubble();
                      return _Bubble(message: chat.messages[i]);
                    },
                  ),
          ),
          // Botones antes que teclado: las preguntas de todos los días no
          // deberían exigir redactarlas.
          if (!sinConexion) _barraConsultas(),
          if (!sinConexion)
            _InputBar(
              controller: _input,
              sending: chat.sending,
              onSend: () => _send(),
            ),
        ],
      ),
    );
  }
}

/// Banner que informa si la IA local (Ollama) está activa.
class _StatusBanner extends ConsumerWidget {
  const _StatusBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(aiStatusProvider);
    return status.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (s) {
        final ok = (s.enabled && s.available && s.modelReady) ||
            s.mlAvailable ||
            s.rubriAvailable;
        final tone = SemanticTone.of(
            context, ok ? SemanticKind.success : SemanticKind.warning);
        final color = tone.fg;
        final bg = tone.bg;
        final text = s.enabled && s.available && s.modelReady
            ? 'Rubri disponible · modelo conversacional ${s.model ?? ''}'
            : s.mlAvailable
                ? 'Rubri activo · modelo de predicción interno (ML en Python)'
                : s.rubriAvailable
                    ? 'Rubri disponible · clasificador NLP interno activo'
                    : 'Rubri sin conexión — respuestas básicas por reglas';
        return Container(
          width: double.infinity,
          color: bg,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(ok ? Icons.bolt_outlined : Icons.info_outline,
                  size: 16, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(text,
                    style: AppType.captionStrong.copyWith(color: color)),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _EmptyChat extends StatelessWidget {
  final void Function(String) onPick;
  const _EmptyChat({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final brand = SemanticTone.of(context, SemanticKind.brand);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 24),
        const Center(child: Rubri(size: 128)),
        const SizedBox(height: 12),
        const Center(
          child: Text('Hola, soy Rubri', style: AppType.h3),
        ),
        const SizedBox(height: 6),
        Center(
          child: Text(
            'Pregunta en lenguaje natural sobre tus estudiantes:\nnotas, riesgo, asistencia y recomendaciones.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted),
          ),
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          alignment: WrapAlignment.center,
          children: [
            for (final s in _AiPageState._suggestions)
              ActionChip(
                label: Text(s),
                onPressed: () => onPick(s),
                backgroundColor: brand.bg,
                labelStyle: TextStyle(color: brand.fg),
                side: BorderSide.none,
              ),
          ],
        ),
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  final ChatMessage message;
  const _Bubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    final isError = message.source == 'error';
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final assistantBg = isDark ? AppColors.surfaceAltDark : AppColors.surfaceAlt;
    final assistantFg = isDark ? AppColors.textDark : AppColors.text;
    final error = SemanticTone.of(context, SemanticKind.danger);
    final bg = isUser ? scheme.primary : (isError ? error.bg : assistantBg);
    final fg = isUser ? scheme.onPrimary : (isError ? error.fg : assistantFg);

    final emotion = switch (message.emotion) {
      'happy' => RubriEmotion.happy,
      'sad' => RubriEmotion.sad,
      'offline' => RubriEmotion.offline,
      _ => RubriEmotion.neutral,
    };

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Row(
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isUser) ...[
            Rubri(emotion: emotion, size: 40, animated: false),
            const SizedBox(width: 8),
          ],
          Container(
        // `sizeOf` y no `of`: esto está dentro de cada burbuja del chat, que
        // es justo la pantalla donde el teclado se abre y se cierra todo el
        // rato. Con `MediaQuery.of`, cada burbuja visible se reconstruía en
        // cada fotograma de la animación del teclado — para leer un ancho de
        // pantalla que la animación no toca.
        constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * 0.78),
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(message.content,
                style: AppType.body.copyWith(color: fg, height: 1.35)),
            if (!isUser && message.source == 'datos') ...[
              const SizedBox(height: 4),
              Text('cálculo directo con tus datos',
                  style: AppType.caption.copyWith(color: AppColors.textMuted)),
            ],
            if (!isUser && message.source == 'ml') ...[
              const SizedBox(height: 4),
              Text('modelo de predicción interno',
                  style: AppType.caption.copyWith(color: AppColors.textMuted)),
            ],
            if (!isUser && message.source == 'rules') ...[
              const SizedBox(height: 4),
              Text('modo básico (sin IA)',
                  style: AppType.caption.copyWith(color: AppColors.textMuted)),
            ],
          ],
        ),
          ),
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const SizedBox(
          width: 40,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Dot(), _Dot(), _Dot(),
            ],
          ),
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot();
  @override
  Widget build(BuildContext context) => const CircleAvatar(
      radius: 4, backgroundColor: AppColors.textMuted);
}

class _InputBar extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  const _InputBar({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
                decoration: const InputDecoration(
                  hintText: 'Escribe tu pregunta…',
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: sending ? null : onSend,
              style: FilledButton.styleFrom(
                shape: const CircleBorder(),
                padding: const EdgeInsets.all(14),
              ),
              child: sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.send_outlined),
            ),
          ],
        ),
      ),
    );
  }
}
