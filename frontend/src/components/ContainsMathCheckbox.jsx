export default function ContainsMathCheckbox({ id, checked, onChange }) {
  return (
    <div className="form-group" style={{ marginTop: '0.15rem' }}>
      <label
        htmlFor={id}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.55rem',
          cursor: 'pointer',
        }}
      >
        <input
          id={id}
          type="checkbox"
          checked={Boolean(checked)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: '0.25rem', flexShrink: 0 }}
        />
        <span>
          <span
            className="form-label"
            style={{ display: 'block', marginBottom: '0.15rem' }}
          >
            This lesson contains equations / formulas
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              display: 'block',
              lineHeight: 1.4,
            }}
          >
            Tick this for maths, physics, chemistry, or any slides with scientific
            notation. We keep formulas as LaTeX and do not let dedupe drop them.
            Leave unticked for ordinary lessons.
          </span>
        </span>
      </label>
    </div>
  );
}
