import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getGatewayBaseUrl } from '../config/gateway';
import { assertClientVideoDuration } from '../utils/videoDuration';
import ContainsMathCheckbox from '../components/ContainsMathCheckbox';
import LessonQueueProgress from '../components/LessonQueueProgress';
import TeacherWorkspaceLayout from '../components/TeacherWorkspaceLayout';
import {
  enableTeacherPushNotifications,
  trackProcessingSubsection,
} from '../utils/pushNotifications';

const resetInnerSectionState = () => ({
  sectionName: '',
  activeSectionId: null,
  subToggleOpen: false,
  subVideo: null,
  subPpt: null,
  subPdf: null,
  subImages: [],
  containsMath: false,
  lastSubsectionSubmitted: false,
  submittedSubsections: [],
  subsectionFormKey: 0,
});

const SUBSECTION_TOGGLE_DELAY_MS = 220;

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

const UploadNewLesson = () => {
  const navigate = useNavigate();
  const subsectionPanelDelayRef = useRef(null);
  const [formKey, setFormKey] = useState(0);
  const gatewayBaseUrl = getGatewayBaseUrl();

  const [courseName, setCourseName] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [savedThumbnailUrl, setSavedThumbnailUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [savedCourseId, setSavedCourseId] = useState(null);

  const [sectionsPanelOpen, setSectionsPanelOpen] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [subToggleOpen, setSubToggleOpen] = useState(false);
  const [subVideo, setSubVideo] = useState(null);
  const [subPpt, setSubPpt] = useState(null);
  const [subPdf, setSubPdf] = useState(null);
  const [subImages, setSubImages] = useState([]);
  const [containsMath, setContainsMath] = useState(false);
  const [lastSubsectionSubmitted, setLastSubsectionSubmitted] = useState(false);
  const [submittedSubsections, setSubmittedSubsections] = useState([]);
  const [subsectionFormKey, setSubsectionFormKey] = useState(0);

  useEffect(() => {
    return () => {
      if (subsectionPanelDelayRef.current != null) {
        clearTimeout(subsectionPanelDelayRef.current);
        subsectionPanelDelayRef.current = null;
      }
    };
  }, []);

  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [isSubmittingSub, setIsSubmittingSub] = useState(false);

  const coursePartComplete = Boolean(savedCourseId);
  const courseFieldsLocked = coursePartComplete;
  const sectionNameLocked = Boolean(activeSectionId);

  const applyInnerReset = useCallback(() => {
    const r = resetInnerSectionState();
    setSectionName(r.sectionName);
    setActiveSectionId(r.activeSectionId);
    setSubToggleOpen(r.subToggleOpen);
    setSubVideo(r.subVideo);
    setSubPpt(r.subPpt);
    setSubPdf(r.subPdf);
    setSubImages(r.subImages);
    setContainsMath(Boolean(r.containsMath));
    setLastSubsectionSubmitted(r.lastSubsectionSubmitted);
    setSubmittedSubsections(r.submittedSubsections);
    setSubsectionFormKey((k) => k + 1);
  }, []);

  const toggleSectionsPanel = () => {
    if (sectionsPanelOpen) {
      setSectionsPanelOpen(false);
      applyInnerReset();
    } else {
      setSectionsPanelOpen(true);
    }
  };

  const startNewCourseSection = () => {
    setSectionName('');
    setActiveSectionId(null);
    setSubToggleOpen(false);
    setSubVideo(null);
    setSubPpt(null);
    setSubPdf(null);
    setSubImages([]);
    setContainsMath(false);
    setLastSubsectionSubmitted(false);
    setSubmittedSubsections([]);
    setSubsectionFormKey((k) => k + 1);
  };

  const startNewCourse = () => {
    setCourseName('');
    setThumbnailFile(null);
    setSavedThumbnailUrl('');
    setKeywords('');
    setDescription('');
    setSavedCourseId(null);
    setSectionsPanelOpen(false);
    applyInnerReset();
    setMessage('');
    setFormKey((k) => k + 1);
  };

  const getToken = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return null;
    }
    return token;
  };

  const handleSaveCourse = async () => {
    setMessage('');

    if (savedCourseId) {
      return;
    }

    if (!courseName.trim()) {
      setMessage('Course name is required.');
      return;
    }

    if (!thumbnailFile) {
      setMessage('Please upload a thumbnail image.');
      return;
    }

    const token = getToken();
    if (!token) return;

    const formData = new FormData();
    formData.append('courseName', courseName.trim());
    formData.append('thumbnail', thumbnailFile);
    formData.append('keywords', keywords);
    formData.append('description', description.trim());
    const educatorLabel = getLoggedInEducatorName();
    if (educatorLabel) {
      formData.append('educatorName', educatorLabel);
    }

    try {
      setIsSavingCourse(true);
      const response = await axios.post(
        `${gatewayBaseUrl}/api/courses`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      const data = response.data?.data;
      const courseId = data?.id;
      if (!courseId) {
        setMessage(response.data?.message || 'Course saved but missing id.');
        return;
      }

      setSavedCourseId(courseId);
      if (typeof data.courseName === 'string') {
        setCourseName(data.courseName);
      }
      if (Array.isArray(data.keywords)) {
        setKeywords(data.keywords.join(', '));
      }
      if (typeof data.description === 'string') {
        setDescription(data.description);
      }
      if (typeof data.thumbnailUrl === 'string') {
        setSavedThumbnailUrl(data.thumbnailUrl);
      }
      setThumbnailFile(null);

      setMessage(
        'Course saved. Use the right column to add a section, then subsections with files.'
      );
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setMessage(
        error.response?.data?.message || 'Failed to save course. Try again.'
      );
    } finally {
      setIsSavingCourse(false);
    }
  };

  const handleAddSubSection = async () => {
    setMessage('');
    if (!savedCourseId) {
      setMessage('Save the course first.');
      return;
    }
    if (!sectionName.trim()) {
      setMessage('Enter a section name first.');
      return;
    }

    const token = getToken();
    if (!token) return;

    if (!activeSectionId) {
      try {
        setIsCreatingSection(true);
        const educatorName = getLoggedInEducatorName();
        const res = await axios.post(
          `${gatewayBaseUrl}/api/courses/${savedCourseId}/section`,
          {
            name: sectionName.trim(),
            ...(educatorName ? { educatorName } : {}),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const sid = res.data?.data?.id ?? res.data?.data?._id;
        if (sid == null) {
          setMessage(res.data?.message || 'Could not create section.');
          return;
        }
        setActiveSectionId(String(sid));
        setSubToggleOpen(true);
        setLastSubsectionSubmitted(false);
        setMessage('Section created. Add files for the first subsection below.');
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
          return;
        }
        setMessage(
          error.response?.data?.message || 'Failed to create section.'
        );
      } finally {
        setIsCreatingSection(false);
      }
      return;
    }

    setSubToggleOpen((open) => !open);
  };

  const clearSubFiles = () => {
    setSubVideo(null);
    setSubPpt(null);
    setSubPdf(null);
    setSubImages([]);
    setContainsMath(false);
    setSubsectionFormKey((k) => k + 1);
  };

  const handleSubmitSubsection = async () => {
    setMessage('');
    const sectionIdStr =
      activeSectionId != null ? String(activeSectionId).trim() : '';
    if (!sectionIdStr) {
      setMessage('Create the section first (Add sub section).');
      return;
    }

    if (!subVideo) {
      setMessage('Subsection video is required. PPT, PDF, and images are optional.');
      return;
    }

    try {
      await assertClientVideoDuration(subVideo);
    } catch (durationErr) {
      setMessage(durationErr.message);
      return;
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
    if (educatorLabel) {
      formData.append('educatorName', educatorLabel);
    }

    try {
      setIsSubmittingSub(true);
      await enableTeacherPushNotifications();
      const res = await axios.post(
        `${gatewayBaseUrl}/api/sections/${activeSectionId}/subsections`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      const payload = res.data?.data;
      const sub = payload?.subsection ?? payload;
      const sec = payload?.section;
      if (sub?.id) {
        trackProcessingSubsection({
          id: sub.id,
          sectionId: String(sec?.id ?? activeSectionId),
          label: sec?.sectionName
            ? `Subsection under "${sec.sectionName}"`
            : 'Lesson subsection',
        });
        setSubmittedSubsections((prev) => [
          ...prev,
          {
            id: sub.id,
            order: sub.order,
            sectionId: String(sec?.id ?? activeSectionId),
            sectionName: sec?.sectionName ?? sectionName,
          },
        ]);
      }
      setLastSubsectionSubmitted(true);
      clearSubFiles();
      setMessage(
        sec?.sectionName
          ? `Files saved under "${sec.sectionName}" and added to the processing queue. Subsections run one at a time. Allow Chrome notifications to be told when each one is ready.`
          : 'Files saved and queued. Subsections process one at a time in the background. Allow Chrome notifications to be told when each one is ready.'
      );
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      const detail =
        error.response?.data?.message ||
        error.message ||
        (error.code === 'ERR_NETWORK'
          ? 'Network error — is the API gateway running?'
          : 'Failed to save subsection.');
      setMessage(detail);
    } finally {
      setIsSubmittingSub(false);
    }
  };

  const handleAddAnotherSubsection = () => {
    if (!lastSubsectionSubmitted) return;
    setLastSubsectionSubmitted(false);
    setSubToggleOpen(false);
    setMessage('');

    if (subsectionPanelDelayRef.current != null) {
      clearTimeout(subsectionPanelDelayRef.current);
    }
    subsectionPanelDelayRef.current = window.setTimeout(() => {
      subsectionPanelDelayRef.current = null;
      clearSubFiles();
      setSubToggleOpen(true);
      setMessage('Enter the next subsection files, then submit.');
    }, SUBSECTION_TOGGLE_DELAY_MS);
  };

  const readonlyFieldStyle = courseFieldsLocked
    ? { opacity: 0.92, cursor: 'default' }
    : undefined;

  return (
    <TeacherWorkspaceLayout
      activePath="/upload-lesson"
      eyebrow="Lesson management"
      title="Upload new lessons"
      description="Save the course details first, then add sections and subsections below. Subsection videos must be 15 minutes or less."
      badge="NEW"
    >
      <div className="upload-lesson-toolbar">
        <button
          type="button"
          className="teacher-workspace-secondary-button"
          onClick={() => navigate('/upload-lesson')}
        >
          Back to lesson uploads
        </button>
      </div>

      <div className="upload-lesson-steps" aria-hidden="true">
        <div className={`upload-lesson-step ${coursePartComplete ? 'is-done' : 'is-active'}`}>
          <span className="upload-lesson-step-index">1</span>
          <span>
            <strong>Course details</strong>
            <small>
              {coursePartComplete ? 'Saved and locked for this session.' : 'Name, thumbnail, keywords, and description.'}
            </small>
          </span>
        </div>
        <div className={`upload-lesson-step ${coursePartComplete ? 'is-active' : ''}`}>
          <span className="upload-lesson-step-index">2</span>
          <span>
            <strong>Sections & materials</strong>
            <small>
              {coursePartComplete ? 'Add a section, then upload each subsection.' : 'Unlocks after the course is saved.'}
            </small>
          </span>
        </div>
      </div>

      <div className="upload-lesson-grid">
        <section className="teacher-workspace-card">
          <div className="teacher-workspace-card-heading">
            <h2>New course</h2>
            <p>Create the course record before you attach lesson files.</p>
          </div>
          {savedCourseId ? (
            <div className="upload-lesson-queue">
              <LessonQueueProgress courseId={savedCourseId} />
            </div>
          ) : null}

          <div key={formKey} className="teacher-workspace-form">
            {courseFieldsLocked ? (
              <p className="upload-lesson-status">
                Course saved — fields below show what was stored.
              </p>
            ) : null}

            <div className="form-group">
              <label className="form-label" htmlFor="courseName">
                Course name
              </label>
              <input
                id="courseName"
                name="courseName"
                type="text"
                className="form-input"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Enter course name"
                autoComplete="off"
                readOnly={courseFieldsLocked}
                style={readonlyFieldStyle}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="thumbnail">
                Upload thumbnail
              </label>
              {!courseFieldsLocked ? (
                <div className="upload-lesson-file">
                  <input
                    id="thumbnail"
                    name="thumbnail"
                    type="file"
                    accept="image/*"
                    className="form-input"
                    onChange={(e) =>
                      setThumbnailFile(e.target.files?.[0] || null)
                    }
                  />
                  <p className="upload-lesson-hint">Image only, max 2MB.</p>
                </div>
              ) : (
                <div>
                  {savedThumbnailUrl ? (
                    <img
                      src={savedThumbnailUrl}
                      alt="Course thumbnail"
                      className="upload-lesson-thumb"
                    />
                  ) : (
                    <p className="upload-lesson-hint">
                      Thumbnail URL saved (preview unavailable).
                    </p>
                  )}
                  <p className="upload-lesson-hint">
                    Thumbnail is stored on Cloudinary; the link above is what
                    was saved for this course.
                  </p>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="keywords">
                Keywords for search
              </label>
              <input
                id="keywords"
                name="keywords"
                type="text"
                className="form-input"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. algebra, grade 9, semester 1"
                readOnly={courseFieldsLocked}
                style={readonlyFieldStyle}
              />
              <p className="upload-lesson-hint">Comma-separated keywords.</p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                className="form-input"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Course description"
                style={{
                  resize: 'vertical',
                  minHeight: '120px',
                  ...readonlyFieldStyle,
                }}
                readOnly={courseFieldsLocked}
              />
            </div>

            {!courseFieldsLocked ? (
              <button
                type="button"
                className="teacher-workspace-primary-button"
                onClick={handleSaveCourse}
                disabled={isSavingCourse}
              >
                {isSavingCourse ? 'Saving course…' : 'Save course'}
              </button>
            ) : (
              <button
                type="button"
                className="teacher-workspace-secondary-button"
                onClick={startNewCourse}
              >
                Start another course
              </button>
            )}
          </div>
        </section>

        <section
          className={`teacher-workspace-card upload-lesson-sections ${
            coursePartComplete ? 'is-ready' : 'is-waiting'
          }`}
          style={{
            pointerEvents: coursePartComplete ? 'auto' : 'none',
          }}
        >
          <div className="teacher-workspace-card-heading">
            <h2>Sections</h2>
            <p>
              {coursePartComplete
                ? 'Open Add section, enter a section name, then use Add sub section to upload materials. Submit each subsection before adding another. Subsection videos must be 15 minutes or less.'
                : 'Save the course on the left first.'}
            </p>
          </div>

          <div className="upload-lesson-actions">
            <button
              type="button"
              className="teacher-workspace-primary-button"
              onClick={toggleSectionsPanel}
              disabled={!coursePartComplete}
            >
              {sectionsPanelOpen ? 'Hide add section' : 'Add section'}
            </button>
          </div>

          {sectionsPanelOpen && coursePartComplete && (
            <div className="upload-lesson-stack" style={{ marginTop: '1rem' }}>
              <div className="form-group teacher-workspace-form">
                <label className="form-label" htmlFor="sectionName">
                  Section name
                </label>
                <input
                  id="sectionName"
                  type="text"
                  className="form-input"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  placeholder="e.g. Module 1"
                  readOnly={sectionNameLocked}
                  style={
                    sectionNameLocked
                      ? { opacity: 0.92, cursor: 'default' }
                      : undefined
                  }
                  autoComplete="off"
                />
              </div>

              <button
                type="button"
                className="teacher-workspace-secondary-button"
                onClick={handleAddSubSection}
                disabled={isCreatingSection || !sectionName.trim()}
              >
                {isCreatingSection
                  ? 'Creating section…'
                  : activeSectionId
                    ? subToggleOpen
                      ? 'Hide sub section'
                      : 'Show sub section'
                    : 'Add sub section'}
              </button>

              {activeSectionId && subToggleOpen && (
                <div key={subsectionFormKey} className="upload-lesson-subsection">
                  <p className="upload-lesson-hint" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    Upload subsection video (required). We only accept videos of
                    15 minutes or less. PPT, PDF, and multiple images are optional.
                  </p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-video">
                      Video (15 minutes or less)
                    </label>
                    <div className="upload-lesson-file">
                      <input
                        id="sub-video"
                        type="file"
                        accept="video/*"
                        className="form-input"
                        onChange={async (e) => {
                          const file = e.target.files?.[0] || null;
                          if (!file) {
                            setSubVideo(null);
                            return;
                          }
                          try {
                            await assertClientVideoDuration(file);
                            setSubVideo(file);
                            setMessage('');
                          } catch (durationErr) {
                            setSubVideo(null);
                            e.target.value = '';
                            setMessage(durationErr.message);
                          }
                        }}
                      />
                      <p className="upload-lesson-hint">
                        Note: only videos of 15 minutes or less are accepted (max 100MB). Longer videos will be rejected.
                      </p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-ppt">
                      PowerPoint (PPT / PPTX)
                    </label>
                    <div className="upload-lesson-file">
                      <input
                        id="sub-ppt"
                        type="file"
                        accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        className="form-input"
                        onChange={(e) =>
                          setSubPpt(e.target.files?.[0] || null)
                        }
                      />
                      <p className="upload-lesson-hint">Max 15MB.</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-pdf">
                      PDF
                    </label>
                    <div className="upload-lesson-file">
                      <input
                        id="sub-pdf"
                        type="file"
                        accept=".pdf,application/pdf"
                        className="form-input"
                        onChange={(e) =>
                          setSubPdf(e.target.files?.[0] || null)
                        }
                      />
                      <p className="upload-lesson-hint">Max 15MB.</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="sub-images">
                      Images (multiple)
                    </label>
                    <div className="upload-lesson-file">
                      <input
                        id="sub-images"
                        type="file"
                        accept="image/*"
                        multiple
                        className="form-input"
                        onChange={(e) =>
                          setSubImages(
                            e.target.files
                              ? Array.from(e.target.files)
                              : []
                          )
                        }
                      />
                      <p className="upload-lesson-hint">
                        Up to 15 files, 100MB each.
                      </p>
                    </div>
                  </div>

                  <ContainsMathCheckbox
                    id="sub-contains-math"
                    checked={containsMath}
                    onChange={setContainsMath}
                  />

                  <div className="upload-lesson-actions">
                    <button
                      type="button"
                      className="teacher-workspace-primary-button"
                      onClick={handleSubmitSubsection}
                      disabled={isSubmittingSub}
                    >
                      {isSubmittingSub
                        ? 'Uploading files…'
                        : 'Submit subsection'}
                    </button>

                    <button
                      type="button"
                      className={`teacher-workspace-secondary-button upload-lesson-add-another${
                        lastSubsectionSubmitted ? ' is-ready' : ''
                      }`}
                      onClick={handleAddAnotherSubsection}
                      disabled={!lastSubsectionSubmitted}
                    >
                      + Add another subsection
                    </button>
                  </div>
                </div>
              )}

              {submittedSubsections.length > 0 && (
                <div className="upload-lesson-hierarchy">
                  <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                    Hierarchy (this course section)
                  </p>
                  <h3>
                    Section:{' '}
                    {sectionName.trim() ||
                      submittedSubsections[0]?.sectionName ||
                      '(unnamed)'}
                  </h3>
                  <p>
                    Subsections saved under this section (
                    {submittedSubsections.length})
                  </p>
                  <ul>
                    {submittedSubsections.map((s, i) => (
                      <li key={s.id}>
                        Subsection {i + 1} (order {s.order})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSectionId && (
                <button
                  type="button"
                  className="teacher-workspace-secondary-button"
                  onClick={startNewCourseSection}
                >
                  New course section
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {message ? <p className="upload-lesson-message">{message}</p> : null}
    </TeacherWorkspaceLayout>
  );
};

export default UploadNewLesson;
