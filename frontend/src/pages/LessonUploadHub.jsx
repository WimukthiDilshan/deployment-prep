import { useNavigate } from 'react-router-dom';
import TeacherWorkspaceLayout from '../components/TeacherWorkspaceLayout';

const LessonUploadHub = () => {
  const navigate = useNavigate();

  return (
    <TeacherWorkspaceLayout
      activePath="/upload-lesson"
      eyebrow="Lesson management"
      title="Upload Lesson"
      description="Create new lesson content or return to the lessons you have already uploaded."
      badge="UP"
    >
      <section className="teacher-workspace-card">
        <div className="teacher-workspace-card-heading">
          <h2>Lesson uploads</h2>
          <p>Choose how you would like to manage your teaching content.</p>
        </div>
        <div className="teacher-workspace-actions">
          <button type="button" className="teacher-workspace-action" onClick={() => navigate('/upload-new_lesson')}>
            <span className="teacher-workspace-action-icon" aria-hidden="true">+</span>
            <strong>Upload new lessons</strong>
            <small>Create a course structure and add new lesson resources.</small>
          </button>
          <button type="button" className="teacher-workspace-action" onClick={() => navigate('/uploads')}>
            <span className="teacher-workspace-action-icon" aria-hidden="true">L</span>
            <strong>View uploaded lessons</strong>
            <small>Review, open, and continue managing your existing lessons.</small>
          </button>
        </div>
      </section>
    </TeacherWorkspaceLayout>
  );
};

export default LessonUploadHub;
