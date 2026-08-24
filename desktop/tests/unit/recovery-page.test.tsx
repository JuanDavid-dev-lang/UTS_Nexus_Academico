import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoveryPage from '@/features/auth/recovery-page';

const repository = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock('@/infrastructure/repositories/auth.repository', () => ({ authRepository: repository }));
const renderPage = () => render(<MemoryRouter><RecoveryPage /></MemoryRouter>);

describe('flujo de recuperación', () => {
  beforeEach(() => {
    repository.requestPasswordReset.mockResolvedValue({ message: 'ok', devCode: '123456' });
    repository.resetPassword.mockResolvedValue(undefined);
  });

  it('solicita, muestra devCode y completa el cambio con payload normalizado', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Correo institucional/), { target: { value: ' Persona@UTS.EDU.CO ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText(/Código local de desarrollo:/);
    expect(repository.requestPasswordReset).toHaveBeenCalledWith('persona@uts.edu.co');
    fireEvent.change(screen.getByLabelText(/Código recibido/), { target: { value: '123456' } });
    // La contraseña cumple la política compartida con el autorregistro: diez
    // caracteres, mayúscula, minúscula y número.
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: 'Segura12345' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'Segura12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    await screen.findByText('Tu contraseña fue actualizada.');
    expect(repository.resetPassword).toHaveBeenCalledWith({ email: 'persona@uts.edu.co', code: '123456', newPassword: 'Segura12345' });
    expect(screen.getByRole('link', { name: 'Ir al acceso' })).toHaveAttribute('href', '/login');
  });

  it('valida confirmación y no envía un cambio inconsistente', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Correo institucional/), { target: { value: 'a@uts.edu.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText(/Código recibido/);
    fireEvent.change(screen.getByLabelText(/Código recibido/), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: 'Segura12345' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'Otra12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Las contraseñas no coinciden');
    expect(repository.resetPassword).not.toHaveBeenCalled();
  });

  it('no acepta una contraseña más floja que la del registro', async () => {
    // Aquí se podía dejar en «segura123» lo que el autorregistro exige con diez
    // caracteres y tres clases: la puerta más débil es la que manda.
    renderPage();
    fireEvent.change(screen.getByLabelText(/Correo institucional/), { target: { value: 'a@uts.edu.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText(/Código recibido/);
    fireEvent.change(screen.getByLabelText(/Código recibido/), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: 'segura123' } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: 'segura123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('10 caracteres');
    expect(repository.resetPassword).not.toHaveBeenCalled();
  });

  it('presenta errores seguros de solicitud', async () => {
    repository.requestPasswordReset.mockRejectedValue(new Error('No fue posible enviar el código'));
    renderPage();
    fireEvent.change(screen.getByLabelText(/Correo institucional/), { target: { value: 'a@uts.edu.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No fue posible enviar el código'));
  });
});
