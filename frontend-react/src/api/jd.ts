import client from './client';

// JD 数据类型定义
export interface JDData {
  job_title: string;
  industry?: string;
  job_level?: string;
  department: string;
  salary_range?: string;
  headcount?: number;
  expected_onboard_date?: string;
  job_responsibilities?: string;
  hard_requirements?: string;
  other_requirements?: string;
}

export interface JD extends JDData {
  id: number;
  status: 'draft' | 'published' | 'closed';
  created_at: string;
  updated_at: string;
  creator_id?: number;
  creator_name?: string;
}

export interface JDListParams {
  page?: number;
  page_size?: number;
  keyword?: string;
  department?: string;
  status?: string;
}

export interface JDListResponse {
  items: JD[];
  total: number;
  page: number;
  page_size: number;
}

// 获取 JD 列表
export const getJDList = async (params: JDListParams): Promise<JDListResponse> => {
  const response = await client.get('/jd/list', { params });
  return response.data;
};

// 获取 JD 详情
export const getJDDetail = async (id: number): Promise<JD> => {
  const response = await client.get(`/jd/${id}`);
  return response.data;
};

// AI 帮写（流式输出）- 返回 fetch Response 以支持流式读取
export const aiAssistWrite = async (data: {
  jd_info: JDData;
  output_mode: 'job_responsibilities' | 'hard_requirements' | 'other_requirements';
}): Promise<Response> => {
  // 从 zustand persist 存储中获取 token
  const userStorage = localStorage.getItem('user-storage');
  let token = '';
  if (userStorage) {
    try {
      const parsed = JSON.parse(userStorage);
      token = parsed?.state?.token || '';
    } catch (e) {
      console.error('Failed to parse user storage:', e);
    }
  }

  const response = await fetch('/api/jd/ai-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('AI 生成失败');
  }

  return response;
};

// 清理 JD 数据，将空字符串转为 undefined 避免后端解析失败
const cleanJDData = (jdData: JDData): JDData => {
  const cleaned = { ...jdData };
  // 可选字符串字段：空字符串转 undefined
  const optionalFields: (keyof JDData)[] = [
    'industry', 'job_level', 'salary_range',
    'expected_onboard_date', 'job_responsibilities',
    'hard_requirements', 'other_requirements',
  ];
  for (const field of optionalFields) {
    if (cleaned[field] === '') {
      (cleaned as any)[field] = undefined;
    }
  }
  return cleaned;
};

// 保存 JD 草稿
export const saveJD = async (data: { id?: number; jd_data: JDData }): Promise<JD> => {
  const response = await client.post('/jd/save', {
    ...data,
    jd_data: cleanJDData(data.jd_data),
  });
  return response.data;
};

// 发布 JD
export const publishJD = async (data: { id?: number; jd_data: JDData }): Promise<JD> => {
  const response = await client.post('/jd/publish', {
    ...data,
    jd_data: cleanJDData(data.jd_data),
  });
  return response.data;
};

// 更新 JD
export const updateJD = async (id: number, data: JDData): Promise<JD> => {
  const response = await client.put(`/jd/${id}`, data);
  return response.data;
};

// 删除 JD（仅草稿）
export const deleteJD = async (id: number): Promise<void> => {
  await client.delete(`/jd/${id}`);
};

// 关闭 JD（仅 HR）
export const closeJD = async (id: number): Promise<JD> => {
  const response = await client.post(`/jd/${id}/close`);
  return response.data;
};

// 导出 JD 为 Word
export const exportJD = async (id: number): Promise<Blob> => {
  const response = await client.get(`/jd/${id}/export`, {
    responseType: 'blob',
  });
  return response.data;
};
