import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NativeSelect } from '@/shared/ui';

/**
 * El menú propio del `<select>` en Linux.
 *
 * El de WebKitGTK salía claro en modo oscuro y se quedaba flotando encima de
 * otras aplicaciones. Lo que se afirma es que el sustituto sigue siendo un
 * `<select>` para quien lo usa: el `onChange` de siempre, el teclado de
 * siempre, y que se cierra al irse de la ventana.
 */
vi.mock('@/shared/ui/select-menu-logica', async (original) => ({
  ...(await original<typeof import('@/shared/ui/select-menu-logica')>()),
  usarMenuPropio: true,
}));

function Materias({ onCambio }: { onCambio: (valor: string) => void }) {
  const [valor, setValor] = useState('b191');
  return (
    <NativeSelect
      aria-label="Materia"
      value={valor}
      onChange={(evento) => {
        setValor(evento.target.value);
        onCambio(evento.target.value);
      }}
    >
      <option value="">Selecciona una materia</option>
      <option value="b191">Nuevas Tecnologías</option>
      <option value="dcb007" disabled>
        Ecuaciones Diferenciales
      </option>
      <option value="dcb020">Álgebra Lineal</option>
    </NativeSelect>
  );
}

const select = () => screen.getByRole('combobox', { name: 'Materia' }) as HTMLSelectElement;

describe('menú del select en Linux', () => {
  it('abre el menú de la página, no el nativo, y elegir dispara el onChange de siempre', () => {
    const onCambio = vi.fn();
    render(<Materias onCambio={onCambio} />);

    const abrir = fireEvent.mouseDown(select(), { button: 0 });
    // `false` = se impidió la acción por defecto: el menú de GTK no abre.
    expect(abrir).toBe(false);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Álgebra Lineal' }));

    expect(onCambio).toHaveBeenCalledWith('dcb020');
    expect(select().value).toBe('dcb020');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('con el teclado salta las opciones deshabilitadas y Escape cierra sin elegir', () => {
    const onCambio = vi.fn();
    render(<Materias onCambio={onCambio} />);

    fireEvent.keyDown(select(), { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(select(), { key: 'ArrowDown' });
    fireEvent.keyDown(select(), { key: 'Enter' });
    expect(onCambio).toHaveBeenCalledWith('dcb020');

    fireEvent.keyDown(select(), { key: ' ' });
    fireEvent.keyDown(select(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onCambio).toHaveBeenCalledTimes(1);
  });

  it('cambiar de aplicación lo cierra, que es lo que el de GTK no hacía', () => {
    render(<Materias onCambio={vi.fn()} />);

    fireEvent.mouseDown(select(), { button: 0 });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
