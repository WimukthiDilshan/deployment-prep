import { useState } from 'react';

function TechniqueFeedbackForm({
  technique,
  savedFeedback,
  onSubmit,
  submitting,
}) {
  const [used, setUsed] = useState(savedFeedback ? String(savedFeedback.used) : '');
  const [helpfulness, setHelpfulness] = useState(savedFeedback?.helpfulness || '');
  const [easeOfUse, setEaseOfUse] = useState(savedFeedback?.ease_of_use || '');
  const [comment, setComment] = useState(savedFeedback?.comment || '');

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      technique: technique.technique,
      used: used === 'true',
      helpfulness: used === 'true' ? Number(helpfulness) : null,
      easeOfUse: used === 'true' ? Number(easeOfUse) : null,
      comment,
    });
  }

  return (
    <form className="technique-feedback-form" onSubmit={handleSubmit}>
      <div>
        <strong>Tell us about this recommendation</strong>
        <p>Your feedback helps evaluate and improve future recommendations.</p>
      </div>
      <label>
        Did you use this technique?
        <select value={used} onChange={(event) => setUsed(event.target.value)} required>
          <option value="">Select an answer</option>
          <option value="true">Yes, I used it</option>
          <option value="false">No, I did not use it</option>
        </select>
      </label>
      {used === 'true' ? (
        <div className="technique-feedback-ratings">
          <label>
            How helpful was it?
            <select value={helpfulness} onChange={(event) => setHelpfulness(event.target.value)} required>
              <option value="">Select 1–5</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
            </select>
          </label>
          <label>
            How easy was it to use?
            <select value={easeOfUse} onChange={(event) => setEaseOfUse(event.target.value)} required>
              <option value="">Select 1–5</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      <label>
        Comment (optional)
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="What worked well, or what made you decide not to use it?"
        />
      </label>
      <button type="submit" className="technique-feedback-submit" disabled={submitting || !used}>
        {submitting ? 'Saving...' : savedFeedback ? 'Update feedback' : 'Save feedback'}
      </button>
      {savedFeedback ? <span className="feedback-saved-message">Feedback saved. You can update it.</span> : null}
    </form>
  );
}

export default function StudyTechniqueCards({
  studyTechnique,
  showSource = true,
  onFeedbackSubmit = null,
  feedbackKey = '',
  submittingTechnique = '',
}) {
  if (!studyTechnique) return null;

  const techniques = studyTechnique.techniques ?? [];

  return (
    <div className="student-support-card study-technique-card">
      <div className="support-card-header">
        <div>
          <p className="support-card-title">Recommended Study Techniques</p>
          <p className="support-card-subtitle">
            Choose one technique and follow its steps. External tools are optional.
          </p>
        </div>
        {showSource ? (
          <p className="support-source">
            AI (Source: {studyTechnique.source?.toUpperCase() || 'AI'})
          </p>
        ) : null}
      </div>

      {techniques.length ? (
        <div className="techniques-list">
          {techniques.map((technique, index) => (
            <article key={`${technique.technique}-${index}`} className="technique-guide-card">
              <div className="technique-guide-heading">
                <div>
                  <p className="technique-emoji-title">
                    <span aria-hidden="true">{technique.emoji}</span>{' '}
                    {technique.title || technique.technique}
                  </p>
                  <p className="technique-description">
                    {technique.description || 'Use this technique to organise and review the lesson.'}
                  </p>
                </div>
                {technique.estimated_time ? (
                  <span className="technique-time-badge">About {technique.estimated_time}</span>
                ) : null}
              </div>

              {technique.best_for ? (
                <div className="technique-best-for">
                  <strong>Best for:</strong> {technique.best_for}
                </div>
              ) : null}

              {technique.steps?.length ? (
                <details className="technique-how-to" open>
                  <summary>How to get started</summary>
                  <ol>
                    {technique.steps.map((step, stepIndex) => (
                      <li key={`${technique.technique}-step-${stepIndex}`}>{step}</li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {technique.account_note ? (
                <div className="technique-link-info">
                  <p className="technique-info-title">Before opening the link</p>
                  <p>{technique.account_note}</p>
                </div>
              ) : null}

              {technique.link ? (
                <div className="technique-actions">
                  <a
                    href={technique.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="technique-link-btn"
                    aria-label={`${technique.link_text || 'Open study tool'} in a new tab`}
                  >
                    {technique.link_text || 'Open study tool'} <span aria-hidden="true">↗</span>
                  </a>
                  <span>The website opens in a new tab; return here to review these steps.</span>
                </div>
              ) : null}

              {technique.paper_alternative ? (
                <div className="technique-paper-option">
                  <strong>Prefer not to create an account?</strong>
                  <span>{technique.paper_alternative}</span>
                </div>
              ) : null}

              {onFeedbackSubmit ? (
                <TechniqueFeedbackForm
                  key={`${feedbackKey}-${technique.technique}`}
                  technique={technique}
                  savedFeedback={studyTechnique.student_feedback?.[technique.technique]}
                  onSubmit={onFeedbackSubmit}
                  submitting={submittingTechnique === technique.technique}
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">No study technique is available for this lesson.</p>
      )}
    </div>
  );
}
