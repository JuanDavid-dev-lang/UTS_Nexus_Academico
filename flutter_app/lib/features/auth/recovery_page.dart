import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_error.dart';
import '../../core/services/api_client.dart';
import '../../core/theme/app_theme.dart';

/// Recuperación de contraseña, en dos pasos.
///
/// La versión anterior mostraba los tres campos y los dos botones a la vez, y
/// volcaba `response.data.toString()` en pantalla. Aquí el flujo es secuencial:
/// primero se pide el código, y solo entonces aparecen el código y la nueva
/// contraseña. Nadie tiene que adivinar el orden.
class RecoveryPage extends StatefulWidget {
  const RecoveryPage({super.key});

  @override
  State<RecoveryPage> createState() => _RecoveryPageState();
}

enum _Step { requestCode, resetPassword, done }

class _RecoveryPageState extends State<RecoveryPage> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();

  _Step _step = _Step.requestCode;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recuperar contraseña'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/login'),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _step == _Step.done
                  ? _DoneView(onBack: () => context.go('/login'))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          _step == _Step.requestCode
                              ? 'Te enviaremos un código al correo institucional registrado.'
                              : 'Revisa tu correo e ingresa el código que recibiste.',
                          style: TextStyle(fontSize: 14, color: muted),
                        ),
                        const SizedBox(height: 22),
                        TextField(
                          controller: _email,
                          enabled: _step == _Step.requestCode,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Correo institucional',
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                        ),
                        if (_step == _Step.resetPassword) ...[
                          const SizedBox(height: 14),
                          TextField(
                            controller: _code,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Código recibido',
                              prefixIcon: Icon(Icons.pin_outlined),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _password,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Nueva contraseña',
                              prefixIcon: Icon(Icons.lock_outline),
                              helperText: 'Mínimo 8 caracteres',
                            ),
                          ),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.error_outline,
                                  size: 18, color: AppColors.danger),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: const TextStyle(
                                      fontSize: 13, color: AppColors.danger),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _busy ? null : _submit,
                          child: _busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2.4))
                              : Text(_step == _Step.requestCode
                                  ? 'Enviar código'
                                  : 'Restablecer contraseña'),
                        ),
                        if (_step == _Step.resetPassword) ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => setState(() {
                                      _step = _Step.requestCode;
                                      _error = null;
                                    }),
                            child: const Text('Usar otro correo'),
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

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      if (_step == _Step.requestCode) {
        final email = _email.text.trim();
        if (email.isEmpty || !email.contains('@')) {
          setState(() => _error = 'Ingresa un correo válido.');
          return;
        }
        await ApiClient.instance
            .post('/auth/recovery/request', data: {'email': email});
        if (mounted) setState(() => _step = _Step.resetPassword);
      } else {
        if (_code.text.trim().isEmpty) {
          setState(() => _error = 'Ingresa el código que recibiste.');
          return;
        }
        if (_password.text.length < 8) {
          setState(
              () => _error = 'La contraseña debe tener al menos 8 caracteres.');
          return;
        }
        await ApiClient.instance.post('/auth/recovery/reset', data: {
          'email': _email.text.trim(),
          'code': _code.text.trim(),
          'newPassword': _password.text,
        });
        if (mounted) setState(() => _step = _Step.done);
      }
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _DoneView extends StatelessWidget {
  final VoidCallback onBack;
  const _DoneView({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 20),
        const Icon(Icons.check_circle_outline,
            size: 64, color: AppColors.success),
        const SizedBox(height: 18),
        const Text(
          'Contraseña actualizada',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Ya puedes ingresar con tu nueva contraseña.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 26),
        FilledButton(onPressed: onBack, child: const Text('Ir al acceso')),
      ],
    );
  }
}
