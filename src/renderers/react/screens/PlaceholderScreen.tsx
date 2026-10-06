/**
 * Stands in for a screen a later task builds (plan 6.3 to 6.5). Replace its entry in
 * `screenRegistry.ts` with the real component.
 *
 * @param props - The screen title and the task that delivers it.
 * @returns A short notice.
 */
export function PlaceholderScreen(props: { title: string; task: string }) {
  return (
    <section className="kv-screen kv-placeholder">
      <h2>{props.title}</h2>
      <p>This screen arrives with plan task {props.task}.</p>
    </section>
  );
}
