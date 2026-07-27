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
    this.padding = const EdgeInsets.all(18),
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
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: TextStyle(fontSize: 13, color: muted)),
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
    final s = RiskStyle.of(nivel);
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
        style: TextStyle(
            color: s.color, fontWeight: FontWeight.w600, fontSize: 12.5),
      ),
    );
  }
}

/// Etiqueta de estado genérica (aprobado, pendiente, etc.).
class StatusPill extends StatelessWidget {
  final String text;
  final Color color;
  final Color background;
  const StatusPill(this.text,
      {super.key, this.color = AppColors.info, this.background = AppColors.infoSoft});

  factory StatusPill.success(String t) =>
      StatusPill(t, color: AppColors.success, background: AppColors.successSoft);
  factory StatusPill.danger(String t) =>
      StatusPill(t, color: AppColors.danger, background: AppColors.dangerSoft);
  factory StatusPill.warning(String t) => StatusPill(t,
      color: AppColors.warningText, background: AppColors.warningSoft);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
      ),
      child: Text(text,
          style: TextStyle(
              color: color, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

/// Tarjeta de métrica: etiqueta, valor grande y pista.
class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final String? hint;
  final Color valueColor;
  final IconData? icon;
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.hint,
    this.valueColor = AppColors.primary,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
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
                    style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w600,
                        color: muted)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 26, fontWeight: FontWeight.w800, color: valueColor)),
          if (hint != null) ...[
            const SizedBox(height: 2),
            Text(hint!, style: TextStyle(fontSize: 11, color: muted)),
          ],
        ],
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
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, fontSize: 14)),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
