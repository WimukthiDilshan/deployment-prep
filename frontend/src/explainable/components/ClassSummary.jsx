import ClassLoadBoxPlot from './ClassLoadBoxPlot';

export default function ClassSummary({ summary, recommendation }) {
  if (!summary) {
    return (
      <section className="panel">
        <h3>Class Summary</h3>
        <p className="muted">Generate or select a lesson to view the class summary.</p>
      </section>
    );
  }

  const counts = summary.cognitive_load_counts ?? {};
  const commonFactors = summary.common_factors ?? [];

  return (
    <section className="panel">
      <div className="panel-header">
        <h3>Class Summary</h3>
        <span className="badge">{summary.dominant_cognitive_load ?? 'Unknown'}</span>
      </div>
      <p className="muted">
        Lesson {summary.lesson_id} · {summary.total_students} students
      </p>
      <div className="counts-grid">
        {Object.entries(counts).map(([label, value]) => (
          <div key={label} className="count-card">
            <span className="count-value">{value}</span>
            <span className="count-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="text-block">
        <h4>Cognitive Load Distribution</h4>
        <ClassLoadBoxPlot values={summary.cognitive_load_distribution ?? []} />
      </div>
      <div className="text-block">
        <h4>Common Factors</h4>
        {commonFactors.length ? (
          <ul className="factor-list compact">
            {commonFactors.map((factor) => (
              <li key={factor.feature}>
                <span className="factor-feature">{factor.feature}</span>
                <span className="factor-score">{factor.frequency}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No common factors available yet.</p>
        )}
      </div>
      <div className="text-block">
        <h4>Next Lesson Recommendation</h4>
        <p>{recommendation || summary.next_lesson_recommendation || 'No recommendation generated yet.'}</p>
      </div>
    </section>
  );
}
