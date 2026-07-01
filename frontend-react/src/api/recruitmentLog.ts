import client from './client';

export interface RecruitmentLog {
  id: number;
  candidate_id?: number;
  candidate_name?: string;
  candidate_number?: string;
  operator: string;
  event: string;
  stage?: string;
  operation_time: string;
}

export interface GetLogsParams {
  page?: number;
  page_size?: number;
}

export interface GetLogsResponse {
  logs: RecruitmentLog[];
  total: number;
}

// 获取招聘日志列表
export const getRecruitmentLogs = async (params: GetLogsParams): Promise<GetLogsResponse> => {
  const response = await client.get('/recruitment-log/list', { params });
  return response.data;
};
