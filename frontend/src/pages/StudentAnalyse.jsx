import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  createStudentLessonSummary,
  fetchAggregateExplanation,
  fetchLessonNames,
  fetchLimeExplanation,
  fetchLimeLessons,
  fetchLimeStudentsByLesson,
  fetchSavedStudentLessonAnalysis,
  fetchStudentNames,
} from '../lime/apiClient';
import { fetchShapExplanation } from '../shap/apiClient';
import { analyseCognitiveStyle } from '../cognitiveStyle/apiClient';
import {
  regenerateLessonGuidance,
  rejectLessonGuidance,
  shareLessonGuidance,
} from '../lessonSummary/apiClient';
import StudyTechniqueCards from '../components/StudyTechniqueCards';
import '../styles/dashboard.css';
import '../styles/studentAnalyse.css';

function formatRecommendationItems(text) {
  if (!text) return [];

  if (text.includes('Unable to generate strategies')) {
    return [];
  }

  const normalized = String(text).replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length < 5) return [];

  // Ollama commonly returns one line such as "1) ... 2) ... 3) ...".
  // Extract each numbered section once instead of also treating the complete
  // line as the first recommendation.
  const cleanRecommendation = (value) => value
    .replace(/^[)\-.:\s]+/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^jot down\b/i, 'Write down')
    .trim();

  const numberedItems = [];
  const numberedPattern = /(?:^|\s)\d+[).:-]\s*(.*?)(?=\s+\d+[).:-]\s*|$)/g;
  for (const match of normalized.matchAll(numberedPattern)) {
    const clean = cleanRecommendation(match[1]);
    if (clean.length > 5 && !numberedItems.includes(clean)) {
      numberedItems.push(clean);
    }
  }

  if (numberedItems.length > 0) {
    return numberedItems.slice(0, 5);
  }

  // Plain prose is displayed as separate sentences when no numbering exists.
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map(cleanRecommendation)
    .filter(item => item.length > 5)
    .slice(0, 5);
}

function isNoRecommendationLoad(level) {
  const normalized = String(level || '').trim().toLowerCase();
  return normalized === 'very low' || normalized === 'low';
}

function getLoadClass(level) {
  return String(level || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function formatCognitiveStyleLabel(style) {
  const normalized = String(style || '').trim().toLowerCase();
  return ['moderate/intermediatory', 'moderate/intermediate', 'intermediatory', 'moderate']
    .includes(normalized)
    ? 'Intermediate'
    : style;
}

function SelectionDropdown({ value, options, placeholder, disabled = false, onChange }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const selectedOption = options.find((option) => String(option.value) === String(value));

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!dropdownRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, []);

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div ref={dropdownRef} className={`selection-dropdown ${open ? 'is-open' : ''}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`selection-dropdown-trigger ${selectedOption ? '' : 'is-placeholder'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label || placeholder}</span>
        <span className="selection-dropdown-arrow" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="selection-dropdown-menu" role="listbox" aria-label={placeholder}>
          {options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`selection-dropdown-option ${selected ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(String(option.value));
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span>{option.label}</span>
                {selected && <span className="selection-dropdown-check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StudentAnalyse() {
  const [lessons, setLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisLoadingId, setAnalysisLoadingId] = useState(null);
  const [selectedAnalysisRowId, setSelectedAnalysisRowId] = useState(null);
  const [limeExplanation, setLimeExplanation] = useState(null);
  const [shapExplanation, setShapExplanation] = useState(null);
  const [aggregateExplanation, setAggregateExplanation] = useState(null);
  const [aggregateError, setAggregateError] = useState('');
  const [shapError, setShapError] = useState('');
  const [error, setError] = useState('');
  const [, setStatusMessage] = useState('');
  const [styleAnalysis, setStyleAnalysis] = useState(null);
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleError, setStyleError] = useState('');
  const [guidanceAction, setGuidanceAction] = useState('');
  const [guidanceRejectionReason, setGuidanceRejectionReason] = useState('');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showTechniqueEvidence, setShowTechniqueEvidence] = useState(false);
  const [showStyleTopFeatures, setShowStyleTopFeatures] = useState(false);
  const [guidanceStep, setGuidanceStep] = useState(1);

  const recommendationItems = formatRecommendationItems(
    aggregateExplanation?.human_explanation || limeExplanation?.human_explanation || '',
  );
  const navigate = useNavigate();
  const dashboardUser = JSON.parse(localStorage.getItem('user') || '{}');
  const teacherInitial = (dashboardUser.name || 'T').trim().charAt(0).toUpperCase();
  const analysisNavigation = [
    { label: 'Upload Lesson', path: '/upload-lesson', icon: '+' },
    { label: 'Student Analyse', path: '/student-analyse', icon: 'S', active: true },
    { label: 'Chat Assistant', path: '/gpt', icon: 'C' },
    { label: 'DeepSeek Chat', path: '/deepseek', icon: 'D' },
    { label: 'Next Lesson Recommendation', path: '/next-lesson-recommendation', icon: 'N' },
    { label: 'Upload Lecture PDF for Exam', path: '/exam-materials', icon: 'E' },
  ];

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  useEffect(() => {
    loadLessons();
  }, []);

  useEffect(() => {
    if (!selectedLessonId) {
      setStudents([]);
      setSelectedStudentId('');
      setPredictions([]);
      return;
    }

    loadStudents(selectedLessonId);
    setPredictions([]);
    setLimeExplanation(null);
    setShapExplanation(null);
    setAggregateExplanation(null);
    setAggregateError('');
    setShapError('');
    setShowTechnicalDetails(false);
    setShowTechniqueEvidence(false);
    setGuidanceStep(1);
    setSelectedAnalysisRowId(null);
    setStatusMessage('Select a student and click "Show High Cognitive Load".');
  }, [selectedLessonId]);

  useEffect(() => {
    setStyleAnalysis(null);
    setStyleError('');
    setShowStyleTopFeatures(false);
  }, [selectedLessonId, selectedStudentId]);

  async function loadLessons() {
    try {
      setError('');
      const [lessonRows, courseRows] = await Promise.all([
        fetchLimeLessons(),
        fetchLessonNames().catch(() => []),
      ]);
      const courseNames = new Map(
        (courseRows ?? []).map((course) => [String(course.id), course.courseName]),
      );
      const namedLessons = (lessonRows ?? []).map((lesson) => ({
        ...lesson,
        lesson_name: courseNames.get(String(lesson.lesson_id)) || '',
      }));
      setLessons(namedLessons);

      if (namedLessons.length) {
        setSelectedLessonId(String(namedLessons[0].lesson_id));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadStudents(lessonId) {
    try {
      setError('');
      const studentRows = await fetchLimeStudentsByLesson(lessonId);
      const nameRows = await fetchStudentNames(
        (studentRows ?? []).map((student) => student.student_id),
      ).catch(() => []);
      const studentNames = new Map(
        nameRows.map((student) => [String(student.student_id), student.student_name]),
      );
      setStudents(
        (studentRows ?? []).map((student) => ({
          ...student,
          student_name: studentNames.get(String(student.student_id)) || '',
        })),
      );
      setSelectedStudentId('');
    } catch (err) {
      setError(err.message);
      setStudents([]);
      setSelectedStudentId('');
    }
  }

  async function handleShowHighLoad() {
    if (!selectedLessonId || !selectedStudentId) {
      setError('Please select both a lesson and a student.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const summary = await createStudentLessonSummary(selectedLessonId, selectedStudentId);
      setPredictions(summary ? [summary] : []);
      setLimeExplanation(null);
      setShapExplanation(null);
      setAggregateExplanation(null);
      setAggregateError('');
      setShapError('');
      setSelectedAnalysisRowId(null);
      setGuidanceStep(1);

      if (!summary) {
        setStatusMessage('Failed to create student-lesson summary.');
      } else if (isNoRecommendationLoad(summary.predicted_cognitive_load)) {
        setStatusMessage(
          `Student ${selectedStudentId} cognitive load is ${summary.predicted_cognitive_load}. No further guidance is needed.`,
        );
      } else {
        setStatusMessage(`Cognitive-load summary created for student ${selectedStudentId}. You can now check why this load level was detected.`);
      }
    } catch (err) {
      setError(err.message);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRawAnalyse(row) {
    if (!selectedLessonId || !row?.id) return;

    try {
      setAnalysisLoadingId(row.id);
      setError('');
      setAggregateError('');
      setShapError('');
      setShowTechnicalDetails(false);
      setShowTechniqueEvidence(false);
      setGuidanceStep(1);

      // Fixed sample sizes for all cognitive load levels
      const limeSamples = 50;   // LIME: 50 samples
      const shapSamples = 25;   // SHAP: 25 samples

      const savedAnalysis = await fetchSavedStudentLessonAnalysis(
        selectedLessonId,
        row.student_id,
      );
      if (savedAnalysis) {
        setLimeExplanation(savedAnalysis.lime_explanation);
        setShapExplanation(savedAnalysis.shap_explanation);
        setAggregateExplanation(savedAnalysis.aggregate_explanation);
        setSelectedAnalysisRowId(row.id);
        setStatusMessage(
          `Saved LIME, SHAP, and AI guidance loaded for student ${row.student_id}.`,
        );
        return;
      }

      const [limeResult, shapResult] = await Promise.allSettled([
        fetchLimeExplanation(selectedLessonId, row.id, {
          numFeatures: 8,
          numSamples: limeSamples,
        }),
        fetchShapExplanation(selectedLessonId, row.id, {
          numFeatures: 8,
          numSamples: shapSamples,
        }),
      ]);

      if (limeResult.status === 'fulfilled') {
        setLimeExplanation(limeResult.value);
      } else {
        setLimeExplanation(null);
        setError(limeResult.reason?.message || 'LIME analysis failed.');
      }

      if (shapResult.status === 'fulfilled') {
        setShapExplanation(shapResult.value);
      } else {
        setShapExplanation(null);
        setShapError(shapResult.reason?.message || 'SHAP analysis failed.');
      }

      if (limeResult.status === 'fulfilled' && shapResult.status === 'fulfilled') {
        try {
          const aggregate = await fetchAggregateExplanation({
            lesson_id: String(selectedLessonId),
            prediction_id: Number(row.id),
            student_id: String(row.student_id),
            predicted_cognitive_load: String(row.predicted_cognitive_load),
            predicted_score: Number(row.predicted_score),
            confidence: Number(row.confidence),
            lime_factors: limeResult.value.factors ?? [],
            shap_values: shapResult.value.shap_values ?? [],
            lime_explanation: limeResult.value,
            shap_explanation: shapResult.value,
          });
          setAggregateExplanation(aggregate);
        } catch (aggregateErr) {
          setAggregateExplanation(null);
          setAggregateError(aggregateErr.message || 'Aggregate explanation generation failed.');
        }
      } else {
        setAggregateExplanation(null);
      }

      setSelectedAnalysisRowId(row.id);
      if (limeResult.status === 'fulfilled' && shapResult.status === 'fulfilled') {
        setStatusMessage(`LIME and SHAP explanations generated for record #${row.id}.`);
      } else if (limeResult.status === 'fulfilled') {
        setStatusMessage(`LIME explanation generated for record #${row.id}. SHAP is unavailable.`);
      } else if (shapResult.status === 'fulfilled') {
        setStatusMessage(`SHAP explanation generated for record #${row.id}. LIME is unavailable.`);
      }
    } catch (err) {
      setError(err.message);
      setLimeExplanation(null);
      setShapExplanation(null);
      setAggregateExplanation(null);
      setSelectedAnalysisRowId(null);
    } finally {
      setAnalysisLoadingId(null);
    }
  }

  async function handleAnalyseStyle() {
    if (!selectedLessonId || !selectedStudentId) return;
    try {
      setStyleLoading(true);
      setStyleError('');
      setStyleAnalysis(null);
      setShowStyleTopFeatures(false);
      const result = await analyseCognitiveStyle(selectedLessonId, selectedStudentId);
      setStyleAnalysis(result);
      setStatusMessage(
        result.cached
          ? `Saved cognitive-style analysis loaded for student ${selectedStudentId}; LIME and SHAP were not rerun.`
          : `Cognitive-style LIME and SHAP analysis completed for student ${selectedStudentId}.`,
      );
    } catch (err) {
      setStyleError(err.message);
    } finally {
      setStyleLoading(false);
    }
  }

  function showGuidanceStep(step) {
    setShowTechnicalDetails(false);
    setShowTechniqueEvidence(false);
    setGuidanceStep(step);
    requestAnimationFrame(() => {
      document.getElementById('guidance-review-workspace')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  async function handleShareGuidance() {
    if (!aggregateExplanation || !selectedLessonId || !selectedStudentId) return;
    try {
      setGuidanceAction('approve');
      setError('');
      const shared = await shareLessonGuidance(selectedStudentId, selectedLessonId);
      setAggregateExplanation((current) => ({
        ...current,
        shared_to_student: true,
        shared_at: shared.shared_at,
        study_technique: {
          ...current.study_technique,
          teacher_review: shared.teacher_review,
        },
      }));
      setStatusMessage('Recommendation and study techniques sent to the student.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuidanceAction('');
    }
  }

  async function handleRejectGuidance() {
    if (!aggregateExplanation || !selectedLessonId || !selectedStudentId) return;
    try {
      setGuidanceAction('reject');
      setError('');
      const rejected = await rejectLessonGuidance(
        selectedStudentId,
        selectedLessonId,
        guidanceRejectionReason,
      );
      setAggregateExplanation((current) => ({
        ...current,
        shared_to_student: false,
        shared_at: null,
        study_technique: {
          ...current.study_technique,
          teacher_review: rejected.teacher_review,
        },
      }));
      setStatusMessage('Guidance rejected and withheld from the student.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuidanceAction('');
    }
  }

  async function handleRegenerateGuidance() {
    if (!aggregateExplanation || !selectedLessonId || !selectedStudentId) return;
    try {
      setGuidanceAction('regenerate');
      setError('');
      const regenerated = await regenerateLessonGuidance(selectedStudentId, selectedLessonId);
      setAggregateExplanation((current) => ({
        ...current,
        ...regenerated,
      }));
      setGuidanceRejectionReason('');
      setStatusMessage('New guidance generated. Review it before approving and sending.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuidanceAction('');
    }
  }

  return (
    <div className="teacher-dashboard-shell student-analysis-dashboard-layout">
      <aside className="teacher-dashboard-sidebar">
        <div className="teacher-dashboard-brand">
          <span className="teacher-dashboard-brand-mark" aria-hidden="true">E</span>
          <span className="teacher-dashboard-brand-copy">
            <strong>EduPortal</strong>
            <small>Teacher workspace</small>
          </span>
        </div>

        <nav className="teacher-dashboard-nav" aria-label="Teacher analysis navigation">
          <button type="button" className="teacher-dashboard-nav-button" onClick={() => navigate('/dashboard')}>
            <span className="teacher-dashboard-nav-icon" aria-hidden="true">⌂</span>
            <span>Dashboard</span>
          </button>
          {analysisNavigation.map((action) => (
            <button
              key={action.path}
              type="button"
              className={`teacher-dashboard-nav-button ${action.active ? 'is-active' : ''}`}
              onClick={() => navigate(action.path)}
              aria-current={action.active ? 'page' : undefined}
            >
              <span className="teacher-dashboard-nav-icon" aria-hidden="true">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
        </nav>

        <div className="teacher-dashboard-profile">
          <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
          <span className="teacher-dashboard-profile-copy">
            <strong>{dashboardUser.name || 'Teacher'}</strong>
            <small>Teacher account</small>
          </span>
          <button type="button" className="teacher-dashboard-logout" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <div className="teacher-dashboard-main student-analysis-dashboard-main">
        <header className="teacher-dashboard-topbar">
          <div>
            <span className="teacher-dashboard-topbar-label">Teacher portal</span>
            <strong>Student Analyse</strong>
          </div>
          <div className="teacher-dashboard-user-chip">
            <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
            <span>Hello, {dashboardUser.name || 'Teacher'}</span>
          </div>
        </header>

        <div className="student-analyse-shell">
      {analysisLoadingId ? (
        <div className="analysis-loading-overlay" role="dialog" aria-modal="true" aria-labelledby="analysis-loading-title">
          <div className="analysis-loading-modal">
            <div className="analysis-orbit" aria-hidden="true">
              <span className="analysis-orbit-ring orbit-ring-one" />
              <span className="analysis-orbit-ring orbit-ring-two" />
              <span className="analysis-orbit-dot orbit-dot-one" />
              <span className="analysis-orbit-dot orbit-dot-two" />
              <span className="analysis-brain-icon">?</span>
            </div>

            <span className="analysis-loading-kicker">Creating student insight</span>
            <h2 id="analysis-loading-title">Please wait while we analyse the student</h2>
            <p>
              We are reviewing the lesson behaviour and preparing a clear explanation for you.
            </p>

            <div className="analysis-loading-steps" aria-label="Analysis in progress">
              <span><i aria-hidden="true" /> Reviewing behaviour</span>
              <span><i aria-hidden="true" /> Finding key signals</span>
              <span><i aria-hidden="true" /> Preparing guidance</span>
            </div>

            <div className="analysis-loading-bar" aria-hidden="true">
              <span />
            </div>
            <small>This may take a few moments. The result will open automatically.</small>
          </div>
        </div>
      ) : null}

      {styleLoading ? (
        <div className="analysis-loading-overlay" role="dialog" aria-modal="true" aria-labelledby="style-loading-title">
          <div className="analysis-loading-modal style-loading-modal">
            <div className="analysis-orbit style-analysis-orbit" aria-hidden="true">
              <span className="analysis-orbit-ring orbit-ring-one" />
              <span className="analysis-orbit-ring orbit-ring-two" />
              <span className="analysis-orbit-dot orbit-dot-one" />
              <span className="analysis-orbit-dot orbit-dot-two" />
              <span className="analysis-brain-icon style-brain-icon">V|T</span>
            </div>

            <span className="analysis-loading-kicker style-loading-kicker">Understanding learning style</span>
            <h2 id="style-loading-title">Please wait while we analyse the student's learning style</h2>
            <p>
              We are checking for a saved insight and reviewing how the student engaged with visual and text content.
            </p>

            <div className="analysis-loading-steps style-loading-steps" aria-label="Cognitive-style analysis in progress">
              <span><i aria-hidden="true" /> Checking saved analysis</span>
              <span><i aria-hidden="true" /> Finding key patterns</span>
              <span><i aria-hidden="true" /> Preparing explanation</span>
            </div>

            <div className="analysis-loading-bar style-loading-bar" aria-hidden="true">
              <span />
            </div>
            <small>A saved result will open quickly; a new analysis may take a few moments.</small>
          </div>
        </div>
      ) : null}

      <header className="student-analyse-header">
        <div>
          <p className="eyebrow">Student Learning Analysis</p>
          <h1>Understand Your Student's Learning Experience</h1>
          <p className="hero-copy">
            Choose a lesson and student to see how demanding the lesson was and discover what support may help them learn better.
          </p>
        </div>
      </header>

      <section className="student-analyse-toolbar selection-workflow glass-panel">
        <div className="selection-fields selection-fields-simple">
          <div className={`selection-field ${selectedLessonId ? 'completed' : 'active'}`}>
            <span className="selection-field-heading">
              <strong>Select lesson</strong>
            </span>
            <span className="selection-select-wrap">
              <SelectionDropdown
                value={selectedLessonId}
                placeholder="Choose a lesson..."
                options={lessons.map((lesson) => ({
                  value: lesson.lesson_id,
                  label: lesson.lesson_name || `Lesson ${lesson.lesson_id}`,
                }))}
                onChange={setSelectedLessonId}
              />
            </span>
          </div>

          <div className={`selection-field ${selectedStudentId ? 'completed' : selectedLessonId ? 'active' : 'locked'}`}>
            <span className="selection-field-heading">
              <strong>Select student</strong>
            </span>
            <span className="selection-select-wrap">
              <SelectionDropdown
                value={selectedStudentId}
                placeholder={!selectedLessonId ? 'Select a lesson first' : 'Choose a student...'}
                options={students.map((student) => ({
                  value: student.student_id,
                  label: student.student_name || `Student ${student.student_id}`,
                }))}
                disabled={!selectedLessonId || !students.length}
                onChange={setSelectedStudentId}
              />
            </span>
          </div>
        </div>

        <div className="selection-actions selection-actions-simple">
          <div className="selection-action-buttons">
            <button
              type="button"
              onClick={handleShowHighLoad}
              disabled={!selectedLessonId || !selectedStudentId || loading}
            >
              {loading ? 'Analysing cognitive load...' : 'Analyse Cognitive Load'}
            </button>

            <button
              type="button"
              className="analyse-style-btn"
              onClick={handleAnalyseStyle}
              disabled={!selectedLessonId || !selectedStudentId || styleLoading}
            >
              {styleLoading ? 'Analysing style...' : 'Analyse cognitive style'}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {styleError ? <div className="alert error">{styleError}</div> : null}

      {styleLoading || styleAnalysis ? (
        <section className="student-analyse-results glass-panel cognitive-style-panel">
          <h2>Cognitive Style Explanation</h2>
          {styleLoading ? (
            <p className="empty-state">Running LIME and SHAP in parallel...</p>
          ) : (
            <>
              <div className="style-summary-row">
                <div>
                  <span className="style-summary-label">Predicted style</span>
                  <strong className="style-name">
                    {styleAnalysis.cognitive_style_display || formatCognitiveStyleLabel(styleAnalysis.cognitive_style)}
                  </strong>
                </div>
              </div>

              {styleAnalysis.human_explanation ? (
                <div className="human-explanation-card style-human-explanation">
                  <p className="human-explanation-title">Teacher-Friendly Cognitive Style Explanation</p>
                  <p className="human-explanation-source">
                    Generated by Gemini ({styleAnalysis.explanation_model || 'configured model'})
                  </p>
                  <div className="teacher-explanation-sections">
                    <div className="teacher-explanation-section meaning-section">
                      <span className="teacher-explanation-step" aria-hidden="true">?</span>
                      <div>
                        <p className="teacher-explanation-section-title">
                          Why this cognitive style was selected
                        </p>
                        <p className="human-explanation-text">{styleAnalysis.human_explanation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className={`raw-analyse-btn ${showStyleTopFeatures ? 'active' : ''}`}
                onClick={() => setShowStyleTopFeatures(current => !current)}
                aria-expanded={showStyleTopFeatures}
              >
                {showStyleTopFeatures ? 'Hide Technical Evidence' : 'View Technical Evidence'}
              </button>

              {showStyleTopFeatures ? (
                <div className="technical-evidence-panel">
                  <div className="technical-evidence-heading">
                    <div>
                      <p className="eyebrow">For technical review</p>
                      <h3>Model Evidence</h3>
                    </div>
                    <div className="technical-evidence-summary">
                      <span>
                        Prediction:{' '}
                        <strong>
                          {styleAnalysis.cognitive_style_display || formatCognitiveStyleLabel(styleAnalysis.cognitive_style)}
                        </strong>
                      </span>
                      <span>
                        Confidence: <strong>{(Number(styleAnalysis.confidence || 0) * 100).toFixed(2)}%</strong>
                      </span>
                    </div>
                  </div>

                  <p className="technical-evidence-note">
                    The ranked features below summarize the strongest combined LIME and SHAP evidence for this result.
                  </p>

                  <h4>Top 3 Combined Features</h4>
                  <div className="style-feature-grid">
                    {(styleAnalysis.top_features ?? []).map((feature, index) => (
                      <article className="style-feature-card" key={feature.feature}>
                        <span className="feature-rank">#{index + 1}</span>
                        <h4>{feature.feature}</h4>
                        <span className={`impact-badge ${feature.direction}`}>{feature.direction}</span>
                      </article>
                    ))}
                  </div>

                  <div className="style-raw-grid">
                    <details>
                      <summary>Raw LIME output</summary>
                      <div className="results-table-wrapper">
                        <table><thead><tr><th>Feature</th><th>Weight</th></tr></thead><tbody>
                          {(styleAnalysis.lime_output ?? []).map((item) => (
                            <tr key={item.feature}><td>{item.feature}</td><td>{Number(item.weight).toFixed(6)}</td></tr>
                          ))}
                        </tbody></table>
                      </div>
                    </details>
                    <details>
                      <summary>Raw SHAP output</summary>
                      <div className="results-table-wrapper">
                        <table><thead><tr><th>Feature</th><th>SHAP value</th></tr></thead><tbody>
                          {(styleAnalysis.shap_output ?? []).map((item) => (
                            <tr key={item.feature}><td>{item.feature}</td><td>{Number(item.shap_value).toFixed(6)}</td></tr>
                          ))}
                        </tbody></table>
                      </div>
                    </details>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {predictions.length ? (
        <section className="student-analyse-results summary-results-panel glass-panel">
          <div className="summary-results-heading">
            <div>
              <p className="eyebrow">Analysis result</p>
              <h2>Student Cognitive-Load Summary</h2>
              <p>Review the detected load level, then open its explanation if attention is needed.</p>
            </div>
          </div>

          <div className="cognitive-summary-list">
            {predictions.map((row) => {
              const lessonName = lessons.find(
                (lesson) => String(lesson.lesson_id) === String(row.lesson_id),
              )?.lesson_name || `Lesson ${row.lesson_id}`;
              const studentName = students.find(
                (student) => String(student.student_id) === String(row.student_id),
              )?.student_name || `Student ${row.student_id}`;
              const loadLevel = row.predicted_cognitive_load || 'Unknown';
              const loadClass = getLoadClass(loadLevel);

              return (
                <article className={`cognitive-summary-card load-${loadClass}`} key={row.id}>
                  <div className="summary-identity">
                    <span className="summary-lesson-label">Lesson</span>
                    <h3>{lessonName}</h3>
                    <p>
                      Student: <strong>{studentName}</strong>
                    </p>
                  </div>

                  <div className="summary-load-result">
                    <span className="summary-load-label">Detected cognitive load</span>
                    <span className={`load-badge ${loadClass}`}>
                      <span className="load-badge-dot" aria-hidden="true" />
                      {loadLevel}
                    </span>
                    <small>
                      {isNoRecommendationLoad(loadLevel)
                        ? 'This result does not currently require additional guidance.'
                        : 'Review the contributing learning-behaviour signals.'}
                    </small>
                  </div>

                  <div className="summary-card-action">
                    {isNoRecommendationLoad(loadLevel) ? (
                      <span className="summary-no-action">No recommendation needed</span>
                    ) : (
                      <button
                        type="button"
                        className={`load-reason-button ${
                          selectedAnalysisRowId === row.id ? 'active' : ''
                        }`}
                        onClick={() => handleRawAnalyse(row)}
                        disabled={Boolean(analysisLoadingId)}
                      >
                        <span className="load-reason-icon" aria-hidden="true">?</span>
                        <span>
                          <strong>
                            {analysisLoadingId === row.id
                              ? 'Checking cognitive load...'
                              : `Check Why Cognitive Load Is ${loadLevel}`}
                          </strong>
                        </span>
                        <span className="load-reason-arrow" aria-hidden="true">&#8594;</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {limeExplanation ? (
        <section
          id="guidance-review-workspace"
          className="student-analyse-results glass-panel lime-panel guidance-review-panel guidance-step-workspace"
        >
          <div className="guidance-page-heading">
            <div>
              <p className="eyebrow">Teacher decision workspace</p>
              <h2>Review Student Guidance</h2>
              <p>Review each section in order, then approve, regenerate, or reject the complete guidance.</p>
            </div>
            {aggregateExplanation ? (
              <span className={`review-status ${aggregateExplanation.study_technique?.teacher_review?.status || 'pending'}`}>
                {aggregateExplanation.study_technique?.teacher_review?.status || 'pending'}
              </span>
            ) : null}
          </div>
          <div className="guidance-stepper" role="tablist" aria-label="Guidance review steps">
            {[
              ['1', 'Explanation'],
              ['2', 'Recommendations'],
              ['3', 'Techniques & approval'],
            ].map(([step, label]) => (
              <button
                key={step}
                type="button"
                className={guidanceStep === Number(step) ? 'is-current' : ''}
                onClick={() => showGuidanceStep(Number(step))}
                aria-current={guidanceStep === Number(step) ? 'step' : undefined}
              >
                <span>{step}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
          <div className="lime-content guidance-review-flow">
            <section className={`guidance-review-section explanation-review-section guidance-step-page ${guidanceStep === 1 ? 'is-current' : ''}`}>
              <div className="guidance-section-heading">
                <span className="guidance-section-number">1</span>
                <div>
                  <h3>Teacher-Friendly Explanation</h3>
                </div>
              </div>

              <div className="human-explanation-card load-human-explanation">
                <p className="human-explanation-title">Why this cognitive load level was selected</p>
                <p className="human-explanation-source">
                  Generated by Gemini from the observed lesson behaviour
                </p>
                <div className="teacher-explanation-sections">
                  <div className="teacher-explanation-section load-meaning-section">
                    <span className="teacher-explanation-step" aria-hidden="true">?</span>
                    <div>
                      <p className="human-explanation-text">
                        {aggregateExplanation?.human_explanation || 'No explanation text returned.'}
                      </p>
                    </div>
                  </div>
                </div>
                {aggregateError ? <p className="aggregate-error-text">{aggregateError}</p> : null}
              </div>

              <button
                type="button"
                className={`evidence-toggle-button explanation-evidence-button ${showTechnicalDetails ? 'active' : ''}`}
                onClick={() => setShowTechnicalDetails(current => !current)}
                aria-expanded={showTechnicalDetails}
              >
                <span>{showTechnicalDetails ? 'Hide explanation evidence' : 'View explanation technical evidence'}</span>
                <span aria-hidden="true">{showTechnicalDetails ? '−' : '+'}</span>
              </button>

              {showTechnicalDetails ? (
                <div className="technical-explanation-details technical-evidence-panel load-technical-evidence">
                  <div className="technical-evidence-heading">
                    <div>
                      <p className="eyebrow">Explanation evidence only</p>
                      <h3>Cognitive-Load Model Evidence</h3>
                    </div>
                    <div className="technical-evidence-summary">
                      <span>
                        Prediction:{' '}
                        <strong>
                          {aggregateExplanation?.predicted_cognitive_load || limeExplanation.predicted_cognitive_load}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <p className="technical-evidence-note">
                    These LIME and SHAP values support the cognitive-load explanation above. Study-technique evidence is shown separately in section 3.
                  </p>
                  <h4>Top 3 Combined Signals</h4>
                  <div className="results-table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Signal</th>
                          <th>Combined Value</th>
                          <th>Normalized Importance</th>
                          <th>Impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(aggregateExplanation?.top_signals ?? []).map((signal, index) => (
                          <tr key={`${signal.signal}-${index}`}>
                            <td>{signal.signal}</td>
                            <td>{Number(signal.raw_value ?? signal.strength).toFixed(6)}</td>
                            <td>{(Number(signal.normalized_value ?? signal.normalized_strength) * 100).toFixed(2)}%</td>
                            <td><span className={`impact-badge ${signal.impact}`}>{signal.impact}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h4 className="technical-subheading">Raw LIME Details</h4>
                  <div className="results-table-wrapper">
                    <table>
                      <thead><tr><th>Rule</th><th>Weight</th><th>Impact</th></tr></thead>
                      <tbody>
                        {(limeExplanation.factors ?? []).map((factor, index) => (
                          <tr key={`${factor.rule}-${index}`}>
                            <td>{factor.rule}</td>
                            <td>{Number(factor.weight).toFixed(6)}</td>
                            <td><span className={`impact-badge ${factor.impact}`}>{factor.impact}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h4 className="technical-subheading">Raw SHAP Details</h4>
                  {shapError ? <div className="alert error shap-alert">{shapError}</div> : null}
                  {!shapError && !shapExplanation ? (
                    <p className="empty-state technical-empty-state">
                      SHAP output is unavailable for this analysis.
                    </p>
                  ) : null}
                  {shapExplanation ? (
                    <>
                      <p className="technical-table-description">
                        Each SHAP value shows how strongly that feature moved this student’s prediction.
                      </p>
                      <div className="results-table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              <th>Feature</th>
                              <th>Feature Value</th>
                              <th>SHAP Value</th>
                              <th>Impact</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(shapExplanation.shap_values ?? []).map((item, index) => (
                              <tr key={`${item.feature}-${index}`}>
                                <td>{item.feature}</td>
                                <td>{Number(item.value).toFixed(4)}</td>
                                <td>{Number(item.shap_value).toFixed(6)}</td>
                                <td><span className={`impact-badge ${item.impact}`}>{item.impact}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="guidance-step-navigation is-next-only">
                <span>Next, review what should be recommended to the student.</span>
                <button type="button" onClick={() => showGuidanceStep(2)}>
                  Next: Recommendations <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

            <section className={`guidance-review-section recommendation-review-section guidance-step-page ${guidanceStep === 2 ? 'is-current' : ''}`}>
              <div className="guidance-section-heading">
                <span className="guidance-section-number">2</span>
                <div>
                  <h3>Student Recommendations</h3>
                  <p>General guidance the teacher can review before it is shared with the student.</p>
                </div>
              </div>
              <div className="recommendation-content-card">
                {aggregateExplanation?.lecture_support?.strategies ? (
                  <div className="recommendation-list">
                    {formatRecommendationItems(aggregateExplanation.lecture_support.strategies).map((item, index) => (
                      <div key={`${index}-${item}`} className="recommendation-item">
                        <span className="recommendation-item-number">{index + 1}</span>
                        <p className="recommendation-item-text">{item}</p>
                      </div>
                    ))}
                  </div>
                ) : recommendationItems.length > 0 ? (
                  <div className="recommendation-list">
                    {recommendationItems.map((item, index) => (
                      <div key={`${index}-${item}`} className="recommendation-item">
                        <span className="recommendation-item-number">{index + 1}</span>
                        <p className="recommendation-item-text">{item}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="human-explanation-text">No specific student recommendations are available.</p>
                )}
              </div>
              <div className="guidance-step-navigation">
                <button type="button" className="guidance-previous-button" onClick={() => showGuidanceStep(1)}>
                  <span aria-hidden="true">←</span> Previous
                </button>
                <button type="button" onClick={() => showGuidanceStep(3)}>
                  Next: Study Techniques <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>

            <section className={`guidance-review-section technique-review-section guidance-step-page ${guidanceStep === 3 ? 'is-current' : ''}`}>
              <div className="guidance-section-heading">
                <span className="guidance-section-number">3</span>
                <div>
                  <h3>Recommended Study Techniques</h3>
                  <p>Practical techniques selected from the fixed, backend-approved catalogue.</p>
                </div>
              </div>

              <StudyTechniqueCards studyTechnique={aggregateExplanation?.study_technique} />

              <button
                type="button"
                className={`evidence-toggle-button technique-evidence-button ${showTechniqueEvidence ? 'active' : ''}`}
                onClick={() => setShowTechniqueEvidence(current => !current)}
                aria-expanded={showTechniqueEvidence}
              >
                <span>{showTechniqueEvidence ? 'Hide technique evidence' : 'View study-technique evidence'}</span>
                <span aria-hidden="true">{showTechniqueEvidence ? '−' : '+'}</span>
              </button>

              {showTechniqueEvidence && aggregateExplanation?.study_technique?.selection_evidence ? (
                <div className="technical-evidence-panel technique-technical-evidence">
                  <div className="technical-evidence-heading">
                    <div>
                      <p className="eyebrow">Technique evidence only</p>
                      <h3>Study-Technique Selection Evidence</h3>
                    </div>
                  </div>
                  <p className="technical-evidence-note">
                    This evidence explains how Gemini selected the techniques and how the backend constrained the selection.
                  </p>
                  <div className="technique-evidence-metadata">
                    <span>Method: <strong>{aggregateExplanation.study_technique.selection_evidence.selection_method}</strong></span>
                    <span>Model: <strong>{aggregateExplanation.study_technique.selection_evidence.model_name}</strong></span>
                    <span>Prompt version: <strong>{aggregateExplanation.study_technique.selection_evidence.prompt_version}</strong></span>
                    <span>Temperature: <strong>{aggregateExplanation.study_technique.selection_evidence.temperature}</strong></span>
                    <span>Max output tokens: <strong>{aggregateExplanation.study_technique.selection_evidence.max_output_tokens}</strong></span>
                  </div>
                  <h4>Selected techniques and matched behaviours</h4>
                  <div className="results-table-wrapper">
                    <table>
                      <thead>
                        <tr><th>Technique</th><th>Method</th><th>Matched behaviours</th><th>Selection reason</th></tr>
                      </thead>
                      <tbody>
                        {(aggregateExplanation.study_technique.techniques ?? []).map((technique, index) => (
                          <tr key={`${technique.technique}-selection-${index}`}>
                            <td>{technique.title || technique.technique}</td>
                            <td>{technique.selection_method || 'Legacy recommendation'}</td>
                            <td>{technique.matched_signals?.join(', ') || 'Cognitive-load level only'}</td>
                            <td>{technique.selection_reason || 'Not recorded for this legacy result.'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="technique-evidence-scope">
                    <strong>Allowed catalogue:</strong>{' '}
                    {(aggregateExplanation.study_technique.selection_evidence.allowed_techniques ?? []).join(', ')}
                    <br />
                    <strong>Teacher decision:</strong>{' '}
                    {aggregateExplanation.study_technique.teacher_review?.status || 'pending'}
                  </div>
                  {Object.keys(aggregateExplanation.study_technique.student_feedback ?? {}).length ? (
                    <>
                      <h4>Student feedback</h4>
                      <div className="results-table-wrapper">
                        <table>
                          <thead><tr><th>Technique</th><th>Used</th><th>Helpfulness</th><th>Ease</th><th>Comment</th></tr></thead>
                          <tbody>
                            {Object.values(aggregateExplanation.study_technique.student_feedback).map((feedback) => (
                              <tr key={feedback.technique}>
                                <td>{feedback.technique}</td>
                                <td>{feedback.used ? 'Yes' : 'No'}</td>
                                <td>{feedback.helpfulness || 'Not rated'}</td>
                                <td>{feedback.ease_of_use || 'Not rated'}</td>
                                <td>{feedback.comment || 'No comment'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="guidance-step-navigation guidance-technique-navigation">
                <button type="button" className="guidance-previous-button" onClick={() => showGuidanceStep(2)}>
                  <span aria-hidden="true">←</span> Previous: Recommendations
                </button>
                <span>Review the techniques, then make the final decision below.</span>
              </div>
            </section>

            {aggregateExplanation ? (
              <section className={`teacher-guidance-review final-guidance-decision guidance-step-page ${guidanceStep === 3 ? 'is-current' : ''}`}>
                <div className="teacher-guidance-review-heading">
                  <div>
                    <span className="decision-step-label">Final step</span>
                    <p className="support-card-title">Teacher Approval</p>
                    <p className="support-card-subtitle">
                      Your decision applies to the explanation, recommendations, and study techniques above.
                    </p>
                  </div>
                  <span className={`review-status ${aggregateExplanation.study_technique?.teacher_review?.status || 'pending'}`}>
                    {aggregateExplanation.study_technique?.teacher_review?.status || 'pending'}
                  </span>
                </div>
                <label className="guidance-rejection-field">
                  Rejection reason (optional)
                  <input
                    value={guidanceRejectionReason}
                    onChange={(event) => setGuidanceRejectionReason(event.target.value)}
                    maxLength={500}
                    placeholder="Example: The technique does not fit this lesson."
                  />
                </label>
                <div className="teacher-guidance-actions">
                  <button
                    type="button"
                    className="support-button approve-guidance-btn"
                    onClick={handleShareGuidance}
                    disabled={Boolean(guidanceAction) || aggregateExplanation.shared_to_student}
                  >
                    {guidanceAction === 'approve'
                      ? 'Approving...'
                      : aggregateExplanation.shared_to_student
                        ? 'Approved and Sent'
                        : 'Approve and Send to Student'}
                  </button>
                  <button
                    type="button"
                    className="support-button regenerate-guidance-btn"
                    onClick={handleRegenerateGuidance}
                    disabled={Boolean(guidanceAction)}
                  >
                    {guidanceAction === 'regenerate' ? 'Regenerating...' : 'Regenerate Guidance'}
                  </button>
                  <button
                    type="button"
                    className="support-button reject-guidance-btn"
                    onClick={handleRejectGuidance}
                    disabled={Boolean(guidanceAction)}
                  >
                    {guidanceAction === 'reject' ? 'Rejecting...' : 'Reject Guidance'}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      ) : null}

        </div>
      </div>
    </div>
  );
}
