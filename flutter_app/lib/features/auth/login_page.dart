import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_error.dart';
import '../../core/network/connection_controller.dart';
import '../../core/services/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Pantalla de acceso.
///
/// Dos cambios frente a la versión anterior:
///
///  - **No hay credenciales precargadas.** Estaban escritas en el código fuente.
///  - **No se pide la dirección del servidor.** La app lo busca sola en la red;
///    la entrada manual queda escondida como último recurso, para redes donde el
///    barrido no llega.
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
      AppToast.error(context, 'No responde', 'Verifica la dirección y que el servidor esté encendido.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionControllerProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  Image.asset(
                    'assets/logo.png',
                    height: 96,
                    errorBuilder: (_, __, ___) => Icon(
                      Icons.school,
                      size: 72,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'UTS Nexus Académico',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Ingresa con tu cuenta institucional',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 14),
                  ),
                  const SizedBox(height: 28),

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
                  const SizedBox(height: 14),

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
                        icon: Icon(_obscurePassword
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined),
                        tooltip: _obscurePassword ? 'Mostrar' : 'Ocultar',
                        onPressed: () =>
                            setState(() => _obscurePassword = !_obscurePassword),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),

                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          )
                        : const Text('Entrar'),
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () => context.go('/recovery'),
                    child: const Text('¿Olvidaste tu contraseña?'),
                  ),

                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 8),

                  _ConnectionBanner(
                    state: connection,
                    onRetry: () =>
                        ref.read(connectionControllerProvider.notifier).discover(),
                    onManual: () =>
                        setState(() => _showManualServer = !_showManualServer),
                  ),

                  if (_showManualServer) ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _manualServer,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Dirección del servidor',
                        hintText: '192.168.1.10',
                        prefixIcon: Icon(Icons.dns_outlined),
                        helperText: 'Solo si la búsqueda automática no lo encuentra',
                      ),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: _applyManualServer,
                      child: const Text('Conectar a esta dirección'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

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
              icon: Icons.travel_explore,
              color: AppColors.info,
              text: 'Buscando el servidor en tu red…',
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: state.progress == 0 ? null : state.progress,
                minHeight: 4,
              ),
            ),
          ],
        ),
      ConnectionPhase.connected => _row(
          icon: Icons.check_circle_outline,
          color: AppColors.success,
          text: state.detail ?? 'Servidor encontrado',
        ),

      ConnectionPhase.degraded => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _row(
              icon: Icons.warning_amber_outlined,
              color: AppColors.warningText,
              text: 'El servidor no alcanza la base de datos',
            ),
            const SizedBox(height: 4),
            Text(
              'Podrás abrir la app, pero no habrá datos hasta que se resuelva.',
              style: TextStyle(fontSize: 12, color: muted),
            ),
          ],
        ),
      ConnectionPhase.notFound => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _row(
              icon: Icons.wifi_off_outlined,
              color: AppColors.danger,
              text: 'No encontramos el servidor',
            ),
            const SizedBox(height: 4),
            Text(
              state.detail ??
                  'Verifica que el servidor esté encendido y que estés en la misma red Wi-Fi.',
              style: TextStyle(fontSize: 12, color: muted),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Buscar de nuevo'),
                  ),
                ),
                const SizedBox(width: 8),
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

  Widget _row({required IconData icon, required Color color, required String text}) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 13, color: color, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}
