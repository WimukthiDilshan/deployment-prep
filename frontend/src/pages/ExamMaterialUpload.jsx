import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  downloadExamMaterial,
  fetchExamMaterials,
  fetchMyCourses,
  uploadExamMaterial,
} from '../exam/apiClient';
import '../styles/dashboard.css';
import './ExamMaterialUpload.css';

const allowedExtensions = ['pdf', 'ppt', 'pptx'];
const formatSize = (bytes) => `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`;
const teacherNavigation = [
  { label: 'Upload Lesson', path: '/upload-lesson', icon: '+' },
  { label: 'Student Analyse', path: '/student-analyse', icon: 'S' },
  { label: 'Chat Assistant', path: '/gpt', icon: 'C' },
  { label: 'DeepSeek Chat', path: '/deepseek', icon: 'D' },
  { label: 'Next Lesson Recommendation', path: '/next-lesson-recommendation', icon: 'N' },
  { label: 'Upload Lecture PDF for Exam', path: '/exam-materials', icon: 'E' },
];

export default function ExamMaterialUpload() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [lessonName, setLessonName] = useState('');
  const [unitNo, setUnitNo] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const teacherInitial = (user.name || 'T').trim().charAt(0).toUpperCase();

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  }

  async function loadPageData() {
    try {
      const [courseList, materialList] = await Promise.all([
        fetchMyCourses(),
        fetchExamMaterials(),
      ]);
      setCourses(courseList);
      setMaterials(materialList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPageData(); }, []);

  function handleFile(event) {
    setError('');
    const selected = event.target.files?.[0] ?? null;
    const extension = selected?.name.split('.').pop()?.toLowerCase();
    if (selected && !allowedExtensions.includes(extension)) {
      event.target.value = '';
      setDocumentFile(null);
      setError('Choose a PDF, PPT, or PPTX file.');
      return;
    }
    setDocumentFile(selected);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const selectedCourse = courses.find((course) => String(course.id) === courseId);
    if (!selectedCourse || !lessonName.trim() || !unitNo.trim() || !documentFile) {
      setError('Select a course, enter the lesson name and unit number, then choose a document.');
      return;
    }
    setSubmitting(true);
    try {
      await uploadExamMaterial({
        courseId: String(selectedCourse.id),
        courseName: selectedCourse.courseName,
        lessonName: lessonName.trim(),
        unitNo: unitNo.trim(),
        document: documentFile,
      });
      setLessonName('');
      setUnitNo('');
      setDocumentFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setMessage('Exam material uploaded successfully.');
      setMaterials(await fetchExamMaterials());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function download(material) {
    try {
      setError('');
      await downloadExamMaterial(material);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="teacher-dashboard-shell exam-dashboard-layout">
      <aside className="teacher-dashboard-sidebar">
        <div className="teacher-dashboard-brand">
          <span className="teacher-dashboard-brand-mark" aria-hidden="true">E</span>
          <span className="teacher-dashboard-brand-copy">
            <strong>EduPortal</strong>
            <small>Teacher workspace</small>
          </span>
        </div>

        <nav className="teacher-dashboard-nav" aria-label="Teacher exam material navigation">
          <button type="button" className="teacher-dashboard-nav-button" onClick={() => navigate('/dashboard')}>
            <span className="teacher-dashboard-nav-icon" aria-hidden="true">⌂</span>
            <span>Dashboard</span>
          </button>
          {teacherNavigation.map((action) => {
            const isActive = action.path === '/exam-materials';
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
          <button type="button" onClick={handleLogout} className="teacher-dashboard-logout">Logout</button>
        </div>
      </aside>

      <div className="teacher-dashboard-main exam-dashboard-main">
        <header className="teacher-dashboard-topbar">
          <div>
            <span className="teacher-dashboard-topbar-label">Teacher portal</span>
            <strong>Exam materials</strong>
          </div>
          <div className="teacher-dashboard-user-chip">
            <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
            <span>Hello, {user.name || 'Teacher'}</span>
          </div>
        </header>

        <div className="exam-page">
          <header className="exam-header">
            <div><p>Exam preparation</p><h1>Lecture materials for exams</h1></div>
          </header>
          <main className="exam-main">
        <section className="exam-section">
          <div className="exam-heading"><h2>Upload material</h2><span>PDF and PowerPoint, up to 25 MB</span></div>
          <form className="exam-form" onSubmit={submit}>
            <label className="exam-course"><span>Course</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)} required disabled={loading || courses.length === 0}><option value="">{loading ? 'Loading your courses...' : courses.length ? 'Select a course' : 'No uploaded courses found'}</option>{courses.map((course) => <option key={course.id} value={String(course.id)}>{course.courseName}</option>)}</select><small>Only courses uploaded by your logged-in account are shown.</small></label>
            <label><span>Lesson name</span><input value={lessonName} onChange={(e) => setLessonName(e.target.value)} maxLength={255} required /></label>
            <label><span>Unit number</span><input value={unitNo} onChange={(e) => setUnitNo(e.target.value)} maxLength={50} required /></label>
            <label className="exam-file"><span>Lecture document</span><input ref={inputRef} type="file" accept=".pdf,.ppt,.pptx" onChange={handleFile} required /><small>{documentFile ? `${documentFile.name} (${formatSize(documentFile.size)})` : 'No document selected'}</small></label>
            <button className="exam-button primary" type="submit" disabled={submitting || loading || courses.length === 0}>{submitting ? 'Uploading...' : 'Upload exam material'}</button>
          </form>
          {message && <p className="exam-message success">{message}</p>}
          {error && <p className="exam-message error">{error}</p>}
        </section>
        <section className="exam-section">
          <div className="exam-heading"><h2>Your uploaded materials</h2><span>{materials.length} documents</span></div>
          {loading ? <p>Loading...</p> : materials.length === 0 ? <p>No exam materials uploaded yet.</p> : (
            <div className="exam-table-wrap"><table><thead><tr><th>Course</th><th>Lesson</th><th>Unit</th><th>Type</th><th>File</th><th>Uploaded</th><th /></tr></thead><tbody>
              {materials.map((item) => <tr key={item.id}><td>{item.courseName}</td><td>{item.lessonName}</td><td>{item.unitNo}</td><td>{item.documentType === 'pdf' ? 'PDF' : 'Presentation'}</td><td><strong>{item.originalFileName}</strong><small>{formatSize(item.fileSize)}</small></td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><button className="exam-button secondary" type="button" onClick={() => download(item)}>Download</button></td></tr>)}
            </tbody></table></div>
          )}
        </section>
          </main>
        </div>
      </div>
    </div>
  );
}
