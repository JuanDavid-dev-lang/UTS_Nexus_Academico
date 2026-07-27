import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
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
        ],
      ),
      body: Column(
        children: [
          const _StatusBanner(),
          Expanded(
            child: chat.messages.isEmpty
                ? _EmptyChat(onPick: _send)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: chat.messages.length + (chat.sending ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= chat.messages.length) return const _TypingBubble();
                      return _Bubble(message: chat.messages[i]);
                    },
                  ),
          ),
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
        final color = ok ? AppColors.success : AppColors.warningText;
        final bg = ok ? AppColors.successSoft : AppColors.warningSoft;
        final text = ok
            ? 'IA local activa · ${s.model ?? ''}'
            : 'IA local no disponible — respuestas básicas por reglas';
        return Container(
          width: double.infinity,
          color: bg,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(ok ? Icons.bolt : Icons.info_outline, size: 16, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(text,
                    style: TextStyle(
                        color: color, fontSize: 12.5, fontWeight: FontWeight.w600)),
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
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 24),
        const Icon(Icons.smart_toy_outlined, size: 56, color: AppColors.primary),
        const SizedBox(height: 12),
        const Center(
          child: Text('Asistente académico',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: 6),
        const Center(
          child: Text(
            'Pregunta en lenguaje natural sobre tus estudiantes:\nnotas, riesgo, asistencia y recomendaciones.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted),
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
                backgroundColor: AppColors.infoSoft,
                labelStyle: const TextStyle(color: AppColors.primary),
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
    final bg = isUser
        ? scheme.primary
        : (isError ? AppColors.dangerSoft : assistantBg);
    final fg = isUser
        ? scheme.onPrimary
        : (isError ? AppColors.danger : assistantFg);

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
            Text(message.content, style: TextStyle(color: fg, fontSize: 14, height: 1.35)),
            if (!isUser && message.source == 'rules') ...[
              const SizedBox(height: 4),
              const Text('modo básico (sin IA)',
                  style: TextStyle(fontSize: 10, color: AppColors.textMuted)),
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
                  : const Icon(Icons.send),
            ),
          ],
        ),
      ),
    );
  }
}
