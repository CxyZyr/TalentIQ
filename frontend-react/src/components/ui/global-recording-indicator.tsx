import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, CheckCircle, AlertCircle, Square, X } from 'lucide-react';
import { useRecorderStore } from '../../stores/recorderStore';

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const GlobalRecordingIndicator: React.FC = () => {
  const navigate = useNavigate();
  const recorderStore = useRecorderStore();

  const [showCompleted, setShowCompleted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const {
    isRecording,
    currentCandidateId,
    currentStage,
    candidateName,
    duration,
    processingStatus,
  } = recorderStore;

  // 当处理完成时显示并倒计时
  useEffect(() => {
    if (processingStatus === 'completed') {
      setShowCompleted(true);
      setCountdown(5);
    }
  }, [processingStatus]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) {
      if (countdown === 0) setShowCompleted(false);
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleClick = useCallback(() => {
    if (processingStatus === 'completed') {
      setCountdown(null);
      setShowCompleted(true);
    }
    if (currentCandidateId) {
      navigate(`/todo/interview/room/${currentCandidateId}?stage=${encodeURIComponent(currentStage)}`);
    }
  }, [currentCandidateId, currentStage, processingStatus, navigate]);

  const handleStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    recorderStore.stopRecording();
  }, [recorderStore]);

  const handleAbort = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    recorderStore.abortRecording();
  }, [recorderStore]);

  useEffect(() => {
    const handlePageHide = () => {
      const state = useRecorderStore.getState();
      if (state.isRecording || state.uploadingChunk) {
        state.abortRecording();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, []);

  // 判断是否应该显示
  const isProcessing = processingStatus !== 'idle' && processingStatus !== 'completed' && processingStatus !== 'failed';
  const shouldShow = isRecording || isProcessing || (processingStatus === 'completed' && showCompleted) || processingStatus === 'failed';

  if (!shouldShow) return null;

  // 状态信息
  const getStatusInfo = () => {
    if (isRecording) {
      return {
        icon: <Mic className="h-4 w-4" />,
        text: `录音中 ${formatDuration(duration)}`,
        color: 'bg-red-500',
        shadow: 'rgba(239, 68, 68, 0.4)',
      };
    }
    switch (processingStatus) {
      case 'uploading':
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: '上传中...', color: 'bg-orange-500', shadow: '' };
      case 'transcribing':
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: '转录中...', color: 'bg-blue-500', shadow: '' };
      case 'evaluating':
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: 'AI评价中...', color: 'bg-purple-500', shadow: '' };
      case 'completed':
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          text: countdown !== null && countdown > 0 ? `评价完成 (${countdown}s)` : '评价完成',
          color: 'bg-green-500',
          shadow: '',
        };
      case 'failed':
        return { icon: <AlertCircle className="h-4 w-4" />, text: '处理失败', color: 'bg-red-600', shadow: '' };
      default:
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, text: '处理中...', color: 'bg-gray-500', shadow: '' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="global-recording-indicator"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50, transition: { duration: 0.3 } }}
        className="fixed top-4 right-4 z-50"
      >
        <motion.div
          className={`${statusInfo.color} text-white px-4 py-2.5 rounded-lg shadow-lg cursor-pointer flex items-center gap-3 min-w-[220px]`}
          onClick={handleClick}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          animate={
            isRecording
              ? {
                  boxShadow: [
                    `0 4px 20px ${statusInfo.shadow}`,
                    `0 4px 30px ${statusInfo.shadow}`,
                    `0 4px 20px ${statusInfo.shadow}`,
                  ],
                }
              : {}
          }
          transition={{
            duration: 1.5,
            repeat: isRecording ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {/* 图标 */}
          <div>{statusInfo.icon}</div>

          {/* 信息 */}
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium leading-tight">{statusInfo.text}</div>
            <div className="text-[11px] opacity-80 leading-tight truncate">
              {candidateName} · {currentStage}
            </div>
          </div>

          {/* 录音波形动画 */}
          {isRecording && (
            <div className="flex items-center gap-0.5 ml-auto">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-white rounded-full"
                  animate={{ height: [4, 14, 4], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                />
              ))}
            </div>
          )}

          {/* 停止按钮 */}
          {isRecording && (
            <>
              <button
                onClick={handleStop}
                className="ml-1 p-1 rounded hover:bg-white/20 transition-colors"
                title="结束录音并开始处理"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleAbort}
                className="p-1 rounded hover:bg-white/20 transition-colors"
                title="强制终止录音"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {/* 点击提示 */}
          {!isRecording && (
            <div className="text-[11px] opacity-70 ml-auto whitespace-nowrap">点击查看</div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
