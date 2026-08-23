import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { Logo } from '@/shared/ui/logo';
import { authRepository } from '@/infrastructure/repositories/auth.repository';
import { recoveryEmailSchema, recoveryPasswordSchema } from '@/domain/schemas/auth';
import { toAppError } from '@/core/api/errors';

type Step = 'request' | 'reset' | 'done';

export default function RecoveryPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [devCode, setDevCode] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [canResend, setCanResend] = useState(false);

  async function requestCode() {
    const parsed = recoveryEmailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Correo inválido');
    setBusy(true); setError(undefined);
    try {
      const result = await authRepository.requestPasswordReset(parsed.data);
      setEmail(parsed.data); setDevCode(result.devCode); setCanResend(false); setStep('reset');
      window.setTimeout(() => setCanResend(true), 60_000);
    } catch (cause) { setError(toAppError(cause).message); }
    finally { setBusy(false); }
  }

  async function reset() {
    const parsed = recoveryPasswordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    if (password !== confirmation) return setError('Las contraseñas no coinciden');
    if (!/^\d{6}$/.test(code.trim())) return setError('Ingresa el código de seis dígitos');
    setBusy(true); setError(undefined);
    try {
      await authRepository.resetPassword({ email, code: code.trim(), newPassword: password });
      setStep('done');
    } catch (cause) { setError(toAppError(cause).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <section className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <Logo size={44} />
        <h1 className="mt-5 text-h3 font-bold text-text">Recuperar contraseña</h1>
        {step === 'done' ? (
          <div className="mt-6 text-center">
            <CheckCircle2 className="mx-auto size-14 text-success" />
            <p className="mt-3 text-body text-text">Tu contraseña fue actualizada.</p>
            <Link className="mt-5 inline-block font-semibold text-primary hover:underline" to="/login">Ir al acceso</Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <Field label="Correo institucional" required>
              {(props) => <Input {...props} type="email" autoComplete="email" disabled={step === 'reset'} value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            {step === 'reset' ? <>
              {devCode ? <p className="rounded-lg bg-info-soft p-3 text-caption text-info">Código local de desarrollo: <strong>{devCode}</strong></p> : null}
              {/*
                El aviso va aquí y no en un toast: el correo tarda, y para
                cuando la persona se pregunta «¿y esto?» un toast ya se fue.
                Los códigos salen de una cuenta que no es la institucional, así
                que el filtro de correo los manda a no deseado con frecuencia.
              */}
              <p className="text-caption text-muted">
                El código puede tardar un momento. Si no lo ves en tu bandeja de entrada,
                revisa la carpeta de <strong>correo no deseado</strong> o spam.
              </p>
              <Field label="Código recibido" required>{(props) => <Input {...props} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
              <Field label="Nueva contraseña" hint="Entre 8 y 128 caracteres" required>{(props) => <Input {...props} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
              <Field label="Confirmar contraseña" required>{(props) => <Input {...props} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />}</Field>
            </> : null}
            {error ? <p role="alert" className="text-caption font-medium text-danger">{error}</p> : null}
            <Button block size="lg" loading={busy} onClick={() => void (step === 'request' ? requestCode() : reset())}>{step === 'request' ? 'Enviar código' : 'Cambiar contraseña'}</Button>
            {step === 'reset' ? <Button variant="secondary" disabled={busy || !canResend} onClick={() => void requestCode()}>{canResend ? 'Reenviar código' : 'Reenviar disponible en 1 minuto'}</Button> : null}
            <Link className="text-center text-caption font-semibold text-primary hover:underline" to="/login">Volver al acceso</Link>
          </div>
        )}
      </section>
    </main>
  );
}
