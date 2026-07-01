"use client";

import React, { useState } from "react";
import { Sidebar } from "../ui/sidebar";

interface MainLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export function MainLayout({ children, onLogout }: MainLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-slate-50">
      <Sidebar onLogout={onLogout} isCollapsed={isCollapsed} onToggleCollapse={setIsCollapsed} />
      {/* 主内容区域 - 展开 w-56=224px / 收起 w-16=64px */}
      <main
        className={`transition-all duration-300 h-screen flex flex-col ${
          isCollapsed ? "ml-16" : "ml-56"
        }`}
      >
        <div className="px-6 pt-5 pb-4 flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}

export default MainLayout;
