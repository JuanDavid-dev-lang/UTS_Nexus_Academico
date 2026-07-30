import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Componentes reutilizables del sistema de diseño (DESIGN.md §8, §12, §18).

/// Superficie blanca con borde sutil y esquinas de 18px.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  const AppCard({
    super.key,
    required this.child,
    // Relleno interior = el gap de §7, no el padding de página: en un teléfono
    // de 360dp, 24 de margen exterior más 24 de interior deja el contenido sin
    // aire. La tarjeta ya está separada de los bordes por la página.
    this.padding = const EdgeInsets.all(AppSpacing.gap),
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? AppColors.surfaceDark : AppColors.surface;
    final border = isDark ? AppColors.borderDark : AppColors.border;
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: border),
      ),
      child: child,
    );
    if (onTap == null) return content;
    return InkWell(
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      onTap: onTap,
      child: content,
    );
  }
}

/// Encabezado de sección: título (H2) + subtítulo opcional.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const SectionHeader(this.title, {super.key, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: AppType.h2),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: AppType.caption.copyWith(color: muted)),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// Insignia de riesgo con color + MOTIVO (DESIGN.md §12).
class RiskBadge extends StatelessWidget {
  final String nivel;
  final String? motivo;
  final bool compact;
  const RiskBadge(this.nivel, {super.key, this.motivo, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final s = RiskStyle.from(context, nivel);
    final text = motivo == null || motivo!.isEmpty || compact
        ? '${s.emoji}  ${s.label}'
        : '${s.emoji}  ${s.label} — ${motivo!}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: s.background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
      ),
      child: Text(
        text,
        style: AppType.captionStrong.copyWith(color: s.color),
      ),
    );
  }
}

/// Etiqueta de estado genérica (aprobado, pendiente, etc.).
///
/// Recibe el *significado*, no el color: el par texto/fondo lo resuelve
/// [SemanticTone] contra el tema activo, porque los chips claros de DESIGN.md
/// §4 no alcanzan AA sobre las superficies oliva del modo oscuro.
class StatusPill extends StatelessWidget {
  final String text;
  final SemanticKind kind;
  const StatusPill(this.text, {super.key, this.kind = SemanticKind.info});

  factory StatusPill.success(String t) =>
      StatusPill(t, kind: SemanticKind.success);
  factory StatusPill.danger(String t) =>
      StatusPill(t, kind: SemanticKind.danger);
  factory StatusPill.warning(String t) =>
      StatusPill(t, kind: SemanticKind.warning);

  @override
  Widget build(BuildContext context) {
    final tone = SemanticTone.of(context, kind);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: tone.bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
      ),
      child: Text(text,
          style: AppType.captionStrong.copyWith(color: tone.fg)),
    );
  }
}

/// Tarjeta de métrica: etiqueta, valor grande y pista.
///
/// El color del valor se declara por [tone] (su significado), no en crudo: el
/// verde institucional es ilegible sobre las superficies oliva del modo oscuro,
/// así que sin tono el valor cae en el color de texto del tema.
class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final String? hint;
  final SemanticKind? tone;
  final IconData? icon;
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.hint,
    this.tone,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    // DESIGN.md §4 regla 4: en oscuro el texto nunca va en lima, para no
    // competir con los CTAs. La cifra neutra usa el color de texto del tema.
    final valueColor = tone == null
        ? (isDark ? AppColors.textDark : AppColors.primary)
        : SemanticTone.of(context, tone!).fg;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 18, color: valueColor),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(label.toUpperCase(),
                    style: AppType.captionStrong
                        .copyWith(letterSpacing: 0.8, color: muted)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(value,
              style: AppType.h2.copyWith(color: valueColor)),
          if (hint != null) ...[
            const SizedBox(height: 2),
            Text(hint!, style: AppType.caption.copyWith(color: muted)),
          ],
        ],
      ),
    );
  }
}

/// Avisos efímeros.
///
/// Sustituyen a los `AlertDialog` de confirmación. Un diálogo modal para "nota
/// guardada" interrumpe el trabajo y exige un toque; un aviso informa sin robar
/// el foco. Los errores duran más porque requieren una decisión.
class AppToast {
  static void _show(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String title,
    String? detail,
    required Duration duration,
  }) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        duration: duration,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
        ),
        content: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title,
                      style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
                  if (detail != null) ...[
                    const SizedBox(height: 2),
                    Text(detail, style: AppType.caption),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static void success(BuildContext context, String title, [String? detail]) => _show(
        context,
        icon: Icons.check_circle_outline,
        color: AppColors.success,
        title: title,
        detail: detail,
        duration: const Duration(seconds: 3),
      );

  static void info(BuildContext context, String title, [String? detail]) => _show(
        context,
        icon: Icons.info_outline,
        color: AppColors.info,
        title: title,
        detail: detail,
        duration: const Duration(seconds: 4),
      );

  static void error(BuildContext context, String title, [String? detail]) => _show(
        context,
        icon: Icons.error_outline,
        color: AppColors.danger,
        title: title,
        detail: detail,
        duration: const Duration(seconds: 6),
      );
}

/// Bloque de carga con brillo.
///
/// Reserva el espacio del contenido real, así la pantalla no salta cuando
/// llegan los datos. Un indicador circular centrado no consigue ninguna de las
/// dos cosas.
class SkeletonBox extends StatefulWidget {
  final double height;
  final double? width;
  final double radius;

  const SkeletonBox({
    super.key,
    this.height = 16,
    this.width,
    this.radius = 8,
  });

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark ? AppColors.surfaceAltDark : AppColors.surfaceAlt;
    final highlight = isDark ? AppColors.borderDark : AppColors.border;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Container(
          height: widget.height,
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radius),
            gradient: LinearGradient(
              colors: [base, highlight, base],
              stops: const [0.1, 0.5, 0.9],
              begin: Alignment(-1 - 2 * _controller.value, 0),
              end: Alignment(1 - 2 * _controller.value, 0),
            ),
          ),
        );
      },
    );
  }
}

/// Rejilla de métricas en carga, con la forma de las tarjetas reales.
class SkeletonStatGrid extends StatelessWidget {
  final int count;
  const SkeletonStatGrid({super.key, this.count = 4});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 12,
      mainAxisSpacing: 12,
      childAspectRatio: 1.5,
      children: List.generate(
        count,
        (_) => const AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonBox(height: 10, width: 70),
              SizedBox(height: 12),
              SkeletonBox(height: 26, width: 60),
              SizedBox(height: 10),
              SkeletonBox(height: 9, width: 90),
            ],
          ),
        ),
      ),
    );
  }
}

/// Vista de estado: loading / empty / error (DESIGN.md §18).
/// Evita pantallas en blanco: siempre comunica qué pasa.
class StateView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  const StateView({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  factory StateView.loading([String message = 'Cargando información…']) =>
      StateView(icon: Icons.hourglass_empty, title: 'Un momento', message: message);

  factory StateView.empty([String message = 'No hay datos para mostrar todavía.']) =>
      StateView(icon: Icons.inbox_outlined, title: 'Sin datos', message: message);

  factory StateView.error(String message, {Widget? action}) => StateView(
      icon: Icons.error_outline,
      title: 'Ocurrió un problema',
      message: message,
      action: action);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: muted),
            const SizedBox(height: 12),
            Text(title,
                style:
                    AppType.h3),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: AppType.body.copyWith(color: muted)),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
