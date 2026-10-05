import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import './AdminDashboard.css';

const statusLabel = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const AdminDashboard = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const navigate = useNavigate();
  const gatewayBaseUrl = getGatewayBaseUrl();

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${gatewayBaseUrl}/api/auth/admin/teachers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeachers(response.data.teachers || []);
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) {
        logout();
        return;
      }
      setError(err.response?.data?.message || 'Could not load teacher registrations.');
    } finally {
      setLoading(false);
    }
  }, [gatewayBaseUrl, logout]);

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  const pendingCount = useMemo(
    () => teachers.filter((teacher) => teacher.approvalStatus === 'pending').length,
    [teachers]
  );

  const updateApproval = async (teacherId, status) => {
    setUpdatingId(teacherId);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(
        `${gatewayBaseUrl}/api/auth/admin/teachers/${teacherId}/approval`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTeachers((current) => current.map((teacher) => (
        teacher._id === teacherId ? response.data.teacher : teacher
      )));
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) {
        logout();
        return;
      }
      setError(err.response?.data?.message || 'Could not update teacher approval.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Administrator workspace</p>
          <h1>Teacher approvals</h1>
          <p>{pendingCount} registration{pendingCount === 1 ? '' : 's'} waiting for review</p>
        </div>
        <button className="btn admin-logout" type="button" onClick={logout}>Sign out</button>
      </header>

      {error && <div className="error-message admin-alert">{error}</div>}

      <section className="admin-panel">
        {loading ? (
          <p className="admin-empty">Loading registrations...</p>
        ) : teachers.length === 0 ? (
          <p className="admin-empty">No teacher registrations found.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher._id}>
                    <td>
                      <strong>{teacher.name}</strong>
                      <span>{teacher.email}</span>
                    </td>
                    <td>{new Date(teacher.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`admin-status admin-status--${teacher.approvalStatus}`}>
                        {statusLabel[teacher.approvalStatus] || teacher.approvalStatus}
                      </span>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          className="btn admin-accept"
                          type="button"
                          disabled={updatingId === teacher._id || teacher.approvalStatus === 'approved'}
                          onClick={() => updateApproval(teacher._id, 'approved')}
                        >
                          Accept
                        </button>
                        <button
                          className="btn admin-reject"
                          type="button"
                          disabled={updatingId === teacher._id || teacher.approvalStatus === 'rejected'}
                          onClick={() => updateApproval(teacher._id, 'rejected')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
};

export default AdminDashboard;
