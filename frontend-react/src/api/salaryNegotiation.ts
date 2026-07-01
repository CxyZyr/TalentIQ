import client from './client';

// 获取谈薪&背调列表（通过待办接口过滤）
export const getSalaryNegotiationList = async () => {
  const response = await client.get('/salary-negotiation/list/all');
  return response.data;
};

// 获取单个候选人的谈薪&背调信息
export const getSalaryNegotiation = async (candidateId: number) => {
  const response = await client.get(`/salary-negotiation/${candidateId}`);
  return response.data;
};

// 保存谈薪&背调信息（草稿保存，不提交）
export interface SalaryNegotiationData {
  salary_status: string;
  background_check_status: string;
  background_report_path?: string | null;
  offer_status: string;
  is_onboarded: boolean;
}

export const saveSalaryNegotiation = async (candidateId: number, data: SalaryNegotiationData) => {
  const response = await client.post(`/salary-negotiation/save/${candidateId}`, data);
  return response.data;
};

// 提交谈薪&背调信息（完成待办）
export const submitSalaryNegotiation = async (candidateId: number, data: SalaryNegotiationData) => {
  const response = await client.post(`/salary-negotiation/submit/${candidateId}`, data);
  return response.data;
};

// 上传背调报告
export const uploadBackgroundReport = async (formData: FormData) => {
  const response = await client.post('/salary-negotiation/upload-report', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
