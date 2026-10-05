import { useEffect, useMemo, useRef, useState } from 'react';

import { getGatewayBaseUrl } from '../config/gateway';
import { fetchSavedStudentLessonAnalysis } from '../lime/apiClient';
import AssistantMarkdown from './AssistantMarkdown';
import './StudentRoutineChatbot.css';

const SIGNAL_PLANS = {
  pause_frequency: {
    label: 'Frequent pauses',
    action: 'Study in a focused 20-minute block, then take a planned 5-minute break.',
  },
  navigation_count_video: {
    label: 'Video navigation',
    action: 'Preview the lesson headings first, then watch one section without jumping between parts.',
  },
  rewatch_segments: {
    label: 'Repeated video sections',
    action: 'Replay only the difficult section once, then explain it in two sentences from memory.',
  },
  playback_rate_change: {
    label: 'Playback-speed changes',
    action: 'Choose one comfortable playback speed and keep it steady for the full study block.',
  },
  idle_duration_video: {
    label: 'Inactive video time',
    action: 'Use a distraction-free 15-minute video block and write one note every five minutes.',
  },
  time_on_content: {
    label: 'Time spent on content',
    action: 'Set a clear 25-minute limit for new content, then switch to a short recall activity.',
  },
  navigation_count_adaptation: {
    label: 'Resource switching',
    action: 'Use one learning resource at a time: lesson first, notes second, practice last.',
  },
  revisit_frequency: {
    label: 'Frequent revisits',
    action: 'Schedule two quick reviews: one after the lesson and another later in the day.',
  },
  idle_duration_adaptation: {
    label: 'Inactive learning time',
    action: 'Keep a question beside you and answer it before moving to each new section.',
  },
  quiz_response_time: {
    label: 'Quiz response time',
    action: 'Complete a five-question timed practice, then retry the questions without a timer.',
  },
  error_rate: {
    label: 'Practice errors',
    action: 'Keep a three-line error log: the mistake, the correct idea, and one similar example.',
  },
};

const DEFAULT_PLAN = {
  label: 'Learning pattern',
  action: 'Use active recall: close your notes and write the three most important ideas from memory.',
};

function BotIcon() {
  return (
    <svg className="routine-bot__icon" viewBox="0 0 64 64" aria-hidden="true">
      <path className="routine-bot__icon-antenna" d="M32 12V7" />
      <circle className="routine-bot__icon-light" cx="32" cy="5" r="3" />
      <rect className="routine-bot__icon-ear" x="5" y="27" width="7" height="17" rx="3.5" />
      <rect className="routine-bot__icon-ear" x="52" y="27" width="7" height="17" rx="3.5" />
      <rect className="routine-bot__icon-head" x="10" y="14" width="44" height="39" rx="14" />
      <rect className="routine-bot__icon-face" x="16" y="21" width="32" height="24" rx="10" />
      <circle className="routine-bot__icon-eye" cx="25" cy="32" r="3" />
      <circle className="routine-bot__icon-eye" cx="39" cy="32" r="3" />
      <path className="routine-bot__icon-smile" d="M26 39c3.5 2.5 8.5 2.5 12 0" />
      <path className="routine-bot__icon-base" d="M22 53v4h20v-4" />
    </svg>
  );
}

function getStoredStudent() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.role === 'Student' ? user : null;
  } catch {
    return null;
  }
}

function normalizeSignalName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function signalPlan(signal) {
  const key = normalizeSignalName(signal?.signal);
  const configured = SIGNAL_PLANS[key] || DEFAULT_PLAN;
  return {
    ...configured,
    key,
    importance: Math.max(
      0,
      Math.min(100, Math.round(Number(signal?.normalized_value ?? signal?.normalized_strength ?? 0) * 100)),
    ),
  };
}

function buildRoutine(signals) {
  const plans = signals.slice(0, 3).map(signalPlan);
  const blocks = [
    {
      time: 'Morning · 10 min',
      title: 'Warm-up and plan',
      detail: 'Review yesterday’s key ideas and write one goal for today’s subject.',
    },
    ...plans.map((plan, index) => ({
      time: index === 0 ? 'Main session · 25 min' : index === 1 ? 'Practice · 20 min' : 'Evening review · 15 min',
      title: plan.label,
      detail: plan.action,
    })),
    {
      time: 'Finish · 5 min',
      title: 'Quick self-check',
      detail: 'Without notes, say what you learned, what is still unclear, and what you will do tomorrow.',
    },
  ];
  return { plans, blocks };
}

async function requestAiStudyReply({ token, course, signals, fallback, mode, message, history }) {
  const response = await fetch(`${getGatewayBaseUrl()}/api/next-lesson-recommendation/student-study-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      message,
      courseId: String(course.courseId || ''),
      courseName: course.courseName || 'Selected subject',
      topSignals: signals.slice(0, 3).map((signal) => ({
        signal: signal.signal,
        importance: Math.max(
          0,
          Math.min(100, Math.round(Number(signal.normalized_value ?? signal.normalized_strength ?? 0) * 100)),
        ),
      })),
      fallbackRoutine: fallback.blocks,
      history,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'The AI assistant is temporarily unavailable.');
  }
  const answer = String(payload?.data?.answer || '').trim();
  if (!answer) throw new Error('The AI assistant returned an empty response.');
  return answer;
}

export default function StudentRoutineChatbot() {
  const student = getStoredStudent();
  const token = localStorage.getItem('token');
  const panelRef = useRef(null);
  const conversationEndRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [routine, setRoutine] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [loadingRoutine, setLoadingRoutine] = useState(false);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  const firstName = useMemo(
    () => String(student?.name || 'there').trim().split(/\s+/)[0],
    [student?.name],
  );

  useEffect(() => {
    if (!open || coursesLoaded) return undefined;
    let cancelled = false;

    (async () => {
      setLoadingCourses(true);
      setError('');
      try {
        const response = await fetch(`${getGatewayBaseUrl()}/api/enrollments/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || 'Could not load your enrolled subjects.');
        if (!cancelled) setEnrollments(Array.isArray(payload?.data) ? payload.data : []);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) {
          setLoadingCourses(false);
          setCoursesLoaded(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [coursesLoaded, open, token]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) window.setTimeout(() => panelRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (open && (loadingRoutine || routine || error || chatError || chatLoading || chatMessages.length)) {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatError, chatLoading, chatMessages.length, error, loadingRoutine, open, routine]);

  if (!student || !token) return null;

  async function chooseCourse(course) {
    setSelectedCourse(course);
    setRoutine(null);
    setSignals([]);
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setUsingFallback(false);
    setLoadingRoutine(true);
    setError('');
    try {
      const analysis = await fetchSavedStudentLessonAnalysis(String(course.courseId), String(student.id));
      const topSignals = analysis?.aggregate_explanation?.top_signals;
      if (!Array.isArray(topSignals) || topSignals.length === 0) {
        throw new Error('I do not have enough learning activity for this subject yet. Complete a lesson and try again.');
      }
      const fallback = buildRoutine(topSignals);
      setSignals(topSignals.slice(0, 3));
      try {
        const answer = await requestAiStudyReply({
          token,
          course,
          signals: topSignals,
          fallback,
          mode: 'routine',
          message: '',
          history: [],
        });
        setChatMessages([{ role: 'assistant', content: answer }]);
      } catch {
        setRoutine(fallback);
        setUsingFallback(true);
        setChatError('AI is unavailable right now, so I used your dependable signal-based routine. You can still retry a question below.');
      }
    } catch (requestError) {
      setError(requestError.message || 'Could not create your routine right now.');
    } finally {
      setLoadingRoutine(false);
    }
  }

  function startAgain() {
    setSelectedCourse(null);
    setRoutine(null);
    setSignals([]);
    setChatMessages([]);
    setChatInput('');
    setChatError('');
    setUsingFallback(false);
    setError('');
  }

  async function sendChatMessage(event) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || !selectedCourse || !signals.length || chatLoading) return;

    const userMessage = { role: 'user', content: message };
    const previousHistory = chatMessages;
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatError('');
    setChatLoading(true);

    try {
      const fallback = routine || buildRoutine(signals);
      const answer = await requestAiStudyReply({
        token,
        course: selectedCourse,
        signals,
        fallback,
        mode: 'chat',
        message,
        history: previousHistory,
      });
      setChatMessages((current) => [...current, { role: 'assistant', content: answer }]);
    } catch (requestError) {
      if (!routine) {
        setRoutine(buildRoutine(signals));
        setUsingFallback(true);
      }
      setChatError(`${requestError.message} Your fallback routine is still available.`);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <div className="routine-bot">
      {open ? (
        <section
          className="routine-bot__panel"
          ref={panelRef}
          tabIndex="-1"
          role="dialog"
          aria-modal="false"
          aria-labelledby="routine-bot-title"
        >
          <header className="routine-bot__header">
            <span className="routine-bot__avatar" aria-hidden="true"><BotIcon /></span>
            <div>
              <strong id="routine-bot-title">Lumora Study Mate</strong>
              <small><span /> Online · your daily routine helper</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close study assistant">×</button>
          </header>

          <div className="routine-bot__conversation" aria-live="polite">
            <div className="routine-bot__message is-bot">
              Hi {firstName}! Choose one of your enrolled subjects. I’ll use your top three learning signals to make today’s routine.
            </div>

            {!selectedCourse ? (
              <div className="routine-bot__choices">
                {loadingCourses ? <p className="routine-bot__status">Loading your subjects…</p> : null}
                {!loadingCourses && enrollments.length === 0 && !error ? (
                  <p className="routine-bot__empty">You have no enrolled subjects yet. Enroll in a course first.</p>
                ) : null}
                {enrollments.map((course) => (
                  <button type="button" key={course._id || course.courseId} onClick={() => chooseCourse(course)}>
                    <span>{course.courseName || 'Untitled subject'}</span>
                    <small>{course.educatorName || 'Your enrolled course'}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="routine-bot__message is-student">Create my routine for {selectedCourse.courseName}.</div>
            )}

            {loadingRoutine ? (
              <div className="routine-bot__message is-bot routine-bot__typing" aria-label="Creating routine">
                <span /><span /><span />
              </div>
            ) : null}

            {signals.length && !loadingRoutine ? (
              <div className="routine-bot__evidence">
                <small>{usingFallback ? 'Signal-based fallback' : 'Gemini personalized'} using your top learning signals</small>
                <div className="routine-bot__signals" aria-label="Top learning signals">
                  {signals.map((signal, index) => {
                    const plan = signalPlan(signal);
                    return (
                      <span key={`${plan.key}-${index}`}>
                        #{index + 1} {plan.label}{plan.importance ? ` - ${plan.importance}%` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="routine-bot__message is-bot is-error">
                {error}
                {selectedCourse ? <button type="button" onClick={startAgain}>Choose another subject</button> : null}
              </div>
            ) : null}

            {routine ? (
              <div className="routine-bot__message is-bot routine-bot__routine">
                <h2>Today’s fallback routine</h2>
                <p className="routine-bot__intro">A reliable plan built directly from your strongest learning signals.</p>
                <ol>
                  {routine.blocks.map((block) => (
                    <li key={`${block.time}-${block.title}`}>
                      <time>{block.time}</time>
                      <strong>{block.title}</strong>
                      <p>{block.detail}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {chatMessages.map((chatMessage, index) => (
              <div
                className={`routine-bot__message ${chatMessage.role === 'user' ? 'is-student' : 'is-bot routine-bot__ai-answer'}`}
                key={`${chatMessage.role}-${index}-${chatMessage.content.slice(0, 20)}`}
              >
                {chatMessage.role === 'assistant' ? (
                  <AssistantMarkdown>{chatMessage.content}</AssistantMarkdown>
                ) : chatMessage.content}
              </div>
            ))}

            {chatLoading ? (
              <div className="routine-bot__message is-bot routine-bot__typing" aria-label="AI assistant is replying">
                <span /><span /><span />
              </div>
            ) : null}

            {chatError ? <div className="routine-bot__chat-error">{chatError}</div> : null}

            {selectedCourse && signals.length && !loadingRoutine ? (
              <form className="routine-bot__composer" onSubmit={sendChatMessage}>
                <label htmlFor="routine-bot-message">Ask about this subject or your routine</label>
                <div>
                  <input
                    id="routine-bot-message"
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Can you make the evening session shorter?"
                    maxLength={2000}
                    disabled={chatLoading}
                  />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()} aria-label="Send message">
                    Send
                  </button>
                </div>
                <button className="routine-bot__again" type="button" onClick={startAgain}>Plan another subject</button>
              </form>
            ) : null}
            <div ref={conversationEndRef} aria-hidden="true" />
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className={`routine-bot__launcher${open ? ' is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? 'Close daily routine assistant' : 'Open daily routine assistant'}
      >
        {open ? <span aria-hidden="true">×</span> : <><BotIcon /><small>Study Mate</small></>}
      </button>
    </div>
  );
}
