import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { getGatewayBaseUrl } from '../config/gateway';

const UploadsView = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const gatewayBaseUrl = getGatewayBaseUrl();

  const fetchMyCourses = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    const response = await axios.get(`${gatewayBaseUrl}/api/courses/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = response.data?.data;
    setCourses(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    (async () => {
      try {
        await fetchMyCourses();
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }
        setMessage(
          error.response?.data?.message || 'Failed to load your courses.'
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [gatewayBaseUrl, navigate]);

  const handleDelete = async (id) => {
    const ok = window.confirm(
      'Delete this course and all its sections and materials? This cannot be undone.'
    );
    if (!ok) return;

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const idStr = String(id);
    setDeletingId(idStr);
    setMessage('');
    try {
      await axios.delete(
        `${gatewayBaseUrl}/api/courses/${encodeURIComponent(idStr)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCourses((prev) => prev.filter((c) => String(c.id) !== idStr));
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setMessage(
        error.response?.data?.message || 'Could not delete this course.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: '2rem' }}>
      <nav
        className="navbar glass-panel"
        style={{
          borderRadius: '12px',
          marginBottom: '2rem',
          maxWidth: '720px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <div>
          <h1
            className="gradient-text"
            style={{ fontSize: '1.25rem', fontWeight: 700 }}
          >
            My uploaded courses
          </h1>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => navigate('/upload-lesson')}
        >
          Back
        </button>
      </nav>

      <main className="container" style={{ maxWidth: '720px', margin: '0 auto' }}>
        {isLoading && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
            Loading your courses…
          </p>
        )}
        {!isLoading && message && (
          <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
            {message}
          </p>
        )}
        {!isLoading && !message && courses.length === 0 && (
          <div
            className="glass-panel"
            style={{ padding: '2rem', textAlign: 'center' }}
          >
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
              You have not uploaded any courses yet.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/upload-new_lesson')}
            >
              Upload a course
            </button>
          </div>
        )}
        {!isLoading && courses.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            {courses.map((c) => (
              <li key={String(c.id)}>
                <div
                  className="glass-panel"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                  }}
                >
                  <div
                    style={{
                      width: '96px',
                      height: '64px',
                      flexShrink: 0,
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'var(--surface)',
                    }}
                  >
                    {c.thumbnailUrl ? (
                      <img
                        src={c.thumbnailUrl}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontWeight: 600,
                        fontSize: '1rem',
                        color: 'var(--text)',
                        marginBottom: '0.25rem',
                        lineHeight: 1.35,
                      }}
                    >
                      {c.courseName || 'Untitled course'}
                    </p>
                    <Link
                      to={`/course/${encodeURIComponent(String(c.id))}`}
                      style={{
                        fontSize: '0.82rem',
                        color: '#93c5fd',
                        textDecoration: 'none',
                      }}
                    >
                      Preview public page →
                    </Link>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        navigate(
                          `/upload-course/edit/${encodeURIComponent(String(c.id))}`
                        )
                      }
                      style={{
                        fontSize: '0.82rem',
                        padding: '0.35rem 0.65rem',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: '#93c5fd',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                      }}
                    >
                      Update
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={deletingId === String(c.id)}
                      onClick={() => handleDelete(c.id)}
                      style={{
                        fontSize: '0.82rem',
                        padding: '0.35rem 0.65rem',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        opacity: deletingId === String(c.id) ? 0.6 : 1,
                      }}
                    >
                      {deletingId === String(c.id) ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
};

export default UploadsView;
