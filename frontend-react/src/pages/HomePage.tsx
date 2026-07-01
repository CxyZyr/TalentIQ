import React from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Users,
  FileText,
  BarChart3,
  LogOut,
  Sparkles
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useUserStore } from '../stores/userStore';

interface HomePageProps {
  onLogout: () => void;
}

export function HomePage({ onLogout }: HomePageProps) {
  const { user } = useUserStore();

  const modules = [
    {
      icon: FileText,
      title: 'JD管理',
      description: '职位描述的创建、编辑和发布',
      color: 'from-blue-500 to-blue-600',
      shadowColor: 'shadow-blue-500/20',
    },
    {
      icon: Users,
      title: '候选人管理',
      description: '简历筛选、候选人跟踪',
      color: 'from-green-500 to-green-600',
      shadowColor: 'shadow-green-500/20',
    },
    {
      icon: BarChart3,
      title: '面试评估',
      description: 'AI辅助面试评估与分析',
      color: 'from-purple-500 to-purple-600',
      shadowColor: 'shadow-purple-500/20',
    },
    {
      icon: Building2,
      title: '数据统计',
      description: '招聘数据统计与报表',
      color: 'from-orange-500 to-orange-600',
      shadowColor: 'shadow-orange-500/20',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto flex-1">
      {/* 顶部导航 */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">TalentIQ</h1>
              <p className="text-xs text-slate-500">智能招聘系统</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user?.name || user?.username}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              退出登录
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* 欢迎区 */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            欢迎回来，{user?.name || user?.username}
          </h2>
          <p className="text-slate-600">
            开始您今天的招聘工作吧
          </p>
        </motion.div>

        {/* 功能模块 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module, index) => {
            const Icon = module.icon;
            return (
              <motion.div
                key={module.title}
                className={`bg-white rounded-2xl p-6 shadow-lg ${module.shadowColor} hover:shadow-xl transition-all duration-300 cursor-pointer group`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -4 }}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-4 shadow-lg ${module.shadowColor} group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {module.title}
                </h3>
                <p className="text-sm text-slate-500">
                  {module.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* 快速统计 */}
        <motion.div
          className="mt-12 bg-white rounded-2xl p-8 shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h3 className="text-xl font-semibold text-slate-900 mb-6">快速统计</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">12</p>
              <p className="text-sm text-slate-500 mt-1">在招职位</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">48</p>
              <p className="text-sm text-slate-500 mt-1">待处理简历</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">8</p>
              <p className="text-sm text-slate-500 mt-1">本周面试</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-orange-600">3</p>
              <p className="text-sm text-slate-500 mt-1">待发Offer</p>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

export default HomePage;
