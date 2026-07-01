import client from './client';

// 候选人类型定义
export interface Candidate {
  id: number;
  candidate_number: string;
  name: string;
  phone?: string;
  email?: string;
  department: string;
  job_title: string;
  jd_id: number;
  current_stage: string;
  current_stage_owner_name?: string;
  screening_result?: string;
  first_interview_result?: string;
  second_interview_result?: string;
  third_interview_result?: string;
  offer_status?: string;
  is_onboarded: boolean;
  ai_score_total?: number;
  is_parsed: boolean;
  resume_file_path?: string;
  created_at: string;
  updated_at: string;
  // 详情页扩展字段
  gender?: string;
  age?: number;
  work_status?: string;
  work_years?: number;
  expected_salary?: string;
  highest_education?: string;
  school?: string;
  is_985?: boolean;
  is_211?: boolean;
  is_double_first_class?: boolean;
  privacy_info?: string;
}

export interface CandidateListParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  start_date?: string;
  end_date?: string;
  jd_id?: number | string;
  department?: string;
  stage?: string;
  screening_result?: string;
  first_interview_result?: string;
  second_interview_result?: string;
  third_interview_result?: string;
  offer_status?: string;
  // 多选筛选参数（逗号分隔）
  jd_ids?: string;
  departments?: string;
  stages?: string;
  screening_results?: string;
  first_interview_results?: string;
  second_interview_results?: string;
  third_interview_results?: string;
  offer_statuses?: string;
}

export interface CandidateListResponse {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
}

export interface JDForSelect {
  id: number;
  job_title: string;
  department: string;
  status: string;
}

export interface UserInfo {
  id: number;
  username: string;
  real_name?: string;
  role: string;
  department?: string;
  is_active?: boolean;
}

// 获取候选人列表
export const getCandidateList = async (params: CandidateListParams): Promise<CandidateListResponse> => {
  // 过滤空值
  const filteredParams: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      filteredParams[key] = value;
    }
  });

  const response = await client.get('/candidate/list', { params: filteredParams });
  return response.data;
};

// 获取候选人详情
export const getCandidateDetail = async (candidateId: number): Promise<Candidate> => {
  const response = await client.get(`/candidate/${candidateId}`);
  return response.data;
};

// 获取候选人完整信息（包含流程全链路）
export const getCandidateCompleteInfo = async (candidateId: number) => {
  const response = await client.get(`/candidate-ext/${candidateId}/complete-info`);
  return response.data;
};

// 获取AI评分详情
export const getCandidateAIScoreDetail = async (candidateId: number) => {
  const response = await client.get(`/candidate-ext/${candidateId}/ai-score-detail`);
  return response.data;
};

// 添加候选人（批量上传简历）
export const addCandidates = async (formData: FormData) => {
  const response = await client.post('/candidate/add', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// 更新候选人基本信息
export const updateCandidate = async (candidateId: number, data: Partial<Candidate>) => {
  const response = await client.put(`/candidate/${candidateId}`, data);
  return response.data;
};

// 删除候选人
export const deleteCandidate = async (candidateId: number): Promise<void> => {
  await client.delete(`/candidate/${candidateId}`);
};

// 批量删除候选人
export const batchDeleteCandidates = async (ids: number[]): Promise<void> => {
  await client.post('/candidate/batch-delete', { ids });
};

// 获取JD列表（用于下拉选择，只获取已发布的）
export const getJDListForSelect = async (): Promise<{ items: JDForSelect[]; total: number }> => {
  const response = await client.get('/jd/list', {
    params: {
      page: 1,
      page_size: 100,
      status: 'published',
    },
  });
  return response.data;
};

// 获取用户列表（用于选择负责人）
export const getUserList = async (): Promise<UserInfo[]> => {
  const response = await client.get('/auth/users');
  return response.data;
};

// 导出候选人列表
export const exportCandidateList = async (params: {
  candidate_ids?: string;
  jd_id?: number;
  stage?: string;
}): Promise<Blob> => {
  const response = await client.get('/candidate/export', {
    params,
    responseType: 'blob',
  });
  return response.data;
};

// 更新候选人简历
export const updateCandidateResume = async (candidateId: number, formData: FormData) => {
  const response = await client.put(`/candidate/${candidateId}/resume`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// 添加到人才储备库
export const addToTalentPool = async (candidateIds: number[], remark: string = '') => {
  const response = await client.post('/talent-pool/add', {
    candidate_ids: candidateIds,
    remark,
  });
  return response.data;
};

// 获取AI提取的面试问答
export const getInterviewQA = async (candidateId: number, stage: string) => {
  const response = await client.get(`/candidate-ext/${candidateId}/interview-qa/${stage}`);
  return response.data;
};
