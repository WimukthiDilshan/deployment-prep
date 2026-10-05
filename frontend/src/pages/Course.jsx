import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '../config/brand';
import { CatalogWatchPie } from '../components/CourseWatchRing';
import StudentRoutineChatbot from '../components/StudentRoutineChatbot';
import {
  getWatchUserId,
  loadLocalProgress,
  summarizeStoredWatch,
  formatWatchClock,
} from '../utils/videoWatchProgress';
import {
  loadFavoriteCourseIds,
  toggleFavoriteCourseId,
} from '../utils/courseFavorites';
import './Course.css';

const FEATURED_COUNT = 9;

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

function pickRandomCourses(list, count = FEATURED_COUNT) {
  const copy = [...(Array.isArray(list) ? list : [])];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function lectureClock(totalSeconds) {
  const minutes = Math.max(0, Math.round((Number(totalSeconds) || 0) / 60));
  if (minutes <= 0) return '';
  return `${minutes}m`;
}

function continueLectureCopy(progress) {
  const percent = Number(progress?.percent) || 0;
  if (progress?.lectureTitle) return progress.lectureTitle;
  if (percent >= 95) return 'Ready to finish strong';
  if (percent > 0) return 'Continue where you left off';
  return 'Start this lecture';
}

function matchesSearch(course, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const name = String(course?.courseName || '').toLowerCase();
  const educator = String(course?.educatorName || '').toLowerCase();
  return name.includes(q) || educator.includes(q);
}

function courseAllowsEnrollment(course) {
  const preparing = Number(course?.preparingLessonCount || 0);
  if (preparing > 0) return false;
  if (typeof course?.enrollmentOpen === 'boolean') {
    return course.enrollmentOpen;
  }
  if (course?.readyLessonCount != null && course?.readyLessonCount !== '') {
    return Number(course.readyLessonCount) > 0;
  }
  return true;
}

function CourseThumb({ url, name, play = false, square = false }) {
  return (
    <div className={`course-thumb${square ? ' is-square' : ''}`}>
      {url ? (
        <>
          <img className="course-thumb__blur" src={url} alt="" aria-hidden="true" />
          <img
            className="course-thumb__photo"
            src={url}
            alt={name || 'Course thumbnail'}
          />
        </>
      ) : (
        <div className="course-thumb__empty" aria-hidden="true" />
      )}
      {play ? (
        <span className="course-thumb__play" aria-hidden="true">
          ▶
        </span>
      ) : null}
    </div>
  );
}

function CourseProgressBar({ percent }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="course-progress">
      <div className="course-progress__track" aria-hidden="true">
        <span style={{ width: `${p}%` }} />
      </div>
      <p className="course-progress__label">{Math.round(p)}% complete</p>
    </div>
  );
}

const Course = () => {
  const user = getStoredUser();

  const [courses, setCourses] = useState([]);
  const [featuredCourses, setFeaturedCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState(() => loadFavoriteCourseIds());
  const [enrollingId, setEnrollingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [myCoursesOpen, setMyCoursesOpen] = useState(false);
  const [watchByCourse, setWatchByCourse] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogView, setCatalogView] = useState('discover');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError('');
      setLoading(true);
      const token = localStorage.getItem('token');
      const authHeaders = token
        ? { Authorization: `Bearer ${token}` }
        : undefined;

      try {
        const coursesRes = await axios.get(
          `${getGatewayBaseUrl()}/api/public/courses`
        );

        if (cancelled) return;

        const list = Array.isArray(coursesRes.data?.data)
          ? coursesRes.data.data
          : [];
        setCourses(list);
        setFeaturedCourses(pickRandomCourses(list, FEATURED_COUNT));

        if (authHeaders) {
          try {
            const enrollmentsRes = await axios.get(
              `${getGatewayBaseUrl()}/api/enrollments/me`,
              { headers: authHeaders }
            );
            if (!cancelled) {
              const rows = Array.isArray(enrollmentsRes.data?.data)
                ? enrollmentsRes.data.data
                : [];
              setEnrollments(rows);
              const ids = Array.isArray(enrollmentsRes.data?.courseIds)
                ? enrollmentsRes.data.courseIds
                : rows.map((row) => String(row.courseId));
              setEnrolledIds(new Set(ids.map(String)));
            }
          } catch {
            // Keep browsing courses even if enrollment status cannot load.
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e.response?.data?.message ||
              e.message ||
              'Could not load courses.'
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

  useEffect(() => {
    const userId = getWatchUserId();
    const token = localStorage.getItem('token');
    const ids = new Set(
      [...enrolledIds].concat(
        courses
          .map((course) => String(course.id))
          .filter((id) => {
            const lessons = loadLocalProgress(id, userId);
            return Object.values(lessons).some(
              (lesson) => (lesson?.intervals || []).length > 0
            );
          })
      )
    );
    if (ids.size === 0) {
      setWatchByCourse({});
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        [...ids].map(async (id) => {
          const local = summarizeStoredWatch(id, userId);
          try {
            const res = await axios.get(
              `${getGatewayBaseUrl()}/api/public/courses/${encodeURIComponent(
                id
              )}/watch-progress`,
              { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
            );
            const data = res.data?.data || {};
            return [
              id,
              {
                percent: Number(data.percent) || local.percent || 0,
                watchedSec: Number(data.watchedSec) || local.watchedSec || 0,
                totalSec: Number(data.totalSec) || local.totalSec || 0,
                videoCount: Math.max(
                  Number(data.videoCount) || 0,
                  local.videoCount || 0,
                  1
                ),
                lectureTitle: data.lectureTitle || '',
                lectureDurationSec:
                  Number(data.lectureDurationSec) || 0,
              },
            ];
          } catch {
            return [
              id,
              {
                ...local,
                videoCount: Math.max(local.videoCount || 0, 1),
              },
            ];
          }
        })
      );
      if (!cancelled) setWatchByCourse(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [courses, enrolledIds]);

  useEffect(() => {
    if (!myCoursesOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMyCoursesOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [myCoursesOpen]);

  const visibleCourses = useMemo(() => {
    const query = searchQuery.trim();
    if (query) {
      return courses.filter((course) => matchesSearch(course, query));
    }
    if (catalogView === 'enrolled') {
      return courses
        .filter((course) => enrolledIds.has(String(course.id)))
        .sort((left, right) => {
          const leftProgress = watchByCourse[String(left.id)] || {};
          const rightProgress = watchByCourse[String(right.id)] || {};
          const byPercent =
            (Number(rightProgress.percent) || 0) -
            (Number(leftProgress.percent) || 0);
          if (byPercent) return byPercent;
          return (
            (Number(rightProgress.watchedSec) || 0) -
            (Number(leftProgress.watchedSec) || 0)
          );
        });
    }
    if (catalogView === 'favorites') {
      return courses.filter((course) => favoriteIds.has(String(course.id)));
    }
    return featuredCourses;
  }, [courses, featuredCourses, searchQuery, catalogView, enrolledIds, favoriteIds, watchByCourse]);

  const continueLearning = useMemo(() => {
    const enrolledCourses = courses.filter((course) =>
      enrolledIds.has(String(course.id))
    );
    return enrolledCourses
      .map((course) => {
        const progress = watchByCourse[String(course.id)] || {
          percent: 0,
          watchedSec: 0,
          totalSec: 0,
          videoCount: 0,
        };
        return { course, progress };
      })
      .sort((left, right) => {
        const byPercent =
          (Number(right.progress.percent) || 0) - (Number(left.progress.percent) || 0);
        if (byPercent) return byPercent;
        return (
          (Number(right.progress.watchedSec) || 0) -
          (Number(left.progress.watchedSec) || 0)
        );
      })
      .slice(0, 3);
  }, [courses, enrolledIds, watchByCourse]);

  const recommendedCourses = useMemo(() => {
    const query = searchQuery.trim();
    if (query) return [];
    const unused = (list) =>
      list.filter((course) => !enrolledIds.has(String(course.id)));
    let next = unused(featuredCourses);
    if (next.length < FEATURED_COUNT) {
      const seen = new Set(next.map((course) => String(course.id)));
      unused(courses).forEach((course) => {
        if (seen.has(String(course.id))) return;
        next.push(course);
        seen.add(String(course.id));
      });
    }
    return next.slice(0, FEATURED_COUNT);
  }, [featuredCourses, courses, enrolledIds, searchQuery]);

  const handleEnroll = async (event, course) => {
    event.preventDefault();
    event.stopPropagation();

    const courseId = String(course.id);
    if (enrolledIds.has(courseId) || enrollingId === courseId) return;
    if (!courseAllowsEnrollment(course)) {
      setActionMessage(
        Number(course.preparingLessonCount || 0) > 0
          ? 'This course is still processing uploaded subsections. You can enroll when the queue is complete.'
          : 'This course has no lessons ready for enrollment yet.'
      );
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setActionMessage('Please log in as a student to enroll.');
      return;
    }

    setEnrollingId(courseId);
    setActionMessage('');

    try {
      const res = await axios.post(
        `${getGatewayBaseUrl()}/api/enrollments`,
        {
          courseId,
          courseName: course.courseName || '',
          educatorName: course.educatorName || '',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const enrollment = res.data?.enrollment;
      setEnrolledIds((prev) => {
        const next = new Set(prev);
        next.add(courseId);
        return next;
      });
      setEnrollments((prev) => {
        if (prev.some((row) => String(row.courseId) === courseId)) return prev;
        return [
          enrollment || {
            courseId,
            courseName: course.courseName || '',
            educatorName: course.educatorName || '',
          },
          ...prev,
        ];
      });
      setActionMessage(`Enrolled in ${course.courseName || 'course'}.`);
    } catch (e) {
      setActionMessage(
        e.response?.data?.message ||
          e.message ||
          'Enrollment failed. Please try again.'
      );
    } finally {
      setEnrollingId('');
    }
  };

  const handleFavorite = (event, course) => {
    event.preventDefault();
    event.stopPropagation();
    const courseId = String(course.id);
    if (!enrolledIds.has(courseId)) {
      setActionMessage('Enroll in a course first, then you can add it to Favorites.');
      return;
    }
    setFavoriteIds((prev) => toggleFavoriteCourseId(courseId, prev));
  };

  const showDiscover = () => {
    setCatalogView('discover');
    setSearchQuery('');
    setMyCoursesOpen(false);
  };

  const intro = searchQuery.trim()
    ? {
        title: 'Search results',
        copy: `Courses and educators matching “${searchQuery.trim()}”.`,
      }
    : catalogView === 'enrolled'
      ? {
          title: 'My learning',
          copy: 'Your enrolled courses, with the most completed at the top.',
        }
      : catalogView === 'favorites'
        ? {
            title: 'Favorites',
            copy: 'Enrolled courses you marked with a heart.',
          }
        : {
            title: 'Picked for you',
            copy: 'Nine courses to start with. Search an educator or course name to see more.',
          };

  const initials = (user?.name || user?.email || 'S')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'S';
  const firstName = (user?.name || 'there').trim().split(/\s+/)[0];
  const showHome = !searchQuery.trim() && catalogView === 'discover';

  const renderCourseCard = (c, { showEnroll = true } = {}) => {
    const courseId = String(c.id);
    const isEnrolled = enrolledIds.has(courseId);
    const isFavorite = favoriteIds.has(courseId);
    const isEnrolling = enrollingId === courseId;
    const lessonsPreparing = Number(c.preparingLessonCount || 0) > 0;
    const canEnroll = courseAllowsEnrollment(c);
    const enrollHint = lessonsPreparing
      ? 'Enrollment opens when every subsection has finished processing.'
      : 'This course has no published lessons yet.';
    const progress = watchByCourse[courseId];
    const percent = Number(progress?.percent) || 0;

    return (
      <article key={courseId} className="course-card">
        <button
          type="button"
          className={`course-card__heart${isFavorite ? ' is-on' : ''}`}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          title={
            isEnrolled
              ? isFavorite
                ? 'Remove from favorites'
                : 'Add to favorites'
              : 'Enroll first to favorite this course'
          }
          disabled={!isEnrolled}
          onClick={(event) => handleFavorite(event, c)}
        >
          {isFavorite ? '♥' : '♡'}
        </button>
        <Link
          to={`/course/${encodeURIComponent(courseId)}`}
          className="course-card__link"
        >
          <CourseThumb
            url={c.thumbnailUrl}
            name={c.courseName}
            play
          />
          <div className="course-card__body">
            <h2 className="course-card__name">
              {c.courseName || 'Untitled course'}
            </h2>
            <p className="course-card__meta">
              {c.educatorName ? c.educatorName : 'Educator: —'}
            </p>
            {lessonsPreparing ? (
              <p className="course-card__warn">
                Lessons are still in the processing queue. Enrollment opens when every subsection is ready.
              </p>
            ) : null}
            {isEnrolled ? (
              <div className="course-card__progress-row">
                <CatalogWatchPie percent={percent} size={42} />
                <CourseProgressBar percent={percent} />
              </div>
            ) : null}
          </div>
        </Link>
        {showEnroll ? (
          <div className="course-card__cta">
            <button
              type="button"
              className="btn btn-primary"
              disabled={isEnrolled || isEnrolling || !canEnroll}
              title={
                isEnrolled
                  ? 'You are already enrolled'
                  : !canEnroll
                    ? enrollHint
                    : 'Enroll in this course'
              }
              onClick={(event) => handleEnroll(event, c)}
              style={{
                opacity: isEnrolled || !canEnroll ? 0.85 : 1,
                cursor: isEnrolled || !canEnroll ? 'default' : 'pointer',
              }}
            >
              {isEnrolled
                ? 'Enrolled'
                : isEnrolling
                  ? 'Enrolling…'
                  : lessonsPreparing
                    ? 'Preparing lessons'
                    : canEnroll
                      ? 'Enroll now'
                      : 'Not ready yet'}
            </button>
            {!isEnrolled && !canEnroll ? (
              <p className="course-card__cta-hint">{enrollHint}</p>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="course-catalog">
      <header className="lumora-header">
        <Link to="/course" className="lumora-header__brand" onClick={showDiscover}>
          <span className="lumora-header__mark" aria-hidden="true">
            L
          </span>
          <span>
            <span className="lumora-header__name">{PLATFORM_NAME}</span>
            <span className="lumora-header__tag">{PLATFORM_TAGLINE}</span>
          </span>
        </Link>

        <form
          className="lumora-header__search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search educator or course name"
            aria-label="Search educator or course name"
          />
          <button type="submit" aria-label="Search">
            ⌕
          </button>
        </form>

        <nav className="lumora-header__nav" aria-label="Student navigation">
          <button
            type="button"
            className={`lumora-header__link${catalogView === 'discover' && !searchQuery.trim() ? ' is-active' : ''}`}
            onClick={showDiscover}
          >
            Courses
          </button>
          <button
            type="button"
            className={`lumora-header__link${catalogView === 'enrolled' && !searchQuery.trim() ? ' is-active' : ''}`}
            onClick={() => {
              setCatalogView('enrolled');
              setSearchQuery('');
              setMyCoursesOpen(false);
            }}
          >
            My learning
          </button>
          <button
            type="button"
            className={`lumora-header__link${catalogView === 'favorites' && !searchQuery.trim() ? ' is-active' : ''}`}
            onClick={() => {
              setCatalogView('favorites');
              setSearchQuery('');
            }}
          >
            Favorites
          </button>
          <Link to="/get-exam" className="lumora-header__link">
            Get exam
          </Link>
          <Link to="/student/previous-lesson-summary" className="lumora-header__link">
            Summaries
          </Link>
          <Link
            to="/student/profile"
            className="lumora-header__avatar"
            aria-label="Open my profile"
            title={user?.name || 'My profile'}
          >
            {initials}
          </Link>
        </nav>
      </header>

      <main className="course-catalog__body">
        {actionMessage ? (
          <p className="course-catalog__flash">{actionMessage}</p>
        ) : null}

        {loading ? (
          <p className="course-catalog__status">Loading courses…</p>
        ) : null}
        {!loading && error ? (
          <p className="course-catalog__status is-error">{error}</p>
        ) : null}

        {!loading && !error && showHome ? (
          <>
            <section className="home-hero">
              <div className="home-welcome">
              <Link
                to="/student/profile"
                className="home-welcome__avatar"
                aria-label="Open my profile"
              >
                {initials}
              </Link>
              <div className="home-welcome__copy">
                <p className="home-hero__eyebrow">Student catalog</p>
                <h1>Welcome back, {firstName}</h1>
                <Link to="/student/profile" className="home-welcome__link">
                  Add occupation and interests
                </Link>
              </div>
              <div className="home-hero__stats" aria-label="Your learning snapshot">
                <div>
                  <strong>{enrolledIds.size}</strong>
                  <span>Enrolled</span>
                </div>
                <div>
                  <strong>{favoriteIds.size}</strong>
                  <span>Favorites</span>
                </div>
                <div>
                  <strong>{continueLearning.length}</strong>
                  <span>In progress</span>
                </div>
              </div>
              </div>
            </section>

            {continueLearning.length > 0 ? (
              <section className="home-section">
                <div className="home-section__head">
                  <h2>Let’s start learning</h2>
                  <button
                    type="button"
                    className="home-section__link"
                    onClick={() => {
                      setCatalogView('enrolled');
                      setSearchQuery('');
                    }}
                  >
                    My learning
                  </button>
                </div>
                <div className="continue-grid">
                  {continueLearning.map(({ course, progress }) => {
                    const percent = Number(progress?.percent) || 0;
                    const lectureMins = lectureClock(
                      progress?.lectureDurationSec || progress?.totalSec || 0
                    );
                    const watchedLabel =
                      Number(progress?.watchedSec) > 0
                        ? `${formatWatchClock(progress.watchedSec)} watched`
                        : '';
                    return (
                      <Link
                        key={course.id}
                        className="continue-card"
                        to={`/course/${encodeURIComponent(course.id)}`}
                      >
                        <CourseThumb
                          url={course.thumbnailUrl}
                          name={course.courseName}
                          play
                          square
                        />
                        <div className="continue-card__copy">
                          <p className="continue-card__course">
                            {course.courseName || 'Untitled course'}
                          </p>
                          <p className="continue-card__lecture">
                            {continueLectureCopy(progress)}
                          </p>
                          <p className="continue-card__meta">
                            Lecture
                            {lectureMins ? ` • ${lectureMins}` : ''}
                            {watchedLabel ? ` • ${watchedLabel}` : ''}
                          </p>
                          <CourseProgressBar percent={percent} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="home-section">
                <div className="home-section__head">
                  <h2>Let’s start learning</h2>
                </div>
                <p className="course-catalog__empty">
                  Enroll in a course and your most active lessons will appear here.
                </p>
              </section>
            )}

            <section className="home-section">
              <div className="home-section__head">
                <div>
                  <h2>What to learn next</h2>
                  <p>Recommended for you</p>
                </div>
              </div>
              {recommendedCourses.length > 0 ? (
                <div className="course-catalog__grid">
                  {recommendedCourses.map((course) =>
                    renderCourseCard(course, { showEnroll: true })
                  )}
                </div>
              ) : (
                <p className="course-catalog__empty">
                  No more suggestions right now. Search an educator to find a course.
                </p>
              )}
            </section>
          </>
        ) : null}

        {!loading && !error && !showHome ? (
          <>
            <div className="course-catalog__intro">
              <div>
                <h1>{intro.title}</h1>
                <p>{intro.copy}</p>
              </div>
            </div>
            {visibleCourses.length === 0 ? (
              <p className="course-catalog__empty">
                {searchQuery.trim()
                  ? 'No educator or course matched that search.'
                  : catalogView === 'favorites'
                    ? 'No favorites yet. Enroll, then tap the heart on a course.'
                    : catalogView === 'enrolled'
                      ? 'You have not enrolled in any courses yet.'
                      : 'No courses yet.'}
              </p>
            ) : (
              <div className="course-catalog__grid">
                {visibleCourses.map((course) =>
                  renderCourseCard(course, {
                    showEnroll: catalogView !== 'enrolled',
                  })
                )}
              </div>
            )}
          </>
        ) : null}
      </main>

      {myCoursesOpen && (
        <div
          role="presentation"
          onClick={() => setMyCoursesOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="my-courses-title"
            className="glass-panel"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              maxHeight: 'min(80vh, 640px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '16px',
              padding: '1.25rem 1.35rem',
              boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <h2
                id="my-courses-title"
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                My learning ({enrollments.length})
              </h2>
              <button
                type="button"
                aria-label="Close my courses"
                onClick={() => setMyCoursesOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '1.4rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0.15rem 0.35rem',
                }}
              >
                ×
              </button>
            </div>

            {enrollments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                You have not enrolled in any courses yet.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'grid',
                  gap: '0.65rem',
                  overflowY: 'auto',
                }}
              >
                {enrollments.map((enrollment) => {
                  const courseId = String(enrollment.courseId);
                  const isFavorite = favoriteIds.has(courseId);
                  return (
                    <li key={courseId}>
                      <Link
                        to={`/course/${encodeURIComponent(courseId)}`}
                        onClick={() => setMyCoursesOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          textDecoration: 'none',
                          color: 'inherit',
                          padding: '0.9rem 1rem',
                          borderRadius: '12px',
                          background: 'rgba(248, 250, 252, 0.9)',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        {watchByCourse[courseId] ? (
                          <CatalogWatchPie
                            percent={watchByCourse[courseId].percent || 0}
                          />
                        ) : null}
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              display: 'block',
                              fontWeight: 650,
                              color: 'var(--text)',
                              marginBottom: '0.2rem',
                            }}
                          >
                            {enrollment.courseName || 'Untitled course'}
                            {isFavorite ? ' ♥' : ''}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.85rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {enrollment.educatorName
                              ? `Educator: ${enrollment.educatorName}`
                              : 'Educator: —'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      <StudentRoutineChatbot />
    </div>
  );
};

export default Course;
