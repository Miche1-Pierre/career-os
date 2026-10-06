import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="label-xs text-muted-foreground">{eyebrow}</div>}
        <h1 className="truncate heading-2xl text-foreground">{title}</h1>
        {description && <div className="copy-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children, className, wide = false }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-6 sm:px-6 md:py-8", wide ? "max-w-[1600px]" : "max-w-6xl", className)}>{children}</div>;
}

export function Section({ title, description, actions, children, className }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-0.5">
            {title && <h2 className="heading-base text-foreground">{title}</h2>}
            {description && <p className="copy-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
