import { HOCKEY_GROUP_ORDER, type HockeySquadRow } from "@/lib/team-hub/hockey-squad";

/** Hockeylagets trupp: målvakter, backar, forwards. Utespelare sorteras på poäng. Serverkomponent. */
export function HockeySquad({ rows }: { rows: HockeySquadRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground text-balance">
        Truppen fylls på när lagets första matcher är synkade.
      </p>
    );
  }

  // Innan lagets första match är hämtad saknas positioner: då är alla "Övriga", och rubriken säger bara Spelare.
  const onlyUngrouped = rows.every((r) => r.group === "Övriga");

  return (
    <div className="space-y-5 px-4 pt-5 sm:px-6">
      {HOCKEY_GROUP_ORDER.map((group) => {
        const players = rows.filter((r) => r.group === group);
        if (players.length === 0) return null;
        // Poängkolumnerna visas bara där någon i gruppen har en statistikrad — målvakter har ingen.
        const hasStats = players.some((p) => p.goals != null);
        return (
          <section key={group} aria-labelledby={`trupp-${group}`} className="rounded-xl border border-border bg-card p-4">
            <h2 id={`trupp-${group}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {onlyUngrouped ? "Spelare" : group} <span className="font-normal tabular-nums">· {players.length}</span>
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="w-8 py-1.5 text-left font-normal">#</th>
                  <th scope="col" className="py-1.5 text-left font-normal">Spelare</th>
                  {hasStats && (
                    <>
                      <th scope="col" className="w-9 py-1.5 text-right font-normal">Mål</th>
                      <th scope="col" className="w-9 py-1.5 text-right font-normal">Ass</th>
                      <th scope="col" className="w-9 py-1.5 text-right font-semibold text-foreground">P</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const facts = [p.age != null ? `${p.age} år` : null, p.height ? `${p.height} cm` : null, p.weight ? `${p.weight} kg` : null].filter(Boolean);
                  return (
                    <tr key={p.playerId} className="border-b border-border/40 last:border-0">
                      <td className="py-2 align-top font-mono tabular-nums text-muted-foreground">{p.jersey ?? ""}</td>
                      <td className="min-w-0 py-2">
                        <span className="block truncate text-foreground">{p.name}</span>
                        {facts.length > 0 && <span className="block text-xs tabular-nums text-muted-foreground">{facts.join(" · ")}</span>}
                      </td>
                      {hasStats && (
                        <>
                          <td className="py-2 text-right align-top font-mono tabular-nums text-muted-foreground">{p.goals ?? ""}</td>
                          <td className="py-2 text-right align-top font-mono tabular-nums text-muted-foreground">{p.assists ?? ""}</td>
                          <td className="py-2 text-right align-top font-mono font-semibold tabular-nums text-foreground">
                            {p.goals != null && p.assists != null ? p.goals + p.assists : ""}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
