import { Loader2 } from "lucide-react";

export default function HandoffLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Laddar
      </p>
    </main>
  );
}
