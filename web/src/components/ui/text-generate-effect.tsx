import { useEffect } from 'react';
import { motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * Aceternity UI · Text Generate Effect
 * 适配中文：无空格时按字符切分，避免整段一起出现。
 */
export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.5,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}) => {
  const [scope, animate] = useAnimate();
  const reduceMotion = useReducedMotion();
  const tokens = words.includes(' ') ? words.split(' ') : Array.from(words);

  useEffect(() => {
    if (reduceMotion) return;
    animate(
      'span',
      { opacity: 1, filter: filter ? 'blur(0px)' : 'none' },
      { duration, delay: stagger(0.035) },
    );
  }, [scope.current, animate, duration, filter, reduceMotion]);

  return (
    <div className={cn('font-bold', className)}>
      <motion.div ref={scope}>
        {tokens.map((token, index) => (
          <motion.span
            key={`${token}-${index}`}
            className="inline-block opacity-0"
            style={{ filter: reduceMotion ? 'none' : 'blur(8px)', opacity: reduceMotion ? 1 : undefined }}
          >
            {token}
            {words.includes(' ') ? '\u00A0' : ''}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
};
