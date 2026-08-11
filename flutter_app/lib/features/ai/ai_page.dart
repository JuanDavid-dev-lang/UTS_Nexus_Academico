import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/data/offline_status.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/offline_banner.dart';
import '../../core/widgets/session_menu.dart';
import 'ai_service.dart';

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
        title: const Text('Asistente IA'),
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
                    que: 'El asistente',
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
        final ok = s.enabled && s.available && s.modelReady;
        final tone = SemanticTone.of(
            context, ok ? SemanticKind.success : SemanticKind.warning);
        final color = tone.fg;
        final bg = tone.bg;
        final text = ok
            ? 'IA local activa · ${s.model ?? ''}'
            : 'IA local no disponible — respuestas básicas por reglas';
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
        Icon(Icons.smart_toy_outlined, size: 56, color: brand.fg),
        const SizedBox(height: 12),
        const Center(
          child: Text('Asistente académico', style: AppType.h3),
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

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.78),
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
            if (!isUser && message.source == 'rules') ...[
              const SizedBox(height: 4),
              Text('modo básico (sin IA)',
                  style: AppType.caption.copyWith(color: AppColors.textMuted)),
            ],
          ],
        ),
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
