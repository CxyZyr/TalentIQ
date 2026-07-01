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
  Handshake,
  DollarSign,
  ShieldCheck,
  FileText,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
import { cn } from '../lib/utils';
import { useDepartments } from '../hooks/useDepartments';

// 谈薪状态标签类型
const getSalaryStatusVariant = (status?: string): string => {
  const map: Record<string, string> = {
    '待处理': 'gray',
    '进行中': 'amber',
    '已完成': 'green',
    '谈薪失败': 'red',
  };
  return map[status || ''] || 'gray';
};

// 背调状态标签类型
const getBackgroundCheckVariant = (status?: string): string => {
  const map: Record<string, string> = {
    '待处理': 'gray',
    '进行中': 'amber',
    '已完成': 'green',
  };
  return map[status || ''] || 'gray';
};

// OFFER状态标签类型
const getOfferStatusVariant = (status?: string): string => {
  const map: Record<string, string> = {
    '待发放': 'gray',
    '已发放': 'blue',
    '已回签': 'green',
    '已拒绝': 'red',
    '自主放弃': 'amber',
  };
  return map[status || ''] || 'gray';
};

// 扩展TodoItem以适配谈薪背调字段
interface SalaryTodoItem extends TodoItem {
  salary_status?: string;
  background_check_status?: string;
  is_onboarded?: boolean | string;
  job_title?: string;
}

// 谈薪背调卡片组件
interface SalaryNegotiationCardProps {
  item: SalaryTodoItem;
  onProcess: () => void;
  onViewDetail: () => void;
  index: number;
}

const SalaryNegotiationCard: React.FC<SalaryNegotiationCardProps> = ({
  item,
  onProcess,
  onViewDetail,
  index,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="w-full rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="p-6 pb-8">
        {/* 顶部标签区 */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-gray-50">
              {item.department || '未分配'}
            </Badge>
            {item.expected_salary && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                期望: {item.expected_salary}
              </Badge>
            )}
          </div>
          <span className="text-xs text-gray-400">
            #{item.candidate_number || item.candidate_id}
          </span>
        </div>

        {/* 主体内容 - 12列网格 */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 md:gap-x-6 items-center">
          {/* 左侧：头像和基本信息 */}
          <div className="md:col-span-3 flex flex-col">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 flex items-center justify-center rounded-lg text-white font-semibold text-lg",
                item.gender === '女'
                  ? 'bg-gradient-to-br from-pink-400 to-pink-600'
                  : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                {item.candidate_name?.charAt(0) || <User className="w-6 h-6" />}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{item.candidate_name || '-'}</p>
                <p className="text-sm text-gray-500">
                  {item.gender || '-'} · {item.age ? `${item.age}岁` : '-'} · {item.work_years ? `${item.work_years}年经验` : '-'}
                </p>
              </div>
            </div>
            <Button
              variant="link"
              className="p-0 h-auto justify-start mt-2 text-sm"
              onClick={onViewDetail}
            >
              查看详情
            </Button>
          </div>

          {/* 中间：状态信息 */}
          <div className="md:col-span-5 md:col-start-5 self-center">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-sm text-gray-500">应聘:</span>
              <span className="text-sm font-medium text-gray-900">{item.jd_title || item.job_title || '-'}</span>
            </div>

            {/* 状态标签区 */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 inline-block w-[48px] flex-shrink-0">谈薪:</span>
                <Badge
                  variant={getSalaryStatusVariant(item.salary_status) as any}
                  size="md"
                >
                  {item.salary_status || '待处理'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500">背调:</span>
                <Badge
                  variant={getBackgroundCheckVariant(item.background_check_status) as any}
                  size="md"
                >
                  {item.background_check_status || '待处理'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500">OFFER:</span>
                <Badge
                  variant={getOfferStatusVariant(item.offer_status) as any}
                  size="md"
                >
                  {item.offer_status || '待发放'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500">入职:</span>
                <Badge
                  variant={
                    (item.is_onboarded === true || item.is_onboarded === '是')
                      ? 'green' : 'gray'
                  }
                  size="md"
                >
                  {(item.is_onboarded === true || item.is_onboarded === '是') ? '是' : '否'}
                </Badge>
              </div>
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="md:col-span-3 flex flex-col md:items-end gap-3 self-center">
            <div className="flex items-center gap-2">
              <Handshake className="w-5 h-5 text-teal-500" />
              <span className="text-sm font-medium text-gray-700">谈薪&背调</span>
            </div>
            <Button
              onClick={onProcess}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              处理
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export function SalaryNegotiationPage() {
  const navigate = useNavigate();
  const { departmentNames: DEPARTMENTS } = useDepartments();

  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    jd_id: '',
    department: '',
    salary_status: '',
    background_check_status: '',
    offer_status: '',
  });

  // 分页
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
  });

  // 数据状态
  const [loading, setLoading] = useState(false);
  const [todoList, setTodoList] = useState<SalaryTodoItem[]>([]);

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
      const res = await getMyTodos({ stage_filter: '谈薪&背调' });
      const todos = res['谈薪&背调'] || [];
      setTodoList(todos.map((item: any) => ({
        ...item,
        job_title: item.jd_title || item.job_title || '-',
      })));
    } catch (error) {
      console.error('加载待办列表失败:', error);
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

    // 谈薪状态筛选
    if (filters.salary_status) {
      list = list.filter((item) => item.salary_status === filters.salary_status);
    }

    // 背调状态筛选
    if (filters.background_check_status) {
      list = list.filter((item) => item.background_check_status === filters.background_check_status);
    }

    // OFFER状态筛选
    if (filters.offer_status) {
      list = list.filter((item) => item.offer_status === filters.offer_status);
    }

    return list;
  }, [todoList, filters]);

  // 分页后的列表
  const filteredList = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    return filteredListAll.slice(start, end);
  }, [filteredListAll, pagination]);

  // 待处理计数
  const pendingCount = useMemo(() => {
    return todoList.filter(
      (item) => item.salary_status === '待处理' || item.background_check_status === '待处理'
    ).length;
  }, [todoList]);

  // 重置
  const handleReset = () => {
    setFilters({
      keyword: '',
      jd_id: '',
      department: '',
      salary_status: '',
      background_check_status: '',
      offer_status: '',
    });
    setPagination({ page: 1, pageSize: 10 });
    loadTodoList();
  };

  // 处理
  const handleProcess = (item: SalaryTodoItem) => {
    navigate(`/todo/salary-negotiation/process/${item.candidate_id}`);
  };

  // 查看详情
  const handleViewDetail = (item: SalaryTodoItem) => {
    navigate(`/candidate/detail/${item.candidate_id}`);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* 页面标题 */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">谈薪&背调</h1>
        {pendingCount > 0 && (
          <Badge variant="red" size="md">
            {pendingCount} 项待处理
          </Badge>
        )}
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
                onKeyDown={(e) => e.key === 'Enter' && setPagination((prev) => ({ ...prev, page: 1 }))}
                placeholder="姓名/职位关键词"
                className="pl-9 h-8 text-sm text-gray-600"
              />
            </div>

            <Select
              value={filters.jd_id || 'all'}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, jd_id: value === 'all' ? '' : value }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
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
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, department: value === 'all' ? '' : value }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
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

            <Select
              value={filters.salary_status || 'all'}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, salary_status: value === 'all' ? '' : value }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <SelectTrigger className="w-[130px] h-8 text-sm text-gray-600">
                <SelectValue placeholder="谈薪状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部谈薪</SelectItem>
                <SelectItem value="待处理">待处理</SelectItem>
                <SelectItem value="进行中">进行中</SelectItem>
                <SelectItem value="已完成">已完成</SelectItem>
                <SelectItem value="谈薪失败">谈薪失败</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.background_check_status || 'all'}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, background_check_status: value === 'all' ? '' : value }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            >
              <SelectTrigger className="w-[130px] h-8 text-sm text-gray-600">
                <SelectValue placeholder="背调状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部背调</SelectItem>
                <SelectItem value="待处理">待处理</SelectItem>
                <SelectItem value="进行中">进行中</SelectItem>
                <SelectItem value="已完成">已完成</SelectItem>
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
          共 <span className="font-medium text-gray-700">{filteredListAll.length}</span> 个待谈薪&背调
        </div>
      </div>

      {/* 卡片列表 */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Handshake className="w-12 h-12 text-gray-300 mb-3" />
            <p>暂无谈薪&背调待办</p>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {filteredList.map((item, index) => (
              <SalaryNegotiationCard
                key={item.id || item.candidate_id}
                item={item}
                index={index}
                onProcess={() => handleProcess(item)}
                onViewDetail={() => handleViewDetail(item)}
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
    </div>
  );
}
