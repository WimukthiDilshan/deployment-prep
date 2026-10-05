import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import {
  getStudentHomePath,
  hasCompletedLearnerProfile,
  mergeStudentSessionUser,
} from '../utils/studentHome';

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export default function StudentHomeRedirect() {
  const [to, setTo] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = getStoredUser();

    if (!token || !user) {
      setTo('/student/login');
      return undefined;
    }

    if (user.role === 'Teacher') {
      setTo('/dashboard');
      return undefined;
    }

    if (user.role === 'Admin') {
      setTo('/admin');
      return undefined;
    }

    if (user.role !== 'Student') {
      setTo('/student/login');
      return undefined;
    }

    if (hasCompletedLearnerProfile(user)) {
      setTo('/course');
      return undefined;
    }

    let cancelled = false;
    const studentId = String(user.id || user._id || '').trim();
    if (!studentId) {
      setTo('/learner-profile');
      return undefined;
    }

    axios
      .get(`${getGatewayBaseUrl()}/api/auth/student/${encodeURIComponent(studentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        if (cancelled) return;
        const merged = mergeStudentSessionUser(user, response.data?.student);
        localStorage.setItem('user', JSON.stringify(merged));
        setTo(getStudentHomePath(merged));
      })
      .catch(() => {
        if (!cancelled) setTo('/learner-profile');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!to) return null;
  return <Navigate to={to} replace />;
}
