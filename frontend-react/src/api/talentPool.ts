import client from './client';

// 人才储备类型定义
export interface TalentPoolItem {
  id: number;
  candidate_id: number;
  candidate_number: string;
  candidate_name: string;
  gender?: string;
  age?: number;
  highest_education?: string;
  school?: string;
  is_985?: boolean;
  is_211?: boolean;
  is_double_first_class?: boolean;
  work_years?: number;
  job_title: string;
  department: string;
  jd_id: number;
  ai_score_total?: number;
  resume_file_path?: string;
  resume_upload_time?: string;
  created_at: string;
  remark?: string;
}

export interface TalentPoolListParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  jd_id?: number | string;
  department?: string;
  jd_ids?: string;
  departments?: string;
}

export interface TalentPoolListResponse {
  items: TalentPoolItem[];
  total: number;
  page: number;
  page_size: number;
}

// 获取人才储备库列表
export const getTalentPoolList = async (params: TalentPoolListParams): Promise<TalentPoolListResponse> => {
  // 过滤空值
  const filteredParams: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      filteredParams[key] = value;
    }
  });

  const response = await client.get('/talent-pool/list', { params: filteredParams });
  return response.data;
};

// 从人才储备库移除
export const removeFromTalentPool = async (talentPoolIds: number[]): Promise<{ success: number; failed: number }> => {
  const response = await client.post('/talent-pool/remove', {
    talent_pool_ids: talentPoolIds,
  });
  return response.data;
};

// 重启招聘
export const restartRecruitment = async (
  talentPoolId: number,
  jdId: number,
  screeningOwnerId: number
): Promise<{ candidate_id: number; message: string }> => {
  const response = await client.post('/talent-pool/restart', {
    talent_pool_id: talentPoolId,
    jd_id: jdId,
    screening_owner_id: screeningOwnerId,
  });
  return response.data;
};

// 获取人才储备详情
export const getTalentPoolDetail = async (talentPoolId: number): Promise<TalentPoolItem> => {
  const response = await client.get(`/talent-pool/${talentPoolId}`);
  return response.data;
};
