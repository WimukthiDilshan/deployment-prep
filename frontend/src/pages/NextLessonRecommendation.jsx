import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactApexChart from 'react-apexcharts';
import { getGatewayBaseUrl } from '../config/gateway';
import '../styles/dashboard.css';
import '../styles/nextLessonRecommendation.css';

const teacherNavigation = [
  { label: 'Upload Lesson', path: '/upload-lesson', icon: '+' },
  { label: 'Student Analyse', path: '/student-analyse', icon: 'S' },
  { label: 'Chat Assistant', path: '/gpt', icon: 'C' },
  { label: 'DeepSeek Chat', path: '/deepseek', icon: 'D' },
  { label: 'Next Lesson Recommendation', path: '/next-lesson-recommendation', icon: 'N' },
  { label: 'Upload Lecture PDF for Exam', path: '/exam-materials', icon: 'E' },
];

export default function NextLessonRecommendation() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [recommendation, setRecommendation] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reviewAction, setReviewAction] = useState('');
  const [editingRecommendation, setEditingRecommendation] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [showTechnicalEvidence, setShowTechnicalEvidence] = useState(false);
  const [recommendationDraft, setRecommendationDraft] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const teacherInitial = (user.name || 'T').trim().charAt(0).toUpperCase();
  const isCoveVerified = recommendation?.recommendationSource === 'gemini-cove-verified';

  useEffect(() => {
    let active = true;

    axios
      .get(`${getGatewayBaseUrl()}/api/courses/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        if (!active) return;
        const rows = response.data?.data || [];
        setCourses(rows);
        if (rows.length) setSelectedCourseId(String(rows[0].id));
      })
      .catch((requestError) => {
        if (!active) return;
        if ([401, 403].includes(requestError.response?.status)) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }
        setError(requestError.response?.data?.message || 'Could not load your uploaded courses.');
      })
      .finally(() => {
        if (active) setLoadingCourses(false);
      });

    return () => {
      active = false;
    };
  }, [navigate, token]);

  const generateRecommendation = async (event) => {
    event?.preventDefault();
    if (!selectedCourseId) {
      setError('Select a course first.');
      return;
    }

    setGenerating(true);
    setError('');
    setRecommendation(null);
    try {
      const response = await axios.post(
        `${getGatewayBaseUrl()}/api/next-lesson-recommendation/recommendations`,
        { courseId: selectedCourseId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRecommendation(response.data.data);
      setRecommendationDraft(response.data.data.recommendation || '');
      setEditingRecommendation(false);
      setShowRejectReason(false);
      setShowTechnicalEvidence(false);
      setReviewReason('');
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Could not create the next lesson recommendation.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const reviewRecommendation = async (action) => {
    if (!recommendation) return;
    setReviewAction(action);
    setError('');
    try {
      const response = await axios.patch(
        `${getGatewayBaseUrl()}/api/next-lesson-recommendation/recommendations/${selectedCourseId}/review`,
        {
          action,
          reason: reviewReason,
          recommendation: action === 'edited' ? recommendationDraft : undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRecommendation(response.data.data);
      setRecommendationDraft(response.data.data.recommendation || '');
      setEditingRecommendation(false);
      setShowRejectReason(false);
      setReviewReason('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save your review.');
    } finally {
      setReviewAction('');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="teacher-dashboard-shell next-recommendation-dashboard-layout">
      <aside className="teacher-dashboard-sidebar">
        <div className="teacher-dashboard-brand">
          <span className="teacher-dashboard-brand-mark" aria-hidden="true">E</span>
          <span className="teacher-dashboard-brand-copy">
            <strong>EduPortal</strong>
            <small>Teacher workspace</small>
          </span>
        </div>

        <nav className="teacher-dashboard-nav" aria-label="Teacher lesson recommendation navigation">
          <button type="button" className="teacher-dashboard-nav-button" onClick={() => navigate('/dashboard')}>
            <span className="teacher-dashboard-nav-icon" aria-hidden="true">⌂</span>
            <span>Dashboard</span>
          </button>
          {teacherNavigation.map((action) => {
            const isActive = action.path === '/next-lesson-recommendation';
            return (
              <button
                key={action.path}
                type="button"
                className={`teacher-dashboard-nav-button ${isActive ? 'is-active' : ''}`}
                onClick={() => navigate(action.path)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="teacher-dashboard-nav-icon" aria-hidden="true">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="teacher-dashboard-profile">
          <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
          <span className="teacher-dashboard-profile-copy">
            <strong>{user.name || 'Teacher'}</strong>
            <small>Teacher account</small>
          </span>
          <button type="button" className="teacher-dashboard-logout" onClick={logout}>Logout</button>
        </div>
      </aside>

      <div className="teacher-dashboard-main next-recommendation-dashboard-main">
        <header className="teacher-dashboard-topbar">
          <div>
            <span className="teacher-dashboard-topbar-label">Teacher portal</span>
            <strong>Next Lesson Recommendation</strong>
          </div>
          <div className="teacher-dashboard-user-chip">
            <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
            <span>Hello, {user.name || 'Teacher'}</span>
          </div>
        </header>

        <div className="next-recommendation-page">

      <main className="container next-recommendation-content">
        <section className="glass-panel next-recommendation-hero">
          <p className="eyebrow">Teacher planning assistant</p>
          <h1>Next Lesson Recommendation</h1>
          <p>
            Choose a course and get an evidence-based plan for your next lesson. Review and adjust it before use.
          </p>
        </section>

        <form className="glass-panel course-selector" onSubmit={generateRecommendation}>
          <div className="course-selector-control">
            <label className="course-select-label" htmlFor="recommendation-course">
              <span>Choose your course</span>
              {!loadingCourses && courses.length > 0 && (
                <small>{courses.length} uploaded {courses.length === 1 ? 'course' : 'courses'} available</small>
              )}
            </label>
            <div className="selector-row">
              <div className="course-select-shell">
                <select
                  id="recommendation-course"
                  className="form-input"
                  value={selectedCourseId}
                  disabled={loadingCourses || generating || courses.length === 0}
                  onChange={(event) => {
                    setSelectedCourseId(event.target.value);
                    setRecommendation(null);
                    setRecommendationDraft('');
                    setEditingRecommendation(false);
                    setShowRejectReason(false);
                    setShowTechnicalEvidence(false);
                    setReviewReason('');
                    setError('');
                  }}
                >
                  {loadingCourses && <option value="">Loading your courses...</option>}
                  {!loadingCourses && courses.length === 0 && <option value="">No uploaded courses found</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.courseName}</option>
                  ))}
                </select>
                <span className="course-select-arrow" aria-hidden="true">⌄</span>
              </div>
              <button
                className="btn btn-primary create-plan-button"
                type="submit"
                disabled={generating || loadingCourses || !selectedCourseId}
              >
                {generating ? (
                  <>
                    <span className="plan-button-spinner" aria-hidden="true" />
                    Analysing class evidence...
                  </>
                ) : (
                  <>
                    Get Your Next Lesson Recommendation
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </div>
            <p className="course-selector-note">Your plan will use cognitive load, learning signals, and cognitive-style evidence.</p>
          </div>
        </form>

        {error && <div className="error-message recommendation-error">{error}</div>}

        {recommendation && (
          <section className="recommendation-results" aria-live="polite">
            {recommendation.evidence && (
              <div className="recommendation-technical-details">
                <button
                  type="button"
                  className={`recommendation-evidence-toggle ${showTechnicalEvidence ? 'active' : ''}`}
                  onClick={() => setShowTechnicalEvidence((current) => !current)}
                  aria-expanded={showTechnicalEvidence}
                  aria-controls="recommendation-technical-evidence"
                >
                  <span className="evidence-toggle-icon" aria-hidden="true">{showTechnicalEvidence ? '−' : '?'}</span>
                  <span className="evidence-toggle-copy">
                    <strong>{showTechnicalEvidence ? 'Hide Technical Details' : 'See Technical Details'}</strong>
                    <small>View the class evidence used to create this plan</small>
                  </span>
                  <span className="evidence-toggle-arrow" aria-hidden="true">{showTechnicalEvidence ? '⌃' : '⌄'}</span>
                </button>

                {showTechnicalEvidence && (
              <article
                className="glass-panel recommendation-evidence"
                id="recommendation-technical-evidence"
              >
                <div className="evidence-heading">
                  <div>
                    <p className="eyebrow">Evidence used for planning</p>
                    <h2>What shaped this recommendation</h2>
                  </div>
                  <span className={`recommendation-source ${recommendation.recommendationSource}`}>
                    {isCoveVerified
                      ? 'CoVe-verified AI guidance'
                      : 'Reliable template fallback'}
                  </span>
                </div>

                <div className="recommendation-evidence-grid">
                  <div className="evidence-stat-card attention">
                    <span>High or very high load</span>
                    <strong>{recommendation.evidence.cognitiveLoad?.highOrVeryHighPercentage ?? 0}%</strong>
                    <small>of completed student-lesson results</small>
                  </div>

                  <div className="evidence-detail-card">
                    <h3>Common learning signals</h3>
                    {recommendation.evidence.commonSignals?.length ? (
                      <ul>
                        {recommendation.evidence.commonSignals.map((signal) => (
                          <li key={signal.signal}>
                            <span>{signal.signal.replaceAll('_', ' ')}</span>
                            <strong>{signal.occurrences} students/lessons</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p>No completed explanation signals are available yet.</p>}
                  </div>

                  <div className="evidence-detail-card">
                    <h3>Observed cognitive styles</h3>
                    {recommendation.evidence.cognitiveStyles?.total > 0 ? (
                      <ul>
                        {['Visual', 'Verbal', 'Intermediate'].map((style) => (
                          <li key={style}>
                            <span>{style}</span>
                            <strong>{recommendation.evidence.cognitiveStyles.percentages?.[style] || 0}%</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p>No completed cognitive-style analyses are available yet.</p>}
                  </div>

                  <div className="evidence-detail-card verification-card">
                    <h3>Hallucination verification</h3>
                    {isCoveVerified ? (
                      <ul>
                        <li>
                          <span>Method</span>
                          <strong>{recommendation.verification?.method || 'Chain-of-Verification'}</strong>
                        </li>
                        <li>
                          <span>Status</span>
                          <strong>Verified</strong>
                        </li>
                        <li>
                          <span>Questions checked</span>
                          <strong>{recommendation.verification?.report?.questionCount || 0}</strong>
                        </li>
                        <li>
                          <span>Unsupported claims found</span>
                          <strong>{recommendation.verification?.report?.unsupportedClaimCount || 0}</strong>
                        </li>
                      </ul>
                    ) : (
                      <p>CoVe verification did not complete, so the fixed evidence-based template was used.</p>
                    )}
                  </div>
                </div>

                {!isCoveVerified && (
                  <p className="recommendation-fallback-note">
                    The evidence summary remains available, but the dependable fixed recommendation was used because AI generation or verification did not complete.
                  </p>
                )}
              </article>
                )}
              </div>
            )}

            {recommendation.boxPlotData?.length > 0 && (
              <article className="glass-panel recommendation-chart">
                <div className="chart-heading">
                  <div>
                    <p className="eyebrow">Cognitive-load distribution</p>
                    <h2>Box Plot: Pause Frequency by Cognitive Load Level</h2>
                  </div>
                  <p>Each box shows minimum, Q1, median, Q3, and maximum.</p>
                </div>
                <ReactApexChart
                  options={{
                    chart: { type: 'boxPlot', height: 360, toolbar: { show: false } },
                    colors: ['#2563eb', '#60a5fa'],
                    plotOptions: {
                      boxPlot: { colors: { upper: '#3b82f6', lower: '#93c5fd' } },
                    },
                    xaxis: {
                      type: 'category',
                      title: { text: 'Cognitive Load Level' },
                    },
                    yaxis: {
                      title: { text: 'Pause Frequency' },
                      min: 0,
                    },
                    grid: { borderColor: '#e2e8f0' },
                    tooltip: {
                      custom: ({ seriesIndex, dataPointIndex, w }) => {
                        const point = w.config.series[seriesIndex].data[dataPointIndex];
                        const source = recommendation.boxPlotData[dataPointIndex];
                        return `<div class="boxplot-tooltip"><strong>${point.x}</strong><span>${source.observations} observations</span></div>`;
                      },
                    },
                  }}
                  series={[{ type: 'boxPlot', data: recommendation.boxPlotData }]}
                  type="boxPlot"
                  height={360}
                />
              </article>
            )}

            <article className="glass-panel recommendation-copy">
              <p className="eyebrow">Recommended next lesson approach</p>
              <h2>Plan from the class cognitive-load pattern</h2>
              {editingRecommendation ? (
                <textarea
                  className="recommendation-editor"
                  value={recommendationDraft}
                  onChange={(event) => setRecommendationDraft(event.target.value)}
                  rows={9}
                  aria-label="Edit next lesson recommendation"
                />
              ) : (
                <p className="recommendation-plan-text">{recommendation.recommendation}</p>
              )}

              <div className="teacher-recommendation-review">
                <div className="review-heading">
                  <div>
                    <span className="review-step-label">Teacher review</span>
                    <h3>Does this plan fit your next lesson?</h3>
                  </div>
                  <span className={`recommendation-review-status ${recommendation.teacherReview?.status || 'pending'}`}>
                    {recommendation.teacherReview?.status || 'pending'}
                  </span>
                </div>

                {(editingRecommendation || showRejectReason) && (
                  <label className="review-reason-field">
                    <span>{editingRecommendation ? 'Why are you adjusting this plan? (optional)' : 'Why is this plan unsuitable?'}</span>
                    <input
                      type="text"
                      value={reviewReason}
                      onChange={(event) => setReviewReason(event.target.value)}
                      placeholder="Add a short review note"
                    />
                  </label>
                )}

                <div className="recommendation-review-actions">
                  {editingRecommendation ? (
                    <>
                      <button
                        className="btn review-save-button"
                        type="button"
                        disabled={Boolean(reviewAction)}
                        onClick={() => reviewRecommendation('edited')}
                      >
                        {reviewAction === 'edited' ? 'Saving...' : 'Save Edited Plan'}
                      </button>
                      <button className="btn review-secondary-button" type="button" onClick={() => setEditingRecommendation(false)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn review-approve-button"
                        type="button"
                        disabled={Boolean(reviewAction)}
                        onClick={() => reviewRecommendation('approved')}
                      >
                        {reviewAction === 'approved' ? 'Approving...' : 'Approve Plan'}
                      </button>
                      <button className="btn review-secondary-button" type="button" onClick={() => setEditingRecommendation(true)}>
                        Edit Plan
                      </button>
                      <button
                        className="btn review-secondary-button"
                        type="button"
                        disabled={generating || Boolean(reviewAction)}
                        onClick={() => generateRecommendation()}
                      >
                        {generating ? 'Regenerating...' : 'Regenerate'}
                      </button>
                      <button
                        className="btn review-reject-button"
                        type="button"
                        disabled={Boolean(reviewAction)}
                        onClick={() => {
                          if (showRejectReason) {
                            reviewRecommendation('rejected');
                          } else {
                            setShowRejectReason(true);
                            setReviewReason('');
                          }
                        }}
                      >
                        {reviewAction === 'rejected'
                          ? 'Rejecting...'
                          : showRejectReason
                            ? 'Confirm Rejection'
                            : 'Reject Plan'}
                      </button>
                      {showRejectReason && (
                        <button
                          className="btn review-secondary-button"
                          type="button"
                          onClick={() => {
                            setShowRejectReason(false);
                            setReviewReason('');
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          </section>
        )}
      </main>
        </div>
      </div>
    </div>
  );
}
