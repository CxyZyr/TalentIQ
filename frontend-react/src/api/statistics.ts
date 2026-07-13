import client from './client';

export interface FilterParams {
  start_date?: string;
  end_date?: string;
  jd_id?: number;
  department?: string;
  jd_ids?: string;
  departments?: string;
  uploader_ids?: string;
}

export interface FunnelData {
  total_resumes: number;
  resume_passed: number;
  first_interview_passed: number;
  second_interview_passed: number;
  offer_issued: number;
  onboarded: number;
}

export interface ConversionRates {
  resume_pass_rate: number;
  first_interview_pass_rate: number;
  second_interview_pass_rate: number;
  third_interview_pass_rate: number;
  offer_accept_rate: number;
  onboard_rate: number;
}

export interface TodoStatistics {
  resume_screening: number;
  interview: number;
  salary_negotiation: number;
}

export interface JobProgress {
  jd_id: number;
  job_title: string;
  headcount: number;
  onboarded_count: number;
}

export interface JDItem {
  id: number;
  job_title: string;
}

// 获取招聘漏斗数据
export async function getRecruitmentFunnel(params?: FilterParams): Promise<FunnelData> {
  const response = await client.get('/statistics/recruitment-funnel', { params });
  return response.data;
}

// 获取转化率分析
export async function getConversionRates(params?: FilterParams): Promise<ConversionRates> {
  const response = await client.get('/statistics/conversion-rates', { params });
  return response.data;
}

// 获取我的待办统计
export async function getMyTodoStatistics(): Promise<TodoStatistics> {
  const response = await client.get('/statistics/my-todo');
  return response.data;
}

// 获取职位招聘进展
export async function getJobProgress(): Promise<{ jobs: JobProgress[] }> {
  const response = await client.get('/statistics/job-progress');
  return response.data;
}

// 获取JD列表（用于筛选）
export async function getJDListForSelect(): Promise<{ items: JDItem[] }> {
  const response = await client.get('/jd/list', {
    params: {
      page: 1,
      page_size: 100,
      status: 'published'
    }
  });
  return response.data;
}

// ==================== 候选人画像统计 ====================

export interface DistributionItem {
  name: string;
  count: number;
}

export interface RangeItem {
  range: string;
  count: number;
}

export interface TrendItem {
  month: string;
  count: number;
}

export interface CandidateProfile {
  total: number;
  ai_score: {
    scored_count: number;
    avg_score: number;
    buckets: RangeItem[];
  };
  education: DistributionItem[];
  top_school: {
    is_985: number;
    is_211: number;
    is_double_first_class: number;
    total: number;
  };
  school_tier: DistributionItem[];
  trend: TrendItem[];
  job_ranking: DistributionItem[];
  stage_dist: DistributionItem[];
  interview_scores: {
    first: { avg: number | null; count: number };
    second: { avg: number | null; count: number };
    third: { avg: number | null; count: number };
  };
  demographics: {
    work_status: DistributionItem[];
    work_years: RangeItem[];
    gender: DistributionItem[];
    age: RangeItem[];
  };
}

// 获取候选人画像统计
export async function getCandidateProfile(params?: FilterParams): Promise<CandidateProfile> {
  const response = await client.get('/statistics/candidate-profile', { params });
  return response.data;
}

export interface Uploader {
  id: number;
  name: string;
  username: string;
}

// 获取上传过简历的HR列表（用于"负责HR"筛选）
export async function getResumeUploaders(): Promise<{ uploaders: Uploader[] }> {
  const response = await client.get('/statistics/resume-uploaders');
  return response.data;
}
