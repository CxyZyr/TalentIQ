import client from './client';

// 面试问题类型
export interface InterviewQuestion {
  question: string;
  reason?: string;
  priority?: '高' | '中' | '低';
  asked?: boolean;
}

// 面试问题集合
export interface InterviewQuestionSet {
  id: number;
  candidate_id: number;
  stage: string;
  questions: InterviewQuestion[];
  created_at: string;
}

// 获取面试问题
export const getInterviewQuestions = async (candidateId: number, stage: string): Promise<InterviewQuestionSet> => {
  const response = await client.get(`/interview/questions/${candidateId}/${encodeURIComponent(stage)}`);
  return response.data;
};

// 生成面试问题
export const generateInterviewQuestions = async (candidateId: number, stage: string) => {
  const response = await client.post('/interview/questions/generate', {
    candidate_id: candidateId,
    stage,
  }, {
    timeout: 600000, // AI生成需要较长时间，设置10分钟超时
  });
  return response.data;
};

// 修改面试问题
export const modifyInterviewQuestions = async (
  questionSetId: number,
  focusPoints: string,
  message: string
) => {
  const response = await client.put(`/interview/questions/${questionSetId}/modify`, {
    focus_points: focusPoints,
    message: message,
  }, {
    timeout: 600000, // AI重新生成需要较长时间，设置10分钟超时
  });
  return response.data;
};

// 切换问题提问状态
export const toggleQuestionAsked = async (questionSetId: number, questionIndex: number, asked: boolean) => {
  const response = await client.put(`/interview/questions/${questionSetId}/toggle-asked`, {
    question_index: questionIndex,
    asked,
  });
  return response.data;
};

// AI面试评分详情类型
export interface AIInterviewScoreIndicator {
  indicator_name: string;
  actual_score: number;
  total_score: number;
  reason: string;
  evidence?: string;
}

export interface AIInterviewScoreDimension {
  dimension_name: string;
  dimension_actual_score: number;
  dimension_total_score: number;
  is_bonus?: boolean;
  indicators: AIInterviewScoreIndicator[];
}

export interface AIInterviewEvaluation {
  dimensions: AIInterviewScoreDimension[];
  total_possible_score?: number;
  main_total_score?: number;
  bonus_total_score?: number;
}

export interface AIInterviewScore {
  total_score: number;
  main_score: number;
  bonus_score: number;
  total_possible_score?: number;
  main_total_score?: number;
  bonus_total_score?: number;
  dimensions?: AIInterviewScoreDimension[];
  overall_evaluation?: string;
  strengths?: string;
  improvements?: string;
}

// 录音信息类型
export interface Recording {
  id: number;
  candidate_id: number;
  stage: string;
  file_path: string;
  duration?: number;
  transcript_status?: string;
  interview_score_total?: number;
  interview_score_main?: number;
  interview_score_bonus?: number;
  interview_evaluation?: AIInterviewEvaluation;
  comprehensive_evaluation?: string;
  strengths?: string;
  weaknesses?: string;
  created_at: string;
}

// 获取AI面试评分
export const getAIInterviewScore = async (recordingId: number): Promise<AIInterviewScore> => {
  const response = await client.get(`/interview-evaluation/ai-score/${recordingId}`);
  return response.data;
};

// 获取录音列表
export const getRecordingList = async (candidateId: number, stage?: string): Promise<Recording[]> => {
  const response = await client.get(`/interview/recording/candidate/${candidateId}`, {
    params: stage ? { stage } : {}
  });
  return response.data;
};

// 获取录音详情
export const getRecordingDetail = async (recordingId: number): Promise<Recording> => {
  const response = await client.get(`/interview/recording/${recordingId}`);
  return response.data;
};

// 重新生成AI评价
export const reEvaluateRecording = async (recordingId: number) => {
  const response = await client.post('/interview/recording/re-evaluate', {
    recording_id: recordingId,
  }, {
    timeout: 600000, // AI评价需要较长时间，设置10分钟超时
  });
  return response.data;
};

// 已有面试评价详情类型
export interface ExistingEvaluation {
  id: number;
  candidate_id: number;
  recording_id?: number;
  stage: string;
  interview_time?: string;
  personal_quality: {
    motivation_score: number;
    communication_score: number;
    responsibility_score: number;
    stability_score: number;
    total: number;
  };
  work_ability: {
    score: number;
    is_ai_referenced: boolean;
  };
  total_score: number;
  conclusion: string;
  comments?: string;
}

// 获取已有面试评价（用于待定状态预填充）
export const getExistingEvaluation = async (candidateId: number, stage: string): Promise<ExistingEvaluation | null> => {
  try {
    const response = await client.get(`/interview-evaluation/${candidateId}/${encodeURIComponent(stage)}`);
    return response.data;
  } catch {
    return null;
  }
};

// 面试评价提交数据类型
export interface InterviewEvaluationData {
  stage: string;
  interview_time?: string;
  personal_quality?: {
    motivation_score: number;
    communication_score: number;
    responsibility_score: number;
    stability_score: number;
  };
  work_ability?: {
    score: number;
    is_ai_referenced?: boolean;
    recording_id?: number;
  };
  conclusion: '通过' | '淘汰' | '待定';
  comments?: string;
  next_stage?: string;
  next_owner_id?: number;
  rejection_reason?: string;
}

// 提交面试评价
export const submitInterviewEvaluation = async (candidateId: number, data: InterviewEvaluationData) => {
  const response = await client.post(`/stage-flow/interview/${candidateId}`, data);
  return response.data;
};

// AI对话消息类型
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

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

// 发送面试AI对话（流式）
export const sendInterviewChatStream = async (
  candidateId: number,
  message: string,
  conversationHistory: ChatMessage[] = []
): Promise<Response> => {
  const token = getAuthToken();
  return fetch('/api/interview/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      candidate_id: candidateId,
      message,
      conversation_history: conversationHistory,
    }),
  });
};
