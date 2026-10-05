import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getGatewayBaseUrl } from '../config/gateway';
import AssistantMarkdown from '../components/AssistantMarkdown';
import TeacherWorkspaceLayout from '../components/TeacherWorkspaceLayout';

const DeepseekChat = () => {
  const navigate = useNavigate();
  const listRef = useRef(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async () => {
    setError('');
    const text = input.trim();
    if (!text || loading) return;

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    const history = messages.map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(
        `${getGatewayBaseUrl()}/api/deepseek/chat`,
        { message: text, history },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const answer = String(res.data?.data?.answer || '').trim();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: answer || 'No response returned.' },
      ]);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
        return;
      }
      const detail = [
        err.response?.data?.message,
        err.response?.data?.detail,
        err.message,
      ]
        .filter(Boolean)
        .join('\n\n');
      setError(detail || 'Failed to get response from DeepSeek.');
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <TeacherWorkspaceLayout
      activePath="/deepseek"
      eyebrow="AI content support"
      title="DeepSeek Chat"
      description="Convert content, explore lesson ideas, and create clearer learning material with DeepSeek."
      badge="DS"
    >
      <section className="teacher-workspace-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '68vh' }}>
          <div ref={listRef} className="teacher-chat-list">
            {messages.length === 0 && !loading && (
              <p className="teacher-chat-empty">
                Ask anything, or paste content to convert into clearer learning
                material.
              </p>
            )}

            {messages.map((item, index) => {
              const isUser = item.role === 'user';
              return (
                <div
                  key={`${item.role}-${index}`}
                  className={`teacher-chat-message ${isUser ? 'is-user' : 'is-assistant'}`}
                >
                  <div className="teacher-chat-role">
                    {isUser ? 'You' : 'DeepSeek'}
                  </div>
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {item.content}
                    </div>
                  ) : (
                    <AssistantMarkdown>{item.content}</AssistantMarkdown>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="teacher-chat-loading">DeepSeek is thinking…</div>
            )}
          </div>

          {error && <p className="teacher-workspace-error">{error}</p>}

          <div className="teacher-chat-composer teacher-workspace-form">
            <textarea
              className="form-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={4}
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              style={{ resize: 'vertical' }}
              disabled={loading}
            />
            <div className="teacher-chat-actions">
              <button
                type="button"
                className="teacher-workspace-secondary-button"
                onClick={() => {
                  setMessages([]);
                  setError('');
                }}
                disabled={loading || messages.length === 0}
              >
                Clear chat
              </button>
              <button
                type="button"
                className="teacher-workspace-primary-button"
                onClick={send}
                disabled={loading || !input.trim()}
              >
                {loading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
      </section>
    </TeacherWorkspaceLayout>
  );
};

export default DeepseekChat;
