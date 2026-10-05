import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import '../styles/dashboard.css';

const Dashboard = () => {
  const [, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const gatewayBaseUrl = getGatewayBaseUrl();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }
        const response = await axios.get(`${gatewayBaseUrl}/api/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(response.data);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        } else {
          setError('Failed to fetch dashboard data. Make sure backend is running.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [gatewayBaseUrl, navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const quickActions = [
    { label: 'Upload Lesson', path: '/upload-lesson', icon: '+' },
    { label: 'Student Analyse', path: '/student-analyse', icon: 'S' },
    { label: 'Chat Assistant', path: '/gpt', icon: 'C' },
    { label: 'DeepSeek Chat', path: '/deepseek', icon: 'D' },
    { label: 'Next Lesson Recommendation', path: '/next-lesson-recommendation', icon: 'N' },
    { label: 'Upload Lecture PDF for Exam', path: '/exam-materials', icon: 'E' }
  ];

  if (loading) {
    return <div className="auth-container"><h2 className="gradient-text">Loading Dashboard...</h2></div>;
  }

  const teacherInitial = (user.name || 'T').trim().charAt(0).toUpperCase();

  return (
    <div className="teacher-dashboard-shell">
      <aside className="teacher-dashboard-sidebar">
        <div className="teacher-dashboard-brand">
          <span className="teacher-dashboard-brand-mark" aria-hidden="true">E</span>
          <span className="teacher-dashboard-brand-copy">
            <strong>EduPortal</strong>
            <small>Teacher workspace</small>
          </span>
        </div>

        <nav className="teacher-dashboard-nav" aria-label="Teacher dashboard navigation">
          <button type="button" className="teacher-dashboard-nav-button is-active" aria-current="page">
            <span className="teacher-dashboard-nav-icon" aria-hidden="true">⌂</span>
            <span>Dashboard</span>
          </button>
          {quickActions.map((action) => (
            <button key={action.path} type="button" onClick={() => navigate(action.path)} className="teacher-dashboard-nav-button">
              <span className="teacher-dashboard-nav-icon" aria-hidden="true">{action.icon}</span>
              <span>{action.label}</span>
            </button>
          ))}
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
            <strong>Dashboard</strong>
          </div>
          <div className="teacher-dashboard-user-chip">
            <span className="teacher-dashboard-avatar" aria-hidden="true">{teacherInitial}</span>
            <span>Hello, {user.name || 'Teacher'}</span>
          </div>
        </header>

        <main className="teacher-dashboard-content">
          <section className="teacher-dashboard-welcome">
            <div>
              <span className="teacher-dashboard-eyebrow">Overview</span>
              <h1>Welcome back, {user.name || 'Teacher'}</h1>
              <p>Manage lessons, review student learning insights, and prepare your next teaching plan.</p>
            </div>
            <div className="teacher-dashboard-welcome-badge" aria-hidden="true">EDU</div>
          </section>

          {error && <div className="error-message">{error}</div>}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
