import client from './client';

// 待办项类型定义
export interface TodoItem {
  id: number;
  candidate_id: number;
  candidate_number?: string;
  candidate_name: string;
  gender?: string;
  age?: number;
  highest_education?: string;
  school?: string;
  is_985?: boolean;
  is_211?: boolean;
  is_double_first_class?: boolean;
  work_years?: number;
  summary?: string;
  ai_score_total?: number;
  total_score_max?: number;
  hard_requirements_passed?: boolean;
  jd_id: number;
  jd_title: string;
  department: string;
  resume_file_path?: string;
  resume_upload_time?: string;
  current_stage?: string;
  // 面试相关字段
  stage?: string;
  interview_stage?: string;
  interview_time?: string;
  interview_location?: string;
  interviewer_name?: string;
  interview_status?: string;
  interview_result?: string;
  ai_work_ability_score?: number;
  manual_work_ability_score?: number;
  personal_quality_score?: number;
  total_score?: number;
  created_at?: string;
  // 谈薪背调相关字段
  offer_status?: string;
  expected_salary?: string;
}

export interface TodoListResponse {
  [key: string]: TodoItem[];
}

// 获取我的待办列表
export const getMyTodos = async (params?: { stage_filter?: string }): Promise<TodoListResponse> => {
  const response = await client.get('/todo/my', { params });
  return response.data;
};

// 标记待办为已处理
export const markTodoProcessed = async (todoId: number): Promise<void> => {
  await client.post(`/todo/${todoId}/process`);
};

// 获取简历筛选详情
export const getScreeningDetail = async (candidateId: number) => {
  const response = await client.get(`/todo/screening/${candidateId}`);
  return response.data;
};

// 提交简历筛选结果
export const submitScreeningResult = async (
  candidateId: number,
  data: {
    result: '通过' | '不通过';
    reason?: string;
    next_stage_owner_id?: number;
  }
) => {
  const response = await client.post(`/todo/screening/${candidateId}/submit`, data);
  return response.data;
};
