import { Suspense } from "react";
import { HomeContent } from "./HomeContent";

export default function Home() {
  // HomeContent reads `?error=` from the OAuth callback via useSearchParams,
  // which opts the route into client rendering and needs a boundary.
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
