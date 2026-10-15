import { TeamNav } from "@/components/team-hub/TeamNav";

/**
 * Lagets skal. Flikraden renderas för ALLA lagrutter, inklusive hubbens rot.
 *
 * Tidigare bailade layouten ut på roten (`if (pathname === base) return children`)
 * eftersom hubben hade en egen SegmentedControl — resultatet blev två olika
 * flikrader med kolliderande etiketter. Hubben äger inte längre någon egen
 * navigation, så den här raden är den enda.
 *
 * Server component: `pathname` läses i TeamNav (klient), inget behöver hydreras här.
 */
export default async function LagLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div>
      {/* Svep på innehållet byter till grannsektionen (TeamNav → SwipeTabs). */}
      <TeamNav slug={slug}>{children}</TeamNav>
    </div>
  );
}
