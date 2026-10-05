import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../../config/gateway';
import { getStudentHomePath } from '../../utils/studentHome';

const StudentLogin = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const gatewayBaseUrl = getGatewayBaseUrl();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(
        `${gatewayBaseUrl}/api/auth/student/login`,
        formData
      );

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));

      navigate(getStudentHomePath(response.data.user));
    } catch (err) {
      setError(
        err.response?.data?.message || 'Login failed. Please check credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box glass-panel">
        <h2 className="auth-title gradient-text">Welcome Back</h2>
        <p className="auth-subtitle">Login to access your student dashboard.</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              className="form-input"
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="student@school.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              className="form-input"
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <Link
            to="/student/register"
            style={{ color: 'var(--primary)', textDecoration: 'none' }}
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default StudentLogin;