import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, RotateCcw } from 'lucide-react';
import { format, parse } from 'date-fns';
import { getRecruitmentLogs, RecruitmentLog } from '../api/recruitmentLog';
import { Card, CardContent } from '../components/ui/card';
import { DateRangePicker } from '../components/ui/date-range-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Pagination } from '../components/ui/pagination';

export function RecruitmentLogPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [allLogs, setAllLogs] = useState<RecruitmentLog[]>([]);

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stage, setStage] = useState('');

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 阶段选项
  const stageOptions = [
    { value: '简历筛选', label: '简历筛选' },
    { value: '一面', label: '一面' },
    { value: '二面', label: '二面' },
    { value: '三面', label: '三面' },
    { value: '谈薪&背调', label: '谈薪&背调' },
    { value: '流程终止', label: '流程终止' },
  ];

  // 加载日志数据
  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await getRecruitmentLogs({ page: 1, page_size: 1000 });
      setAllLogs(res.logs || []);
    } catch (error) {
      console.error('加载日志失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // 前端筛选
  const filteredLogs = useMemo(() => {
    let list = allLogs;

    // 关键词搜索
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter(item =>
        (item.candidate_name && item.candidate_name.toLowerCase().includes(kw)) ||
        (item.candidate_number && item.candidate_number.toLowerCase().includes(kw)) ||
        (item.operator && item.operator.toLowerCase().includes(kw)) ||
        (item.event && item.event.toLowerCase().includes(kw))
      );
    }

    // 阶段筛选
    if (stage) {
      list = list.filter(item => item.stage === stage);
    }

    // 时间筛选
    if (startDate) {
      list = list.filter(item => {
        if (!item.operation_time) return false;
        return item.operation_time.slice(0, 10) >= startDate;
      });
    }
    if (endDate) {
      list = list.filter(item => {
        if (!item.operation_time) return false;
        return item.operation_time.slice(0, 10) <= endDate;
      });
    }

    return list;
  }, [allLogs, keyword, stage, startDate, endDate]);

  // 分页数据
  const totalCount = filteredLogs.length;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredLogs.slice(start, end);
  }, [filteredLogs, currentPage, pageSize]);

  // 格式化日期时间
  const formatDateTime = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return dateStr.replace('T', ' ').slice(0, 19);
  };

  // 重置
  const handleReset = () => {
    setKeyword('');
    setStartDate('');
    setEndDate('');
    setStage('');
    setCurrentPage(1);
  };

  // 跳转到候选人详情
  const goToCandidate = (log: RecruitmentLog) => {
    if (log.candidate_id) {
      navigate(`/candidate/detail/${log.candidate_id}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-800">招聘日志</h1>
      </div>

      {/* 筛选条件 */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-nowrap">
            {/* 关键词搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索候选人/操作人"
                className="pl-9 pr-3 py-1.5 w-44 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <DateRangePicker
              startDate={startDate ? parse(startDate, 'yyyy-MM-dd', new Date()) : undefined}
              endDate={endDate ? parse(endDate, 'yyyy-MM-dd', new Date()) : undefined}
              onStartDateChange={(date) => setStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
              onEndDateChange={(date) => setEndDate(date ? format(date, 'yyyy-MM-dd') : '')}
              startPlaceholder="开始日期"
              endPlaceholder="结束日期"
            />

            {/* 阶段筛选 */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 whitespace-nowrap">阶段</label>
              <Select value={stage || 'all'} onValueChange={(val) => setStage(val === 'all' ? '' : val)}>
                <SelectTrigger className="w-28 h-8 text-sm text-gray-600">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {stageOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 重置按钮 */}
            <button
              onClick={handleReset}
              className="h-8 px-3 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 日志列表 */}
      <div className="flex-1 bg-white rounded-md border border-gray-200 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-16 text-center">序号</TableHead>
                <TableHead className="w-28">用户</TableHead>
                <TableHead className="min-w-[300px]">操作事件</TableHead>
                <TableHead className="w-44 text-center">操作时间</TableHead>
                <TableHead className="w-28 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                      <span className="ml-2 text-gray-500">加载中...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-gray-400">
                    暂无日志记录
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log, index) => (
                  <TableRow key={log.id} className="hover:bg-gray-50">
                    <TableCell className="text-center text-gray-500">
                      {(currentPage - 1) * pageSize + index + 1}
                    </TableCell>
                    <TableCell className="text-gray-700">{log.operator || '-'}</TableCell>
                    <TableCell className="text-gray-700">{log.event || '-'}</TableCell>
                    <TableCell className="text-center text-gray-500 whitespace-nowrap">
                      {formatDateTime(log.operation_time)}
                    </TableCell>
                    <TableCell className="text-center">
                      {log.candidate_id ? (
                        <button
                          onClick={() => goToCandidate(log)}
                          className="text-gray-700 hover:underline text-sm flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          查看详情
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {totalCount > 0 && (
          <div className="px-4 py-3">
            <Pagination
              currentPage={currentPage}
              pageSize={pageSize}
              total={totalCount}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default RecruitmentLogPage;
