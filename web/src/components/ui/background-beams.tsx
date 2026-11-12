import { memo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

const BEAM_COUNT = 18;

const beamPath = (index: number) => {
  const dx = index * 7;
  const dy = index * -8;
  return `M${-380 + dx} ${-189 + dy}C${-380 + dx} ${-189 + dy} ${-312 + dx} ${216 + dy} ${152 + dx} ${
    343 + dy
  }C${616 + dx} ${470 + dy} ${684 + dx} ${875 + dy} ${684 + dx} ${875 + dy}`;
};

/**
 * Aceternity UI · Background Beams（精简版）
 * 保留官方「SVG 路径 + 渐变流动」做法，减少路径数量以控制首屏开销。
 */
export const BackgroundBeams = memo(({ className }: { className?: string }) => {
  const reduceMotion = useReducedMotion();
  const paths = Array.from({ length: BEAM_COUNT }, (_, index) => beamPath(index));

  return (
    <div className={cn('absolute inset-0 flex h-full w-full items-center justify-center overflow-hidden', className)} aria-hidden="true">
      <svg
        className="pointer-events-none absolute z-0 h-full w-full"
        width="100%"
        height="100%"
        viewBox="-420 -620 1520 1560"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {paths.map((path, index) => (
          <motion.path
            key={`beam-${index}`}
            d={path}
            stroke={`url(#beam-gradient-${index})`}
            strokeOpacity={0.35}
            strokeWidth={0.6}
          />
        ))}
        <defs>
          {paths.map((_, index) => (
            <motion.linearGradient
              key={`beam-def-${index}`}
              id={`beam-gradient-${index}`}
              initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
              animate={
                reduceMotion
                  ? undefined
                  : {
                      x1: ['0%', '100%'],
                      x2: ['0%', '95%'],
                      y1: ['0%', '100%'],
                      y2: ['0%', `${93 + (index % 8)}%`],
                    }
              }
              transition={{
                duration: 12 + (index % 10),
                ease: 'easeInOut',
                repeat: Infinity,
                delay: index * 0.6,
              }}
            >
              <stop stopColor="#ff5c1a" stopOpacity="0" />
              <stop stopColor="#ff8a3d" />
              <stop offset="42%" stopColor="#c6ff3d" />
              <stop offset="100%" stopColor="#c6ff3d" stopOpacity="0" />
            </motion.linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  );
});

BackgroundBeams.displayName = 'BackgroundBeams';
