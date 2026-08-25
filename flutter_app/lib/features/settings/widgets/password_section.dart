import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/password_policy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/widgets/ui_kit.dart';

/// Cambio de la propia contraseña, para cualquier rol.
///
/// Se pide la actual aunque la sesión ya diga quién eres: un teléfono
/// desbloqueado encima de una mesa convertiría este formulario en apropiarse de
/// la cuenta sin saber nada de su dueño.
///
/// Cambiarla **cierra las demás sesiones**, que es exactamente para lo que se
/// cambia una contraseña. Se avisa antes y se repite después: quien no lo sepa
/// se queda creyendo que el computador de la oficina sigue dentro.
class PasswordSection extends ConsumerWidget {
  const PasswordSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: ListTile(
        leading: const Icon(Icons.lock_outline),
        title: const Text('Cambiar contraseña'),
        subtitle: const Text('Cierra las demás sesiones; esta se mantiene'),
        trailing: const Icon(Icons.chevron_right_outlined),
        onTap: () => _abrir(context, ref),
      ),
    );
  }

  Future<void> _abrir(BuildContext context, WidgetRef ref) async {
    // Hoja modal y no una pantalla: son tres campos y se vuelve al mismo sitio.
    // `isScrollControlled` con el inset del teclado es lo que evita que el
    // tercer campo quede debajo del teclado en un teléfono corto.
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _FormularioContrasena(),
    );
  }
}

class _FormularioContrasena extends ConsumerStatefulWidget {
  const _FormularioContrasena();

  @override
  ConsumerState<_FormularioContrasena> createState() => _FormularioContrasenaState();
}

class _FormularioContrasenaState extends ConsumerState<_FormularioContrasena> {
  final _formKey = GlobalKey<FormState>();
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _confirmacion = TextEditingController();
  bool _visible = false;
  bool _guardando = false;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _confirmacion.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _guardando = true);
    try {
      final mensaje = await ref.read(authControllerProvider.notifier).cambiarPassword(
            actual: _actual.text,
            nueva: _nueva.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      AppToast.success(context, 'Contraseña actualizada', mensaje);
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() => _guardando = false);
      AppToast.error(context, 'No se pudo cambiar', error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _guardando = false);
      AppToast.error(context, 'No se pudo cambiar',
          'Revisa la conexión con el servidor e inténtalo de nuevo.');
    }
  }

  @override
  Widget build(BuildContext context) {
    // `viewInsetsOf` y no `MediaQuery.of`: el teclado anima este valor fotograma
    // a fotograma, y suscribirse al MediaQueryData entero reconstruiría la hoja
    // sesenta veces por segundo mientras sube.
    final teclado = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: teclado + 16),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Cambiar contraseña', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              'Al cambiarla se cierran las demás sesiones. Esta se mantiene abierta.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _actual,
              obscureText: !_visible,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Contraseña actual'),
              validator: (valor) =>
                  (valor == null || valor.isEmpty) ? 'Escribe tu contraseña actual.' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _nueva,
              obscureText: !_visible,
              autofillHints: const [AutofillHints.newPassword],
              decoration: const InputDecoration(
                labelText: 'Contraseña nueva',
                helperText: ayudaPassword,
              ),
              // La política vive en `password_policy.dart`, no copiada aquí: el
              // backend impone la misma y tres copias garantizan que una quede
              // atrás el día que cambie.
              validator: (valor) {
                final motivo = revisarPassword(valor ?? '');
                if (motivo != null) return motivo;
                if (valor == _actual.text) {
                  return 'Es igual a la actual: quien la supiera seguiría sabiéndola.';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _confirmacion,
              obscureText: !_visible,
              decoration: const InputDecoration(labelText: 'Repite la nueva'),
              validator: (valor) =>
                  valor == _nueva.text ? null : 'No coincide con la contraseña nueva.',
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(() => _visible = !_visible),
                icon: Icon(_visible ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                label: Text(_visible ? 'Ocultar' : 'Ver lo escrito'),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: _guardando ? null : _guardar,
              child: Text(_guardando ? 'Cambiando…' : 'Cambiar contraseña'),
            ),
          ],
        ),
      ),
    );
  }
}
