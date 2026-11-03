import { cn } from "@/lib/utils";

export default function BotAvatar({ emoji, url, name, className }: { emoji?: string | null; url?: string | null; name: string; className?: string }) {
  if (url) return <img src={url} alt={`${name} avatar`} className={cn("rounded-full object-cover flex-shrink-0", className)} data-testid="img-avatar" referrerPolicy="no-referrer" />;
  return (
    <span role="img" aria-label={`${name} avatar`} data-testid="img-avatar"
      className={cn("inline-flex items-center justify-center rounded-full bg-primary/15 flex-shrink-0 select-none leading-none", className)}>
      <span className="text-[1.15em]">{emoji || "🤖"}</span>
    </span>
  );
}
