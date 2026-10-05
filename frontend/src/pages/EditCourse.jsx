import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { getGatewayBaseUrl } from '../config/gateway';
import { assertClientVideoDuration } from '../utils/videoDuration';
import ContainsMathCheckbox from '../components/ContainsMathCheckbox';
import LessonQueueProgress from '../components/LessonQueueProgress';
import { isLessonPreparing } from '../utils/lessonStatus';
import {
  enableTeacherPushNotifications,
  trackProcessingSubsection,
} from '../utils/pushNotifications';

function getLoggedInEducatorName() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const u = JSON.parse(raw);
    return String(u?.name ?? '').trim();
  } catch {
    return '';
  }
}

function SubsectionMaterialsUpdater({
  subsection,
  sectionId,
  gatewayBaseUrl,
  getToken,
  navigate,
  onUpdated,
}) {
  const [expanded, setExpanded] = useState(false);
  const [subVideo, setSubVideo] = useState(null);
  const [subPpt, setSubPpt] = useState(null);
  const [subPdf, setSubPdf] = useState(null);
  const [subImages, setSubImages] = useState([]);
  const [containsMath, setContainsMath] = useState(Boolean(subsection.containsMath));
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [localMsg, setLocalMsg] = useState('');

  const clearFiles = () => {
    setSubVideo(null);
    setSubPpt(null);
    setSubPdf(null);
    setSubImages([]);
    setFileKey((k) => k + 1);
  };

  useEffect(() => {
    setContainsMath(Boolean(subsection.containsMath));
  }, [subsection.containsMath]);

  const wasExpandedRef = useRef(false);
  useEffect(() => {
    if (wasExpandedRef.current && !expanded) {
      setSubVideo(null);
      setSubPpt(null);
      setSubPdf(null);
      setSubImages([]);
      setFileKey((k) => k + 1);
      setLocalMsg('');
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  const materialSummary = useMemo(() => {
    const parts = [];
    if (subsection.videoUrl) parts.push('Video');
    if (subsection.pptUrl) parts.push('PPT');
    if (subsection.pdfUrl) parts.push('PDF');
    if (subsection.containsMath) parts.push('Equations preserved');
    if (isLessonPreparing(subsection.knowledgeStatus)) {
      parts.push(
        subsection.knowledgeStatus === 'queued'
          ? 'Waiting in processing queue'
          : 'Processing in background'
      );
    }
    if (subsection.knowledgeStatus === 'failed') parts.push('Processing failed');
    const imgCount = Array.isArray(subsection.images) ? subsection.images.length : 0;
    if (imgCount > 0) parts.push(`${imgCount} image${imgCount === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'No materials yet';
  }, [
    subsection.videoUrl,
    subsection.pptUrl,
    subsection.pdfUrl,
    subsection.containsMath,
    subsection.knowledgeStatus,
    subsection.images,
  ]);

  const handlePatch = async () => {
    setLocalMsg('');
    const hasFile =
      subVideo ||
      subPpt ||
      subPdf ||
      (Array.isArray(subImages) && subImages.length > 0);
    const mathChanged = Boolean(containsMath) !== Boolean(subsection.containsMath);
    if (!hasFile && !mathChanged) {
      setLocalMsg(
        'Select at least one new file, or change the equations option, to update this subsection.'
      );
      return;
    }

    if (subVideo) {
      try {
        await assertClientVideoDuration(subVideo);
      } catch (durationErr) {
        setLocalMsg(durationErr.message);
        return;
      }
    }

    const token = getToken();
    if (!token) return;

    const formData = new FormData();
    if (subVideo) formData.append('video', subVideo);
    if (subPpt) formData.append('ppt', subPpt);
    if (subPdf) formData.append('pdf', subPdf);
    if (Array.isArray(subImages)) {
      subImages.forEach((file) => formData.append('images', file));
    }
    formData.append('containsMath', containsMath ? 'true' : 'false');
    const educatorLabel = getLoggedInEducatorName();
    if (educatorLabel) formData.append('educatorName', educatorLabel);

    try {
      setSaving(true);
      await enableTeacherPushNotifications();
      const patchRes = await axios.patch(
        `${gatewayBaseUrl}/api/sections/${encodeURIComponent(String(sectionId))}/subsections/${encodeURIComponent(String(subsection.id))}`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      clearFiles();
      if (subVideo || subPpt || subPdf || mathChanged) {
        trackProcessingSubsection({
          id: subsection.id,
          sectionId,
          label: `Subsection ${orderLabel || ''}`.trim(),
        });
        setLocalMsg(
          'Files saved and queued. This subsection will process after earlier items, one at a time. You will get a Chrome notification when it is ready.'
        );
      } else {
        setLocalMsg('Subsection updated.');
      }
      onUpdated();
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setLocalMsg(
        error.response?.data?.message ||
          error.message ||
          'Failed to update subsection.'
      );
    } finally {
      setSaving(false);
    }
  };

  const orderLabel =
    typeof subsection.order === 'number' ? subsection.order + 1 : '';

  return (
    <div
      style={{
        marginTop: '0.65rem',
        padding: '0.75rem',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(15, 23, 42, 0.35)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            marginTop: '0.15rem',
            fontSize: '0.65rem',
            opacity: 0.75,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          ▼
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block' }}>
            Subsection {orderLabel}
          </span>
          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              display: 'block',
              marginTop: '0.2rem',
            }}
          >
            {materialSummary}
            {!expanded ? ' · Click to update files' : ''}
          </span>
        </span>
      </button>
      {expanded ? (
        <>
          <p
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              marginTop: '0.55rem',
              marginBottom: '0.5rem',
            }}
          >
            Replace any file type below (only selected files are updated). New images
            replace all previous images for this subsection. Videos must be 15 minutes
            or less.
          </p>
          <div
            key={fileKey}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
          >
            <label className="form-label" style={{ fontSize: '0.75rem' }}>
              Video (15 minutes or less)
            </label>
            <input
              type="file"
              accept="video/*"
              className="form-input"
              style={{ padding: '0.35rem', fontSize: '0.8rem' }}
              onChange={async (e) => {
                const file = e.target.files?.[0] || null;
                if (!file) {
                  setSubVideo(null);
                  return;
                }
                try {
                  await assertClientVideoDuration(file);
                  setSubVideo(file);
                  setLocalMsg('');
                } catch (durationErr) {
                  setSubVideo(null);
                  e.target.value = '';
                  setLocalMsg(durationErr.message);
                }
              }}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
              Note: we only accept subsection videos of 15 minutes or less (max 100MB).
            </p>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>
              PPT / PPTX
            </label>
            <input
              type="file"
              accept=".ppt,.pptx"
              className="form-input"
              style={{ padding: '0.35rem', fontSize: '0.8rem' }}
              onChange={(e) => setSubPpt(e.target.files?.[0] || null)}
            />
            <label className="form-label" style={{ fontSize: '0.75rem' }}>
              PDF
            </label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="form-input"
              style={{ padding: '0.35rem', fontSize: '0.8rem' }}
              onChange={(e) => setSubPdf(e.target.files?.[0] || null)}
            />
            <label className="form-label" style={{ fontSize: '0.75rem' }}>
              Images (replaces set)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="form-input"
              style={{ padding: '0.35rem', fontSize: '0.8rem' }}
              onChange={(e) =>
                setSubImages(e.target.files ? Array.from(e.target.files) : [])
              }
            />
            <ContainsMathCheckbox
              id={`sub-contains-math-${subsection.id}`}
              checked={containsMath}
              onChange={setContainsMath}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={handlePatch}
            style={{
              marginTop: '0.65rem',
              width: '100%',
              fontSize: '0.85rem',
              padding: '0.45rem',
            }}
          >
            {saving ? 'Updating…' : 'Update subsection files'}
          </button>
          {localMsg ? (
            <p
              style={{
                marginTop: '0.45rem',
                fontSize: '0.78rem',
                color: localMsg.includes('updated')
                  ? 'var(--success, #10b981)'
                  : 'var(--danger)',
              }}
            >
              {localMsg}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function NewSubsectionForm({
  sectionId,
  gatewayBaseUrl,
  getToken,
  navigate,
  onAdded,
}) {
  const [expanded, setExpanded] = useState(false);
  const [subVideo, setSubVideo] = useState(null);
  const [subPpt, setSubPpt] = useState(null);
  const [subPdf, setSubPdf] = useState(null);
  const [subImages, setSubImages] = useState([]);
  const [containsMath, setContainsMath] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [localMsg, setLocalMsg] = useState('');

  const wasExpandedRef = useRef(false);
  useEffect(() => {
    if (wasExpandedRef.current && !expanded) {
      setSubVideo(null);
      setSubPpt(null);
      setSubPdf(null);
      setSubImages([]);
      setContainsMath(false);
      setFileKey((k) => k + 1);
      setLocalMsg('');
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  const clearFiles = () => {
    setSubVideo(null);
    setSubPpt(null);
    setSubPdf(null);
    setSubImages([]);
    setContainsMath(false);
    setFileKey((k) => k + 1);
  };

  const submit = async () => {
    setLocalMsg('');
    const hasFile =
      subVideo ||
      subPpt ||
      subPdf ||
      (Array.isArray(subImages) && subImages.length > 0);
    if (!hasFile) {
      setLocalMsg('Add at least one file for the new subsection.');
      return;
    }
    if (subVideo) {
      try {
        await assertClientVideoDuration(subVideo);
      } catch (durationErr) {
        setLocalMsg(durationErr.message);
        return;
      }
    }
    const token = getToken();
    if (!token) return;

    const formData = new FormData();
    if (subVideo) formData.append('video', subVideo);
    if (subPpt) formData.append('ppt', subPpt);
    if (subPdf) formData.append('pdf', subPdf);
    if (Array.isArray(subImages)) {
      subImages.forEach((file) => formData.append('images', file));
    }
    formData.append('containsMath', containsMath ? 'true' : 'false');
    const educatorLabel = getLoggedInEducatorName();
    if (educatorLabel) formData.append('educatorName', educatorLabel);

    try {
      setSaving(true);
      await enableTeacherPushNotifications();
      const addRes = await axios.post(
        `${gatewayBaseUrl}/api/sections/${encodeURIComponent(String(sectionId))}/subsections`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      const created = addRes.data?.data?.subsection;
      if (created?.id) {
        trackProcessingSubsection({
          id: created.id,
          sectionId,
          label: 'New subsection',
        });
      }
      clearFiles();
      setLocalMsg(
        'Files saved and queued. Subsections process one at a time. You will get a Chrome notification when it is ready.'
      );
      onAdded();
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setLocalMsg(
        error.response?.data?.message || error.message || 'Failed to add subsection.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            marginTop: '0.15rem',
            fontSize: '0.65rem',
            opacity: 0.75,
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
        >
          ▼
        </span>
        <span style={{ flex: 1 }}>
          <span
            className="form-label"
            style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block' }}
          >
            Add another subsection
          </span>
          {!expanded ? (
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                display: 'block',
                marginTop: '0.2rem',
              }}
            >
              Click to open file upload
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <>
          <div
            key={fileKey}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.5rem' }}
          >
            <input type="file" accept="video/*" className="form-input" style={{ padding: '0.35rem', fontSize: '0.8rem' }} onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) {
                setSubVideo(null);
                return;
              }
              try {
                await assertClientVideoDuration(file);
                setSubVideo(file);
                setLocalMsg('');
              } catch (durationErr) {
                setSubVideo(null);
                e.target.value = '';
                setLocalMsg(durationErr.message);
              }
            }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
              Video: 15 minutes or less only (max 100MB). Longer videos are not accepted.
            </p>
            <input type="file" accept=".ppt,.pptx" className="form-input" style={{ padding: '0.35rem', fontSize: '0.8rem' }} onChange={(e) => setSubPpt(e.target.files?.[0] || null)} />
            <input type="file" accept=".pdf" className="form-input" style={{ padding: '0.35rem', fontSize: '0.8rem' }} onChange={(e) => setSubPdf(e.target.files?.[0] || null)} />
            <input type="file" accept="image/*" multiple className="form-input" style={{ padding: '0.35rem', fontSize: '0.8rem' }} onChange={(e) => setSubImages(e.target.files ? Array.from(e.target.files) : [])} />
            <ContainsMathCheckbox
              id={`new-sub-contains-math-${sectionId}`}
              checked={containsMath}
              onChange={setContainsMath}
            />
          </div>
          <button type="button" className="btn" onClick={submit} disabled={saving} style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.85rem' }}>
            {saving ? 'Saving…' : 'Add subsection'}
          </button>
          {localMsg ? (
            <p style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: localMsg.includes('added') ? 'var(--success, #10b981)' : 'var(--danger)' }}>
              {localMsg}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const EditCourse = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const gatewayBaseUrl = getGatewayBaseUrl();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [courseName, setCourseName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [loadedOk, setLoadedOk] = useState(false);

  const [sectionsData, setSectionsData] = useState([]);
  const [newSectionName, setNewSectionName] = useState('');
  const [creatingSection, setCreatingSection] = useState(false);

  const getToken = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return null;
    }
    return token;
  }, [navigate]);

  const reloadFullCourse = useCallback(async () => {
    if (!courseId?.trim()) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const res = await axios.get(
      `${gatewayBaseUrl}/api/courses/${encodeURIComponent(courseId.trim())}/for-edit`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const d = res.data?.data;
    if (d) {
      setCourseName(d.courseName || '');
      setKeywords(Array.isArray(d.keywords) ? d.keywords.join(', ') : '');
      setDescription(d.description || '');
      setThumbnailUrl(d.thumbnailUrl || '');
      setSectionsData(Array.isArray(d.sections) ? d.sections : []);
    }
  }, [courseId, gatewayBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!courseId?.trim()) {
      setLoading(false);
      setMessage('Missing course.');
      return undefined;
    }

    (async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }
      setMessage('');
      setLoading(true);
      try {
        const res = await axios.get(
          `${gatewayBaseUrl}/api/courses/${encodeURIComponent(courseId.trim())}/for-edit`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = res.data?.data;
        if (!cancelled && d) {
          setCourseName(d.courseName || '');
          setKeywords(Array.isArray(d.keywords) ? d.keywords.join(', ') : '');
          setDescription(d.description || '');
          setThumbnailUrl(d.thumbnailUrl || '');
          setSectionsData(Array.isArray(d.sections) ? d.sections : []);
          setLoadedOk(true);
        }
      } catch (e) {
        if (!cancelled) {
          if (e.response?.status === 401 || e.response?.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            navigate('/login');
            return;
          }
          setMessage(e.response?.data?.message || 'Could not load course for editing.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, gatewayBaseUrl, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!courseName.trim()) {
      setMessage('Course name is required.');
      return;
    }

    const token = getToken();
    if (!token) return;

    const formData = new FormData();
    formData.append('courseName', courseName.trim());
    formData.append('keywords', keywords);
    formData.append('description', description.trim());
    const educatorLabel = getLoggedInEducatorName();
    if (educatorLabel) formData.append('educatorName', educatorLabel);
    if (thumbnailFile) formData.append('thumbnail', thumbnailFile);

    try {
      setSaving(true);
      const patchRes = await axios.patch(
        `${gatewayBaseUrl}/api/courses/${encodeURIComponent(courseId.trim())}`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      setThumbnailFile(null);
      setMessage(patchRes.data?.message || 'Course updated.');
      const u = patchRes.data?.data;
      if (u?.thumbnailUrl) setThumbnailUrl(u.thumbnailUrl);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setMessage(error.response?.data?.message || 'Failed to save changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSection = async () => {
    const name = newSectionName.trim();
    if (!name) {
      setMessage('Enter a section name to add.');
      return;
    }
    const token = getToken();
    if (!token) return;
    setCreatingSection(true);
    setMessage('');
    try {
      await axios.post(
        `${gatewayBaseUrl}/api/courses/${encodeURIComponent(courseId.trim())}/section`,
        { name, educatorName: getLoggedInEducatorName() || undefined },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      setNewSectionName('');
      await reloadFullCourse();
      setMessage('Section added. Add subsections under it below.');
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setMessage(error.response?.data?.message || 'Could not add section.');
    } finally {
      setCreatingSection(false);
    }
  };

  const layoutMax = 'min(960px, 100%)';

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: '2rem' }}>
      <nav
        className="navbar glass-panel"
        style={{
          borderRadius: '12px',
          marginBottom: '2rem',
          maxWidth: layoutMax,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <div>
          <h1 className="gradient-text" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            Update course
          </h1>
        </div>
        <button type="button" className="btn" onClick={() => navigate('/uploads')}>
          Back to my courses
        </button>
      </nav>

      <main className="container" style={{ maxWidth: layoutMax, margin: '0 auto' }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
        ) : !loadedOk ? (
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
              {message || 'Course could not be loaded.'}
            </p>
            <button type="button" className="btn" onClick={() => navigate('/uploads')}>
              Back to my courses
            </button>
          </div>
        ) : (
          <>
            {courseId ? <LessonQueueProgress courseId={courseId.trim()} /> : null}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>Course details</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                Update basic information, then scroll down to edit subsection materials (video,
                PPT, PDF, images). Subsection videos must be 15 minutes or less.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-courseName">
                    Course name
                  </label>
                  <input
                    id="edit-courseName"
                    className="form-input"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-thumb">
                    Thumbnail (optional — leave empty to keep current)
                  </label>
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt=""
                      style={{
                        width: '100%',
                        maxWidth: '280px',
                        borderRadius: '8px',
                        marginBottom: '0.75rem',
                        border: '1px solid var(--surface-light)',
                        display: 'block',
                      }}
                    />
                  ) : null}
                  <input
                    id="edit-thumb"
                    type="file"
                    accept="image/*"
                    className="form-input"
                    style={{ padding: '0.5rem' }}
                    onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-keywords">
                    Keywords (comma-separated)
                  </label>
                  <input
                    id="edit-keywords"
                    className="form-input"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-description">
                    Description
                  </label>
                  <textarea
                    id="edit-description"
                    className="form-input"
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ resize: 'vertical', minHeight: '120px' }}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ width: '100%', marginTop: '0.5rem' }}
                >
                  {saving ? 'Saving…' : 'Save course details'}
                </button>
              </form>

              {message ? (
                <p
                  style={{
                    marginTop: '1rem',
                    fontSize: '0.9rem',
                    color:
                      message.includes('updated') || message.includes('added')
                        ? 'var(--success, #10b981)'
                        : 'var(--danger)',
                  }}
                >
                  {message}
                </p>
              ) : null}
            </div>

            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
                Sections & subsection materials
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
                Add new sections, then update or add subsections with files. Updating a subsection
                replaces only the file types you upload. Subsection videos must be 15 minutes or less.
              </p>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="new-section-name">
                  New section name
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    id="new-section-name"
                    className="form-input"
                    style={{ flex: '1 1 200px', minWidth: 0 }}
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="e.g. Module 2"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={creatingSection}
                    onClick={handleAddSection}
                  >
                    {creatingSection ? 'Adding…' : 'Add section'}
                  </button>
                </div>
              </div>

              {sectionsData.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No sections yet. Add a section above, then add subsections with materials.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {sectionsData.map((sec, idx) => (
                    <div
                      key={String(sec.id)}
                      style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(15, 23, 42, 0.25)',
                      }}
                    >
                      <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem' }}>
                        {typeof sec.order === 'number' ? sec.order + 1 : idx + 1}.{' '}
                        {sec.sectionName || 'Section'}
                      </p>

                      {(sec.subsections || []).length === 0 ? (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          No subsections yet.
                        </p>
                      ) : (
                        (sec.subsections || []).map((sub) => (
                          <SubsectionMaterialsUpdater
                            key={String(sub.id)}
                            subsection={sub}
                            sectionId={sec.id}
                            gatewayBaseUrl={gatewayBaseUrl}
                            getToken={getToken}
                            navigate={navigate}
                            onUpdated={reloadFullCourse}
                          />
                        ))
                      )}

                      <NewSubsectionForm
                        sectionId={sec.id}
                        gatewayBaseUrl={gatewayBaseUrl}
                        getToken={getToken}
                        navigate={navigate}
                        onAdded={reloadFullCourse}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default EditCourse;
