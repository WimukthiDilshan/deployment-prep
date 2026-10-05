import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import { ENABLE_HUGGINGFACE_GENERATION } from '../config/modelGeneration';
import AssistantMarkdown from '../components/AssistantMarkdown';
import TeacherWorkspaceLayout from '../components/TeacherWorkspaceLayout';

function buildGptAskUrls() {
  const base = getGatewayBaseUrl();
  return [
    `${base}/api/gpt/ask`,
    'http://localhost:4000/api/gpt/ask',
    'http://127.0.0.1:4000/api/gpt/ask',
    'http://localhost:5002/api/gpt/ask',
  ].filter((url, i, arr) => arr.indexOf(url) === i);
}

const Gpt = () => {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    setError('');
    setAnswer('');
    const q = question.trim();
    if (!q) {
      setError('Please enter a question.');
      return;
    }

    if (!ENABLE_HUGGINGFACE_GENERATION) {
      setError(
        'Hugging Face generation is paused to save credits. Flip ENABLE_HUGGINGFACE_GENERATION in frontend/src/config/modelGeneration.js (and HF_GENERATION_ENABLED in gpt-service/.env) to turn it back on.'
      );
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      const urls = buildGptAskUrls();
      let lastErr;
      let res;
      for (const url of urls) {
        try {
          res = await axios.post(
            url,
            { question: q },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (e.response?.status === 404) continue;
          if (!e.response && e.code === 'ERR_NETWORK') continue;
          throw e;
        }
      }
      if (!res && lastErr) throw lastErr;
      setAnswer(String(res.data?.data?.answer || '').trim());
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      setError(
        [
          err.response?.data?.message,
          err.response?.data?.detail,
          err.message,
        ]
          .filter(Boolean)
          .join('\n\n') || 'Failed to get response from assistant.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <TeacherWorkspaceLayout
      activePath="/gpt"
      eyebrow="AI teaching support"
      title="Chat Assistant"
      description="Ask teaching questions and turn complex ideas into clear, classroom-ready explanations."
      badge="AI"
    >
      <section className="teacher-workspace-card">
        <div className="teacher-workspace-card-heading">
          <h2>Ask the assistant</h2>
          <p>Enter a question below to receive focused teaching and lesson support.</p>
        </div>
        <div className="teacher-workspace-form">
          <label className="form-label" htmlFor="assistant-question">
            Ask a question
          </label>
          <textarea
            id="assistant-question"
            className="form-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={5}
            placeholder="Type your question here..."
            style={{ resize: 'vertical' }}
          />

          <button
            type="button"
            className="teacher-workspace-primary-button"
            onClick={ask}
            disabled={loading}
          >
            {loading ? 'Asking…' : 'Ask'}
          </button>
        </div>

        {error ? <p className="teacher-workspace-error">{error}</p> : null}

        {answer ? (
          <div className="teacher-workspace-answer">
            <p className="teacher-workspace-answer-label">Assistant response</p>
            <AssistantMarkdown style={{ maxHeight: 'min(60vh, 520px)', overflowY: 'auto' }}>
              {answer}
            </AssistantMarkdown>
          </div>
        ) : null}
      </section>
    </TeacherWorkspaceLayout>
  );
};

export default Gpt;
