import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { GlassNav } from "@/components/layout/GlassNav";
import { TeamSelectionModal } from "@/components/ui/TeamSelectionModal";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { MobileNav } from "@/components/layout/MobileNav";
import { PullToRefreshShell } from "@/components/layout/PullToRefreshShell";
import { EdgeSwipeBack } from "@/components/layout/EdgeSwipeBack";
import { ScrollRestore } from "@/components/ux/ScrollRestore";
import { VERTICAL } from "@/lib/vertical";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const clerkEnabled =
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.match(/^pk_(test|live)_[A-Za-z0-9+/=]+$/);

  return (
    <>
      {/* Gester för hela app-shellen — en hanterare per gest, aldrig en per yta. */}
      <PullToRefreshShell />
      <EdgeSwipeBack />
      <Suspense fallback={null}>
        <ScrollRestore />
      </Suspense>
      <Header clerkEnabled={clerkEnabled} />
      <div className="flex flex-1 min-h-0">
        <Suspense fallback={null}>
          <AppSidebar />
        </Suspense>
        {/* tabIndex=-1 så skip-linken faktiskt flyttar fokus, inte bara scrollar. */}
        <main id="main" tabIndex={-1} className="flex-1 min-w-0 pb-20 focus:outline-none">
          {children}
        </main>
      </div>
      <Footer />
      <GlassNav clerkEnabled={clerkEnabled} />
      <CommandPalette />
      {clerkEnabled && (
        <>
          {VERTICAL !== "golf" && <TeamSelectionModal />}
          <PwaInstallBanner />
        </>
      )}
      <MobileNav />
    </>
  );
}
