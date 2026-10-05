import { useNavigate } from 'react-router-dom';
import '../styles/dashboard.css';
import '../styles/teacherWorkspace.css';

const navigationItems = [
  { label: 'Dashboard', path: '/dashboard', icon: '⌂' },
  { label: 'Upload Lesson', path: '/upload-lesson', icon: '+' },
  { label: 'Student Analyse', path: '/student-analyse', icon: 'S' },
  { label: 'Chat Assistant', path: '/gpt', icon: 'C' },
  { label: 'DeepSeek Chat', path: '/deepseek', icon: 'D' },
  { label: 'Next Lesson Recommendation', path: '/next-lesson-recommendation', icon: 'N' },
  { label: 'Upload Lecture PDF for Exam', path: '/exam-materials', icon: 'E' },
];

export default function TeacherWorkspaceLayout({
  activePath,
  title,
  description,
  eyebrow = 'Teacher workspace',
  badge = 'EDU',
  children,
}) {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const teacherInitial = (user.name || 'T').trim().charAt(0).toUpperCase();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="teacher-dashboard-shell teacher-workspace-layout">
      <aside className="teacher-dashboard-sidebar">
        <div className="teacher-dashboard-brand">
          <span className="teacher-dashboard-brand-mark" aria-hidden="true">E</span>
          <span className="teacher-dashboard-brand-copy">
            <strong>EduPortal</strong>
            <small>Teacher workspace</small>
          </span>
        </div>

        <nav className="teacher-dashboard-nav" aria-label="Teacher workspace navigation">
          {navigationItems.map((item) => {
            const isActive = item.path === activePath;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`teacher-dashboard-nav-button ${isActive ? 'is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="teacher-dashboard-nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
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

      <div className="teacher-dashboard-main">
        <header className="teacher-dashboard-topbar">
          <div>
            <span className="teacher-dashboard-topbar-label">Teacher portal</span>
            <strong>{title}</strong>
          </div>
          <div className="teacher-dashboard-user-chip">
            <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
            <span>Hello, {user.name || 'Teacher'}</span>
          </div>
        </header>

        <main className="teacher-dashboard-content teacher-workspace-content">
          <section className="teacher-workspace-hero">
            <div>
              <span className="teacher-dashboard-eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <span className="teacher-workspace-hero-badge" aria-hidden="true">{badge}</span>
          </section>
          {children}
        </main>
      </div>
    </div>
  );
}

