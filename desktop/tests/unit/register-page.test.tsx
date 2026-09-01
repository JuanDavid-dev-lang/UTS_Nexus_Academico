import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from '@/features/auth/register-page';

const repositories = vi.hoisted(() => ({
  catalogo: vi.fn(),
  solicitar: vi.fn(),
}));

vi.mock('@/infrastructure/repositories/academic.repository', () => ({
  registroRepository: {
    catalogo: repositories.catalogo,
    solicitar: repositories.solicitar,
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('pantalla de registro de docentes', () => {
  beforeEach(() => {
    repositories.catalogo.mockResolvedValue({
      ok: true,
      abierto: true,
      sedes: [{ id: 'BUCARAMANGA', nombre: 'Bucaramanga' }],
      facultades: [{ id: 'NATURALES_INGENIERIAS', nombre: 'Ciencias Naturales e Ingenierías' }],
      niveles: [
        { id: 'TECNOLOGICO', nombre: 'Tecnológico' },
        { id: 'PROFESIONAL', nombre: 'Profesional' },
      ],
      programas: [
        {
          id: 'SIS-TEC',
          nombre: 'Tecnología en Desarrollo de Sistemas Informáticos',
          facultad: 'NATURALES_INGENIERIAS',
          nivel: 'TECNOLOGICO',
        },
        {
          id: 'SIS-ING',
          nombre: 'Ingeniería de Sistemas',
          facultad: 'NATURALES_INGENIERIAS',
          nivel: 'PROFESIONAL',
        },
      ],
      areas: [],
    });

    repositories.solicitar.mockResolvedValue({
      ok: true,
      message: 'Solicitud radicada con éxito. Un administrador revisará tu cuenta.',
    });
  });

  it('valida campos obligatorios si se intenta enviar vacío', async () => {
    renderPage();
    await screen.findByText('Registro de docentes');

    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/i }));

    await waitFor(() => {
      expect(screen.getByText(/La cédula debe tener entre 6 y 10 dígitos/i)).toBeVisible();
    });
    expect(repositories.solicitar).not.toHaveBeenCalled();
  });

  it('permite seleccionar nivel, filtrar programas y enviar la solicitud', async () => {
    renderPage();
    await screen.findByText('Registro de docentes');

    // Llenar datos personales
    fireEvent.change(screen.getByLabelText(/Cédula/i), { target: { value: '1098765432' } });
    fireEvent.change(screen.getByLabelText(/Nombres/i), { target: { value: 'María Fernanda' } });
    fireEvent.change(screen.getByLabelText(/Apellidos/i), { target: { value: 'Ortiz Gómez' } });

    // Elegir sede y facultad
    fireEvent.change(screen.getByLabelText(/Sede institucional/i), { target: { value: 'BUCARAMANGA' } });
    fireEvent.change(screen.getByLabelText(/Facultad/i), { target: { value: 'NATURALES_INGENIERIAS' } });

    // Marcar nivel Tecnológico
    const btnTecnologico = screen.getByRole('button', { name: /Tecnológico/i });
    fireEvent.click(btnTecnologico);

    // El programa tecnológico debe estar disponible
    const programaCheck = await screen.findByLabelText(/Tecnología en Desarrollo de Sistemas Informáticos/i);
    fireEvent.click(programaCheck);

    // Credenciales
    fireEvent.change(screen.getByLabelText(/Correo institucional/i), {
      target: { value: 'maria.ortiz@uts.edu.co' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Crea una clave segura/i), {
      target: { value: 'ClaveSegura2026' },
    });

    // Enviar
    fireEvent.click(screen.getByRole('button', { name: /Enviar solicitud/i }));

    await waitFor(() => {
      expect(repositories.solicitar).toHaveBeenCalledWith({
        cedula: '1098765432',
        nombres: 'María Fernanda',
        apellidos: 'Ortiz Gómez',
        sede: 'BUCARAMANGA',
        facultad: 'NATURALES_INGENIERIAS',
        niveles: ['TECNOLOGICO'],
        programas: ['SIS-TEC'],
        email: 'maria.ortiz@uts.edu.co',
        password: 'ClaveSegura2026',
      });
    });

    await screen.findByText('Solicitud enviada');
    expect(screen.getByText(/Solicitud radicada con éxito/i)).toBeVisible();
  });

  it('muestra pantalla de cerrado cuando el catálogo lo indica', async () => {
    repositories.catalogo.mockResolvedValueOnce({
      ok: true,
      abierto: false,
      sedes: [],
      facultades: [],
      niveles: [],
      programas: [],
      areas: [],
    });

    renderPage();
    await screen.findByText('El registro está cerrado');
    expect(screen.getByRole('link', { name: /Volver/i })).toHaveAttribute('href', '/login');
  });
});
