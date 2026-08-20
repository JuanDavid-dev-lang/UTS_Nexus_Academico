import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Componentes reutilizables del sistema de diseño (DESIGN.md §8, §12, §18).

/// Superficie de contenido.
///
/// Lleva sombra además del borde. Un rectángulo blanco con borde de 1 px sobre
/// un fondo casi blanco no se lee como una capa, se lee como una línea
/// dibujada: la tarjeta está ahí pero no está *encima* de nada. La sombra de
/// dos capas —contacto corto y ambiente largo— es lo que le da un sitio en el
/// eje Z, y es la diferencia entre una lista de recuadros y una de tarjetas.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Sube un nivel de elevación. Para lo que está por encima del resto de la
  /// pantalla: la clase en curso, una alerta que exige decisión.
  final bool elevated;

  /// Realce de marca: borde y tinte del color primario. Para la tarjeta
  /// seleccionada de una lista, no para «esta es importante».
  final bool selected;

  const AppCard({
    super.key,
    required this.child,
    // Relleno interior = el gap de §7, no el padding de página: en un teléfono
    // de 360dp, 24 de margen exterior más 24 de interior deja el contenido sin
    // aire. La tarjeta ya está separada de los bordes por la página.
    this.padding = const EdgeInsets.all(AppSpacing.gap),
    this.onTap,
    this.onLongPress,
    this.elevated = false,
    this.selected = false,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final radio = BorderRadius.circular(AppSpacing.radiusCard);

    final content = AnimatedContainer(
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      padding: padding,
      decoration: BoxDecoration(
        color: selected ? palette.primarySoft : palette.surface,
        borderRadius: radio,
        border: Border.all(
          color: selected ? palette.primary : palette.border,
          width: selected ? 1.5 : 1,
        ),
        boxShadow: elevated ? AppShadows.md(palette.isDark) : AppShadows.sm(palette.isDark),
      ),
      child: child,
    );

    if (onTap == null && onLongPress == null) return content;

    // El `Material` transparente por debajo es lo que hace que la onda del
    // `InkWell` se dibuje: sin él, el `InkWell` pinta sobre el `Material` del
    // Scaffold, que está detrás de la tarjeta, y el toque no deja rastro.
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: radio,
        onTap: onTap,
        onLongPress: onLongPress,
        child: content,
      ),
    );
  }
}

/// Superficie de marca: degradado institucional con velo lima.
///
/// Reservada a lo que representa a la aplicación —la cabecera del panel, la
/// clase que está ocurriendo ahora—. Si cada pantalla abriera con un bloque
/// verde, el verde dejaría de significar «esto es UTS Nexus» y pasaría a
/// significar «esto es una cabecera».
class BrandSurface extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final BorderRadius? borderRadius;

  const BrandSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.gap + 4),
    this.onTap,
    this.borderRadius,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radio = borderRadius ?? BorderRadius.circular(AppSpacing.radiusLarge);

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: AppGradients.brand(isDark),
        borderRadius: radio,
        boxShadow: AppShadows.md(isDark),
      ),
      child: ClipRRect(
        borderRadius: radio,
        child: Stack(
          children: [
            // El velo va detrás del contenido y no encima: encima bajaría el
            // contraste del texto justo donde más claro está el degradado.
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: AppGradients.veil(isDark)),
              ),
            ),
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onTap,
                child: Padding(
                  padding: padding,
                  // En claro el texto va en blanco; en oscuro el degradado es
                  // oliva y el blanco puro vibra encima, así que hereda el
                  // color de texto del tema.
                  child: DefaultTextStyle.merge(
                    style: TextStyle(
                      color: isDark ? AppColors.textDark : Colors.white,
                    ),
                    child: IconTheme.merge(
                      data: IconThemeData(
                        color: isDark ? AppColors.textDark : Colors.white,
                      ),
                      child: child,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
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
    final palette = context.palette;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppType.h2),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: AppType.caption.copyWith(color: palette.muted)),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// Insignia de riesgo con color + ICONO + MOTIVO (DESIGN.md §12).
///
/// El icono no es decoración: es lo que permite distinguir el nivel sin ver el
/// color. Ver la nota de [RiskStyle.icon].
class RiskBadge extends StatelessWidget {
  final String nivel;
  final String? motivo;
  final bool compact;
  const RiskBadge(this.nivel, {super.key, this.motivo, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final s = RiskStyle.from(context, nivel);
    final mostrarMotivo = motivo != null && motivo!.isNotEmpty && !compact;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: s.background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        border: Border.all(color: s.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(s.icon, size: 14, color: s.color),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              mostrarMotivo ? '${s.label} — ${motivo!}' : s.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppType.captionStrong.copyWith(color: s.color),
            ),
          ),
        ],
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
  final IconData? icon;
  const StatusPill(this.text, {super.key, this.kind = SemanticKind.info, this.icon});

  factory StatusPill.success(String t, {IconData? icon}) =>
      StatusPill(t, kind: SemanticKind.success, icon: icon);
  factory StatusPill.danger(String t, {IconData? icon}) =>
      StatusPill(t, kind: SemanticKind.danger, icon: icon);
  factory StatusPill.warning(String t, {IconData? icon}) =>
      StatusPill(t, kind: SemanticKind.warning, icon: icon);

  @override
  Widget build(BuildContext context) {
    final tone = SemanticTone.of(context, kind);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: icon == null ? 10 : 8, vertical: 4),
      decoration: BoxDecoration(
        color: tone.bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        // El borde es lo que separa el chip de la superficie sobre la que cae.
        // Sin él, un chip suave sobre `surfaceAlt` se distingue del fondo por
        // unos pocos puntos de luminancia y deja de leerse como una insignia.
        border: Border.all(color: tone.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: tone.fg),
            const SizedBox(width: 4),
          ],
          Text(text, style: AppType.captionStrong.copyWith(color: tone.fg)),
        ],
      ),
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
  final VoidCallback? onTap;
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.hint,
    this.tone,
    this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final semantico = tone == null ? null : SemanticTone.of(context, tone!);
    // DESIGN.md §4 regla 4: en oscuro el texto nunca va en lima, para no
    // competir con los CTAs. La cifra neutra usa el color de texto del tema.
    final valueColor = semantico?.fg ?? (palette.isDark ? palette.text : palette.primary);
    final railColor = semantico?.fg ?? palette.primary;

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Franja de tono arriba. Es lo que permite reconocer la tarjeta sin
          // leerla: con el color solo en la cifra, cuatro tarjetas en
          // cuadrícula son cuatro rectángulos idénticos y hay que leerlas todas
          // para encontrar la que está en rojo.
          Container(
            height: 3,
            decoration: BoxDecoration(
              color: railColor,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppSpacing.radiusCard),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.gap),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    if (icon != null) ...[
                      Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          color: semantico?.bg ?? palette.primarySoft,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusInput - 4),
                        ),
                        child: Icon(icon, size: 14, color: valueColor),
                      ),
                      const SizedBox(width: AppSpacing.gapSm),
                    ],
                    Expanded(
                      child: Text(
                        label.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppType.captionStrong
                            .copyWith(letterSpacing: 0.8, color: palette.muted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.gapSm),
                Text(value, style: AppType.metric.copyWith(color: valueColor)),
                if (hint != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    hint!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.caption.copyWith(color: palette.muted),
                  ),
                ],
              ],
            ),
          ),
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
    required SemanticKind kind,
    required String title,
    String? detail,
    required Duration duration,
  }) {
    final messenger = ScaffoldMessenger.of(context);
    final tone = SemanticTone.of(context, kind);
    final palette = AppPalette.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        duration: duration,
        behavior: SnackBarBehavior.floating,
        // El aviso va sobre la superficie del tema, no sobre el gris oscuro por
        // defecto de Material: con el tema claro activo, un rectángulo casi
        // negro flotando era el único elemento de la aplicación con ese color.
        backgroundColor: palette.surface,
        elevation: 0,
        margin: const EdgeInsets.all(AppSpacing.gap),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          side: BorderSide(color: tone.border),
        ),
        content: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: tone.bg,
                borderRadius: BorderRadius.circular(AppSpacing.radiusInput - 4),
              ),
              child: Icon(icon, color: tone.fg, size: 18),
            ),
            const SizedBox(width: AppSpacing.gapSm + 2),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: AppType.bodyStrong.copyWith(
                      color: palette.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (detail != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      detail,
                      style: AppType.caption.copyWith(color: palette.muted),
                    ),
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
        kind: SemanticKind.success,
        title: title,
        detail: detail,
        duration: const Duration(seconds: 3),
      );

  static void info(BuildContext context, String title, [String? detail]) => _show(
        context,
        icon: Icons.info_outline,
        kind: SemanticKind.info,
        title: title,
        detail: detail,
        duration: const Duration(seconds: 4),
      );

  static void error(BuildContext context, String title, [String? detail]) => _show(
        context,
        icon: Icons.error_outline,
        kind: SemanticKind.danger,
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
    final palette = context.palette;
    final base = palette.surfaceAlt;
    final highlight = palette.isDark ? palette.border : palette.surfaceSunken;

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
    return GridView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      // El mismo alto en dp que las tarjetas reales de [CompactStat]. Con una
      // proporción, el esqueleto medía otra cosa que lo que venía después y la
      // pantalla daba un salto justo al llegar los datos, que es exactamente lo
      // que un esqueleto existe para evitar.
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: AppSpacing.gapSm,
        mainAxisSpacing: AppSpacing.gapSm,
        mainAxisExtent: 120,
      ),
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
    final palette = context.palette;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Dos círculos concéntricos y no un icono suelto: un icono gris
            // flotando en el centro de una pantalla vacía se lee como algo que
            // no cargó. El halo le da un sitio donde estar y convierte el
            // bloque en algo intencionado, que es lo que un estado vacío tiene
            // que comunicar: aquí no falta nada, todavía no hay nada.
            Container(
              width: 76,
              height: 76,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: palette.surfaceAlt,
                shape: BoxShape.circle,
              ),
              child: Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.surface,
                  shape: BoxShape.circle,
                  boxShadow: AppShadows.sm(palette.isDark),
                ),
                child: Icon(icon, size: 26, color: palette.muted),
              ),
            ),
            const SizedBox(height: AppSpacing.gap + 4),
            Text(title, style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: AppSpacing.gapXs),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            if (action != null) ...[const SizedBox(height: AppSpacing.gap + 4), action!],
          ],
        ),
      ),
    );
  }
}
