import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_error.dart';
import '../../core/network/connection_controller.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/rubri.dart';
import '../../core/widgets/ui_kit.dart';
import 'widgets/rubri_del_acceso.dart';

/// Pantalla de acceso.
///
///  - **No hay credenciales precargadas.** Estaban escritas en el código fuente.
///  - **No se pide la dirección del servidor.** La app lo busca sola en la red;
///    la entrada manual queda escondida como último recurso, para redes donde el
///    barrido no llega.
///
/// La capa visual sigue al acceso del escritorio, en sobrio: una banda de marca
/// plana arriba —el verde institucional liso, con el logo, el nombre, la frase y
/// Rubri— y debajo el formulario en una tarjeta de superficie con borde fino.
/// Sin degradados, sin nubes, sin desenfoque y sin apertura escalonada: nada se
/// mueve salvo Rubri, que lleva su propio vaivén y lo apaga con «reducir
/// movimiento» dentro de su widget.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _manualServer = TextEditingController();

  String? _emailError;
  String? _passwordError;
  bool _submitting = false;
  bool _showManualServer = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    // Se busca el servidor mientras el usuario escribe sus credenciales, así el
    // descubrimiento no se siente como una espera.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(connectionControllerProvider.notifier).initialize();
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _manualServer.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;

    setState(() {
      _emailError = email.isEmpty
          ? 'El correo es obligatorio'
          : (!email.contains('@') ? 'Correo inválido' : null);
      _passwordError = password.isEmpty ? 'La contraseña es obligatoria' : null;
    });
    if (_emailError != null || _passwordError != null) return;

    setState(() => _submitting = true);
    try {
      await ref.read(authControllerProvider.notifier).login(email, password);
      if (mounted) context.go('/');
    } catch (error) {
      final apiError = ApiError.from(error);
      if (!mounted) return;

      setState(() {
        if (apiError.kind == ApiErrorKind.unauthorized) {
          _passwordError = 'Correo o contraseña incorrectos';
        }
      });
      AppToast.error(context, 'No se pudo iniciar sesión', apiError.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _applyManualServer() async {
    final ok = await ref
        .read(connectionControllerProvider.notifier)
        .setManual(_manualServer.text);

    if (!mounted) return;
    if (ok) {
      setState(() => _showManualServer = false);
      AppToast.success(context, 'Servidor conectado');
    } else {
      AppToast.error(
        context,
        'No responde',
        'Verifica la dirección y que el servidor esté encendido.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionControllerProvider);
    final palette = context.palette;
    final muted = palette.muted;

    // Rubri pone la cara del estado: sin servidor a la vista, «sin conexión».
    // Es la única pieza de la cabecera que dice algo, y dice lo mismo que el
    // aviso de abajo.
    final emocion = connection.phase == ConnectionPhase.notFound
        ? RubriEmotion.offline
        : RubriEmotion.happy;

    // El formulario se construye AQUÍ y baja ya armado: los campos conservan sus
    // controladores y la pantalla no los reconstruye por nada ajeno a ellos.
    return Scaffold(
      backgroundColor: palette.bg,
      // Iconos de la barra de estado en claro: arriba está la banda de marca,
      // verde oscuro en claro y superficie oscura en oscuro, y con los iconos
      // oscuros del tema claro la hora desaparecía.
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: _PantallaDeAcceso(
          emocion: emocion,
          formulario: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Bienvenido de vuelta',
                style: AppType.h3.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.gapXs),
              Text(
                'Ingresa con tu cuenta institucional.',
                style: AppType.body.copyWith(color: muted),
              ),
              const SizedBox(height: AppSpacing.page + AppSpacing.gapXs),

              TextField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: 'Correo institucional',
                  hintText: 'docente@uts.edu.co',
                  prefixIcon: const Icon(Icons.mail_outline),
                  errorText: _emailError,
                ),
              ),
              const SizedBox(height: AppSpacing.gap),

              TextField(
                controller: _password,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  labelText: 'Contraseña',
                  prefixIcon: const Icon(Icons.lock_outline),
                  errorText: _passwordError,
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    tooltip: _obscurePassword ? 'Mostrar' : 'Ocultar',
                    onPressed: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.page + AppSpacing.gapXs),

              _BotonPrincipal(enviando: _submitting, onPressed: _submit),
              const SizedBox(height: AppSpacing.gapXs),
              TextButton(
                onPressed: () => context.push('/registro'),
                child: const Text('Registrarme como docente'),
              ),
              TextButton(
                onPressed: () => context.go('/recovery'),
                child: const Text('¿Olvidaste tu contraseña?'),
              ),

              // El estado de la conexión solo se enseña cuando hay algo que
              // hacer al respecto. Mientras comprueba, y cuando encuentra el
              // servidor, la pantalla no dice nada: «servidor encontrado» es
              // ruido debajo de un formulario que ya se puede rellenar.
              //
              // La búsqueda SÍ se enseña, con su barra de progreso: barrer la
              // red tarda unos segundos y sin esa señal la pantalla parece
              // colgada. Y los dos fallos se quedan, porque llevan los
              // botones de reintentar y de escribir la dirección a mano —
              // sin ellos, una red donde el barrido no llega deja la
              // aplicación sin forma de arreglarse desde dentro.
              if (_muestraConexion(connection.phase)) ...[
                const SizedBox(height: AppSpacing.page),
                const Divider(),
                const SizedBox(height: AppSpacing.gapSm),
                _ConnectionBanner(
                  state: connection,
                  onRetry: () => ref
                      .read(connectionControllerProvider.notifier)
                      .discover(),
                  onManual: () =>
                      setState(() => _showManualServer = !_showManualServer),
                ),
              ],

              if (_showManualServer) ...[
                const SizedBox(height: AppSpacing.gap),
                TextField(
                  controller: _manualServer,
                  keyboardType: TextInputType.url,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Dirección del servidor',
                    hintText: '192.168.1.10',
                    prefixIcon: Icon(Icons.dns_outlined),
                    helperText:
                        'Solo si la búsqueda automática no lo encuentra',
                  ),
                ),
                const SizedBox(height: AppSpacing.gapSm),
                OutlinedButton(
                  onPressed: _applyManualServer,
                  child: const Text('Conectar a esta dirección'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Capa visual ─────────────────────────────────────────────────────────────

/// Banda de marca plana y, debajo, el formulario.
///
/// Desplazable: el teclado lo resuelve `Scaffold` (el cuerpo se encoge y esto
/// se desplaza), así que en 360×640 con el teclado abierto no hay ninguna
/// `Column` a la que le falte alto. El alto mínimo es el del viewport, así que
/// en un teléfono alto el fondo de página llena lo que sobra bajo la tarjeta.
class _PantallaDeAcceso extends StatelessWidget {
  final Widget formulario;
  final RubriEmotion emocion;

  const _PantallaDeAcceso({required this.formulario, required this.emocion});

  /// Ancho máximo del bloque en tabletas.
  static const double anchoMaximo = 420;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, limites) => SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: limites.maxHeight),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _BandaDeMarca(emocion: emocion),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.page),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: anchoMaximo),
                      child: _TarjetaDeAcceso(child: formulario),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// La banda de marca: el verde institucional liso —en oscuro, la superficie
/// suave de marca con su filo inferior— con el logo, Rubri, el nombre y la
/// frase alineados a la izquierda.
class _BandaDeMarca extends StatelessWidget {
  final RubriEmotion emocion;

  const _BandaDeMarca({required this.emocion});

  static const double _ladoBaldosa = 56;
  static const double _ladoLogo = 40;
  static const double _ladoRubri = 80;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final oscuro = palette.isDark;
    // En claro el texto sobre la marca es `onPrimary`; en oscuro la banda es
    // apagada y `onPrimary` es el color del FONDO, así que va el texto del tema.
    final sobreMarca = oscuro ? palette.text : palette.onPrimary;
    final arriba = MediaQuery.paddingOf(context).top;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: oscuro ? palette.primarySoft : palette.primary,
        border: oscuro
            ? Border(bottom: BorderSide(color: palette.border))
            : null,
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.page,
          arriba + AppSpacing.page,
          AppSpacing.page,
          AppSpacing.page + AppSpacing.gapSm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Container(
                  width: _ladoBaldosa,
                  height: _ladoBaldosa,
                  padding: const EdgeInsets.all(AppSpacing.gapSm),
                  decoration: BoxDecoration(
                    // El logo lleva verde, azul y lima: sobre una baldosa clara
                    // (o la superficie de la app, en oscuro) tiene el mismo
                    // contraste que en el resto de la aplicación con cualquier
                    // tono.
                    color: oscuro ? palette.surface : palette.onPrimary,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                    border: oscuro ? Border.all(color: palette.border) : null,
                  ),
                  child: Image.asset(
                    'assets/logo.webp',
                    cacheHeight:
                        (_ladoLogo * MediaQuery.devicePixelRatioOf(context))
                            .round(),
                    errorBuilder: (_, __, ___) =>
                        Icon(Icons.school_outlined, color: palette.primary),
                  ),
                ),
                const Spacer(),
                // Rubri es la única ilustración de la pantalla. Su vaivén
                // propio se apaga solo con «reducir movimiento», dentro del
                // widget; el `RepaintBoundary` evita que ese vaivén repinte
                // también la banda.
                RepaintBoundary(
                  child: RubriDelAcceso(emocion: emocion, size: _ladoRubri),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.page),
            Text(
              'UTS Nexus Académico',
              style: AppType.h3.copyWith(
                fontWeight: FontWeight.w700,
                color: sobreMarca,
              ),
            ),
            const SizedBox(height: AppSpacing.gapXs),
            Text(
              'Menos planillas. Más tiempo con tus estudiantes.',
              style: AppType.body.copyWith(
                color: sobreMarca.withValues(alpha: 0.85),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// La tarjeta del formulario: superficie plana con borde fino, como cualquier
/// `AppCard`. El `Material` transparente va dentro de la decoración por lo mismo
/// que en `AppCard`: la onda del ojo de la contraseña se pinta sobre el
/// `Material` más cercano.
class _TarjetaDeAcceso extends StatelessWidget {
  final Widget child;

  const _TarjetaDeAcceso({required this.child});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: palette.border),
      ),
      child: Material(
        color: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.page),
          child: child,
        ),
      ),
    );
  }
}

/// El botón de entrar con su estado de envío: debajo aparece una barra de
/// progreso de 3 dp **con su alto ya reservado**, para que el formulario no dé
/// un salto al empezar a enviar.
class _BotonPrincipal extends StatelessWidget {
  final bool enviando;
  final VoidCallback onPressed;

  const _BotonPrincipal({required this.enviando, required this.onPressed});

  static const double _grosorBarra = 3;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final sinMovimiento = MediaQuery.disableAnimationsOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // El alto lo pone el tema (48 dp): el objetivo táctil está decidido
        // en un sitio y esta pantalla no es la excepción.
        FilledButton(
          onPressed: enviando ? null : onPressed,
          child: Text(enviando ? 'Entrando…' : 'Entrar'),
        ),
        const SizedBox(height: AppSpacing.gapSm),
        SizedBox(
          height: _grosorBarra,
          child: AnimatedOpacity(
            opacity: enviando ? 1 : 0,
            duration: sinMovimiento ? Duration.zero : AppMotion.fast,
            child: enviando
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                    child: LinearProgressIndicator(
                      minHeight: _grosorBarra,
                      color: palette.primary,
                      backgroundColor: palette.primarySoft,
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ),
      ],
    );
  }
}

// ── Sin cambios respecto a la versión anterior ──────────────────────────────

/// Qué fases de la conexión se enseñan en el acceso.
///
/// Se decide con un `switch` sobre el enum y no con una lista de fases
/// ocultas: si mañana se añade una fase, esto deja de compilar y hay que
/// decidir qué hacer con ella. Con una lista, la fase nueva se colaría o se
/// quedaría muda sin que nadie lo notara.
bool _muestraConexion(ConnectionPhase fase) => switch (fase) {
  ConnectionPhase.checking => false,
  ConnectionPhase.connected => false,
  ConnectionPhase.discovering => true,
  ConnectionPhase.degraded => true,
  ConnectionPhase.notFound => true,
};

/// Estado de la conexión, en lenguaje de usuario.
class _ConnectionBanner extends StatelessWidget {
  final ServerConnectionState state;
  final VoidCallback onRetry;
  final VoidCallback onManual;

  const _ConnectionBanner({
    required this.state,
    required this.onRetry,
    required this.onManual,
  });

  @override
  Widget build(BuildContext context) {
    final muted = context.palette.muted;

    // `switch` como expresión: el analizador comprueba que estén todos los
    // casos del enum, así que añadir una fase nueva rompe la compilación en vez
    // de dejar la pantalla en blanco.
    return switch (state.phase) {
      ConnectionPhase.checking => _row(
        icon: Icons.wifi_find_outlined,
        color: muted,
        text: 'Comprobando el servidor…',
      ),
      ConnectionPhase.discovering => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.travel_explore_outlined,
            color: SemanticTone.of(context, SemanticKind.info).fg,
            text: 'Buscando el servidor en tu red…',
          ),
          const SizedBox(height: AppSpacing.gapSm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
            child: LinearProgressIndicator(
              value: state.progress == 0 ? null : state.progress,
              minHeight: 4,
            ),
          ),
        ],
      ),
      ConnectionPhase.connected => _row(
        icon: Icons.check_circle_outline,
        color: SemanticTone.of(context, SemanticKind.success).fg,
        text: state.detail ?? 'Servidor encontrado',
      ),

      ConnectionPhase.degraded => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.warning_amber_outlined,
            color: SemanticTone.of(context, SemanticKind.warning).fg,
            text: 'El servidor no alcanza la base de datos',
          ),
          const SizedBox(height: AppSpacing.gapXs),
          Text(
            'Podrás abrir la app, pero no habrá datos hasta que se resuelva.',
            style: AppType.caption.copyWith(color: muted),
          ),
        ],
      ),
      ConnectionPhase.notFound => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.wifi_off_outlined,
            color: SemanticTone.of(context, SemanticKind.danger).fg,
            text: 'No encontramos el servidor',
          ),
          const SizedBox(height: AppSpacing.gapXs),
          Text(
            state.detail ??
                'Verifica que el servidor esté encendido y que estés en la misma red Wi-Fi.',
            style: AppType.caption.copyWith(color: muted),
          ),
          const SizedBox(height: AppSpacing.gapSm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Buscar de nuevo'),
                ),
              ),
              const SizedBox(width: AppSpacing.gapSm),
              Expanded(
                child: TextButton(
                  onPressed: onManual,
                  child: const Text('Escribir dirección'),
                ),
              ),
            ],
          ),
        ],
      ),
    };
  }

  Widget _row({
    required IconData icon,
    required Color color,
    required String text,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppSpacing.gapSm),
        Expanded(
          child: Text(
            text,
            style: AppType.captionStrong.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}
