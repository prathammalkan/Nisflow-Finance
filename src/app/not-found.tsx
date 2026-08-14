import Link from "next/link";
import { Building2, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="w-full max-w-md space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">404</h1>
          <h2 className="text-xl font-semibold">Page Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The page or record you are looking for doesn't exist or may have been moved.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            <ArrowLeft className="h-4 w-4" /> Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
