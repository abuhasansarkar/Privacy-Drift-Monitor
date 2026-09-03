import Link from "next/link";
import { t } from "@pdm/shared/copy";

/**
 * Global 404 NOT FOUND — §11.8.
 */
export default function RootNotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-canvas px-4 text-center">
      <div className="max-w-md">
        <h1 className="text-h2 font-semibold text-foreground">{t("error.notFound")}</h1>
        <p className="mt-2 text-small text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-small font-medium text-primary-foreground hover:bg-primary/90"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
