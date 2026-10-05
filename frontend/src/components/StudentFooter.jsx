import { Link } from 'react-router-dom';
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '../config/brand';
import './StudentFooter.css';

const exploreLinks = [
  { to: '/course', label: 'Courses' },
  { to: '/get-exam', label: 'Get exam' },
  { to: '/student/previous-lesson-summary', label: 'Summaries' },
  { to: '/student/profile', label: 'Profile' },
];

const accountLinks = [
  { to: '/student/login', label: 'Student login' },
  { to: '/student/register', label: 'Create account' },
];

export default function StudentFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="student-footer">
      <div className="student-footer__inner">
        <div className="student-footer__brand">
          <Link to="/course" className="student-footer__logo">
            <span className="student-footer__mark" aria-hidden="true">
              L
            </span>
            <span>
              <strong>{PLATFORM_NAME}</strong>
              <small>{PLATFORM_TAGLINE}</small>
            </span>
          </Link>
          <p>
            A student learning space for courses, personalized lessons, exams,
            and progress that follows you.
          </p>
        </div>

        <nav className="student-footer__nav" aria-label="Student footer">
          <div>
            <h2>Explore</h2>
            <ul>
              {exploreLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Account</h2>
            <ul>
              {accountLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="student-footer__legal">
        <p>
          © {year} {PLATFORM_NAME}. All rights reserved.
        </p>
        <p>Built for students · Learn at your own pace</p>
      </div>
    </footer>
  );
}
