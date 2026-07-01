"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  Line,
  LineChart,
  Tooltip,
  Legend,
} from "recharts";
import {
  Sparkles,
  GraduationCap,
  Briefcase,
  Users,
  CalendarClock,
  Loader2,
  UserCircle2,
  School,
  TrendingUp,
  BarChart3,
  Workflow,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ChartContainer } from "../components/ui/chart";
import { CandidateProfile } from "../api/statistics";

// 饼图扇区配色
const PIE_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#94a3b8"];
const CHART_MIN_H = "min-h-[220px]";
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" } as const;

interface CardBoxProps {
  title: string;
  icon: React.ReactNode;
  delay?: number;
  loading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}

// 统一卡片外壳（含加载态/空态）
function CardBox({ title, icon, delay = 0, loading, isEmpty, children }: CardBoxProps) {
  return (
    <motion.div
      className="min-w-0 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className="h-full flex flex-col">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 min-h-0">
          {loading ? (
            <div className={`flex items-center justify-center h-full ${CHART_MIN_H}`}>
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : isEmpty ? (
            <div className={`flex items-center justify-center h-full ${CHART_MIN_H} text-slate-400 text-sm`}>
              暂无数据
            </div>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// 饼图卡（学历/求职状态/性别/院校层次/阶段）
function PieCard({
  title,
  icon,
  data,
  loading,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  data: { name: string; count: number }[];
  loading: boolean;
  delay?: number;
}) {
  const chartData = data.map((d, i) => ({ ...d, fill: PIE_COLORS[i % PIE_COLORS.length] }));
  const total = chartData.reduce((s, d) => s + d.count, 0);
  return (
    <CardBox title={title} icon={icon} delay={delay} loading={loading} isEmpty={total === 0}>
      <ChartContainer config={{}} className={`h-full ${CHART_MIN_H} w-full`}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="count"
            nameKey="name"
            innerRadius="45%"
            outerRadius="72%"
            paddingAngle={2}
            strokeWidth={1}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [
              `${value} 人 (${total ? ((value / total) * 100).toFixed(1) : 0}%)`,
              name,
            ]}
            contentStyle={TOOLTIP_STYLE}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(val: any) => <span className="text-xs text-slate-600">{val}</span>}
          />
        </PieChart>
      </ChartContainer>
    </CardBox>
  );
}

// 纵向柱状图卡（AI得分率/工作年限/年龄）
function BarCard({
  title,
  icon,
  data,
  loading,
  color,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  data: { range: string; count: number }[];
  loading: boolean;
  color: string;
  delay?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <CardBox title={title} icon={icon} delay={delay} loading={loading} isEmpty={total === 0}>
      <ChartContainer config={{}} className={`h-full ${CHART_MIN_H} w-full`}>
        <BarChart data={data} margin={{ top: 18, right: 12, left: -12, bottom: 2 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="range" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(value: any) => [`${value} 人`, "人数"]} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={color} barSize={40}>
            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </CardBox>
  );
}

// 折线图卡（新增趋势）
function LineCard({
  title,
  icon,
  data,
  loading,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  data: { month: string; count: number }[];
  loading: boolean;
  delay?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <CardBox title={title} icon={icon} delay={delay} loading={loading} isEmpty={total === 0}>
      <ChartContainer config={{}} className={`h-full ${CHART_MIN_H} w-full`}>
        <LineChart data={data} margin={{ top: 18, right: 18, left: -12, bottom: 2 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} tick={{ fontSize: 11, fill: "#64748b" }} />
          <Tooltip formatter={(value: any) => [`${value} 人`, "新增"]} contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }}>
            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: "#334155", fontWeight: 600 }} />
          </Line>
        </LineChart>
      </ChartContainer>
    </CardBox>
  );
}

// 横向条形图卡（职位候选人排行）
function HBarCard({
  title,
  icon,
  data,
  loading,
  color,
  delay,
}: {
  title: string;
  icon: React.ReactNode;
  data: { name: string; count: number }[];
  loading: boolean;
  color: string;
  delay?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <CardBox title={title} icon={icon} delay={delay} loading={loading} isEmpty={total === 0}>
      <ChartContainer config={{}} className={`h-full ${CHART_MIN_H} w-full`}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 26, left: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} hide />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            width={96}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v: any) => (typeof v === "string" && v.length > 8 ? v.slice(0, 8) + "…" : v)}
          />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(value: any) => [`${value} 人`, "候选人"]} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} fill={color} barSize={12}>
            <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </CardBox>
  );
}

// 概览指标
function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-slate-50 px-3 py-2.5">
      <span className="text-lg font-semibold text-slate-900 leading-tight">{value}</span>
      <span className="text-xs text-slate-500 mt-0.5">{label}</span>
      {sub ? <span className="text-[10px] text-slate-400">{sub}</span> : null}
    </div>
  );
}

interface Props {
  data: CandidateProfile | null;
  loading: boolean;
}

export function CandidateProfilePanel({ data, loading }: Props) {
  const total = data?.total ?? 0;
  const ts = data?.top_school;
  const pct = (n?: number) => (total && n ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-1">
      {/* 概览指标条 */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <Metric label="候选人总数" value={loading ? "-" : total} />
            <Metric label="已AI评分" value={loading ? "-" : data?.ai_score.scored_count ?? 0} />
            <Metric label="平均得分率" value={loading ? "-" : `${data?.ai_score.avg_rate ?? 0}%`} />
            <Metric label="985 占比" value={loading ? "-" : `${pct(ts?.is_985)}%`} sub={loading ? undefined : `${ts?.is_985 ?? 0} 人`} />
            <Metric label="211 占比" value={loading ? "-" : `${pct(ts?.is_211)}%`} sub={loading ? undefined : `${ts?.is_211 ?? 0} 人`} />
            <Metric label="双一流占比" value={loading ? "-" : `${pct(ts?.is_double_first_class)}%`} sub={loading ? undefined : `${ts?.is_double_first_class ?? 0} 人`} />
          </div>
        </CardContent>
      </Card>

      {/* 图表网格（全部等大，一行两个） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LineCard
          title="候选人新增趋势（按月）"
          icon={<TrendingUp className="w-4 h-4 text-indigo-500" />}
          data={data?.trend ?? []}
          loading={loading}
          delay={0.05}
        />
        <HBarCard
          title="职位候选人排行（Top 10）"
          icon={<BarChart3 className="w-4 h-4 text-cyan-500" />}
          data={data?.job_ranking ?? []}
          loading={loading}
          color="#06b6d4"
          delay={0.1}
        />
        <PieCard
          title="学历分布"
          icon={<GraduationCap className="w-4 h-4 text-violet-500" />}
          data={data?.education ?? []}
          loading={loading}
          delay={0.15}
        />
        <PieCard
          title="院校层次分布"
          icon={<School className="w-4 h-4 text-amber-500" />}
          data={data?.school_tier ?? []}
          loading={loading}
          delay={0.2}
        />
        <PieCard
          title="求职状态分布"
          icon={<Briefcase className="w-4 h-4 text-emerald-500" />}
          data={data?.demographics.work_status ?? []}
          loading={loading}
          delay={0.25}
        />
        <PieCard
          title="当前阶段分布（在途）"
          icon={<Workflow className="w-4 h-4 text-teal-500" />}
          data={data?.stage_dist ?? []}
          loading={loading}
          delay={0.3}
        />
        <BarCard
          title="工作年限分布"
          icon={<CalendarClock className="w-4 h-4 text-orange-500" />}
          data={data?.demographics.work_years ?? []}
          loading={loading}
          color="#f59e0b"
          delay={0.35}
        />
        <BarCard
          title="年龄分布"
          icon={<UserCircle2 className="w-4 h-4 text-rose-500" />}
          data={data?.demographics.age ?? []}
          loading={loading}
          color="#f43f5e"
          delay={0.4}
        />
        <PieCard
          title="性别分布"
          icon={<Users className="w-4 h-4 text-sky-500" />}
          data={data?.demographics.gender ?? []}
          loading={loading}
          delay={0.45}
        />
        <BarCard
          title="AI得分分布（得分率）"
          icon={<Sparkles className="w-4 h-4 text-blue-500" />}
          data={data?.ai_score.buckets ?? []}
          loading={loading}
          color="#3b82f6"
          delay={0.5}
        />
      </div>
    </div>
  );
}

export default CandidateProfilePanel;
