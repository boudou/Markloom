import { isDesktop } from '@/lib/shortcuts';
import { DOWNLOAD_URL, MANUAL_URL, REPOSITORY_URL } from '@/lib/projectLinks';
import { cn } from '@/lib/utils';

/** Opens in a new browser tab; the desktop app hands it to the system browser */
function ProjectLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-accent-hover hover:underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary rounded-sm"
    >
      {children}
    </a>
  );
}

/** Version, manual and source; the web version also points to the desktop download */
export function ProjectLinks({ className }: { className?: string }) {
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <span>Markloom {__APP_VERSION__}</span>
      {!isDesktop && <ProjectLink href={DOWNLOAD_URL}>Get the desktop app</ProjectLink>}
      <ProjectLink href={MANUAL_URL}>User manual</ProjectLink>
      <ProjectLink href={REPOSITORY_URL}>GitHub</ProjectLink>
    </span>
  );
}
