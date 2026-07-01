'use client';

import { useState } from 'react';
import { UserManagePage } from './UserManagePage';
import { DepartmentManagePage } from './DepartmentManagePage';

export function SystemManagePage() {
  const [activeTab, setActiveTab] = useState<'user' | 'department'>('user');

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 标题 + Tab 切换 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-900">系统管理</h1>
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setActiveTab('user')}
            className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'user'
                ? 'bg-white text-blue-600 shadow-sm font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            用户管理
          </button>
          <button
            onClick={() => setActiveTab('department')}
            className={`px-3.5 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'department'
                ? 'bg-white text-blue-600 shadow-sm font-medium'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            部门管理
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0">
        {activeTab === 'user' ? <UserManagePage embedded /> : <DepartmentManagePage embedded />}
      </div>
    </div>
  );
}

export default SystemManagePage;
