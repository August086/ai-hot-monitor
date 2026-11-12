import type { HTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * Aceternity UI · Card Spotlight
 * 去掉了 CanvasRevealEffect（首屏开销较大），保留鼠标跟随光斑与边框高亮。
 */
export const CardSpotlight = ({
  children,
  radius = 320,
  color = 'rgba(255, 92, 26, 0.16)',
  className,
  ...props
}: {
  radius?: number;
  color?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) => {
  const mouseX = useMotionValue(-999);
  const mouseY = useMotionValue(-999);
  const maskImage = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 80%)`;

  const handleMouseMove = ({ currentTarget, clientX, clientY }: ReactMouseEvent<HTMLDivElement>) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  };

  return (
    <div
      className={cn('group/spotlight relative', className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        mouseX.set(-999);
        mouseY.set(-999);
      }}
      {...props}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
        style={{ backgroundColor: color, maskImage, WebkitMaskImage: maskImage }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
};
