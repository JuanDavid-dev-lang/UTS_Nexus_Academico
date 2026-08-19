import { motion, useReducedMotion } from 'framer-motion';
import happy from '@/assets/rubri/happy.png';
import neutral from '@/assets/rubri/neutral.png';
import offline from '@/assets/rubri/offline.png';
import sad from '@/assets/rubri/sad.png';
import { cn } from '@/shared/lib/cn';

export type RubriEmotion = 'neutral' | 'happy' | 'sad' | 'offline';

const SPRITES: Record<RubriEmotion, string> = { neutral, happy, sad, offline };
const LABELS: Record<RubriEmotion, string> = {
  neutral: 'Rubri neutral',
  happy: 'Rubri feliz',
  sad: 'Rubri triste',
  offline: 'Rubri sin conexión',
};

const SIZES = { small: 'size-12', medium: 'size-24', large: 'size-40' } as const;

type Props = {
  emotion?: RubriEmotion;
  size?: keyof typeof SIZES;
  animated?: boolean;
  className?: string;
};

/** Mascota oficial. Único mapa de estados a sprites para toda la aplicación. */
export function Rubri({ emotion = 'neutral', size = 'medium', animated = true, className }: Props) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animated && !reduceMotion;
  return (
    <motion.img
      src={SPRITES[emotion]}
      alt={LABELS[emotion]}
      draggable={false}
      className={cn('select-none object-contain', SIZES[size], className)}
      animate={shouldAnimate ? { y: [0, -3, 0], rotate: [0, 0.6, 0] } : undefined}
      transition={shouldAnimate ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
    />
  );
}
