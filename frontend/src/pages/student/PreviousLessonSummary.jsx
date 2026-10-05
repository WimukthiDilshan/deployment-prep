import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getGatewayBaseUrl } from '../../config/gateway';
import StudyTechniqueCards from '../../components/StudyTechniqueCards';
import {
  fetchMySharedLessonGuidance,
  submitTechniqueFeedback,
} from '../../lessonSummary/apiClient';
import '../../styles/studentAnalyse.css';

function recommendationItems(text) {
  const normalized = String(text || '').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const items = [];
  const pattern = /(?:^|\s)\d+[).:-]\s*(.*?)(?=\s+\d+[).:-]\s*|$)/g;
  for (const match of normalized.matchAll(pattern)) {
    const value = match[1].replace(/^jot down\b/i, 'Write down').trim();
    if (value && !items.includes(value)) items.push(value);
  }
  return items.length ? items : [normalized.replace(/^jot down\b/i, 'Write down')];
}

export default function PreviousLessonSummary() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState([]);
  const [lessonNames, setLessonNames] = useState(new Map());
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [submittingTechnique, setSubmittingTechnique] = useState('');
  const [activeSection, setActiveSection] = useState('recommendations');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [sharedRows, courseResponse] = await Promise.all([
          fetchMySharedLessonGuidance(),
          fetch(`${getGatewayBaseUrl()}/api/public/courses`),
        ]);
        const coursePayload = await courseResponse.json().catch(() => null);
        if (!courseResponse.ok) throw new Error(coursePayload?.message || 'Could not load lesson names.');
        if (cancelled) return;
        const rows = Array.isArray(sharedRows) ? sharedRows : [];
        setSummaries(rows);
        setLessonNames(new Map(
          (coursePayload?.data ?? []).map((course) => [String(course.id), course.courseName]),
        ));
        setSelectedLessonId(rows.length ? String(rows[0].lesson_id) : '');
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedSummary = useMemo(
    () => summaries.find((row) => String(row.lesson_id) === selectedLessonId),
    [selectedLessonId, summaries],
  );
  const strategies = recommendationItems(selectedSummary?.lecture_support?.strategies);
  const summarySections = [
    { id: 'recommendations', label: 'Recommendations', description: 'What to do next' },
    { id: 'techniques', label: 'Study Techniques', description: 'Practical study methods' },
  ];

  function selectLesson(lessonId) {
    setSelectedLessonId(lessonId);
    setActiveSection('recommendations');
    setFeedbackMessage('');
    setFeedbackError('');
  }

  async function handleTechniqueFeedback(feedback) {
    try {
      setSubmittingTechnique(feedback.technique);
      setFeedbackMessage('');
      setFeedbackError('');
      const saved = await submitTechniqueFeedback(selectedLessonId, feedback);
      setSummaries((current) => current.map((summary) => {
        if (String(summary.lesson_id) !== selectedLessonId) return summary;
        return {
          ...summary,
          study_technique: {
            ...summary.study_technique,
            student_feedback: {
              ...(summary.study_technique?.student_feedback ?? {}),
              [feedback.technique]: saved,
            },
          },
        };
      }));
      setFeedbackMessage('Thank you. Your feedback was saved.');
    } catch (requestError) {
      setFeedbackError(requestError.message);
    } finally {
      setSubmittingTechnique('');
    }
  }

  return (
    <div className="student-analyse-shell previous-lesson-summary-page">
      <header className="student-analyse-header">
        <button type="button" className="back-button" onClick={() => navigate('/course')}>
          Back to courses
        </button>
        <div>
          <p className="eyebrow">Student support</p>
          <h1>Previous Lesson Summary</h1>
          <p className="hero-copy">Review recommendations and study techniques shared by your teacher.</p>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {loading ? <section className="student-analyse-results glass-panel"><p>Loading summaries...</p></section> : null}

      {!loading && !error ? (
        <section className="student-analyse-toolbar glass-panel">
          <label>
            Subject / lesson
            <select value={selectedLessonId} onChange={(event) => selectLesson(event.target.value)}>
              <option value="">Select a lesson</option>
              {summaries.map((summary) => (
                <option key={summary.lesson_id} value={summary.lesson_id}>
                  {lessonNames.get(String(summary.lesson_id)) || `Lesson ${summary.lesson_id}`}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {!loading && !error && summaries.length === 0 ? (
        <section className="student-analyse-results glass-panel">
          <p className="empty-state">Your teacher has not shared any previous-lesson guidance yet.</p>
        </section>
      ) : null}

      {selectedSummary ? (
        <>
          <nav className="student-summary-tabs glass-panel" aria-label="Previous lesson guidance">
            <div className="student-summary-tabs-heading">
              <span>Selected subject</span>
              <strong>
                {lessonNames.get(String(selectedSummary.lesson_id)) || `Lesson ${selectedSummary.lesson_id}`}
              </strong>
            </div>
            <div className="student-summary-tab-list" role="tablist">
              {summarySections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  id={`student-summary-tab-${section.id}`}
                  role="tab"
                  aria-selected={activeSection === section.id}
                  aria-controls={`student-summary-panel-${section.id}`}
                  className={activeSection === section.id ? 'is-active' : ''}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="student-summary-tab-number">{index + 1}</span>
                  <span>
                    <strong>{section.label}</strong>
                    <small>{section.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <section
            className="student-analyse-results student-summary-content glass-panel"
            id={`student-summary-panel-${activeSection}`}
            role="tabpanel"
            aria-labelledby={`student-summary-tab-${activeSection}`}
          >
            {activeSection === 'recommendations' ? (
              <div className="student-summary-section">
                <div className="student-summary-section-heading">
                  <p className="eyebrow">Teacher guidance</p>
                  <h2>Recommendations</h2>
                  <p>Use these suggestions when you review this subject.</p>
                </div>
                <div className="student-support-card lecture-support-card">
                  <p className="support-card-title">Teacher-shared Recommendations</p>
                  {strategies.length ? (
                    <div className="recommendation-list">
                      {strategies.map((strategy, index) => (
                        <div className="recommendation-item" key={`${index}-${strategy}`}>
                          <span className="recommendation-item-number">{index + 1}</span>
                          <p className="recommendation-item-text">{strategy}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No recommendations are available for this lesson.</p>
                  )}
                </div>
                <div className="student-summary-section-actions">
                  <button type="button" onClick={() => setActiveSection('techniques')}>
                    Study techniques <span aria-hidden="true">&rarr;</span>
                  </button>
                </div>
              </div>
            ) : null}

            {activeSection === 'techniques' ? (
              <div className="student-summary-section">
                <div className="student-summary-section-heading">
                  <p className="eyebrow">Personal study support</p>
                  <h2>Study Techniques</h2>
                  <p>Try the methods below and share feedback after using them.</p>
                </div>
                <StudyTechniqueCards
                  studyTechnique={selectedSummary.study_technique}
                  showSource={false}
                  onFeedbackSubmit={handleTechniqueFeedback}
                  feedbackKey={selectedSummary.lesson_id}
                  submittingTechnique={submittingTechnique}
                />
                {feedbackMessage ? <div className="alert success">{feedbackMessage}</div> : null}
                {feedbackError ? <div className="alert error">{feedbackError}</div> : null}
                <div className="student-summary-section-actions is-back-only">
                  <button type="button" className="is-secondary" onClick={() => setActiveSection('recommendations')}>
                    <span aria-hidden="true">&larr;</span> Recommendations
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
