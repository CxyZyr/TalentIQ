import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  RotateCcw,
  Plus,
  Trash2,
  Archive,
  Download,
  Eye,
  Edit,
  FileText,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { DateRangePicker } from '../components/ui/date-range-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { SearchableSelect } from '../components/ui/searchable-select';
import { MultiSelectCombobox } from '../components/ui/multi-select-combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Pagination } from '../components/ui/pagination';
import {
  getCandidateList,
  deleteCandidate,
  getJDListForSelect,
  getUserList,
  addCandidates,
  exportCandidateList,
  addToTalentPool,
  Candidate,
  CandidateListParams,
  JDForSelect,
  UserInfo,
} from '../api/candidate';
import { useUserStore } from '../stores/userStore';
import { useDepartments } from '../hooks/useDepartments';

const ALLOWED_RESUME_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);

// 候选人列表筛选状态持久化Key（sessionStorage，会话内有效）
const LIST_STATE_STORAGE_KEY = 'candidateListState';

interface MultiFiltersState {
  jd_ids: string[];
  departments: string[];
  stages: string[];
  screening_results: string[];
  first_interview_results: string[];
  second_interview_results: string[];
  third_interview_results: string[];
  offer_statuses: string[];
}

interface SavedListState {
  filters?: CandidateListParams;
  multiFilters?: MultiFiltersState;
  startDate?: string | null;
  endDate?: string | null;
}

const loadSavedListState = (): SavedListState | null => {
  try {
    const saved = sessionStorage.getItem(LIST_STATE_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('解析候选人列表保存状态失败', e);
  }
  return null;
};

// 流程进展选项
const STAGES = [
  { value: '简历筛选', label: '简历筛选' },
  { value: '一面', label: '一面' },
  { value: '二面', label: '二面' },
  { value: '三面', label: '三面' },
  { value: '谈薪&背调', label: '谈薪&背调' },
  { value: '终止流程', label: '终止流程' },
];

// 结果选项（简历筛选、一面、二面）
const RESULT_OPTIONS = [
  { value: '待处理', label: '待处理' },
  { value: '待定', label: '待定' },
  { value: '通过', label: '通过' },
  { value: '不通过', label: '不通过' },
];

// OFFER状态选项
const OFFER_OPTIONS = [
  { value: '待发放', label: '待发放' },
  { value: '已发放', label: '已发放' },
  { value: '已回签', label: '已回签' },
  { value: '已拒绝', label: '已拒绝' },
  { value: '自主放弃', label: '自主放弃' },
];

// 格式化日期时间
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 流程进展标签颜色
const getStageVariant = (stage: string): 'info' | 'default' | 'warning' | 'destructive' => {
  const variantMap: Record<string, 'info' | 'default' | 'warning' | 'destructive'> = {
    '简历筛选': 'info',
    '一面': 'default',
    '二面': 'default',
    '三面': 'default',
    '谈薪&背调': 'warning',
    '终止流程': 'destructive',
  };
  return variantMap[stage] || 'info';
};

// 结果标签颜色
const getResultVariant = (result: string): 'info' | 'success' | 'destructive' | 'warning' => {
  const variantMap: Record<string, 'info' | 'success' | 'destructive' | 'warning'> = {
    '待处理': 'info',
    '待定': 'warning',
    '通过': 'success',
    '不通过': 'destructive',
    '淘汰': 'destructive',
  };
  return variantMap[result] || 'info';
};

// OFFER状态标签颜色
const getOfferVariant = (status: string): 'info' | 'warning' | 'success' | 'destructive' => {
  const variantMap: Record<string, 'info' | 'warning' | 'success' | 'destructive'> = {
    '待发放': 'info',
    '已发放': 'warning',
    '已回签': 'success',
    '已拒绝': 'destructive',
    '自主放弃': 'destructive',
  };
  return variantMap[status] || 'info';
};

// AI评分颜色（按比例，与圆环一致）
const getScoreColorByRatio = (actual: number | undefined, total: number = 120): string => {
  if (!actual || !total) return '#909399';
  const percentage = (actual / total) * 100;
  if (percentage >= 80) return '#22c55e';  // green
  if (percentage >= 60) return '#3b82f6';  // blue
  if (percentage >= 40) return '#f59e0b';  // amber
  return '#ef4444';  // red
};

export function CandidateListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUserStore();
  const { departmentNames: DEPARTMENTS } = useDepartments();

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 轮询定时器
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 筛选条件（初始化时尝试从sessionStorage恢复，URL stage参数优先级最高）
  const [filters, setFilters] = useState<CandidateListParams>(() => {
    const stageParam = searchParams.get('stage');
    const saved = loadSavedListState();
    if (saved?.filters) {
      // URL有stage参数 且 与保存的不一致：使用URL参数，但保留page_size
      if (stageParam && saved.filters.stage !== stageParam) {
        return {
          keyword: '',
          start_date: '',
          end_date: '',
          jd_id: '',
          department: '',
          stage: stageParam,
          screening_result: '',
          first_interview_result: '',
          second_interview_result: '',
          third_interview_result: '',
          offer_status: '',
          page: 1,
          page_size: saved.filters.page_size || 20,
        };
      }
      return saved.filters;
    }
    return {
      keyword: '',
      start_date: '',
      end_date: '',
      jd_id: '',
      department: '',
      stage: stageParam || '',
      screening_result: '',
      first_interview_result: '',
      second_interview_result: '',
      third_interview_result: '',
      offer_status: '',
      page: 1,
      page_size: 20,
    };
  });

  // 多选筛选状态（同样支持从sessionStorage恢复）
  const [multiFilters, setMultiFilters] = useState<MultiFiltersState>(() => {
    const stageParam = searchParams.get('stage');
    const saved = loadSavedListState();
    if (saved?.multiFilters) {
      if (
        stageParam &&
        (saved.multiFilters.stages.length !== 1 || saved.multiFilters.stages[0] !== stageParam)
      ) {
        return {
          jd_ids: [],
          departments: [],
          stages: [stageParam],
          screening_results: [],
          first_interview_results: [],
          second_interview_results: [],
          third_interview_results: [],
          offer_statuses: [],
        };
      }
      return saved.multiFilters;
    }
    return {
      jd_ids: [],
      departments: [],
      stages: stageParam ? [stageParam] : [],
      screening_results: [],
      first_interview_results: [],
      second_interview_results: [],
      third_interview_results: [],
      offer_statuses: [],
    };
  });

  // 日期状态（用于DatePicker组件），同样从sessionStorage恢复
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    const stageParam = searchParams.get('stage');
    const saved = loadSavedListState();
    if (stageParam && saved?.filters?.stage !== stageParam) return undefined;
    return saved?.startDate ? new Date(saved.startDate) : undefined;
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    const stageParam = searchParams.get('stage');
    const saved = loadSavedListState();
    if (stageParam && saved?.filters?.stage !== stageParam) return undefined;
    return saved?.endDate ? new Date(saved.endDate) : undefined;
  });

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);

  // 下拉选项
  const [jdList, setJdList] = useState<JDForSelect[]>([]);
  const [interviewerList, setInterviewerList] = useState<UserInfo[]>([]);

  // 选择状态
  const [selectedRows, setSelectedRows] = useState<Candidate[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 添加候选人弹窗
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    jd_id: '',
    screening_owner_id: '',
  });
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 删除确认弹窗
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; candidate: Candidate | null }>({
    open: false,
    candidate: null,
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 批量删除确认弹窗
  const [batchDeleteDialog, setBatchDeleteDialog] = useState(false);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  // 人才储备确认弹窗
  const [talentPoolDialog, setTalentPoolDialog] = useState(false);
  const [talentPoolLoading, setTalentPoolLoading] = useState(false);

  // 权限判断：HR或CEO可以执行管理操作
  const isHR = user?.role === 'HR' || user?.role === 'CEO';

  // 加载JD列表
  const loadJDList = async () => {
    try {
      const res = await getJDListForSelect();
      setJdList(res.items || []);
    } catch (error) {
      console.error('加载JD列表失败:', error);
    }
  };

  // 加载用户列表（简历筛选负责人可选择所有人）
  const loadInterviewerList = async () => {
    try {
      const res = await getUserList();
      setInterviewerList(res || []);
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  };

  // 加载候选人列表
  const loadCandidateList = useCallback(async (isPolling = false) => {
    if (!isPolling) {
      setLoading(true);
    }
    try {
      const params: CandidateListParams = {
        page: filters.page,
        page_size: filters.page_size,
        keyword: filters.keyword,
        start_date: filters.start_date,
        end_date: filters.end_date,
        jd_id: filters.jd_id,
        // 多选参数以逗号分隔传递
        jd_ids: multiFilters.jd_ids.length > 0 ? multiFilters.jd_ids.join(',') : '',
        departments: multiFilters.departments.length > 0 ? multiFilters.departments.join(',') : '',
        stages: multiFilters.stages.length > 0 ? multiFilters.stages.join(',') : '',
        screening_results: multiFilters.screening_results.length > 0 ? multiFilters.screening_results.join(',') : '',
        first_interview_results: multiFilters.first_interview_results.length > 0 ? multiFilters.first_interview_results.join(',') : '',
        second_interview_results: multiFilters.second_interview_results.length > 0 ? multiFilters.second_interview_results.join(',') : '',
        third_interview_results: multiFilters.third_interview_results.length > 0 ? multiFilters.third_interview_results.join(',') : '',
        offer_statuses: multiFilters.offer_statuses.length > 0 ? multiFilters.offer_statuses.join(',') : '',
      };

      const response = await getCandidateList(params);
      setData(response.items || []);
      setTotal(response.total || 0);

      // 检查是否有未解析完成的候选人
      const hasUnparsed = (response.items || []).some((item: Candidate) => !item.is_parsed);
      if (hasUnparsed && !pollingTimerRef.current) {
        // 启动轮询，每3秒刷新一次
        pollingTimerRef.current = setInterval(() => {
          loadCandidateList(true);
        }, 3000);
      } else if (!hasUnparsed && pollingTimerRef.current) {
        // 全部解析完成，停止轮询
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    } catch (error) {
      console.error('加载候选人列表失败:', error);
      if (!isPolling) {
        showToast('加载候选人列表失败', 'error');
      }
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, [filters, multiFilters]);

  // 初次加载
  useEffect(() => {
    loadJDList();
    loadInterviewerList();
  }, []);

  // 筛选条件变化时加载数据
  useEffect(() => {
    loadCandidateList();
  }, [loadCandidateList]);

  // 组件销毁时清理轮询定时器
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, []);

  // 持久化筛选与分页状态到sessionStorage，用于从详情页返回时恢复
  useEffect(() => {
    try {
      const state: SavedListState = {
        filters,
        multiFilters,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      };
      sessionStorage.setItem(LIST_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('保存候选人列表状态失败', e);
    }
  }, [filters, multiFilters, startDate, endDate]);

  // 更新筛选条件
  const updateFilter = (key: keyof CandidateListParams, value: string | number) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key !== 'page' && key !== 'page_size' ? 1 : (key === 'page' ? value as number : prev.page),
    }));
  };

  // 处理日期变化
  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    updateFilter('start_date', date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '');
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
    updateFilter('end_date', date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '');
  };

  // 重置筛选条件
  const handleReset = () => {
    sessionStorage.removeItem(LIST_STATE_STORAGE_KEY);
    setStartDate(undefined);
    setEndDate(undefined);
    setFilters({
      keyword: '',
      start_date: '',
      end_date: '',
      jd_id: '',
      department: '',
      stage: '',
      screening_result: '',
      first_interview_result: '',
      second_interview_result: '',
      third_interview_result: '',
      offer_status: '',
      page: 1,
      page_size: 20,
    });
    setMultiFilters({
      jd_ids: [],
      departments: [],
      stages: [],
      screening_results: [],
      first_interview_results: [],
      second_interview_results: [],
      third_interview_results: [],
      offer_statuses: [],
    });
  };

  // 选择行
  const handleSelectRow = (candidate: Candidate, checked: boolean) => {
    if (checked) {
      setSelectedRows((prev) => [...prev, candidate]);
    } else {
      setSelectedRows((prev) => prev.filter((r) => r.id !== candidate.id));
    }
  };

  // 全选/取消全选
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedRows([...data]);
    } else {
      setSelectedRows([]);
    }
  };

  // 更新全选状态
  useEffect(() => {
    if (data.length > 0 && selectedRows.length === data.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedRows, data]);

  // 查看详情
  const handleView = (id: number) => {
    navigate(`/candidate/detail/${id}`);
  };

  // 编辑
  const handleEdit = (id: number) => {
    navigate(`/candidate/detail/${id}?edit=true`);
  };

  // 查看简历
  const handleDownloadResume = (candidate: Candidate) => {
    if (!candidate.resume_file_path) {
      showToast('暂无简历文件', 'warning');
      return;
    }
    window.open(`/${candidate.resume_file_path}`, '_blank');
  };

  // 删除
  const handleDelete = (candidate: Candidate) => {
    setDeleteDialog({ open: true, candidate });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.candidate) return;

    setDeleteLoading(true);
    try {
      await deleteCandidate(deleteDialog.candidate.id);
      showToast('删除成功');
      setDeleteDialog({ open: false, candidate: null });
      loadCandidateList();
    } catch (error) {
      console.error('删除失败:', error);
      showToast('删除失败', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedRows.length === 0) {
      showToast('请选择要删除的候选人', 'warning');
      return;
    }
    setBatchDeleteDialog(true);
  };

  const handleBatchDeleteConfirm = async () => {
    setBatchDeleteLoading(true);
    try {
      await Promise.all(selectedRows.map((row) => deleteCandidate(row.id)));
      showToast('删除成功');
      setSelectedRows([]);
      setBatchDeleteDialog(false);
      loadCandidateList();
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast('删除失败', 'error');
    } finally {
      setBatchDeleteLoading(false);
    }
  };

  // 添加到人才储备
  const handleAddToTalentPool = () => {
    if (selectedRows.length === 0) {
      showToast('请选择要添加到人才储备库的候选人', 'warning');
      return;
    }
    setTalentPoolDialog(true);
  };

  const handleTalentPoolConfirm = async () => {
    setTalentPoolLoading(true);
    try {
      const candidateIds = selectedRows.map((row) => row.id);
      const res = await addToTalentPool(candidateIds);

      if (res.failed > 0) {
        showToast(`成功添加 ${res.success} 人，${res.failed} 人已在人才库中或添加失败`, 'warning');
      } else {
        showToast(`成功添加 ${res.success} 人到人才储备库`);
      }
      setSelectedRows([]);
      setTalentPoolDialog(false);
    } catch (error) {
      console.error('添加到人才储备库失败:', error);
      showToast('添加到人才储备库失败', 'error');
    } finally {
      setTalentPoolLoading(false);
    }
  };

  // 导出列表
  const handleExportList = async () => {
    try {
      showToast('正在导出...');

      const params: { candidate_ids?: string; jd_id?: number; stage?: string } = {};

      // 如果有选中的候选人，优先导出选中的
      if (selectedRows.length > 0) {
        params.candidate_ids = selectedRows.map((row) => row.id).join(',');
      } else {
        // 否则按筛选条件导出
        if (filters.jd_id) params.jd_id = Number(filters.jd_id);
        if (filters.stage) params.stage = filters.stage;
      }

      const blob = await exportCandidateList(params);

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `候选人列表_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      showToast('导出失败', 'error');
    }
  };

  // 文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      return ALLOWED_RESUME_EXTENSIONS.has(ext);
    });
    const invalidFiles = files.filter((file) => !validFiles.includes(file));

    if (invalidFiles.length > 0) {
      showToast('仅支持上传 PDF、DOC、DOCX 格式的简历', 'warning');
    }

    setResumeFiles(validFiles);
  };

  // 提交添加候选人
  const handleSubmitAdd = async () => {
    if (!addForm.jd_id) {
      showToast('请选择JD', 'warning');
      return;
    }
    if (!addForm.screening_owner_id) {
      showToast('请选择简历筛选负责人', 'warning');
      return;
    }
    if (resumeFiles.length === 0) {
      showToast('请至少选择一个简历文件', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('jd_id', addForm.jd_id);
      formData.append('screening_owner_id', addForm.screening_owner_id);
      resumeFiles.forEach((file) => {
        formData.append('resume_files', file);
      });

      const res = await addCandidates(formData);

      const result = res?.data ?? {};
      const successCount = result.success ?? resumeFiles.length;
      const failedCount = result.failed ?? 0;
      if (failedCount > 0) {
        showToast(`成功添加 ${successCount} 个候选人，失败 ${failedCount} 个`, 'warning');
      } else {
        showToast(`成功添加 ${successCount} 个候选人`);
      }

      // 重置表单
      setShowAddDialog(false);
      setAddForm({ jd_id: '', screening_owner_id: '' });
      setResumeFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadCandidateList();
    } catch (error) {
      console.error('添加失败:', error);
      showToast('添加失败，请重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
      {/* 页面标题 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-900">候选人管理</h1>
      </div>

      {/* 筛选卡片 */}
      <Card className="flex-shrink-0">
        <CardContent className="py-3">
          {/* 筛选条件 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={filters.keyword || ''}
                onChange={(e) => updateFilter('keyword', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadCandidateList()}
                placeholder="搜索候选人姓名/职位"
                className="pl-9 h-8 text-sm text-gray-600"
              />
            </div>

            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={handleStartDateChange}
              onEndDateChange={handleEndDateChange}
              startPlaceholder="开始日期"
              endPlaceholder="结束日期"
            />

            <MultiSelectCombobox
              label="应聘职位"
              options={jdList.map((jd) => ({ label: `${jd.id} - ${jd.job_title}`, value: String(jd.id) }))}
              value={multiFilters.jd_ids}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, jd_ids: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个职位</span>
              )}
              placeholder="搜索职位..."
            />

            <MultiSelectCombobox
              label="所属部门"
              options={DEPARTMENTS.map((dept) => ({ label: dept, value: dept }))}
              value={multiFilters.departments}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, departments: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个部门</span>
              )}
              placeholder="搜索部门..."
            />

            <MultiSelectCombobox
              label="流程进展"
              options={STAGES}
              value={multiFilters.stages}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, stages: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个流程</span>
              )}
              placeholder="搜索流程..."
            />

            <MultiSelectCombobox
              label="简历筛选"
              options={RESULT_OPTIONS}
              value={multiFilters.screening_results}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, screening_results: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个结果</span>
              )}
              placeholder="搜索结果..."
            />

            <MultiSelectCombobox
              label="一面面试"
              options={RESULT_OPTIONS}
              value={multiFilters.first_interview_results}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, first_interview_results: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个结果</span>
              )}
              placeholder="搜索结果..."
            />

            <MultiSelectCombobox
              label="二面面试"
              options={RESULT_OPTIONS}
              value={multiFilters.second_interview_results}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, second_interview_results: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个结果</span>
              )}
              placeholder="搜索结果..."
            />

            <MultiSelectCombobox
              label="三面面试"
              options={RESULT_OPTIONS}
              value={multiFilters.third_interview_results}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, third_interview_results: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个结果</span>
              )}
              placeholder="搜索结果..."
            />

            <MultiSelectCombobox
              label="OFFER"
              options={OFFER_OPTIONS}
              value={multiFilters.offer_statuses}
              onChange={(val) => {
                setMultiFilters((prev) => ({ ...prev, offer_statuses: val }));
                setFilters((prev) => ({ ...prev, page: 1 }));
              }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个状态</span>
              )}
              placeholder="搜索状态..."
            />

            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮区 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {isHR && (
            <button
              className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleBatchDelete}
              disabled={selectedRows.length === 0}
            >
              <Trash2 className="w-3.5 h-3.5" />
              批量删除
            </button>
          )}
          {isHR && (
            <button
              className="px-3 py-1.5 text-sm border border-amber-400 text-amber-600 rounded-md hover:bg-amber-50 transition-colors flex items-center gap-1 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAddToTalentPool}
              disabled={selectedRows.length === 0}
            >
              <Archive className="w-3.5 h-3.5" />
              +人才储备
            </button>
          )}
          <button
            className="px-3 py-1.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
            onClick={handleExportList}
          >
            <Download className="w-3.5 h-3.5" />
            导出列表
          </button>
        </div>
        <div>
          {isHR && (
            <button
              className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1 whitespace-nowrap shadow-sm shadow-black/5"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              添加候选人
            </button>
          )}
        </div>
      </div>

      {/* 数据表格 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="pt-4 pb-4 flex-1 flex flex-col min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <div className="relative overflow-auto flex-1 min-h-0">
                <Table className="min-w-[1700px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px] min-w-[50px] sticky left-0 bg-gray-50 z-20 align-middle">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectAll}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </div>
                      </TableHead>
                      <TableHead className="w-[100px] min-w-[100px] sticky left-[50px] bg-gray-50 z-20 whitespace-nowrap">序号</TableHead>
                      <TableHead className="w-[120px] min-w-[120px] sticky left-[150px] bg-gray-50 z-20 whitespace-nowrap border-r">候选人姓名</TableHead>
                      <TableHead className="w-[120px] min-w-[120px] whitespace-nowrap">所属部门</TableHead>
                      <TableHead className="w-[140px] min-w-[140px] whitespace-nowrap">应聘职位</TableHead>
                      <TableHead className="w-[100px] min-w-[100px] whitespace-nowrap">当前负责人</TableHead>
                      <TableHead className="w-[100px] min-w-[100px] whitespace-nowrap">当前流程</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">简历筛选</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">一面</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">二面</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap">三面</TableHead>
                      <TableHead className="w-[90px] min-w-[90px] whitespace-nowrap">OFFER</TableHead>
                      <TableHead className="w-[60px] min-w-[60px] whitespace-nowrap">入职</TableHead>
                      <TableHead className="w-[100px] min-w-[100px] whitespace-nowrap">AI简历评分</TableHead>
                      <TableHead className="w-[160px] min-w-[160px] whitespace-nowrap">简历添加时间</TableHead>
                      <TableHead className="w-[240px] min-w-[240px] sticky right-0 bg-gray-50 z-20 whitespace-nowrap border-l">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={16} className="text-center py-12 text-gray-500">
                          暂无数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.map((candidate) => (
                        <TableRow key={candidate.id}>
                          <TableCell className="py-2 sticky left-0 bg-white z-10 align-middle">
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={selectedRows.some((r) => r.id === candidate.id)}
                                onChange={(e) => handleSelectRow(candidate, e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-2 sticky left-[50px] bg-white z-10 whitespace-nowrap">
                            {candidate.candidate_number || '-'}
                          </TableCell>
                          <TableCell className="py-2 sticky left-[150px] bg-white z-10 border-r whitespace-nowrap">
                            {candidate.is_parsed ? (
                              <button
                                className="text-blue-600 hover:text-blue-700 hover:underline text-left"
                                onClick={() => handleView(candidate.id)}
                              >
                                {candidate.name || '-'}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                                <span className="text-xs">解析中...</span>
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{candidate.department || '-'}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{candidate.job_title || '-'}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.current_stage === '终止流程' ? '-' : (candidate.current_stage_owner_name || '-')}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.current_stage ? (
                              <Badge variant={getStageVariant(candidate.current_stage)}>
                                {candidate.current_stage}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.screening_result ? (
                              <Badge variant={getResultVariant(candidate.screening_result)}>
                                {candidate.screening_result}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.first_interview_result ? (
                              <Badge variant={getResultVariant(candidate.first_interview_result)}>
                                {candidate.first_interview_result === '不通过' ? '淘汰' : candidate.first_interview_result}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.second_interview_result ? (
                              <Badge variant={getResultVariant(candidate.second_interview_result)}>
                                {candidate.second_interview_result === '不通过' ? '淘汰' : candidate.second_interview_result}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.third_interview_result ? (
                              <Badge variant={getResultVariant(candidate.third_interview_result)}>
                                {candidate.third_interview_result === '不通过' ? '淘汰' : candidate.third_interview_result}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.offer_status ? (
                              <Badge variant={getOfferVariant(candidate.offer_status)}>
                                {candidate.offer_status}
                              </Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {candidate.is_onboarded ? '是' : '否'}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {!candidate.is_parsed ? (
                              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                            ) : (
                              <span>
                                <span style={{ color: getScoreColorByRatio(candidate.ai_score_total, 120), fontWeight: 'bold' }}>
                                  {candidate.ai_score_total || '-'}
                                </span>
                                <span className="text-gray-400"> / 120</span>
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {formatDateTime(candidate.created_at)}
                          </TableCell>
                          <TableCell className="py-2 sticky right-0 bg-white z-10 border-l">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <button
                                className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleView(candidate.id)}
                                disabled={!candidate.is_parsed}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                查看
                              </button>
                              <button
                                className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
                                onClick={() => handleDownloadResume(candidate)}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                查看简历
                              </button>
                              {isHR && (
                                <button
                                  className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleEdit(candidate.id)}
                                  disabled={!candidate.is_parsed}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                  编辑
                                </button>
                              )}
                              {isHR && (
                                <button
                                  className="px-2 py-1 text-sm text-red-600 rounded hover:bg-red-50 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                  onClick={() => handleDelete(candidate)}
                                  disabled={!candidate.is_parsed}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  删除
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {total > 0 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={filters.page || 1}
                    pageSize={filters.page_size || 20}
                    total={total}
                    onPageChange={(page) => updateFilter('page', page)}
                    onPageSizeChange={(pageSize) => {
                      setFilters((prev) => ({
                        ...prev,
                        page: 1,
                        page_size: pageSize,
                      }));
                    }}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 添加候选人弹窗 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>添加候选人</DialogTitle>
            <DialogDescription>
              选择JD和简历筛选负责人，上传简历文件
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择JD</label>
              <SearchableSelect
                options={jdList.map((jd) => ({
                  value: String(jd.id),
                  label: `${jd.id} - ${jd.job_title}`,
                }))}
                value={addForm.jd_id}
                onValueChange={(value) => setAddForm((prev) => ({ ...prev, jd_id: value }))}
                placeholder="请选择JD"
                searchPlaceholder="搜索JD..."
                emptyText="无匹配JD"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择简历文件（支持多选）</label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-w-[96px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </Button>
                <span className="text-sm text-gray-500">
                  {resumeFiles.length > 0 ? `已选择 ${resumeFiles.length} 个文件` : '未选择任何文件'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">选择简历筛选负责人</label>
              <SearchableSelect
                options={interviewerList.map((user) => ({
                  value: String(user.id),
                  label: `${user.id}-${user.real_name || user.username}${user.department ? `（${user.department}）` : ''}`,
                }))}
                value={addForm.screening_owner_id}
                onValueChange={(value) => setAddForm((prev) => ({ ...prev, screening_owner_id: value }))}
                placeholder="请选择负责人"
                searchPlaceholder="搜索ID、姓名或部门"
                emptyText="无匹配负责人"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSubmitAdd} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, candidate: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除候选人 "{deleteDialog.candidate?.name}" 吗？删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, candidate: null })}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认弹窗 */}
      <Dialog open={batchDeleteDialog} onOpenChange={setBatchDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selectedRows.length} 个候选人吗？删除后无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDeleteConfirm} disabled={batchDeleteLoading}>
              {batchDeleteLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 人才储备确认弹窗 */}
      <Dialog open={talentPoolDialog} onOpenChange={setTalentPoolDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加到人才储备库</DialogTitle>
            <DialogDescription>
              确定要将选中的 {selectedRows.length} 个候选人添加到人才储备库吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTalentPoolDialog(false)}>
              取消
            </Button>
            <Button onClick={handleTalentPoolConfirm} disabled={talentPoolLoading}>
              {talentPoolLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              确定添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-2">
          <div className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm ${
            toast.type === 'success' ? 'bg-green-600' :
            toast.type === 'error' ? 'bg-red-600' : 'bg-yellow-600'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
