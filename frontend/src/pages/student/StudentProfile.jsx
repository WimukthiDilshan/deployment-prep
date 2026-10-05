import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../../config/gateway';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

const StudentProfile = () => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        setError('Please log in to view your profile.');
        return;
      }

      try {
        const res = await axios.get(
          `${getGatewayBaseUrl()}/api/enrollments/me`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelled) {
          setEnrollments(
            Array.isArray(res.data?.data) ? res.data.data : []
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e.response?.data?.message ||
              e.message ||
              'Could not load enrolled courses.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [completeUser, setCompleteUser] = useState(null);

  useEffect(() => {
    const fetchStudentDetails = async (studentId) => {
      try {
        const response = await axios.get(`${getGatewayBaseUrl()}/api/auth/student/${studentId}`);
        setCompleteUser(response.data.student);
      } catch (err) {
        console.error('Failed to fetch student details:', err);
      }
    };

    if (user?.id) {
      fetchStudentDetails(user.id);
    }
  }, [user?.id]);


  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/student/login');
  };

  const displayUser = completeUser || user;

  const initials = (displayUser?.name || displayUser?.email || 'S')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'S';

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: '2rem' }}>
      <header
        className="glass-panel"
        style={{
          maxWidth: '900px',
          margin: '0 auto 2rem',
          padding: '1.25rem 1.5rem',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            className="gradient-text"
            style={{ fontSize: '1.35rem', fontWeight: 700 }}
          >
            Student Profile
          </h1>
          <p
            style={{
              marginTop: '0.35rem',
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
            }}
          >
            Your account details and enrolled courses.
          </p>
        </div>
        <Link
          to="/course"
          className="btn"
          style={{
            textDecoration: 'none',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff',
            border: '1px solid #1d4ed8',
            whiteSpace: 'nowrap',
          }}
        >
          Back to Courses
        </Link>
      </header>

      <main
        className="container"
        style={{ maxWidth: '900px', paddingTop: 0, display: 'grid', gap: '1.25rem' }}
      >
        <section
          className="glass-panel"
          style={{
            padding: '1.5rem',
            borderRadius: '14px',
            display: 'flex',
            gap: '1.25rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, #1d4ed8, #0f172a)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.35rem',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
              <h2
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  marginBottom: '0.35rem',
                  wordBreak: 'break-word',
                }}
              >
                {displayUser?.name || 'Student'}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gap: '0.35rem',
                  fontSize: '0.95rem',
                  color: 'var(--text-muted)',
                }}
              >
                <p>
                  <span style={{ color: 'var(--text)' }}>Email:</span>{' '}
                  {displayUser?.email || '—'}
                </p>
                <p>
                  <span style={{ color: 'var(--text)' }}>Role:</span>{' '}
                  {displayUser?.role || 'Student'}
                </p>
                <p>
                  <span style={{ color: 'var(--text)' }}>Mobile:</span>{' '}
                  {displayUser?.mobileNumber || '—'}
                </p>
                              <p>
                  <span style={{ color: 'var(--text)' }}>Visual Verbal Cognitive Style:</span>{' '}
                  {displayUser?.visualVerbalCognitiveStyle || '—'}
                </p>
  
                                            <p>
                  <span style={{ color: 'var(--text)' }}>Analytic Wholistic Cognitive Style:</span>{' '}
                  {displayUser?.analyticWholisticCognitiveStyle || '—'}
                </p>
  
                                                          <p>
                  <span style={{ color: 'var(--text)' }}>Learner Profile:</span>{' '}
                  {displayUser?.learnerProfile || '—'}
                </p>
              
            </div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'var(--text)',
            }}
          >
            Log out
          </button>
        </section>

        <section
          className="glass-panel"
          style={{ padding: '1.5rem', borderRadius: '14px' }}
        >
          <h3
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              marginBottom: '1rem',
              color: 'var(--text)',
            }}
          >
            Enrolled courses ({enrollments.length})
          </h3>

          {loading && (
            <p style={{ color: 'var(--text-muted)' }}>Loading enrollments…</p>
          )}
          {!loading && error && (
            <p style={{ color: 'var(--danger)' }}>{error}</p>
          )}
          {!loading && !error && enrollments.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>
              You have not enrolled in any courses yet.{' '}
              <Link to="/course" style={{ color: 'var(--primary)' }}>
                Browse courses
              </Link>
            </p>
          )}
          {!loading && !error && enrollments.length > 0 && (
            <div
              style={{
                display: 'grid',
                gap: '0.75rem',
              }}
            >
              {enrollments.map((enrollment) => {
                const courseId = String(enrollment.courseId);
                return (
                  <Link
                    key={courseId}
                    to={`/course/${encodeURIComponent(courseId)}`}
                    style={{
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                      padding: '1rem 1.1rem',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: '1rem',
                        fontWeight: 650,
                        color: 'var(--text)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {enrollment.courseName || 'Untitled course'}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.875rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {enrollment.educatorName
                        ? `Educator: ${enrollment.educatorName}`
                        : 'Educator: —'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default StudentProfile;
