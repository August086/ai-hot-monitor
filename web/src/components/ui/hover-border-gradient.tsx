import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, ElementType, PropsWithChildren } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

type Direction = 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT';

/**
 * Aceternity UI · Hover Border Gradient
 * 用于主行动按钮（RUN SCAN），悬停时高光沿边框流动。
 */
export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = 'button',
  duration = 1,
  clockwise = true,
  ...props
}: PropsWithChildren<
  {
    as?: ElementType;
    containerClassName?: string;
    className?: string;
    duration?: number;
    clockwise?: boolean;
  } & ButtonHTMLAttributes<HTMLElement>
>) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<Direction>('TOP');

  const rotateDirection = (current: Direction): Direction => {
    const directions: Direction[] = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'];
    const currentIndex = directions.indexOf(current);
    const nextIndex = clockwise
      ? (currentIndex - 1 + directions.length) % directions.length
      : (currentIndex + 1) % directions.length;
    return directions[nextIndex];
  };

  const movingMap: Record<Direction, string> = {
    TOP: 'radial-gradient(20.7% 50% at 50% 0%, #ff5c1a 0%, rgba(255, 92, 26, 0) 100%)',
    LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, #ff5c1a 0%, rgba(255, 92, 26, 0) 100%)',
    BOTTOM: 'radial-gradient(20.7% 50% at 50% 100%, #c6ff3d 0%, rgba(198, 255, 61, 0) 100%)',
    RIGHT: 'radial-gradient(16.2% 41.2% at 100% 50%, #c6ff3d 0%, rgba(198, 255, 61, 0) 100%)',
  };

  const highlight = 'radial-gradient(75% 181% at 50% 50%, #ff5c1a 0%, rgba(255, 92, 26, 0) 100%)';

  useEffect(() => {
    if (!hovered) {
      const interval = setInterval(() => {
        setDirection((prev) => rotateDirection(prev));
      }, duration * 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [hovered, duration]);

  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex w-fit flex-col flex-nowrap content-center items-center justify-center gap-10 overflow-visible rounded-full border bg-black/20 p-px transition duration-500 hover:bg-black/10',
        containerClassName,
      )}
      {...props}
    >
      <div className={cn('z-10 w-auto rounded-[inherit] bg-black px-4 py-2 text-white', className)}>{children}</div>
      <motion.div
        className="absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
        style={{ filter: 'blur(2px)', position: 'absolute', width: '100%', height: '100%' }}
        initial={{ background: movingMap[direction] }}
        animate={{ background: hovered ? [movingMap[direction], highlight] : movingMap[direction] }}
        transition={{ ease: 'linear', duration: duration ?? 1 }}
        aria-hidden="true"
      />
      <div className="absolute inset-[2px] z-[1] flex-none rounded-full bg-black" aria-hidden="true" />
    </Tag>
  );
}
