import Image from 'next/image';
import { cn } from '@/lib/cn';

/** Full Yakunex wordmark with emblem. Transparent background, so it sits directly on dark surfaces. */
export function YakunexLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/yakunex-logo.png"
      alt="Yakunex Technologies (Pvt) Ltd."
      width={652}
      height={720}
      priority
      className={cn('h-auto w-full', className)}
    />
  );
}

/** Emblem only, for compact spaces. */
export function YakunexMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/yakunex-mark.png"
      alt=""
      width={512}
      height={512}
      className={cn('h-9 w-9', className)}
      aria-hidden="true"
    />
  );
}
