import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  Mic, Square, ChevronRight, FileText, Sparkles, RefreshCw, Send, Loader2,
  User, CheckCircle, XCircle, Clock, ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Gauge } from '../components/ui/gauge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { useRecorderStore } from '../stores/recorderStore';
import { useToast } from '../components/ui/toast';
import {
  getRecordingList,
  getRecordingDetail,
  reEvaluateRecording,
  getInterviewQuestions,
  generateInterviewQuestions,
  modifyInterviewQuestions,
  toggleQuestionAsked,
  sendInterviewChatStream,
  Recording,
  AIInterviewEvaluation,
  InterviewQuestion,
  ChatMessage,
} from '../api/interview';
import { getCandidateDetail, Candidate } from '../api/candidate';

// 格式化时长
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 根据得分比例获取颜色
const getScoreColorByRatio = (actual: number, total: number) => {
  if (total === 0) return '#6b7280';
  const ratio = actual / total;
  if (ratio >= 0.8) return '#16a34a';
  if (ratio >= 0.6) return '#2563eb';
  if (ratio >= 0.4) return '#f59e0b';
  return '#ef4444';
};

export function InterviewRoomPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const candidateId = id ? parseInt(id) : null;
  const stage = searchParams.get('stage') || '一面';

  // Toast
  const { showToast } = useToast();

  // 候选人信息
  const [candidateInfo, setCandidateInfo] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);

  // AI评价相关
  const [loadingEvaluation, setLoadingEvaluation] = useState(false);
  const [reEvaluating, setReEvaluating] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<number | null>(null);
  const [interviewEvaluation, setInterviewEvaluation] = useState<AIInterviewEvaluation | null>(null);
  const [interviewScore, setInterviewScore] = useState({ total: 0, main: 0, bonus: 0 });
  const [comprehensiveEvaluation, setComprehensiveEvaluation] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');

  // AI对话
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // 录音覆盖确认弹窗
  const [recordingConfirmVisible, setRecordingConfirmVisible] = useState(false);

  // AI辅助面试弹窗
  const [aiDialogVisible, setAiDialogVisible] = useState(false);
  const [focusPoints, setFocusPoints] = useState('');
  const [modifyInput, setModifyInput] = useState('');
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsGeneratedTime, setQuestionsGeneratedTime] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState<number | null>(null);

  // 录音store
  const recorderStore = useRecorderStore();

  // 加载候选人信息
  const loadCandidateInfo = useCallback(async () => {
    if (!candidateId) return;

    setLoading(true);
    try {
      const data = await getCandidateDetail(candidateId);
      setCandidateInfo(data);
    } catch (error) {
      console.error('加载候选人信息失败:', error);
      showToast('加载候选人信息失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  // 加载面试评价
  const loadInterviewEvaluation = useCallback(async () => {
    if (!candidateId) return;

    setLoadingEvaluation(true);
    try {
      // 获取录音列表
      const recordings = await getRecordingList(candidateId, stage);

      // 找到已完成的录音
      const completedRecording = recordings.find((r: Recording) => r.transcript_status === 'completed');

      if (!completedRecording) {
        setInterviewEvaluation(null);
        setCurrentRecordingId(null);
        return;
      }

      setCurrentRecordingId(completedRecording.id);

      // 获取录音详情
      const detail = await getRecordingDetail(completedRecording.id);

      if (detail && detail.interview_evaluation) {
        setInterviewEvaluation(detail.interview_evaluation);
        setInterviewScore({
          total: detail.interview_score_total || 0,
          main: detail.interview_score_main || 0,
          bonus: detail.interview_score_bonus || 0,
        });
        setComprehensiveEvaluation(detail.comprehensive_evaluation || '');
        setStrengths(detail.strengths || '');
        setWeaknesses(detail.weaknesses || '');
      } else {
        setInterviewEvaluation(null);
      }
    } catch (error) {
      console.error('加载面试评价失败:', error);
    } finally {
      setLoadingEvaluation(false);
    }
  }, [candidateId, stage]);

  // 重新评价（异步后台处理）
  const reEvalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleReEvaluate = async () => {
    if (!currentRecordingId) {
      return;
    }

    setReEvaluating(true);
    try {
      await reEvaluateRecording(currentRecordingId);
      showToast('重新评价已启动，请等待完成');

      // 开始轮询评价状态
      if (reEvalPollRef.current) {
        clearInterval(reEvalPollRef.current);
      }
      reEvalPollRef.current = setInterval(async () => {
        try {
          const recordings = await getRecordingList(candidateId!, stage);
          const completed = recordings.find((r: Recording) => r.id === currentRecordingId);
          if (completed && completed.transcript_status === 'completed') {
            // 评价完成，加载结果
            if (reEvalPollRef.current) {
              clearInterval(reEvalPollRef.current);
              reEvalPollRef.current = null;
            }
            await loadInterviewEvaluation();
            setReEvaluating(false);
            showToast('重新评价完成');
          } else if (completed && completed.transcript_status === 'failed') {
            if (reEvalPollRef.current) {
              clearInterval(reEvalPollRef.current);
              reEvalPollRef.current = null;
            }
            setReEvaluating(false);
            showToast('重新评价失败', 'error');
          }
        } catch {
          // 轮询失败，忽略
        }
      }, 3000);
    } catch (error) {
      console.error('重新评价失败:', error);
      showToast('重新评价失败，请重试', 'error');
      setReEvaluating(false);
    }
  };

  // 清理轮询定时器
  useEffect(() => {
    return () => {
      if (reEvalPollRef.current) {
        clearInterval(reEvalPollRef.current);
      }
    };
  }, []);

  // 开始录音
  const handleStartRecording = async () => {
    if (!candidateId) return;

    // 检查是否已存在当前阶段的录音记录
    if (currentRecordingId) {
      setRecordingConfirmVisible(true);
      return;
    }

    await doStartRecording();
  };

  // 确认后真正开始录音
  const doStartRecording = async () => {
    if (!candidateId) return;
    await recorderStore.initRecording({
      candidateId,
      stage,
      name: candidateInfo?.name || '候选人',
    });
  };

  // 停止录音
  const handleStopRecording = async () => {
    await recorderStore.stopRecording();
  };

  // 监听录音处理完成，刷新评价
  useEffect(() => {
    if (recorderStore.processingStatus === 'completed') {
      loadInterviewEvaluation();
    }
  }, [recorderStore.processingStatus, loadInterviewEvaluation]);

  // 进入评价页面
  const goToEvaluate = () => {
    navigate(`/todo/interview/process/${candidateId}?stage=${encodeURIComponent(stage)}`);
  };

  // 打开AI辅助
  const openAIAssist = async () => {
    setAiDialogVisible(true);
    setFocusPoints('');
    setModifyInput('');
    setInterviewQuestions([]);
    setQuestionsGeneratedTime('');
    setCurrentQuestionId(null);

    // 加载已有的面试问题
    await loadInterviewQuestions();
  };

  // 加载面试问题
  const loadInterviewQuestions = async () => {
    if (!candidateId) return;

    setLoadingQuestions(true);
    try {
      const res = await getInterviewQuestions(candidateId, stage);
      if (res && res.questions) {
        setCurrentQuestionId(res.id);
        setInterviewQuestions(res.questions.map((q: InterviewQuestion) => ({
          ...q,
          asked: q.asked || false,
        })));
        setQuestionsGeneratedTime(
          res.created_at ? res.created_at.replace('T', ' ').slice(0, 16) : ''
        );
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        setInterviewQuestions([]);
        setCurrentQuestionId(null);
      } else {
        console.error('加载面试问题失败:', error);
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  // 生成或修改面试问题
  const handleGenerateOrModifyQuestions = async () => {
    if (!candidateId) return;

    setGeneratingQuestions(true);
    try {
      let res;
      if (currentQuestionId) {
        res = await modifyInterviewQuestions(
          currentQuestionId,
          focusPoints,
          modifyInput || '请根据考察重点重新生成面试问题'
        );
      } else {
        res = await generateInterviewQuestions(candidateId, stage);
      }

      if (res && res.questions) {
        setCurrentQuestionId(res.id || currentQuestionId);
        setInterviewQuestions(res.questions.map((q: InterviewQuestion) => ({
          ...q,
          asked: false,
        })));
        setQuestionsGeneratedTime(new Date().toLocaleString('zh-CN'));

      }
    } catch (error) {
      console.error('生成面试问题失败:', error);
      showToast('生成面试问题失败，请重试', 'error');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  // 切换问题状态
  const toggleAsked = async (idx: number) => {
    const newAsked = !interviewQuestions[idx].asked;
    // 乐观更新
    setInterviewQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, asked: newAsked } : q))
    );
    // 持久化到后端
    if (currentQuestionId) {
      try {
        await toggleQuestionAsked(currentQuestionId, idx, newAsked);
      } catch (error) {
        console.error('保存提问状态失败:', error);
        // 回滚
        setInterviewQuestions((prev) =>
          prev.map((q, i) => (i === idx ? { ...q, asked: !newAsked } : q))
        );
      }
    }
  };

  // 发送AI对话
  const handleSendChat = async () => {
    if (!chatInput.trim() || !candidateId) return;

    const userMessage = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setChatLoading(true);

    // 添加空的AI消息用于流式显示
    const aiMessageIndex = chatMessages.length + 1;
    setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    setTimeout(() => {
      if (chatMessagesRef.current) {
        chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      }
    }, 0);

    try {
      const conversationHistory = chatMessages.slice(0, -1);
      const response = await sendInterviewChatStream(candidateId, userMessage, conversationHistory);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '请求失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  setChatMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[aiMessageIndex] = {
                      ...newMessages[aiMessageIndex],
                      content: newMessages[aiMessageIndex].content + parsed.content,
                    };
                    return newMessages;
                  });

                  setTimeout(() => {
                    if (chatMessagesRef.current) {
                      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
                    }
                  }, 0);
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('AI对话失败:', error);
      showToast(error.message || 'AI回复失败，请重试', 'error');
      // 移除失败的消息
      setChatMessages((prev) => prev.slice(0, -2));
    } finally {
      setChatLoading(false);
    }
  };

  // 计算得分率
  const getInterviewScoreRate = () => {
    if (!interviewEvaluation || !interviewEvaluation.dimensions) return '0%';
    let totalScore = 0;
    let actualScore = 0;
    interviewEvaluation.dimensions.forEach((d) => {
      totalScore += d.dimension_total_score || 0;
      actualScore += d.dimension_actual_score || 0;
    });
    if (totalScore === 0) return '0%';
    return Math.round((actualScore / totalScore) * 100) + '%';
  };

  // 获取优先级标签类型
  const getPriorityBadgeVariant = (priority?: string) => {
    const variantMap: Record<string, 'destructive' | 'warning' | 'info'> = {
      '高': 'destructive',
      '中': 'warning',
      '低': 'info',
    };
    return variantMap[priority || '中'] || 'warning';
  };

  // 问题统计
  const questionStats = {
    total: interviewQuestions.length,
    high: interviewQuestions.filter((q) => q.priority === '高').length,
    medium: interviewQuestions.filter((q) => q.priority === '中' || !q.priority).length,
    low: interviewQuestions.filter((q) => q.priority === '低').length,
  };

  useEffect(() => {
    loadCandidateInfo();
    loadInterviewEvaluation();
  }, [loadCandidateInfo, loadInterviewEvaluation]);

  // 清理录音资源
  useEffect(() => {
    return () => {
      // 如果页面卸载时还在录音，不要清理（保持全局录音状态）
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-shrink-0">
        <Link to="/todo/interview" className="hover:text-gray-700">
          面试管理
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{candidateInfo?.name || '候选人'}</span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">开始面试</span>
      </nav>

      {/* 三栏布局 */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* 左侧：基础设置 */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-sm font-medium">面试录音</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
              {/* 候选人信息 */}
              <div className="flex flex-col gap-1.5 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/40">候选人</span>
                  <span className="text-black/70 font-medium">{candidateInfo?.name || '-'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/40">应聘职位</span>
                  <span className="text-black/70 font-medium">{candidateInfo?.job_title || '-'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-black/40">面试阶段</span>
                  <span className="text-black/70 font-medium">{stage}</span>
                </div>
              </div>

              {/* 录音控制区 */}
              <div className="w-full py-4">
                <div className="relative w-full flex items-center flex-col gap-2">
                  {/* 录音按钮 */}
                  {(recorderStore.currentCandidateId === candidateId && ['uploading', 'transcribing', 'transcribed', 'evaluating'].includes(recorderStore.processingStatus)) ? (
                    <button
                      disabled
                      className="w-16 h-16 rounded-xl flex items-center justify-center cursor-not-allowed"
                      type="button"
                    >
                      <Loader2 className="w-6 h-6 text-black/30 animate-spin" />
                    </button>
                  ) : !recorderStore.isRecording ? (
                    <button
                      onClick={handleStartRecording}
                      className="group w-16 h-16 rounded-xl flex items-center justify-center transition-colors bg-none hover:bg-black/10"
                      type="button"
                    >
                      <Mic className="w-6 h-6 text-black/70" />
                    </button>
                  ) : recorderStore.currentCandidateId === candidateId ? (
                    <button
                      onClick={handleStopRecording}
                      className="group w-16 h-16 rounded-xl flex items-center justify-center transition-colors"
                      type="button"
                    >
                      <div
                        className="w-6 h-6 rounded-sm animate-spin bg-black cursor-pointer"
                        style={{ animationDuration: '3s' }}
                      />
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-16 h-16 rounded-xl flex items-center justify-center cursor-not-allowed"
                      type="button"
                    >
                      <Mic className="w-6 h-6 text-black/20" />
                    </button>
                  )}

                  {/* 录音时长 */}
                  <span
                    className={cn(
                      "font-mono text-sm transition-opacity duration-300",
                      recorderStore.isRecording && recorderStore.currentCandidateId === candidateId
                        ? "text-black/70"
                        : "text-black/30"
                    )}
                  >
                    {formatDuration(recorderStore.isRecording && recorderStore.currentCandidateId === candidateId ? recorderStore.duration : 0)}
                  </span>

                  {/* 音频可视化条 */}
                  <div className="h-4 w-full max-w-[240px] flex items-center justify-center gap-0.5">
                    {[...Array(48)].map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "w-0.5 rounded-full transition-all duration-300",
                          recorderStore.isRecording && recorderStore.currentCandidateId === candidateId
                            ? "bg-black/50 animate-pulse"
                            : "bg-black/10 h-1"
                        )}
                        style={
                          recorderStore.isRecording && recorderStore.currentCandidateId === candidateId
                            ? {
                                height: `${20 + Math.random() * 80}%`,
                                animationDelay: `${i * 0.05}s`,
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>

                  {/* 状态文字 */}
                  <p className="h-4 text-xs text-black/70">
                    {(recorderStore.currentCandidateId === candidateId && ['uploading', 'transcribing', 'transcribed', 'evaluating'].includes(recorderStore.processingStatus))
                      ? '录音处理中，请稍候...'
                      : !recorderStore.isRecording
                      ? '点击开始录音'
                      : recorderStore.currentCandidateId === candidateId
                        ? '录音中...'
                        : '其他面试录音中...'}
                  </p>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex flex-col gap-2 mt-4">
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={goToEvaluate}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  面试评价
                </Button>
                <Button
                  className="w-full justify-center bg-blue-600 hover:bg-blue-700"
                  onClick={openAIAssist}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI辅助面试
                </Button>
              </div>

              {/* 录音处理状态 - 仅当前候选人的录音才显示 */}
              {recorderStore.processingStatus !== 'idle' && recorderStore.currentCandidateId === candidateId && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    {recorderStore.processingStatus !== 'completed' &&
                      recorderStore.processingStatus !== 'failed' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                    {recorderStore.processingStatus === 'completed' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {recorderStore.processingStatus === 'failed' && (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">录音处理</span>
                  </div>

                  <div className="space-y-2">
                    {['uploading', 'transcribing', 'evaluating', 'completed'].map((step, idx) => {
                      const statusOrder = ['uploading', 'transcribing', 'evaluating', 'completed'];
                      const currentIdx = statusOrder.indexOf(recorderStore.processingStatus);
                      const stepIdx = statusOrder.indexOf(step);

                      let status = 'pending';
                      if (stepIdx < currentIdx) status = 'done';
                      if (stepIdx === currentIdx) status = 'active';

                      const labels: Record<string, string> = {
                        uploading: '上传录音',
                        transcribing: '语音转录',
                        evaluating: 'AI评价',
                        completed: '处理完成',
                      };

                      return (
                        <div key={step} className="flex items-center gap-2 text-xs">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              status === 'done'
                                ? 'bg-green-500'
                                : status === 'active'
                                  ? 'bg-blue-500 animate-pulse'
                                  : 'bg-gray-300'
                            }`}
                          />
                          <span
                            className={
                              status === 'done'
                                ? 'text-green-600'
                                : status === 'active'
                                  ? 'text-blue-600'
                                  : 'text-gray-400'
                            }
                          >
                            {labels[step]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {recorderStore.processingStatus === 'completed' && (
                    <div className="mt-3 p-2 bg-green-50 rounded text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      AI评价已生成，请查看中间评价详情
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 中间：AI面试评价 */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" />
                  <CardTitle className="text-sm font-medium">AI面试评价</CardTitle>
                </div>
                {interviewEvaluation && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReEvaluate}
                      disabled={reEvaluating}
                      className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${reEvaluating ? 'animate-spin' : ''}`} />
                      重新评价
                    </button>
                    <button
                      onClick={loadInterviewEvaluation}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      刷新
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              {loadingEvaluation || reEvaluating ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : !interviewEvaluation ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <FileText className="w-12 h-12 mb-4" />
                  <p className="text-sm mb-4">完成录音和转录后，这里将显示AI生成的面试评价结果</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadInterviewEvaluation}
                    disabled={loadingEvaluation}
                  >
                    检查评价状态
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 评分概览 */}
                  <div className="flex items-center justify-center gap-6 mb-4 pb-3 border-b border-gray-200">
                    <Gauge
                      value={interviewScore.total}
                      maxValue={interviewEvaluation?.total_possible_score || 80}
                      size="small"
                      label={`总分 / ${interviewEvaluation?.total_possible_score || 80}`}
                      showValue
                    />
                    <Gauge
                      value={interviewScore.main}
                      maxValue={interviewEvaluation?.main_total_score || 80}
                      size="small"
                      label={`主要分 / ${interviewEvaluation?.main_total_score || 80}`}
                      showValue
                    />
                    {(interviewEvaluation?.bonus_total_score || 0) > 0 && (
                    <Gauge
                      value={interviewScore.bonus}
                      maxValue={interviewEvaluation?.bonus_total_score || 0}
                      size="small"
                      label={`加分项 / ${interviewEvaluation?.bonus_total_score || 0}`}
                      showValue
                    />
                    )}
                  </div>

                  {/* AI评价表格 */}
                  {(comprehensiveEvaluation || strengths || weaknesses) && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                      <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b border-gray-200">
                        <span className="text-sm font-medium text-gray-800">AI评价</span>
                      </div>
                      <div className="p-3">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-xs text-gray-500">
                              <th className="pb-1.5 font-medium w-20">评价</th>
                              <th className="pb-1.5 font-medium">评价结果</th>
                            </tr>
                          </thead>
                          <tbody>
                            {comprehensiveEvaluation && (
                              <tr className="border-t border-gray-100">
                                <td className="py-2 pr-3 text-xs text-gray-700 font-medium align-top">总体评价</td>
                                <td className="py-2 text-xs text-gray-600 align-top leading-relaxed">
                                  {comprehensiveEvaluation}
                                </td>
                              </tr>
                            )}
                            {strengths && (
                              <tr className="border-t border-gray-100">
                                <td className="py-2 pr-3 text-xs text-gray-700 font-medium align-top">优势</td>
                                <td className="py-2 text-xs text-gray-600 align-top leading-relaxed">
                                  {strengths}
                                </td>
                              </tr>
                            )}
                            {weaknesses && (
                              <tr className="border-t border-gray-100">
                                <td className="py-2 pr-3 text-xs text-gray-700 font-medium align-top">劣势</td>
                                <td className="py-2 text-xs text-gray-600 align-top leading-relaxed">
                                  {weaknesses}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 维度详细评分 */}
                  {interviewEvaluation.dimensions && interviewEvaluation.dimensions.length > 0 ? (
                    <div className="space-y-3">
                      {interviewEvaluation.dimensions.map((dimension, dIdx) => (
                        <div key={dIdx} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* 维度标题 */}
                          <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-800">{dimension.dimension_name}</span>
                              {dimension.is_bonus && (
                                <Badge variant="warning" className="text-xs">加分项</Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-600">
                              得分: <span
                                className="font-semibold"
                                style={{ color: getScoreColorByRatio(dimension.dimension_actual_score, dimension.dimension_total_score) }}
                              >{dimension.dimension_actual_score}</span>
                              <span className="text-gray-400"> / {dimension.dimension_total_score}</span>
                            </span>
                          </div>

                          {/* 指标表格 */}
                          <div className="p-3">
                            <table className="w-full">
                              <thead>
                                <tr className="text-left text-xs text-gray-500">
                                  <th className="pb-1.5 font-medium w-24">指标</th>
                                  <th className="pb-1.5 font-medium">评判理由</th>
                                  <th className="pb-1.5 font-medium w-16 text-right">得分</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dimension.indicators?.map((indicator, iIdx) => (
                                  <tr key={iIdx} className="border-t border-gray-100">
                                    <td className="py-2 pr-3 text-xs text-gray-700 font-medium align-top">
                                      {indicator.indicator_name}
                                    </td>
                                    <td className="py-2 pr-3 text-xs text-gray-600 align-top">
                                      <div>{indicator.reason}</div>
                                      {indicator.evidence && (
                                        <div className="mt-1 text-gray-400 text-[10px]">来源: {indicator.evidence}</div>
                                      )}
                                    </td>
                                    <td className="py-2 text-xs text-right align-top">
                                      <span
                                        className="font-semibold"
                                        style={{ color: getScoreColorByRatio(indicator.actual_score, indicator.total_score) }}
                                      >{indicator.actual_score}</span>
                                      <span className="text-gray-400"> / {indicator.total_score}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-xs text-gray-400">暂无详细评分数据</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右侧：AI对话 */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex flex-col overflow-hidden bg-white border rounded-lg shadow-sm">
            {/* Chat Header */}
            <div className="flex items-center px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium">AI面试助手</span>
              </div>
            </div>

            {/* Chat Body */}
            <div
              ref={chatMessagesRef}
              className="flex-1 overflow-y-auto min-h-0"
            >
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Sparkles className="w-5 h-5 text-gray-300" />
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">完成录音并生成面试评价后<br />可在这里与AI助手对话</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex gap-2",
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Sparkles className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] px-3 py-2 text-sm leading-relaxed",
                          msg.role === 'user'
                            ? 'bg-zinc-900 text-white rounded-2xl rounded-br-md'
                            : 'bg-gray-100 text-gray-700 rounded-2xl rounded-bl-md'
                        )}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm prose-gray max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex gap-2 justify-start">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-3 h-3 text-white" />
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chat Footer */}
            <div className="border-t px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder="输入消息..."
                  disabled={chatLoading}
                  className="h-9 border-gray-200 focus-visible:ring-1 focus-visible:ring-gray-300 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="h-9 w-9 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI辅助面试弹窗 */}
      <Dialog open={aiDialogVisible} onOpenChange={setAiDialogVisible}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>AI辅助面试</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">
            {/* 左侧：输入区域 */}
            <div className="w-64 flex-shrink-0 flex flex-col">
              <div className="p-3 bg-gray-50 rounded-lg mb-4">
                <div className="text-sm mb-2">
                  <span className="text-gray-500">候选人：</span>
                  <span className="text-gray-900 font-medium">{candidateInfo?.name}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">应聘职位：</span>
                  <span className="text-gray-900 font-medium">{candidateInfo?.job_title}</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-sm text-gray-700 mb-2 block">考察重点(可选)</label>
                <textarea
                  value={focusPoints}
                  onChange={(e) => setFocusPoints(e.target.value)}
                  placeholder="每行一个考察重点，例如：&#10;技术深度&#10;项目经验&#10;沟通能力"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-4">
                <label className="text-sm text-gray-700 mb-2 block">修改需求</label>
                <textarea
                  value={modifyInput}
                  onChange={(e) => setModifyInput(e.target.value)}
                  placeholder="请描述您希望如何调整面试问题"
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <Button
                onClick={handleGenerateOrModifyQuestions}
                disabled={generatingQuestions}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {generatingQuestions ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : currentQuestionId ? (
                  '重新生成面试问题'
                ) : (
                  '生成面试问题'
                )}
              </Button>
            </div>

            {/* 右侧：面试问题集合 */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-800">面试问题集合</span>
                {questionsGeneratedTime && (
                  <span className="text-xs text-gray-400">生成时间: {questionsGeneratedTime}</span>
                )}
              </div>

              {/* 统计数据 */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl font-semibold text-blue-600">{questionStats.total}</div>
                  <div className="text-xs text-gray-500">总问题数</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-xl font-semibold text-red-600">{questionStats.high}</div>
                  <div className="text-xs text-gray-500">高优先级</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-xl font-semibold text-orange-600">{questionStats.medium}</div>
                  <div className="text-xs text-gray-500">中优先级</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xl font-semibold text-gray-600">{questionStats.low}</div>
                  <div className="text-xs text-gray-500">低优先级</div>
                </div>
              </div>

              {/* 问题列表 */}
              <div className="flex-1 overflow-y-auto border rounded-lg p-3 min-h-0">
                {loadingQuestions ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : interviewQuestions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <FileText className="w-10 h-10 mb-2" />
                    <p className="text-sm">暂无面试问题，请点击「生成面试问题」</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interviewQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 border-b last:border-b-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="text-sm text-gray-800 mb-1">
                              {idx + 1}. {q.question}
                            </div>
                            {q.reason && (
                              <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                                考察目的：{q.reason}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <Badge variant={getPriorityBadgeVariant(q.priority)} className="text-xs">
                              {q.priority || '中'}优先级
                            </Badge>
                            <Badge
                              variant={q.asked ? 'success' : 'info'}
                              className="text-xs cursor-pointer"
                              onClick={() => toggleAsked(idx)}
                            >
                              {q.asked ? '已提问' : '未提问'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 录音覆盖确认弹窗 */}
      <Dialog open={recordingConfirmVisible} onOpenChange={setRecordingConfirmVisible}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>录音覆盖提醒</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            当前阶段已存在面试录音记录，开始新的录音将覆盖之前的录音及AI评价结果，是否继续？
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => setRecordingConfirmVisible(false)}>
              取消
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                setRecordingConfirmVisible(false);
                doStartRecording();
              }}
            >
              确认录音
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast 通知 */}
    </div>
  );
}

export default InterviewRoomPage;
