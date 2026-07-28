import { Logo } from '@/shared/ui/logo';

/**
 * Startup screen shown while the stored session is being validated.
 *
 * It carries the brand instead of a bare spinner, so the first thing the user
 * sees already looks like the product.
 */
export function BootScreen({ message = 'Preparando tu espacio…' }: { message?: string }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg">
      <Logo size={72} className="animate-pulse" alt="" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-semibold text-text">UTS Nexus Académico</p>
        <p className="text-xs text-muted">{message}</p>
      </div>
    </div>
  );
}
