"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import {
  BarChart3,
  TrendingUp,
  ClipboardList,
  Briefcase,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { MultiSelectCombobox } from "../components/ui/multi-select-combobox";
import { DateRangePicker } from "../components/ui/date-range-picker";
import { format, parse } from "date-fns";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../components/ui/chart";
import {
  getRecruitmentFunnel,
  getConversionRates,
  getMyTodoStatistics,
  getJobProgress,
  getJDListForSelect,
  getCandidateProfile,
  getResumeUploaders,
  FunnelData,
  ConversionRates,
  TodoStatistics,
  JobProgress,
  JDItem,
  FilterParams,
  CandidateProfile,
  Uploader,
} from "../api/statistics";
import { useDepartments } from '../hooks/useDepartments';
import { CandidateProfilePanel } from "./CandidateProfilePanel";

// 图表配置
const chartConfig = {
  value: {
    label: "数量",
    color: "hsl(var(--chart-1))",
  },
  rate: {
    label: "转化率",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const funnelStageColors = {
  totalResumes: "#3b82f6",
  resumePassed: "#0ea5e9",
  firstInterviewPassed: "#22c55e",
  secondInterviewPassed: "#a855f7",
  offerIssued: "#f59e0b",
  onboarded: "#ef4444",
} as const;

export function StatisticsPage() {
  const navigate = useNavigate();
  const { departmentNames } = useDepartments();

  // 筛选状态
  const [filterForm, setFilterForm] = useState<FilterParams>({
    start_date: "",
    end_date: "",
    jd_id: undefined,
    department: "",
  });

  // 多选筛选状态
  const [selectedJdIds, setSelectedJdIds] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  // Tab 切换（招聘效能 / 候选人画像）
  const [activeTab, setActiveTab] = useState<'efficiency' | 'profile'>('efficiency');

  // 候选人画像数据
  const [profileData, setProfileData] = useState<CandidateProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // 负责HR（简历上传人）
  const [uploaderList, setUploaderList] = useState<Uploader[]>([]);
  const [selectedUploaderIds, setSelectedUploaderIds] = useState<string[]>([]);

  // 数据状态
  const [jdList, setJdList] = useState<JDItem[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelData>({
    total_resumes: 0,
    resume_passed: 0,
    first_interview_passed: 0,
    second_interview_passed: 0,
    offer_issued: 0,
    onboarded: 0,
  });
  const [ratesData, setRatesData] = useState<ConversionRates>({
    resume_pass_rate: 0,
    first_interview_pass_rate: 0,
    second_interview_pass_rate: 0,
    third_interview_pass_rate: 0,
    offer_accept_rate: 0,
    onboard_rate: 0,
  });
  const [todoData, setTodoData] = useState<TodoStatistics>({
    resume_screening: 0,
    interview: 0,
    salary_negotiation: 0,
  });
  const [jobProgressList, setJobProgressList] = useState<JobProgress[]>([]);
  const [jobProgressKeyword, setJobProgressKeyword] = useState("");

  // 加载状态
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [todoLoading, setTodoLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);

  // 漏斗图数据
  const funnelChartData = useMemo(() => {
    const d = funnelData;
    return [
      { name: "总简历数", value: d.total_resumes, fill: funnelStageColors.totalResumes },
      { name: "简历通过", value: d.resume_passed, fill: funnelStageColors.resumePassed },
      { name: "一面通过", value: d.first_interview_passed, fill: funnelStageColors.firstInterviewPassed },
      { name: "二面通过", value: d.second_interview_passed, fill: funnelStageColors.secondInterviewPassed },
      { name: "OFFER发放", value: d.offer_issued, fill: funnelStageColors.offerIssued },
      { name: "已入职", value: d.onboarded, fill: funnelStageColors.onboarded },
    ];
  }, [funnelData]);

  // 转化率图数据
  const ratesChartData = useMemo(() => {
    const d = ratesData;
    return [
      { name: "简历通过率", rate: d.resume_pass_rate, fill: funnelStageColors.totalResumes },
      { name: "一面通过率", rate: d.first_interview_pass_rate, fill: funnelStageColors.resumePassed },
      { name: "二面通过率", rate: d.second_interview_pass_rate, fill: funnelStageColors.firstInterviewPassed },
      { name: "三面通过率", rate: d.third_interview_pass_rate, fill: funnelStageColors.secondInterviewPassed },
      { name: "OFFER接受率", rate: d.offer_accept_rate, fill: funnelStageColors.offerIssued },
      { name: "入职转化率", rate: d.onboard_rate, fill: funnelStageColors.onboarded },
    ];
  }, [ratesData]);

  // 待办列表
  const todoItems = useMemo(() => {
    return [
      { label: "简历待筛选", count: todoData.resume_screening, route: "/todo/resume-screening" },
      { label: "待面试", count: todoData.interview, route: "/todo/interview" },
      { label: "谈薪&背调", count: todoData.salary_negotiation, route: "/todo/salary-negotiation" },
    ];
  }, [todoData]);

  const filteredJobProgressList = useMemo(() => {
    const keyword = jobProgressKeyword.trim().toLowerCase();
    if (!keyword) return jobProgressList;
    return jobProgressList.filter((job) => job.job_title?.toLowerCase().includes(keyword));
  }, [jobProgressKeyword, jobProgressList]);

  // 构建筛选参数
  const buildFilterParams = useCallback((): FilterParams => {
    const params: FilterParams = {};
    if (filterForm.start_date) params.start_date = filterForm.start_date;
    if (filterForm.end_date) params.end_date = filterForm.end_date;
    if (selectedJdIds.length > 0) params.jd_ids = selectedJdIds.join(',');
    if (selectedDepartments.length > 0) params.departments = selectedDepartments.join(',');
    if (selectedUploaderIds.length > 0) params.uploader_ids = selectedUploaderIds.join(',');
    return params;
  }, [filterForm, selectedJdIds, selectedDepartments, selectedUploaderIds]);

  // 加载JD列表
  const loadJDList = useCallback(async () => {
    try {
      const res = await getJDListForSelect();
      setJdList(res.items || []);
    } catch (error) {
      console.error("加载JD列表失败:", error);
    }
  }, []);

  // 加载负责HR（简历上传人）列表
  const loadUploaders = useCallback(async () => {
    try {
      const res = await getResumeUploaders();
      setUploaderList(res.uploaders || []);
    } catch (error) {
      console.error("加载负责HR列表失败:", error);
    }
  }, []);

  // 加载招聘漏斗
  const loadFunnelData = useCallback(async () => {
    setFunnelLoading(true);
    try {
      const res = await getRecruitmentFunnel(buildFilterParams());
      setFunnelData(res);
    } catch (error) {
      console.error("加载招聘漏斗数据失败:", error);
    } finally {
      setFunnelLoading(false);
    }
  }, [buildFilterParams]);

  // 加载转化率
  const loadRatesData = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await getConversionRates(buildFilterParams());
      setRatesData(res);
    } catch (error) {
      console.error("加载转化率数据失败:", error);
    } finally {
      setRatesLoading(false);
    }
  }, [buildFilterParams]);

  // 加载待办统计
  const loadTodoData = useCallback(async () => {
    setTodoLoading(true);
    try {
      const res = await getMyTodoStatistics();
      setTodoData(res);
    } catch (error) {
      console.error("加载待办数据失败:", error);
    } finally {
      setTodoLoading(false);
    }
  }, []);

  // 加载职位进展
  const loadProgressData = useCallback(async () => {
    setProgressLoading(true);
    try {
      const res = await getJobProgress();
      setJobProgressList(res.jobs || []);
    } catch (error) {
      console.error("加载职位进展数据失败:", error);
    } finally {
      setProgressLoading(false);
    }
  }, []);

  // 加载候选人画像
  const loadProfileData = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await getCandidateProfile(buildFilterParams());
      setProfileData(res);
    } catch (error) {
      console.error("加载候选人画像数据失败:", error);
    } finally {
      setProfileLoading(false);
    }
  }, [buildFilterParams]);

  // 加载所有数据
  const loadAllData = useCallback(() => {
    loadFunnelData();
    loadRatesData();
    loadTodoData();
    loadProgressData();
    loadProfileData();
  }, [loadFunnelData, loadRatesData, loadTodoData, loadProgressData, loadProfileData]);

  // 刷新
  const handleRefresh = () => {
    setFilterForm({
      start_date: "",
      end_date: "",
      jd_id: undefined,
      department: "",
    });
    setSelectedJdIds([]);
    setSelectedDepartments([]);
    setSelectedUploaderIds([]);
    loadAllData();
  };

  // 筛选
  const handleSearch = () => {
    loadFunnelData();
    loadRatesData();
    loadProfileData();
  };

  useEffect(() => {
    loadJDList();
    loadUploaders();
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 分卡片缓存，避免职位搜索时顶部图表重新播放动画
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const funnelCard = useMemo(() => (
    <motion.div
      className="min-w-0 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <CardTitle className="text-sm font-medium">招聘漏斗</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 min-h-0">
          {funnelLoading ? (
            <div className="flex items-center justify-center h-full min-h-[190px]">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full min-h-[190px] w-full">
              <BarChart
                data={funnelChartData}
                layout="vertical"
                margin={{ left: 0, right: 40, top: 5, bottom: 5 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <ChartTooltip
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  content={<ChartTooltipContent hideIndicator />}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                  {funnelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  ), [funnelChartData, funnelLoading]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ratesCard = useMemo(() => (
    <motion.div
      className="min-w-0 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <CardTitle className="text-sm font-medium">转化率分析</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 min-h-0">
          {ratesLoading ? (
            <div className="flex items-center justify-center h-full min-h-[190px]">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full min-h-[190px] w-full">
              <BarChart
                data={ratesChartData}
                layout="vertical"
                margin={{ left: 0, right: 45, top: 5, bottom: 5 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  width={80}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <ChartTooltip
                  cursor={{ fill: "rgba(0,0,0,0.05)" }}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      formatter={(value) => (
                        <div className="flex flex-1 items-center justify-between leading-none">
                          <span className="text-muted-foreground">转化率</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {value}%
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={18}>
                  {ratesChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="rate"
                    position="right"
                    formatter={(value) => `${value}%`}
                    style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  ), [ratesChartData, ratesLoading]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todoCard = useMemo(() => (
    <motion.div
      className="min-w-0 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-orange-500" />
            <CardTitle className="text-sm font-medium">我的待办</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 min-h-0">
          {todoLoading ? (
            <div className="flex items-center justify-center h-full min-h-[190px]">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-2 h-full min-h-[190px] overflow-y-auto pr-2">
              {todoItems.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                    item.count > 0
                      ? "bg-slate-50 hover:bg-slate-100 cursor-pointer"
                      : "bg-slate-50/50"
                  }`}
                  onClick={() => item.count > 0 && navigate(item.route)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">{item.label}</span>
                    {item.count > 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium text-white bg-blue-500 rounded-full">
                        {item.count}
                      </span>
                    )}
                  </div>
                  {item.count > 0 && (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              ))}
              {todoItems.every((item) => item.count === 0) && (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  暂无待办事项
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  ), [todoItems, todoLoading, navigate]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progressCard = useMemo(() => (
    <motion.div
      className="min-w-0 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-purple-500" />
            <CardTitle className="text-sm font-medium">职位招聘进展</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 min-h-0">
          {progressLoading ? (
            <div className="flex items-center justify-center h-full min-h-[190px]">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="flex h-full min-h-[190px] flex-col gap-3">
              <div className="pr-[14px]">
                <Input
                  value={jobProgressKeyword}
                  onChange={(e) => setJobProgressKeyword(e.target.value)}
                  placeholder="搜索职位名称..."
                  className="h-8"
                />
              </div>
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2">
                {jobProgressList.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    暂无职位数据
                  </div>
                ) : filteredJobProgressList.length > 0 ? (
                  filteredJobProgressList.map((job) => (
                    <div
                      key={job.jd_id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <span className="text-sm text-slate-700 truncate max-w-[180px]">
                        {job.job_title}
                      </span>
                      <span
                        className={`text-sm font-medium ${
                          job.onboarded_count >= job.headcount
                            ? "text-green-600"
                            : "text-blue-600"
                        }`}
                      >
                        {job.onboarded_count}/{job.headcount}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    无匹配职位
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  ), [jobProgressKeyword, jobProgressList, filteredJobProgressList, progressLoading]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0">
      {/* 页面标题 + Tab 切换 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">数据统计</h1>
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setActiveTab('efficiency')}
            className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'efficiency'
                ? 'bg-white text-blue-600 shadow-sm font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            招聘效能
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'profile'
                ? 'bg-white text-blue-600 shadow-sm font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            候选人画像
          </button>
        </div>
      </div>

      {/* 筛选条件 */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-nowrap">
            <DateRangePicker
              startDate={filterForm.start_date ? parse(filterForm.start_date, "yyyy-MM-dd", new Date()) : undefined}
              endDate={filterForm.end_date ? parse(filterForm.end_date, "yyyy-MM-dd", new Date()) : undefined}
              onStartDateChange={(date) =>
                setFilterForm({ ...filterForm, start_date: date ? format(date, "yyyy-MM-dd") : "" })
              }
              onEndDateChange={(date) =>
                setFilterForm({ ...filterForm, end_date: date ? format(date, "yyyy-MM-dd") : "" })
              }
              startPlaceholder="开始日期"
              endPlaceholder="结束日期"
            />
            <MultiSelectCombobox
              label="应聘职位"
              options={jdList.map((jd) => ({ label: `${jd.id} - ${jd.job_title}`, value: String(jd.id) }))}
              value={selectedJdIds}
              onChange={setSelectedJdIds}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个职位</span>
              )}
              placeholder="搜索职位..."
            />
            <MultiSelectCombobox
              label="所属部门"
              options={departmentNames.map((dept) => ({ label: dept, value: dept }))}
              value={selectedDepartments}
              onChange={setSelectedDepartments}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个部门</span>
              )}
              placeholder="搜索部门..."
            />
            <MultiSelectCombobox
              label="负责HR"
              options={uploaderList.map((u) => ({ label: u.name, value: String(u.id) }))}
              value={selectedUploaderIds}
              onChange={setSelectedUploaderIds}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}位HR</span>
              )}
              placeholder="搜索HR..."
            />
            <button
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm shadow-black/5 inline-flex items-center justify-center gap-1 min-w-[84px]"
              onClick={handleSearch}
            >
              筛选
            </button>
            <button
              className="px-4 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1 min-w-[84px]"
              onClick={handleRefresh}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 统计图表 */}
      {activeTab === 'efficiency' ? (
        <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4">
          {funnelCard}
          {ratesCard}
          {todoCard}
          {progressCard}
        </div>
      ) : (
        <CandidateProfilePanel data={profileData} loading={profileLoading} />
      )}
    </div>
  );
}

export default StatisticsPage;
