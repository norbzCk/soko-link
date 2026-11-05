export function LegacyFeaturePage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">Reserved feature boundary</p>
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <p className="muted">
        This is intentional: the architecture is in place before we port each feature module, which keeps the product goal stable while we improve maintainability.
      </p>
    </section>
  );
}
