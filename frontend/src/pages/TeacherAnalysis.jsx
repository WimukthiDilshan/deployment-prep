import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClassSummary from '../explainable/components/ClassSummary';
import StudentCard from '../explainable/components/StudentCard';
import {
  fetchClassSummary,
  fetchHighLoadPeriodExplanation,
  fetchHighLoadPeriods,
  fetchLessonStudents,
  fetchLessons,
  fetchStudentExplanation,
  generateClassRecommendation,
  generateStudentExplanations,
} from '../explainable/apiClient';
import '../styles/teacherAnalysis.css';

export default function TeacherAnalysis() {
  const [lessons, setLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentExplanation, setStudentExplanation] = useState(null);
  const [highLoadPeriods, setHighLoadPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [periodExplanation, setPeriodExplanation] = useState(null);
  const [classSummary, setClassSummary] = useState(null);
  const [classRecommendation, setClassRecommendation] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    loadLessons();
  }, []);

  useEffect(() => {
    if (!selectedLessonId) {
      setStudents([]);
      setSelectedStudentId('');
      setStudentExplanation(null);
      setClassSummary(null);
      setClassRecommendation('');
      return;
    }

    loadLessonData(selectedLessonId);
  }, [selectedLessonId]);

  useEffect(() => {
    if (!selectedLessonId || !selectedStudentId) {
      setStudentExplanation(null);
      setHighLoadPeriods([]);
      setSelectedPeriodId('');
      setPeriodExplanation(null);
      return;
    }

    loadStudentExplanation(selectedStudentId, selectedLessonId);
    loadHighLoadPeriods(selectedStudentId, selectedLessonId);
  }, [selectedLessonId, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudentId || !selectedLessonId || !selectedPeriodId) {
      setPeriodExplanation(null);
      return;
    }
    loadPeriodExplanation(selectedStudentId, selectedLessonId, selectedPeriodId);
  }, [selectedStudentId, selectedLessonId, selectedPeriodId]);

  async function loadLessons() {
    try {
      setError('');
      const payload = await fetchLessons();
      setLessons(payload.lessons ?? []);
      if (!selectedLessonId && payload.lessons?.length) {
        setSelectedLessonId(String(payload.lessons[0].lesson_id));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadLessonData(lessonId) {
    try {
      setLoading(true);
      setError('');
      const [studentsPayload, summaryPayload] = await Promise.all([
        fetchLessonStudents(lessonId),
        fetchClassSummary(lessonId),
      ]);
      setStudents(studentsPayload.students ?? []);
      setClassSummary(summaryPayload);
      setClassRecommendation(summaryPayload?.next_lesson_recommendation ?? '');
      const nextStudentId = studentsPayload.students?.[0]?.student_id;
      setSelectedStudentId(nextStudentId ? String(nextStudentId) : '');
    } catch (err) {
      setError(err.message);
      setStudents([]);
      setClassSummary(null);
      setSelectedStudentId('');
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentExplanation(studentId, lessonId) {
    try {
      setError('');
      const payload = await fetchStudentExplanation(studentId, lessonId);
      setStudentExplanation(payload);
    } catch (err) {
      setError(err.message);
      setStudentExplanation(null);
    }
  }

  async function loadHighLoadPeriods(studentId, lessonId) {
    try {
      setError('');
      const payload = await fetchHighLoadPeriods(studentId, lessonId);
      setHighLoadPeriods(payload.periods ?? []);
      const firstPeriodId = payload.periods?.[0]?.period_id;
      setSelectedPeriodId(firstPeriodId ? String(firstPeriodId) : '');
      if (!firstPeriodId) {
        setPeriodExplanation(null);
      }
    } catch (err) {
      setError(err.message);
      setHighLoadPeriods([]);
      setSelectedPeriodId('');
      setPeriodExplanation(null);
    }
  }

  async function loadPeriodExplanation(studentId, lessonId, periodId) {
    try {
      setError('');
      const payload = await fetchHighLoadPeriodExplanation(studentId, lessonId, periodId);
      setPeriodExplanation(payload);
    } catch (err) {
      setError(err.message);
      setPeriodExplanation(null);
    }
  }

  async function handleGenerateStudentExplanations() {
    if (!selectedLessonId) return;
    try {
      setLoading(true);
      setError('');
      const payload = await generateStudentExplanations(selectedLessonId);
      setStatusMessage(`Generated explanations for ${payload.count} students.`);
      await Promise.all([loadLessonData(selectedLessonId), loadLessons()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshClassSummary() {
    if (!selectedLessonId) return;
    try {
      setLoading(true);
      setError('');
      const payload = await fetchClassSummary(selectedLessonId);
      setClassSummary(payload);
      setClassRecommendation(payload?.next_lesson_recommendation ?? '');
      setStatusMessage('Class summary refreshed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRecommendation() {
    if (!selectedLessonId || !classSummary) return;
    try {
      setLoading(true);
      setError('');
      const payload = await generateClassRecommendation(selectedLessonId, classSummary);
      setClassRecommendation(payload.next_lesson_recommendation);
      setStatusMessage('Class recommendation generated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="analysis-shell">
      <header className="analysis-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
        <div>
          <p className="eyebrow">Teacher Analysis</p>
          <h1>Lesson explainability console</h1>
          <p className="hero-copy">
            Review student cognitive load, inspect explanations, and generate class-level guidance.
          </p>
        </div>
        <div className="actions-row">
          <button onClick={handleGenerateStudentExplanations} disabled={!selectedLessonId || loading}>
            Generate student explanations
          </button>
          <button onClick={handleRefreshClassSummary} disabled={!selectedLessonId || loading} className="secondary">
            Generate class summary
          </button>
          <button onClick={handleGenerateRecommendation} disabled={!selectedLessonId || !classSummary || loading} className="secondary">
            Generate recommendation
          </button>
        </div>
      </header>

      <section className="toolbar">
        <label>
          Lesson
          <select value={selectedLessonId} onChange={(event) => setSelectedLessonId(event.target.value)}>
            <option value="">Select a lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.lesson_id} value={lesson.lesson_id}>
                Lesson {lesson.lesson_id} ({lesson.total_students} students)
              </option>
            ))}
          </select>
        </label>

        <label>
          Student
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            disabled={!students.length}
          >
            <option value="">Select a student</option>
            {students.map((student) => (
              <option key={student.student_id} value={student.student_id}>
                Student {student.student_id}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {statusMessage ? <div className="alert success">{statusMessage}</div> : null}

      <main className="dashboard-grid">
        <StudentCard
          explanation={studentExplanation}
          highLoadPeriods={highLoadPeriods}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={(periodId) => setSelectedPeriodId(String(periodId))}
          periodExplanation={periodExplanation}
        />
        <ClassSummary summary={classSummary} recommendation={classRecommendation} />
      </main>

      {loading ? <p className="loading-text">Loading...</p> : null}
    </div>
  );
}
