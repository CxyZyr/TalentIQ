import client from './client';

// 简历筛选提交数据类型
export interface ResumeScreeningData {
  result: '通过' | '不通过';
  comments?: string;
  next_stage?: '一面' | '二面' | '三面' | null;
  next_owner_id?: number | null;
  rejection_reason?: string | null;
}

// 处理简历筛选
export const processResumeScreening = async (candidateId: number, data: ResumeScreeningData) => {
  const response = await client.post(`/stage-flow/resume-screening/${candidateId}`, data);
  return response.data;
};

// 面试流程提交数据类型
export interface InterviewData {
  result: '通过' | '不通过';
  score?: number;
  evaluation?: string;
  next_stage?: '一面' | '二面' | '三面' | '谈薪背调' | null;
  next_owner_id?: number | null;
  rejection_reason?: string | null;
}

// 处理面试流程
export const processInterview = async (candidateId: number, data: InterviewData) => {
  const response = await client.post(`/stage-flow/interview/${candidateId}`, data);
  return response.data;
};

// 终止流程数据类型
export interface TerminateData {
  reason: string;
}

// 终止流程
export const terminateProcess = async (candidateId: number, data: TerminateData) => {
  const response = await client.post(`/stage-flow/terminate/${candidateId}`, data);
  return response.data;
};

// HR异常终止流程
export const hrTerminateProcess = async (candidateId: number, termination_reason: string) => {
  const response = await client.post(`/stage-flow/hr-terminate/${candidateId}`, { termination_reason });
  return response.data;
};

// 终止流程回退
export const rollbackTerminatedCandidate = async (candidateId: number) => {
  const response = await client.post(`/stage-flow/rollback-terminated/${candidateId}`);
  return response.data;
};

// 查询异常终止信息
export const getTerminationInfo = async (candidateId: number) => {
  const response = await client.get(`/stage-flow/termination-info/${candidateId}`);
  return response.data;
};

// 待办转交
export const transferTodo = async (candidate_id: number, new_owner_id: number, target_stage?: string) => {
  const response = await client.post('/todo/transfer', { candidate_id, new_owner_id, target_stage });
  return response.data;
};
