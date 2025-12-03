import { Suspense } from "react";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wrap the Studio page in Suspense so hooks like useSearchParams are allowed
  return <Suspense fallback={null}>{children}</Suspense>;
}
