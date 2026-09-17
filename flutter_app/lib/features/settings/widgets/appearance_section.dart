import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/theme/appearance/appearance_preferences.dart';
import '../../../core/theme/appearance/color_math.dart';
import '../../../core/theme/appearance/palettes.dart';
import '../../../core/theme/theme_controller.dart';
import '../../../core/widgets/ui_kit.dart';

/// Colores sugeridos para "Color propio": una docena de semillas que cubren
/// el círculo cromático, para no obligar a nadie a escribir un hex a mano si
/// solo quiere "un azul distinto" o "un rojo".
const List<String> _coloresSugeridos = [
  '#DC2626', '#EA580C', '#D97706', '#CA8A04', //
  '#65A30D', '#059669', '#0D9488', '#0891B2', //
  '#2563EB', '#7C3AED', '#C026D3', '#DB2777', //
];

/// Bloque "Apariencia" de Ajustes: modo, tono de interfaz, color propio,
/// visión del color y estilo (esquinas, tamaño de texto, movimiento).
///
/// Vive aparte de `settings_page.dart` porque es, con diferencia, el bloque
/// con más estado propio de la pantalla —un campo de texto validado, seis
/// preferencias independientes— y mezclado con el resto convertía el archivo
/// en una lista de casos especiales.
class AppearanceSection extends ConsumerStatefulWidget {
  const AppearanceSection({super.key});

  @override
  ConsumerState<AppearanceSection> createState() => _AppearanceSectionState();
}

class _AppearanceSectionState extends ConsumerState<AppearanceSection> {
  late final TextEditingController _hexController;

  @override
  void initState() {
    super.initState();
    _hexController = TextEditingController(
      text: ref.read(aparienciaProvider).colorPropio,
    );
  }

  @override
  void dispose() {
    _hexController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final apariencia = ref.watch(aparienciaProvider);
    final modo = ref.watch(themeModeProvider);
    final palette = context.palette;
    final muted = palette.muted;

    // La misma cuenta usada en Ajustes → Tema: sin ella, la vista previa de
    // los tonos pintaría siempre en claro aunque la app esté en oscuro.
    final oscuroAhora =
        modo == ThemeMode.dark ||
        (modo == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    final modoResuelto = oscuroAhora ? ModoResuelto.dark : ModoResuelto.light;

    // `stretch` y no `start`: con `start` cada tarjeta se encoge al ancho de
    // su contenido, así que la vista previa —que es lo más estrecho— quedaba
    // a media pantalla con un hueco a la derecha, desalineada de las demás.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SubLabel('Modo', muted: muted),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  oscuroAhora
                      ? Icons.dark_mode_outlined
                      : Icons.light_mode_outlined,
                ),
                title: const Text('Tema'),
                subtitle: const Text('Claro, oscuro o según el sistema'),
              ),
              // Tres opciones y no un interruptor: con el interruptor, tocar
              // el tema una sola vez dejaba la app clavada en claro u oscuro
              // para siempre y «seguir al sistema» dejaba de ser alcanzable.
              SegmentedButton<ThemeMode>(
                segments: const [
                  ButtonSegment(
                    value: ThemeMode.light,
                    icon: Icon(Icons.light_mode_outlined),
                    label: Text('Claro'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.dark,
                    icon: Icon(Icons.dark_mode_outlined),
                    label: Text('Oscuro'),
                  ),
                  ButtonSegment(
                    value: ThemeMode.system,
                    icon: Icon(Icons.brightness_auto_outlined),
                    label: Text('Sistema'),
                  ),
                ],
                selected: {modo},
                showSelectedIcon: false,
                onSelectionChanged: (seleccion) =>
                    ref.read(themeModeProvider.notifier).set(seleccion.first),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SubLabel('Tono de interfaz', muted: muted),
        AppCard(
          // Filas de ancho completo, no una cuadrícula de círculos: con seis
          // tonos, la cuadrícula dejaba una segunda fila coja y los nombres
          // largos ("Institucional", "Color propio") se cortaban con puntos
          // suspensivos justo en las dos opciones que hay que distinguir.
          child: Column(
            children: [
              for (final tono in [...tonosPredefinidos, Tono.personalizado])
                _ToneRow(
                  tono: tono,
                  modo: modoResuelto,
                  colorPropio: apariencia.colorPropio,
                  selected: apariencia.tono == tono,
                  primeraDeLaLista: tono == tonosPredefinidos.first,
                  onTap: () =>
                      ref.read(aparienciaProvider.notifier).setTono(tono),
                ),
            ],
          ),
        ),
        if (apariencia.tono == Tono.personalizado) ...[
          const SizedBox(height: 22),
          _SubLabel('Color propio', muted: muted),
          Builder(
            builder: (context) {
              // El generador ajusta la luminosidad del color elegido hasta que
              // el texto encima pasa AA (ver `ajustarHastaContraste` en
              // `color_math.dart`): con un amarillo puro o un blanco, el color
              // que de verdad pintan los botones no es el que se escribió. El
              // escritorio muestra el hex real por la misma razón — un color
              // "un poco ajustado" sin decir cuál no es verificable.
              final tokensPropio = tokensDeTono(
                Tono.personalizado,
                modoResuelto,
                apariencia.colorPropio,
              );
              final colorAjustado =
                  tokensPropio.primary != apariencia.colorPropio;

              return AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: AppSpacing.gapSm,
                      runSpacing: AppSpacing.gapSm,
                      children: [
                        for (final hex in _coloresSugeridos)
                          _PresetSwatch(
                            hex: hex,
                            selected:
                                apariencia.colorPropio.toUpperCase() == hex,
                            onTap: () {
                              _hexController.text = hex;
                              ref
                                  .read(aparienciaProvider.notifier)
                                  .setColorPropio(hex);
                            },
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.gap),
                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _hexController,
                      builder: (context, valor, _) {
                        final valido = esHexValido(valor.text);
                        return TextField(
                          controller: _hexController,
                          textCapitalization: TextCapitalization.characters,
                          maxLength: 7,
                          decoration: InputDecoration(
                            labelText: 'Color en hexadecimal',
                            hintText: '#1D4ED8',
                            counterText: '',
                            errorText: valor.text.isEmpty || valido
                                ? null
                                : 'Formato inválido',
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.check),
                              tooltip: 'Aplicar',
                              onPressed: valido
                                  ? () => ref
                                        .read(aparienciaProvider.notifier)
                                        .setColorPropio(valor.text)
                                  : null,
                            ),
                          ),
                          onSubmitted: (texto) {
                            if (esHexValido(texto)) {
                              ref
                                  .read(aparienciaProvider.notifier)
                                  .setColorPropio(texto);
                            }
                          },
                        );
                      },
                    ),
                    if (colorAjustado) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Para que el texto se lea, los botones usan '
                        '${tokensPropio.primary}, una variante del color elegido.',
                        style: AppType.caption.copyWith(color: muted),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
        const SizedBox(height: 22),
        _SubLabel('Visión del color', muted: muted),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Column(
            children: [
              for (final vision in visiones)
                _VisionTile(
                  vision: vision,
                  modo: modoResuelto,
                  selected: apariencia.vision == vision,
                  onTap: () =>
                      ref.read(aparienciaProvider.notifier).setVision(vision),
                ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SubLabel('Estilo', muted: muted),
        AppCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Esquinas', style: AppType.bodyStrong),
              const SizedBox(height: 8),
              SegmentedButton<Esquinas>(
                segments: [
                  for (final e in Esquinas.values)
                    ButtonSegment(value: e, label: Text(e.etiqueta)),
                ],
                selected: {apariencia.esquinas},
                showSelectedIcon: false,
                onSelectionChanged: (s) =>
                    ref.read(aparienciaProvider.notifier).setEsquinas(s.first),
              ),
              const SizedBox(height: AppSpacing.gap),
              Text('Tamaño de texto', style: AppType.bodyStrong),
              const SizedBox(height: 8),
              SegmentedButton<TamanoTexto>(
                segments: [
                  for (final t in TamanoTexto.values)
                    ButtonSegment(value: t, label: Text(t.etiqueta)),
                ],
                selected: {apariencia.tamanoTexto},
                showSelectedIcon: false,
                onSelectionChanged: (s) => ref
                    .read(aparienciaProvider.notifier)
                    .setTamanoTexto(s.first),
              ),
              const SizedBox(height: AppSpacing.gap),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Reducir movimiento'),
                subtitle: const Text('Apaga las animaciones de la interfaz'),
                value: apariencia.reducirMovimiento,
                onChanged: (v) => ref
                    .read(aparienciaProvider.notifier)
                    .setReducirMovimiento(v),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SubLabel('Vista previa', muted: muted),
        const _PreviewCard(),
        const SizedBox(height: AppSpacing.gap),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () =>
                ref.read(aparienciaProvider.notifier).restablecer(),
            icon: const Icon(Icons.restart_alt),
            label: const Text('Restablecer apariencia'),
          ),
        ),
      ],
    );
  }
}

class _SubLabel extends StatelessWidget {
  final String text;
  final Color muted;
  const _SubLabel(this.text, {required this.muted});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: AppType.captionStrong.copyWith(
          letterSpacing: 0.8,
          fontWeight: FontWeight.w700,
          color: muted,
        ),
      ),
    );
  }
}

/// Fila de un tono: muestra de color, nombre completo, descripción y la marca
/// de elegido. Alto 56 dp, el mismo de `AcademicRow`, y toda la fila es el
/// objetivo táctil.
class _ToneRow extends StatelessWidget {
  final Tono tono;
  final ModoResuelto modo;
  final String colorPropio;
  final bool selected;
  final bool primeraDeLaLista;
  final VoidCallback onTap;

  const _ToneRow({
    required this.tono,
    required this.modo,
    required this.colorPropio,
    required this.selected,
    required this.primeraDeLaLista,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tokens = tokensDeTono(tono, modo, colorPropio);

    return Column(
      children: [
        if (!primeraDeLaLista)
          Divider(height: 1, thickness: 1, color: palette.border),
        InkWell(
          onTap: onTap,
          child: Semantics(
            selected: selected,
            // Alto MÍNIMO, no fijo: con el texto grande del sistema las dos
            // líneas pasan de 56 dp y un alto fijo las recorta (6 px de
            // desbordamiento, que es una raya amarilla y media palabra
            // cortada). El relleno mantiene la densidad cuando caben.
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                minHeight: AppSpacing.rowHeight,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.gapSm),
                child: Row(
                  children: [
                    const SizedBox(width: AppSpacing.gap),
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            colorDeHex(tokens.primary),
                            colorDeHex(tokens.accent),
                          ],
                        ),
                        border: Border.all(color: palette.border),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.gap),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tono.etiqueta,
                            style: AppType.bodyStrong.copyWith(
                              color: palette.text,
                              fontWeight: selected
                                  ? FontWeight.w700
                                  : FontWeight.w600,
                            ),
                          ),
                          Text(
                            tono.descripcion,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppType.caption.copyWith(
                              color: palette.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (selected)
                      Icon(
                        Icons.check_circle,
                        color: palette.primary,
                        size: 22,
                      ),
                    const SizedBox(width: AppSpacing.gap),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PresetSwatch extends StatelessWidget {
  final String hex;
  final bool selected;
  final VoidCallback onTap;
  const _PresetSwatch({
    required this.hex,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = colorDeHex(normalizarHex(hex));
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: AppSpacing.tapTargetMin,
        height: AppSpacing.tapTargetMin,
        alignment: Alignment.center,
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
            border: Border.all(
              color: selected ? context.palette.text : Colors.black12,
              width: selected ? 2.5 : 1,
            ),
          ),
        ),
      ),
    );
  }
}

/// Una opción de visión del color: etiqueta, descripción breve y una fila de
/// cuatro chips que muestran cómo se ven los cuatro estados semánticos CON
/// ESA visión — no con la activa, que es lo que resolvería `context.palette`.
class _VisionTile extends StatelessWidget {
  final VisionColor vision;
  final ModoResuelto modo;
  final bool selected;
  final VoidCallback onTap;
  const _VisionTile({
    required this.vision,
    required this.modo,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tonos = tonosSemanticos(vision, modo);

    return ListTile(
      onTap: onTap,
      selected: selected,
      selectedTileColor: palette.primarySoft,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      leading: Icon(
        selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
        color: selected ? palette.primary : palette.muted,
      ),
      title: Text(vision.etiqueta, style: AppType.bodyStrong),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              vision.descripcion,
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _chip('Aprobado', tonos.success),
                _chip('Advertencia', tonos.warning),
                _chip('Riesgo alto', tonos.danger),
                _chip('Información', tonos.info),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String texto, Semantico tono) {
    final fg = colorDeHex(tono.fg);
    final bg = colorDeHex(tono.soft);
    final border = colorDeHex(tono.border);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        border: Border.all(color: border),
      ),
      child: Text(
        texto,
        style: AppType.caption.copyWith(color: fg, fontSize: 11),
      ),
    );
  }
}

/// Tarjeta de ejemplo con el tema realmente activo: cambia en vivo con cada
/// preferencia porque `context.palette` lee el `ThemeData` que
/// `MaterialApp.router` acaba de reconstruir con la apariencia elegida.
class _PreviewCard extends StatelessWidget {
  const _PreviewCard();

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final frente = palette.isDark ? palette.text : Colors.white;

    // Nada de aquí hace nada: es una maqueta. `IgnorePointer` evita el botón
    // que se hunde y no pasa nada, y `ExcludeSemantics` evita que el lector de
    // pantalla lea tres botones falsos entre los ajustes de verdad.
    return ExcludeSemantics(
      child: IgnorePointer(
        child: AppCard(
          padding: EdgeInsets.zero,
          // `stretch`: la cabecera de marca tiene que llegar a los dos bordes
          // de la tarjeta. Con `start` medía lo que su texto y quedaba un
          // bloque de color a media tarjeta, con el resto vacío al lado.
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // La superficie de marca es donde más se nota el tono: sin ella,
              // la vista previa solo enseñaba dos botones y tres pastillas.
              BrandSurface(
                padding: const EdgeInsets.all(AppSpacing.gap),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppSpacing.radiusCard),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Clase en curso',
                      style: AppType.caption.copyWith(
                        color: frente.withValues(alpha: 0.8),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Ingeniería del Software · A194',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppType.bodyStrong.copyWith(color: frente),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.gap),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Así se ve el texto secundario con esta apariencia.',
                      style: AppType.caption.copyWith(color: palette.muted),
                    ),
                    const SizedBox(height: AppSpacing.gap),
                    // `Wrap` y no `Row`: con el texto grande del sistema los
                    // dos botones no caben en una línea de 360 dp, y en `Row`
                    // eso es un desbordamiento, no un salto de línea.
                    Wrap(
                      spacing: AppSpacing.gapSm,
                      runSpacing: AppSpacing.gapSm,
                      children: [
                        FilledButton(
                          onPressed: () {},
                          child: const Text('Guardar notas'),
                        ),
                        OutlinedButton(
                          onPressed: () {},
                          child: const Text('Cancelar'),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.gapSm),
                    Wrap(
                      spacing: AppSpacing.gapSm,
                      runSpacing: AppSpacing.gapSm,
                      children: const [
                        StatusPill('Aprobado', kind: SemanticKind.success),
                        StatusPill('Advertencia', kind: SemanticKind.warning),
                        StatusPill('Riesgo alto', kind: SemanticKind.danger),
                        StatusPill('Información', kind: SemanticKind.info),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
