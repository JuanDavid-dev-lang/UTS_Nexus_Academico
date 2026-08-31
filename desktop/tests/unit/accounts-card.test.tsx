import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsCard } from '@/features/settings/components/accounts-card';
import { useSession } from '@/state/session.store';
import { desplazarASeccion } from '@/shared/lib/scroll-to-hash';

const repositories = vi.hoisted(() => ({
  create: vi.fn(),
  roles: vi.fn(),
  catalogo: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), fromError: vi.fn() }));

vi.mock('@/infrastructure/repositories/coordination.repository', () => ({
  usersRepository: {
    create: repositories.create,
    roles: repositories.roles,
  },
}));

vi.mock('@/infrastructure/repositories/academic.repository', () => ({
  registroRepository: { catalogo: repositories.catalogo },
}));

vi.mock('@/state/toast.store', () => ({
  toast: toasts,
}));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AccountsCard />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('alta de cuentas del personal', () => {
  beforeEach(() => {
    useSession.setState({
      status: 'authenticated',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'admin@uts.edu.co',
        fullName: 'Administración',
        role: 'ADMIN',
      },
    });
    repositories.roles.mockResolvedValue([
      {
        id: 'PROFESSOR',
        nombre: 'Docente',
        descripcion: 'Solo sus materias, sus grupos y sus estudiantes.',
        porPrograma: false,
      },
    ]);
    repositories.catalogo.mockResolvedValue({ areas: [], programas: [] });
    repositories.create.mockResolvedValue({
      id: '507f191e810c19729de860ea',
      fullName: 'María Fernanda Ortiz',
      email: 'maria.ortiz@uts.edu.co',
    });
  });

  it('explica qué falta cuando se intenta crear con los ejemplos vacíos', () => {
    renderCard();

    // Los ejemplos son placeholders: nunca deben contar como datos escritos.
    expect(screen.getByLabelText(/Nombre completo/)).toHaveAttribute(
      'placeholder',
      'Ej.: María Fernanda Ortiz',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByText('Escribe al menos 3 caracteres.')).toBeVisible();
    expect(screen.getByText('Escribe un correo válido.')).toBeVisible();
    expect(screen.getByText(/Cumple las cuatro reglas/)).toBeVisible();
    expect(repositories.create).not.toHaveBeenCalled();
  });

  it('envía el DTO cerrado y normalizado al backend', async () => {
    const { queryClient } = renderCard();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.change(screen.getByLabelText(/Nombre completo/), {
      target: { value: '  María Fernanda Ortiz  ' },
    });
    fireEvent.change(screen.getByLabelText(/Correo institucional/), {
      target: { value: '  maria.ortiz@uts.edu.co  ' },
    });
    fireEvent.change(screen.getByLabelText(/Contraseña inicial/), {
      target: { value: 'ClaveSegura2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() =>
      expect(repositories.create).toHaveBeenCalledWith({
        fullName: 'María Fernanda Ortiz',
        email: 'maria.ortiz@uts.edu.co',
        password: 'ClaveSegura2026',
        role: 'PROFESSOR',
        programas: [],
      }),
    );
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith(
      'Cuenta creada',
      'María Fernanda Ortiz ya puede entrar con maria.ortiz@uts.edu.co.',
    ));
    expect(screen.getByLabelText(/Nombre completo/)).toHaveValue('');
    expect(screen.getByLabelText(/Correo institucional/)).toHaveValue('');
    expect(screen.getByLabelText(/Contraseña inicial/)).toHaveValue('');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['users'] });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['coordination'] });
  });

  it('no ofrece el alta a roles sin permiso administrativo', () => {
    useSession.setState({
      user: {
        id: '507f1f77bcf86cd799439012',
        email: 'coordinacion@uts.edu.co',
        fullName: 'Coordinación',
        role: 'COORDINATOR',
      },
    });

    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });
});

describe('navegación al alta de personal', () => {
  it('desplaza al formulario indicado por el hash de Configuración', () => {
    const seccion = document.createElement('section');
    seccion.id = 'cuentas-personal';
    seccion.scrollIntoView = vi.fn();
    document.body.appendChild(seccion);

    desplazarASeccion('#cuentas-personal');

    expect(seccion.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });
});
