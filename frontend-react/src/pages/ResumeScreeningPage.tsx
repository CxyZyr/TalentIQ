import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  RotateCcw,
  Loader2,
  User,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { DateRangePicker } from '../components/ui/date-range-picker';
import { Gauge } from '../components/ui/gauge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Pagination } from '../components/ui/pagination';
import { getMyTodos, TodoItem } from '../api/todo';
import { getJDListForSelect, JDForSelect } from '../api/candidate';
import { useDepartments } from '../hooks/useDepartments';
import { useToast } from '../components/ui/toast';

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


// 候选人卡片组件
interface CandidateCardProps {
  item: TodoItem;
  onViewResume: () => void;
  onScreening: () => void;
  index: number;
}

const CandidateCard: React.FC<CandidateCardProps> = ({
  item,
  onViewResume,
  onScreening,
  index,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="w-full rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="p-6">
        {/* 顶部标签区 */}
        <div className="flex justify-between items-start mb-4">
          <Badge variant="outline" className="bg-gray-50">
            {item.department || '未分配'}
          </Badge>
          <span className="text-xs text-gray-400">
            简历上传: {formatDateTime(item.resume_upload_time)}
          </span>
        </div>

        {/* 主体内容 - 12列网格 */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 md:gap-x-6 items-center">
          {/* 左侧：头像和基本信息 */}
          <div className="md:col-span-3 flex flex-col">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold text-xl">
                {item.candidate_name?.charAt(0) || <User className="w-7 h-7" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">{item.candidate_name || '-'}</p>
                <p className="text-sm text-gray-500">
                  {item.gender || '-'} · {item.age ? `${item.age}岁` : '-'} · {item.work_years ? `${item.work_years}年经验` : '-'}
                </p>
              </div>
            </div>
            <Button
              variant="link"
              className="p-0 h-auto justify-start mt-2 text-sm"
              onClick={onViewResume}
            >
              查看简历
            </Button>
          </div>

          {/* 中间：学历和职位信息 */}
          <div className="md:col-span-5">
            {/* 学历信息 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm text-gray-500">学历:</span>
              <span className="text-sm font-medium text-gray-900">
                {item.highest_education || '-'} · {item.school || '-'}
              </span>
              {item.is_985 && <Badge variant="red" size="sm">985</Badge>}
              {item.is_211 && <Badge variant="pink" size="sm">211</Badge>}
              {item.is_double_first_class && <Badge variant="green" size="sm">双一流</Badge>}
            </div>
            {/* 应聘职位 */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-500">应聘:</span>
              <span className="text-sm font-medium text-gray-900">{item.jd_title || '-'}</span>
            </div>
            {/* 硬性条件 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-gray-500">硬性条件:</span>
              <Badge variant={item.hard_requirements_passed ? "green" : "red"} size="md">
                {item.hard_requirements_passed ? '通过' : '不通过'}
              </Badge>
            </div>
            {/* 简述 - 悬停显示完整文本 */}
            <div className="group relative">
              <p className="text-sm text-gray-500 line-clamp-2 cursor-default">
                {item.summary || '暂无概况信息'}
              </p>
              {item.summary && item.summary.length > 80 && (
                <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block w-full max-w-md p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-sm text-gray-600">
                  {item.summary}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：评分和操作 */}
          <div className="md:col-span-4 flex flex-col md:items-end gap-3">
            {/* AI评分圆环 */}
            <Gauge
              size="large"
              value={item.ai_score_total || 0}
              maxValue={item.total_score_max || 120}
              label="AI简历评分"
            />
            {/* 筛选按钮 */}
            <Button
              onClick={onScreening}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              筛选
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export function ResumeScreeningPage() {
  const navigate = useNavigate();
  const { departmentNames: DEPARTMENTS } = useDepartments();

  // Toast
  const { showToast } = useToast();

  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    jd_id: '',
    department: '',
    start_date: '',
    end_date: '',
  });

  // 日期状态
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // 分页
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);

  // 下拉选项
  const [jdList, setJdList] = useState<JDForSelect[]>([]);

  // 加载JD列表
  const loadJDList = async () => {
    try {
      const res = await getJDListForSelect();
      setJdList(res.items || []);
    } catch (error) {
      console.error('加载JD列表失败:', error);
    }
  };

  // 加载待办列表
  const loadTodoList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyTodos({ stage_filter: '简历筛选' });
      setTodoList(res['简历筛选'] || []);
    } catch (error) {
      console.error('加载待办列表失败:', error);
      showToast('加载待办列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初次加载
  useEffect(() => {
    loadJDList();
    loadTodoList();
  }, [loadTodoList]);

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

    // 职位筛选
    if (filters.jd_id) {
      list = list.filter((item) => item.jd_id === Number(filters.jd_id));
    }

    // 部门筛选
    if (filters.department) {
      list = list.filter((item) => item.department === filters.department);
    }

    // 开始日期筛选
    if (filters.start_date) {
      list = list.filter((item) => {
        if (!item.resume_upload_time) return false;
        return item.resume_upload_time >= filters.start_date;
      });
    }

    // 结束日期筛选
    if (filters.end_date) {
      list = list.filter((item) => {
        if (!item.resume_upload_time) return false;
        return item.resume_upload_time.slice(0, 10) <= filters.end_date;
      });
    }

    return list;
  }, [todoList, filters]);

  // 分页后的列表
  const filteredList = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return filteredListAll.slice(start, end);
  }, [filteredListAll, pagination]);

  // 处理日期变化
  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    setFilters((prev) => ({
      ...prev,
      start_date: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '',
    }));
  };

  const handleEndDateChange = (date: Date | undefined) => {
    setEndDate(date);
    setFilters((prev) => ({
      ...prev,
      end_date: date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '',
    }));
  };

  // 筛选
  const handleFilter = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // 重置
  const handleReset = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setFilters({
      keyword: '',
      jd_id: '',
      department: '',
      start_date: '',
      end_date: '',
    });
    setPagination({ page: 1, pageSize: 10 });
    loadTodoList();
  };

  // 查看简历
  const handleViewResume = (item: TodoItem) => {
    if (item.resume_file_path) {
      const resumeUrl = item.resume_file_path.startsWith('/')
        ? item.resume_file_path
        : `/${item.resume_file_path}`;
      window.open(resumeUrl, '_blank');
    } else {
      showToast('暂无简历文件', 'warning');
    }
  };

  // 进入筛选详情页
  const handleScreening = (item: TodoItem) => {
    navigate(`/todo/resume-screening/${item.candidate_id}`);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 页面标题 */}
      <div className="flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-900">简历待筛选</h1>
      </div>

      {/* 筛选卡片 */}
      <Card className="flex-shrink-0">
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={filters.keyword}
                onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                placeholder="岗位/姓名关键词"
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

            <Select
              value={filters.jd_id || 'all'}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, jd_id: value === 'all' ? '' : value }))}
            >
              <SelectTrigger className="w-[280px] h-8 text-sm text-gray-600">
                <SelectValue placeholder="应聘职位" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部职位</SelectItem>
                {jdList.map((jd) => (
                  <SelectItem key={jd.id} value={String(jd.id)}>
                    {jd.job_title} - {jd.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.department || 'all'}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, department: value === 'all' ? '' : value }))}
            >
              <SelectTrigger className="w-[180px] h-8 text-sm text-gray-600">
                <SelectValue placeholder="所属部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部部门</SelectItem>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>

            <button
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
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
          共 <span className="font-medium text-gray-700">{filteredListAll.length}</span> 份待筛选简历
        </div>
      </div>

      {/* 候选人卡片列表 */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <User className="w-12 h-12 text-gray-300 mb-3" />
            <p>暂无待筛选简历</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {filteredList.map((item, index) => (
              <CandidateCard
                key={item.id}
                item={item}
                index={index}
                onViewResume={() => handleViewResume(item)}
                onScreening={() => handleScreening(item)}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {filteredListAll.length > 0 && !loading && (
          <div className="mt-4 pb-4">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              total={filteredListAll.length}
              onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
              onPageSizeChange={(pageSize) => setPagination({ page: 1, pageSize })}
            />
          </div>
        )}
      </div>

      {/* Toast 通知 */}
    </div>
  );
}
