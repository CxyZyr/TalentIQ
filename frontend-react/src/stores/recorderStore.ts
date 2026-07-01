import { create } from 'zustand';

// 从 zustand persist 存储中获取 token
const getAuthToken = (): string | null => {
  const userStorage = localStorage.getItem('user-storage');
  if (userStorage) {
    try {
      const parsed = JSON.parse(userStorage);
      return parsed?.state?.token || null;
    } catch {
      return null;
    }
  }
  return null;
};

type ProcessingStatus = 'idle' | 'uploading' | 'transcribing' | 'transcribed' | 'evaluating' | 'completed' | 'failed';

interface RecorderState {
  // 录音状态
  isRecording: boolean;
  isPaused: boolean;
  currentCandidateId: number | null;
  currentStage: string;
  candidateName: string;
  duration: number;
  chunkIndex: number;
  uploadingChunk: boolean;

  // 处理状态
  processingStatus: ProcessingStatus;
  recordingId: number | null;

  // 内部状态（不暴露给外部）
  mediaRecorder: MediaRecorder | null;
  audioStream: MediaStream | null;
  audioChunks: Blob[];
  uploadTimer: ReturnType<typeof setInterval> | null;
  durationTimer: ReturnType<typeof setInterval> | null;
  statusPollTimer: ReturnType<typeof setInterval> | null;

  // 方法
  initRecording: (params: { candidateId: number; stage: string; name: string }) => Promise<boolean>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  abortRecording: () => void;
  cleanup: () => void;
  resetProcessingStatus: () => void;

  // 内部方法
  uploadChunk: () => Promise<void>;
  startStatusPolling: () => void;
  stopStatusPolling: () => void;
}

// 辅助函数：上传分片
const uploadRecordingChunk = async (formData: FormData) => {
  const token = getAuthToken();
  const response = await fetch('/api/interview/recording/upload-chunk', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    throw new Error('上传分片失败');
  }
  return response.json();
};

const getAutoFinishedRecordingId = (response: any): number | null => {
  const result = response?.data;
  if (result?.status === 'recording_auto_finished' && result?.recording_id) {
    return result.recording_id;
  }
  return null;
};

// 辅助函数：完成录音
const finishRecordingApi = async (candidateId: number, stage: string) => {
  const token = getAuthToken();
  const response = await fetch('/api/interview/recording/finish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ candidate_id: candidateId, stage }),
  });
  if (!response.ok) {
    throw new Error('完成录音请求失败');
  }
  return response.json();
};

// 辅助函数：获取录音状态
const getRecordingStatusApi = async (recordingId: number) => {
  const token = getAuthToken();
  const response = await fetch(`/api/interview/recording/status/${recordingId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error('获取录音状态失败');
  }
  return response.json();
};

export const useRecorderStore = create<RecorderState>((set, get) => ({
  // 初始状态
  isRecording: false,
  isPaused: false,
  currentCandidateId: null,
  currentStage: '',
  candidateName: '',
  duration: 0,
  chunkIndex: 0,
  uploadingChunk: false,
  processingStatus: 'idle',
  recordingId: null,
  mediaRecorder: null,
  audioStream: null,
  audioChunks: [],
  uploadTimer: null,
  durationTimer: null,
  statusPollTimer: null,

  // 初始化并开始录音
  initRecording: async ({ candidateId, stage, name }) => {
    try {
      // 检查浏览器支持
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('录音功能需要在 HTTPS 环境下使用，或使用 localhost 访问');
        return false;
      }

      // 请求麦克风权限
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 选择支持的音频格式
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }

      const options = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(audioStream, options);

      // 监听数据可用事件
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          set((state) => ({
            audioChunks: [...state.audioChunks, event.data],
          }));
        }
      };

      // 开始录音
      mediaRecorder.start(1000);

      // 开始计时
      const durationTimer = setInterval(() => {
        const state = get();
        if (!state.isPaused) {
          set({ duration: state.duration + 1 });
        }
      }, 1000);

      // 每5秒上传一次切片
      const uploadTimer = setInterval(() => {
        const state = get();
        if (state.audioChunks.length > 0 && !state.isPaused) {
          state.uploadChunk();
        }
      }, 5000);

      set({
        audioStream,
        mediaRecorder,
        currentCandidateId: candidateId,
        currentStage: stage,
        candidateName: name || '候选人',
        isRecording: true,
        isPaused: false,
        duration: 0,
        chunkIndex: 0,
        audioChunks: [],
        processingStatus: 'idle',
        recordingId: null,
        durationTimer,
        uploadTimer,
      });

      console.log('[录音] 录音已开始');
      return true;
    } catch (error: any) {
      console.error('[录音] 无法访问麦克风:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('请在浏览器中允许麦克风权限后重试');
      } else if (error.name === 'NotFoundError') {
        alert('未检测到麦克风设备，请检查设备连接');
      } else {
        alert('无法访问麦克风，请检查权限设置');
      }
      get().cleanup();
      return false;
    }
  },

  // 上传切片
  uploadChunk: async () => {
    const state = get();
    if (state.audioChunks.length === 0) return;

    set({ uploadingChunk: true });

    try {
      const blob = new Blob(state.audioChunks, {
        type: state.mediaRecorder?.mimeType || 'audio/webm'
      });

      const formData = new FormData();
      formData.append('candidate_id', String(state.currentCandidateId));
      formData.append('stage', state.currentStage);
      formData.append('chunk_index', String(state.chunkIndex));
      formData.append('total_chunks', '-1');
      formData.append('chunk_file', blob, `chunk_${state.chunkIndex}.webm`);

      const response = await uploadRecordingChunk(formData);
      const autoFinishedRecordingId = getAutoFinishedRecordingId(response);

      if (autoFinishedRecordingId) {
        console.warn('[录音] 录音超过3小时，后端已自动结束并开始处理');

        if (state.uploadTimer) {
          clearInterval(state.uploadTimer);
        }
        if (state.durationTimer) {
          clearInterval(state.durationTimer);
        }

        if (state.mediaRecorder) {
          state.mediaRecorder.ondataavailable = null;
          if (state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
          }
        }

        if (state.audioStream) {
          state.audioStream.getTracks().forEach(track => track.stop());
        }

        set({
          isRecording: false,
          isPaused: false,
          uploadingChunk: false,
          audioChunks: [],
          uploadTimer: null,
          durationTimer: null,
          mediaRecorder: null,
          audioStream: null,
          processingStatus: 'transcribing',
          recordingId: autoFinishedRecordingId,
        });

        get().startStatusPolling();
        return;
      }

      set((s) => ({
        audioChunks: [],
        chunkIndex: s.chunkIndex + 1,
      }));

      console.log('[录音] 分片上传成功:', state.chunkIndex + 1);
    } catch (error) {
      console.error('[录音] 分片上传失败:', error);
    } finally {
      set({ uploadingChunk: false });
    }
  },

  // 暂停录音
  pauseRecording: () => {
    const { mediaRecorder } = get();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.pause();
    }
    set({ isPaused: true });
    console.log('[录音] 录音已暂停');
  },

  // 继续录音
  resumeRecording: () => {
    const { mediaRecorder } = get();
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      mediaRecorder.resume();
    }
    set({ isPaused: false });
    console.log('[录音] 录音已继续');
  },

  // 结束录音
  stopRecording: async () => {
    const state = get();
    console.log('[录音Store] 开始停止录音...');

    const savedCandidateId = state.currentCandidateId;
    const savedStage = state.currentStage;

    // 清除定时器
    if (state.uploadTimer) {
      clearInterval(state.uploadTimer);
    }
    if (state.durationTimer) {
      clearInterval(state.durationTimer);
    }

    // 停止录音器
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }

    set({
      isRecording: false,
      isPaused: false,
      uploadTimer: null,
      durationTimer: null,
    });

    // 上传最后的数据
    let autoFinishedRecordingId: number | null = null;
    if (state.audioChunks.length > 0) {
      set({ uploadingChunk: true });
      try {
        const blob = new Blob(state.audioChunks, {
          type: state.mediaRecorder?.mimeType || 'audio/webm'
        });

        const formData = new FormData();
        formData.append('candidate_id', String(savedCandidateId));
        formData.append('stage', savedStage);
        formData.append('chunk_index', String(state.chunkIndex));
        formData.append('total_chunks', '-1');
        formData.append('chunk_file', blob, `chunk_${state.chunkIndex}.webm`);

        const response = await uploadRecordingChunk(formData);
        autoFinishedRecordingId = getAutoFinishedRecordingId(response);
        console.log('[录音Store] 最终分片上传成功');
      } catch (error) {
        console.error('[录音Store] 最终分片上传失败:', error);
      } finally {
        set({ uploadingChunk: false });
      }
    }

    // 停止音频流
    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
    }

    set({
      mediaRecorder: null,
      audioStream: null,
      audioChunks: [],
    });

    // 通知后端完成录音
    if (autoFinishedRecordingId) {
      set({ processingStatus: 'transcribing', recordingId: autoFinishedRecordingId });
      get().startStatusPolling();
      return;
    }

    if (savedCandidateId) {
      try {
        set({ processingStatus: 'transcribing' });
        const response = await finishRecordingApi(savedCandidateId, savedStage);

        if (response.data && response.data.recording_id) {
          set({ recordingId: response.data.recording_id });
          get().startStatusPolling();
        }
      } catch (error) {
        console.error('[录音Store] 完成录音请求失败:', error);
        set({ processingStatus: 'failed' });
      }
    }
  },

  // 强制终止录音：只停止本地录音与上传，不触发后端 finish
  abortRecording: () => {
    const state = get();

    if (state.uploadTimer) {
      clearInterval(state.uploadTimer);
    }
    if (state.durationTimer) {
      clearInterval(state.durationTimer);
    }
    if (state.statusPollTimer) {
      clearInterval(state.statusPollTimer);
    }

    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      try {
        state.mediaRecorder.stop();
      } catch (error) {
        console.error('[录音Store] 强制终止 mediaRecorder 失败:', error);
      }
    }

    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
    }

    set({
      isRecording: false,
      isPaused: false,
      currentCandidateId: null,
      currentStage: '',
      candidateName: '',
      duration: 0,
      chunkIndex: 0,
      uploadingChunk: false,
      processingStatus: 'idle',
      recordingId: null,
      mediaRecorder: null,
      audioStream: null,
      audioChunks: [],
      uploadTimer: null,
      durationTimer: null,
      statusPollTimer: null,
    });
  },

  // 开始轮询状态
  startStatusPolling: () => {
    const state = get();
    if (state.statusPollTimer) {
      clearInterval(state.statusPollTimer);
    }

    const timer = setInterval(async () => {
      const { recordingId } = get();
      if (!recordingId) {
        get().stopStatusPolling();
        return;
      }

      try {
        const response = await getRecordingStatusApi(recordingId);
        const status = response.data?.status;

        if (status) {
          const statusMap: Record<string, ProcessingStatus> = {
            'waiting': 'transcribing',
            'transcribing': 'transcribing',
            'transcribed': 'transcribed',
            'evaluating': 'evaluating',
            'completed': 'completed',
            'failed': 'failed',
          };
          set({ processingStatus: statusMap[status] || status });
        }

        if (['completed', 'failed'].includes(status)) {
          get().stopStatusPolling();
        }
      } catch (error) {
        console.error('[录音] 状态轮询失败:', error);
      }
    }, 2000);

    set({ statusPollTimer: timer });
  },

  // 停止轮询状态
  stopStatusPolling: () => {
    const { statusPollTimer } = get();
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      set({ statusPollTimer: null });
    }
  },

  // 清理资源
  cleanup: () => {
    const state = get();

    if (state.audioStream) {
      state.audioStream.getTracks().forEach(track => track.stop());
    }
    if (state.uploadTimer) {
      clearInterval(state.uploadTimer);
    }
    if (state.durationTimer) {
      clearInterval(state.durationTimer);
    }
    if (state.statusPollTimer) {
      clearInterval(state.statusPollTimer);
    }

    set({
      isRecording: false,
      isPaused: false,
      currentCandidateId: null,
      currentStage: '',
      candidateName: '',
      duration: 0,
      chunkIndex: 0,
      uploadingChunk: false,
      processingStatus: 'idle',
      recordingId: null,
      mediaRecorder: null,
      audioStream: null,
      audioChunks: [],
      uploadTimer: null,
      durationTimer: null,
      statusPollTimer: null,
    });
  },

  // 重置处理状态
  resetProcessingStatus: () => {
    get().stopStatusPolling();
    set({
      processingStatus: 'idle',
      recordingId: null,
    });
  },
}));
