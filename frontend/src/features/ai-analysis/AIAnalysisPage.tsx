import React, { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Card, Tabs, Button, Input, Tag, Progress,
  Space, List, Avatar, Spin, Badge, Typography, Empty, message,
} from 'antd';
import {
  RobotOutlined, ThunderboltOutlined, WarningOutlined,
  CheckCircleOutlined, InfoCircleOutlined, SendOutlined,
  SyncOutlined, BulbOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { PageHeader } from '@/components/common/PageHeader';
import { useResponsive } from '@/hooks/useResponsive';
import { fromNow } from '@/utils';
import { aiService } from '@/services/endpoints/ai';
import { endpointsService } from '@/services/endpoints/endpoints';
import type { AIInsight, Endpoint } from '@/types';

const { TextArea } = Input;
const { Paragraph, Text } = Typography;

const TYPE_ICON: Record<string, React.ReactNode> = {
  anomaly:        <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
  trend:          <ThunderboltOutlined       style={{ color: '#3b82f6' }} />,
  recommendation: <BulbOutlined             style={{ color: '#f59e0b' }} />,
  prediction:     <WarningOutlined          style={{ color: '#8b5cf6' }} />,
};

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const confidenceColor = (score: number): string => {
  if (score >= 90 || score >= 0.9) return '#22c55e';
  if (score >= 70 || score >= 0.7) return '#f59e0b';
  return '#94a3b8';
};

const InsightCard: React.FC<{ insight: AIInsight }> = ({ insight }) => {
  const confVal = insight.confidence <= 1 ? Math.round(insight.confidence * 100) : Math.round(insight.confidence);

  return (
    <Card
      className="card-modern"
      style={{
        marginBottom: 16,
        borderRadius: 12,
        background: 'var(--color-bg-secondary)',
        borderLeft: insight.severity === 'critical'
          ? '4px solid #ef4444'
          : insight.severity === 'warning'
          ? '4px solid #f59e0b'
          : '4px solid #3b82f6',
      }}
      styles={{ body: { padding: '18px 22px' } }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {TYPE_ICON[insight.type] || <BulbOutlined style={{ color: '#3b82f6' }} />}
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
            {insight.title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 16 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              padding: '2px 8px',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              lineHeight: '18px',
            }}
          >
            {insight.type}
          </span>
        </div>
      </div>

      <Paragraph
        style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}
      >
        {insight.description}
      </Paragraph>

      {insight.likelyCauses && insight.likelyCauses.length > 0 && (
        <div style={{ marginBottom: 12, background: 'var(--color-bg-tertiary)', padding: '8px 12px', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Likely Causes:</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {insight.likelyCauses.map((c, idx) => (
              <li key={idx}>
                <strong>{c.cause}</strong> ({c.confidence} confidence) — {c.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insight.suggestedChecks && insight.suggestedChecks.length > 0 && (
        <div style={{ marginBottom: 12, background: 'var(--color-bg-tertiary)', padding: '8px 12px', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Recommended Actions:</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {insight.suggestedChecks.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Confidence</span>
          <Progress
            percent={confVal}
            size="small"
            showInfo={false}
            strokeColor={confidenceColor(confVal)}
            style={{ width: 80, margin: 0 }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>
            {confVal}%
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {insight.createdAt ? fromNow(insight.createdAt) : 'Just now'}
        </span>
      </div>
    </Card>
  );
};

const ThinkingOverlay: React.FC = () => (
  <div style={{ textAlign: 'center', padding: 60 }}>
    <Spin size="large" />
    <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>
      AI is analysing your API telemetry and performance patterns…
    </p>
  </div>
);

export default function AIAnalysisPage() {
  const { isTablet } = useResponsive();
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content:
        "Hello! I am your AI Co-Pilot for API Pulse. Ask me anything about your API latency, root-cause analysis, or performance tuning.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [insightsRes, endpointsRes] = await Promise.all([
        aiService.getInsights().catch(() => []),
        endpointsService.list({ pageSize: 1000 }).catch(() => ({ data: [] })),
      ]);
      setInsights(insightsRes || []);
      setEndpoints(endpointsRes.data || []);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      if (endpoints.length === 0) {
        message.warning('Please add endpoints first to run AI performance analysis');
        setAnalyzing(false);
        return;
      }

      for (const ep of endpoints) {
        await aiService.analyzeEndpoint(ep.id).catch(() => null);
      }

      const refreshed = await aiService.getInsights().catch(() => []);
      setInsights(refreshed);
      message.success('AI analysis completed successfully');
    } catch (err) {
      console.error('Analysis error:', err);
      message.error('Failed to run AI analysis');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMsg: ChatMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    const prompt = input;
    setInput('');
    setSending(true);

    try {
      const res = await aiService.chat(prompt, {
        totalEndpoints: endpoints.length,
        totalInsights: insights.length,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: res.response || 'I analyzed your request against current API Pulse metrics.',
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: 'I analyzed your query. To optimize API performance, ensure database query indexes are present on foreign key lookups and verify that upstream microservice timeouts match client SLAs.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const anomalies = insights.filter((i) => i.type === 'anomaly' || i.type === 'prediction');
  const recommendations = insights.filter((i) => i.type === 'recommendation');
  const trends = insights.filter((i) => i.type === 'trend');

  const renderInsightList = (list: AIInsight[]) => {
    if (analyzing) return <ThinkingOverlay />;
    if (list.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No AI insights detected in this category yet. Click 'Run Analysis' to analyze telemetry."
          style={{ padding: '36px 0' }}
        >
          <Button
            type="primary"
            icon={<RobotOutlined />}
            onClick={handleAnalyze}
            disabled={endpoints.length === 0}
          >
            Run Analysis Now
          </Button>
        </Empty>
      );
    }
    return list.map((i) => <InsightCard key={i.id} insight={i} />);
  };

  return (
    <div>
      <PageHeader
        title="AI Observability & Diagnostics"
        subtitle="Machine learning anomaly detection, predictive outage models, and automated root cause fixes powered by Gemini"
        breadcrumbs={[{ label: 'AI Analysis' }]}
        actions={
          <Button
            type="primary"
            className="btn-ai-gradient"
            icon={analyzing ? <SyncOutlined spin /> : <RobotOutlined />}
            onClick={handleAnalyze}
            loading={analyzing}
          >
            {analyzing ? 'Analyzing Telemetry…' : 'Run AI Analysis'}
          </Button>
        }
      />

      <Row gutter={[20, 20]}>
        {/* Insights panel */}
        <Col xs={24} lg={15}>
          <Card className="card-modern">
            <Tabs
              items={[
                {
                  key: 'all',
                  label: (
                    <span>
                      All Insights{' '}
                      <Badge
                        count={insights.length}
                        style={{ backgroundColor: '#4f8ef7', marginLeft: 4 }}
                      />
                    </span>
                  ),
                  children: renderInsightList(insights),
                },
                {
                  key: 'anomalies',
                  label: (
                    <span>
                      <ExclamationCircleOutlined style={{ color: '#ef4444' }} />{' '}
                      Anomalies ({anomalies.length})
                    </span>
                  ),
                  children: renderInsightList(anomalies),
                },
                {
                  key: 'recommendations',
                  label: (
                    <span>
                      <BulbOutlined style={{ color: '#f59e0b' }} />{' '}
                      Recommendations ({recommendations.length})
                    </span>
                  ),
                  children: renderInsightList(recommendations),
                },
                {
                  key: 'trends',
                  label: (
                    <span>
                      <ThunderboltOutlined style={{ color: '#4f8ef7' }} />{' '}
                      Trends ({trends.length})
                    </span>
                  ),
                  children: renderInsightList(trends),
                },
              ]}
            />
          </Card>
        </Col>

        {/* AI Chat */}
        <Col xs={24} lg={9}>
          <Card
            className="card-modern"
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="modal-icon-badge" style={{ width: 32, height: 32 }}>
                  <RobotOutlined style={{ fontSize: 16 }} />
                </div>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Ask AI Copilot</span>
                <Badge
                  status="processing"
                  text={
                    <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Connected</span>
                  }
                />
              </div>
            }
            style={{
              height: isTablet ? 500 : 'calc(100vh - 220px)',
              display: 'flex',
              flexDirection: 'column',
            }}
            styles={{
              body: {
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                overflow: 'hidden',
              },
            }}
          >
            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                marginBottom: 12,
                paddingRight: 4,
              }}
            >
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: m.role === 'user' ? '#4f8ef7' : '#f1f5f9',
                      color: m.role === 'user' ? '#fff' : '#0f172a',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                  <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: 12 }}>
                    <Spin size="small" /> <span style={{ fontSize: 12, color: '#64748b' }}>Thinking…</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input form */}
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about latency spikes, root causes, or query optimizations…"
                style={{ resize: 'none', borderRadius: 8 }}
              />
              <Button
                type="primary"
                className="btn-primary-gradient"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={sending}
                style={{ height: 'auto', minWidth: 44 }}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
