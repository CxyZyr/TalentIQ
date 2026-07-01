import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RotateCcw, Eye, MessageSquare, Play, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { DateRangePicker } from '../components/ui/date-range-picker';
import { format, parse } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Pagination } from '../components/ui/pagination';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { getMyTodos, TodoItem } from '../api/todo';
import {
  getInterviewQuestions,
  generateInterviewQuestions,
  modifyInterviewQuestions,
  toggleQuestionAsked,
  InterviewQuestion,
} from '../api/interview';
import { useDepartments } from '../hooks/useDepartments';

// 格式化日期时间
const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  return dateStr.replace('T', ' ').slice(0, 16);
};

export function InterviewListPage() {
  const navigate = useNavigate();
  const { departmentNames: DEPARTMENT_OPTIONS } = useDepartments();
  const [loading, setLoading] = useState(false);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 筛选条件
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    keyword: '',
  });
  const [selectedJdIds, setSelectedJdIds] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // AI辅助弹窗
  const [aiDialogVisible, setAiDialogVisible] = useState(false);
  const [currentCandidate, setCurrentCandidate] = useState<TodoItem | null>(null);
  const [focusPoints, setFocusPoints] = useState('');
  const [modifyInput, setModifyInput] = useState('');
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [questionsGeneratedTime, setQuestionsGeneratedTime] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState<number | null>(null);

  // 问题统计
  const questionStats = useMemo(() => {
    return {
      total: interviewQuestions.length,
      high: interviewQuestions.filter((q) => q.priority === '高').length,
      medium: interviewQuestions.filter((q) => q.priority === '中' || !q.priority).length,
      low: interviewQuestions.filter((q) => q.priority === '低').length,
    };
  }, [interviewQuestions]);

  // 从待办列表中提取JD选项（避免依赖JD列表接口的权限问题）
  const jdOptions = useMemo(() => {
    const map = new Map<string, string>();
    todoList.forEach((item) => {
      if (item.jd_id && item.jd_title) {
        map.set(String(item.jd_id), item.jd_title);
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ label, value }));
  }, [todoList]);

  // 前端筛选
  const filteredListAll = useMemo(() => {
    let list = todoList;

    // 关键词筛选
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      list = list.filter(
        (item) =>
          (item.candidate_name && item.candidate_name.toLowerCase().includes(kw)) ||
          (item.jd_title && item.jd_title.toLowerCase().includes(kw))
      );
    }

    // 职位筛选（多选）
    if (selectedJdIds.length > 0) {
      list = list.filter((item) => selectedJdIds.includes(String(item.jd_id)));
    }

    // 部门筛选（多选）
    if (selectedDepartments.length > 0) {
      list = list.filter((item) => item.department && selectedDepartments.includes(item.department));
    }

    // 轮次筛选（多选）
    if (selectedStages.length > 0) {
      list = list.filter((item) => item.stage && selectedStages.includes(item.stage));
    }

    // 面试结果筛选（多选）
    if (selectedResults.length > 0) {
      list = list.filter((item) => item.interview_result && selectedResults.includes(item.interview_result));
    }

    // 时间筛选
    if (filters.startDate) {
      list = list.filter((item) => {
        if (!item.created_at) return false;
        return item.created_at >= filters.startDate;
      });
    }
    if (filters.endDate) {
      list = list.filter((item) => {
        if (!item.created_at) return false;
        return item.created_at.slice(0, 10) <= filters.endDate;
      });
    }

    return list;
  }, [todoList, filters, selectedJdIds, selectedDepartments, selectedStages, selectedResults]);

  // 分页后的列表
  const filteredList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredListAll.slice(start, end);
  }, [filteredListAll, currentPage, pageSize]);

  // 待面试数量
  const pendingCount = useMemo(() => {
    return todoList.filter((item) => !item.interview_status || item.interview_status === '待面试').length;
  }, [todoList]);

  // AI评分颜色（按比例，与候选人列表一致）
  const getScoreColorByRatio = (actual: number | undefined, total: number): string => {
    if (!actual || !total) return '#909399';
    const percentage = (actual / total) * 100;
    if (percentage >= 80) return '#22c55e';
    if (percentage >= 60) return '#3b82f6';
    if (percentage >= 40) return '#f59e0b';
    return '#ef4444';
  };

  // 获取结果Badge样式
  const getResultVariant = (resultValue?: string): 'green' | 'red' | 'amber' | 'gray' => {
    if (resultValue === '通过') return 'green';
    if (resultValue === '淘汰') return 'red';
    if (resultValue === '待定') return 'amber';
    return 'gray';
  };

  // 获取优先级Badge样式
  const getPriorityVariant = (priority?: string): 'red' | 'amber' | 'gray' => {
    if (priority === '高') return 'red';
    if (priority === '中') return 'amber';
    return 'gray';
  };

  // 加载待办列表
  const loadTodoList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyTodos({});
      setTodoList(res['面试'] || []);
    } catch (error) {
      console.error('加载待办列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 更新筛选条件
  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  // 重置筛选
  const handleReset = () => {
    setFilters({
      startDate: '',
      endDate: '',
      keyword: '',
    });
    setSelectedJdIds([]);
    setSelectedDepartments([]);
    setSelectedStages([]);
    setSelectedResults([]);
    setCurrentPage(1);
    loadTodoList();
  };

  // 查看详情
  const handleView = (row: TodoItem) => {
    navigate(`/candidate/detail/${row.candidate_id}`);
  };

  // 开始面试
  const handleStartInterview = (row: TodoItem) => {
    navigate(`/todo/interview/room/${row.candidate_id}?stage=${encodeURIComponent(row.stage || '')}`);
  };

  // 面试评价
  const handleEvaluate = (row: TodoItem) => {
    navigate(`/todo/interview/process/${row.candidate_id}?stage=${encodeURIComponent(row.stage || '')}`);
  };

  // AI辅助
  const handleAIAssist = async (row: TodoItem) => {
    setCurrentCandidate(row);
    setAiDialogVisible(true);
    setFocusPoints('');
    setModifyInput('');
    setInterviewQuestions([]);
    setQuestionsGeneratedTime('');
    setCurrentQuestionId(null);

    await loadInterviewQuestionsList(row.candidate_id, row.stage || '');
  };

  // 加载面试问题
  const loadInterviewQuestionsList = async (candidateId: number, stageValue: string) => {
    setLoadingQuestions(true);
    try {
      const res = await getInterviewQuestions(candidateId, stageValue);
      if (res && res.questions) {
        setCurrentQuestionId(res.id);
        setInterviewQuestions(
          res.questions.map((q) => ({
            ...q,
            asked: q.asked || false,
          }))
        );
        setQuestionsGeneratedTime(res.created_at ? res.created_at.replace('T', ' ').slice(0, 16) : '');
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          setInterviewQuestions([]);
          setCurrentQuestionId(null);
        } else {
          console.error('加载面试问题失败:', error);
        }
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  // 生成或修改面试问题
  const handleGenerateOrModifyQuestions = async () => {
    if (!currentCandidate) return;

    setGeneratingQuestions(true);
    try {
      let res;
      if (currentQuestionId) {
        res = await modifyInterviewQuestions(
          currentQuestionId,
          focusPoints,
          modifyInput || '请根据考察重点重新生成面试问题'
        );
      } else {
        res = await generateInterviewQuestions(currentCandidate.candidate_id, currentCandidate.stage || '');
      }

      if (res && res.questions) {
        setCurrentQuestionId(res.id || currentQuestionId);
        setInterviewQuestions(
          res.questions.map((q: InterviewQuestion) => ({
            ...q,
            asked: false,
          }))
        );
        setQuestionsGeneratedTime(new Date().toLocaleString('zh-CN'));
        showToast('面试问题生成成功');
      }
    } catch (error) {
      console.error('生成面试问题失败:', error);
      showToast('生成面试问题失败，请重试', 'error');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  // 切换问题的已提问/未提问状态
  const toggleAsked = async (idx: number) => {
    const newAsked = !interviewQuestions[idx].asked;
    // 乐观更新
    setInterviewQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, asked: newAsked } : q))
    );
    // 持久化到后端
    if (currentQuestionId) {
      try {
        await toggleQuestionAsked(currentQuestionId, idx, newAsked);
      } catch (error) {
        console.error('保存提问状态失败:', error);
        // 回滚
        setInterviewQuestions((prev) =>
          prev.map((q, i) => (i === idx ? { ...q, asked: !newAsked } : q))
        );
      }
    }
  };

  useEffect(() => {
    loadTodoList();
  }, [loadTodoList]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 页面标题 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-900">面试管理</h1>
      </div>

      {/* 筛选卡片 */}
      <Card className="flex-shrink-0">
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 关键词搜索 */}
            <div className="relative w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={filters.keyword}
                onChange={(e) => updateFilter('keyword', e.target.value)}
                placeholder="搜索姓名、职位"
                className="pl-9 h-8 text-sm text-gray-600"
              />
            </div>

            <DateRangePicker
              startDate={filters.startDate ? parse(filters.startDate, 'yyyy-MM-dd', new Date()) : undefined}
              endDate={filters.endDate ? parse(filters.endDate, 'yyyy-MM-dd', new Date()) : undefined}
              onStartDateChange={(date) => updateFilter('startDate', date ? format(date, 'yyyy-MM-dd') : '')}
              onEndDateChange={(date) => updateFilter('endDate', date ? format(date, 'yyyy-MM-dd') : '')}
              startPlaceholder="开始日期"
              endPlaceholder="结束日期"
            />

            {/* 应聘职位 */}
            <MultiSelectCombobox
              label="应聘职位"
              options={jdOptions}
              value={selectedJdIds}
              onChange={(val) => { setSelectedJdIds(val); setCurrentPage(1); }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个职位</span>
              )}
              placeholder="搜索职位..."
            />

            {/* 所属部门 */}
            <MultiSelectCombobox
              label="所属部门"
              options={DEPARTMENT_OPTIONS.map((dept) => ({ label: dept, value: dept }))}
              value={selectedDepartments}
              onChange={(val) => { setSelectedDepartments(val); setCurrentPage(1); }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个部门</span>
              )}
              placeholder="搜索部门..."
            />

            {/* 面试轮次 */}
            <MultiSelectCombobox
              label="面试轮次"
              options={[
                { label: '一面', value: '一面' },
                { label: '二面', value: '二面' },
                { label: '三面', value: '三面' },
              ]}
              value={selectedStages}
              onChange={(val) => { setSelectedStages(val); setCurrentPage(1); }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个轮次</span>
              )}
              placeholder="搜索轮次..."
            />

            {/* 面试结果 */}
            <MultiSelectCombobox
              label="面试结果"
              options={[
                { label: '待定', value: '待定' },
                { label: '通过', value: '通过' },
                { label: '淘汰', value: '淘汰' },
              ]}
              value={selectedResults}
              onChange={(val) => { setSelectedResults(val); setCurrentPage(1); }}
              renderItem={(option) => <span>{option.label}</span>}
              renderSelectedItem={(values) => (
                <span className="truncate text-sm">{values.length}个结果</span>
              )}
              placeholder="搜索结果..."
            />

            {/* 重置按钮 */}
            <button
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            {/* 刷新按钮 */}
            <button
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1 whitespace-nowrap"
              onClick={loadTodoList}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              刷新
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 统计信息 */}
      <div className="flex items-center justify-end flex-shrink-0">
        <div className="text-sm text-gray-500">
          共 <span className="font-medium text-gray-700">{pendingCount}</span> 个待面试
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
              <div className="relative overflow-x-auto flex-1">
                <Table className="min-w-[1400px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px] min-w-[100px] sticky left-0 bg-gray-50 z-20 whitespace-nowrap">序号</TableHead>
                      <TableHead className="w-[90px] min-w-[90px] sticky left-[100px] bg-gray-50 z-20 whitespace-nowrap border-r">候选人</TableHead>
                      <TableHead className="w-[120px] min-w-[120px] whitespace-nowrap">应聘职位</TableHead>
                      <TableHead className="w-[120px] min-w-[120px] whitespace-nowrap">所属部门</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap text-center">面试轮次</TableHead>
                      <TableHead className="w-[130px] min-w-[130px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          专业能力
                          <Badge variant="turbo" size="sm">AI</Badge>
                        </div>
                      </TableHead>
                      <TableHead className="w-[110px] min-w-[110px] whitespace-nowrap">专业能力(人工)</TableHead>
                      <TableHead className="w-[100px] min-w-[100px] whitespace-nowrap">个人素养</TableHead>
                      <TableHead className="w-[70px] min-w-[70px] whitespace-nowrap text-center">总分</TableHead>
                      <TableHead className="w-[80px] min-w-[80px] whitespace-nowrap text-center">面试结果</TableHead>
                      <TableHead className="w-[140px] min-w-[140px] whitespace-nowrap">面试时间</TableHead>
                      <TableHead className="w-[200px] min-w-[200px] sticky right-0 bg-gray-50 z-20 whitespace-nowrap border-l">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-12 text-gray-500">
                          暂无待面试记录
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredList.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell className="py-2 sticky left-0 bg-white z-10 whitespace-nowrap text-gray-500">
                            {row.candidate_number || '-'}
                          </TableCell>
                          <TableCell className="py-2 sticky left-[100px] bg-white z-10 border-r whitespace-nowrap font-medium">
                            {row.candidate_name || '-'}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{row.jd_title || '-'}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap">{row.department || '-'}</TableCell>
                          <TableCell className="py-2 whitespace-nowrap text-center">
                            <Badge variant="blue" size="sm">{row.stage}</Badge>
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {row.ai_work_ability_score ? (
                              <span>
                                <span style={{ color: getScoreColorByRatio(row.ai_work_ability_score, 80), fontWeight: 'bold' }}>
                                  {row.ai_work_ability_score}
                                </span>
                                <span className="text-gray-400"> / 80</span>
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {row.manual_work_ability_score ? (
                              <span>
                                <span style={{ color: getScoreColorByRatio(row.manual_work_ability_score, 80), fontWeight: 'bold' }}>
                                  {row.manual_work_ability_score}
                                </span>
                                <span className="text-gray-400"> / 80</span>
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap">
                            {row.personal_quality_score ? (
                              <span>
                                <span style={{ color: getScoreColorByRatio(row.personal_quality_score, 20), fontWeight: 'bold' }}>
                                  {row.personal_quality_score}
                                </span>
                                <span className="text-gray-400"> / 20</span>
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap text-center">
                            {row.total_score ? (
                              <span>
                                <span style={{ color: getScoreColorByRatio(row.total_score, 100), fontWeight: 'bold' }}>
                                  {row.total_score}
                                </span>
                                <span className="text-gray-400"> / 100</span>
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap text-center">
                            {row.interview_result ? (
                              <Badge variant={getResultVariant(row.interview_result)} size="sm">
                                {row.interview_result}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 whitespace-nowrap text-sm text-gray-500">
                            {formatDateTime(row.interview_time)}
                          </TableCell>
                          <TableCell className="py-2 sticky right-0 bg-white z-10 border-l">
                            <div className="flex items-center gap-1 whitespace-nowrap">
                              <button
                                className="px-2 py-1 text-sm text-gray-600 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
                                onClick={() => handleView(row)}
                                title="查看详情"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                查看
                              </button>
                              <button
                                className="px-2 py-1 text-sm text-amber-600 rounded hover:bg-amber-50 transition-colors flex items-center gap-1"
                                onClick={() => handleEvaluate(row)}
                                title="面试评价"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                评价
                              </button>
                              {row.interview_status !== '已完成' && (
                                <>
                                  <button
                                    className="px-2 py-1 text-sm text-blue-600 rounded hover:bg-blue-50 transition-colors flex items-center gap-1"
                                    onClick={() => handleStartInterview(row)}
                                    title="开始面试"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    面试
                                  </button>
                                  <button
                                    className="px-2 py-1 text-sm text-green-600 rounded hover:bg-green-50 transition-colors flex items-center gap-1"
                                    onClick={() => handleAIAssist(row)}
                                    title="AI辅助"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    AI
                                  </button>
                                </>
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
              {filteredListAll.length > 0 && (
                <div className="mt-6">
                  <Pagination
                    currentPage={currentPage}
                    pageSize={pageSize}
                    total={filteredListAll.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* AI辅助弹窗 */}
      <Dialog open={aiDialogVisible} onOpenChange={setAiDialogVisible}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>AI辅助面试</DialogTitle>
          </DialogHeader>

          <div className="flex gap-5 flex-1 overflow-hidden">
            {/* 左侧：输入区域 */}
            <div className="w-72 flex-shrink-0 flex flex-col gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="mb-2">
                  <span className="text-sm text-gray-500">候选人：</span>
                  <span className="text-sm font-medium">{currentCandidate?.candidate_name}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-500">应聘职位：</span>
                  <span className="text-sm font-medium">{currentCandidate?.jd_title}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">考察重点(可选)</label>
                <Textarea
                  value={focusPoints}
                  onChange={(e) => setFocusPoints(e.target.value)}
                  placeholder="每行一个考察重点，例如：&#10;技术深度&#10;项目经验&#10;沟通能力"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">修改需求</label>
                <Textarea
                  value={modifyInput}
                  onChange={(e) => setModifyInput(e.target.value)}
                  placeholder="请描述您希望如何调整面试问题"
                  rows={4}
                />
              </div>

              <Button
                onClick={handleGenerateOrModifyQuestions}
                disabled={generatingQuestions}
                className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm shadow-black/5"
              >
                {generatingQuestions ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : currentQuestionId ? (
                  '重新生成面试问题'
                ) : (
                  '生成面试问题'
                )}
              </Button>
            </div>

            {/* 右侧：面试问题集合 */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="flex justify-between items-center mb-4">
                <span className="font-semibold text-gray-800">面试问题集合</span>
                {questionsGeneratedTime && (
                  <span className="text-xs text-gray-400">生成时间: {questionsGeneratedTime}</span>
                )}
              </div>

              {/* 统计数据 */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1 text-center py-3 rounded-lg bg-blue-50">
                  <div className="text-2xl font-semibold text-blue-600">{questionStats.total}</div>
                  <div className="text-xs text-gray-500 mt-1">总问题数</div>
                </div>
                <div className="flex-1 text-center py-3 rounded-lg bg-red-50">
                  <div className="text-2xl font-semibold text-red-600">{questionStats.high}</div>
                  <div className="text-xs text-gray-500 mt-1">高优先级</div>
                </div>
                <div className="flex-1 text-center py-3 rounded-lg bg-amber-50">
                  <div className="text-2xl font-semibold text-amber-600">{questionStats.medium}</div>
                  <div className="text-xs text-gray-500 mt-1">中优先级</div>
                </div>
                <div className="flex-1 text-center py-3 rounded-lg bg-gray-100">
                  <div className="text-2xl font-semibold text-gray-600">{questionStats.low}</div>
                  <div className="text-xs text-gray-500 mt-1">低优先级</div>
                </div>
              </div>

              {/* 问题列表 */}
              <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {loadingQuestions ? (
                  <div className="flex justify-center items-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : interviewQuestions.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    暂无面试问题，请点击「生成面试问题」
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interviewQuestions.map((q, idx) => (
                      <div key={idx} className="p-3 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <div className="text-sm text-gray-800 leading-relaxed mb-2">
                              {idx + 1}. {q.question}
                            </div>
                            {q.reason && (
                              <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                                考察目的：{q.reason}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            <Badge variant={getPriorityVariant(q.priority)} size="sm">
                              {q.priority || '中'}优先级
                            </Badge>
                            <Badge
                              variant={q.asked ? 'green' : 'gray'}
                              size="sm"
                              className="cursor-pointer"
                              onClick={() => toggleAsked(idx)}
                            >
                              {q.asked ? '已提问' : '未提问'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
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

export default InterviewListPage;
