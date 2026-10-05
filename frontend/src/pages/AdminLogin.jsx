import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';

const AdminLogin = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const gatewayBaseUrl = getGatewayBaseUrl();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${gatewayBaseUrl}/api/auth/admin/login`, formData);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box glass-panel">
        <h2 className="auth-title gradient-text">Admin Portal</h2>
        <p className="auth-subtitle">Sign in to review teacher registrations.</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="admin-email">Email</label>
            <input
              className="form-input"
              type="email"
              id="admin-email"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.target.value })}
              placeholder="admin@gmail.com"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="admin-password">Password</label>
            <input
              className="form-input"
              type="password"
              id="admin-password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.target.value })}
              placeholder="Password"
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in...' : 'Admin Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            Back to teacher login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
