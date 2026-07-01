"use client";

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  FileText,
  Sparkles,
  ListTodo,
  Bell,
  FileSearch,
  Calendar,
  Handshake,
  Users,
  Archive,
  Settings,
  BookOpen,
  LogOut,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  User,
  Network,
} from "lucide-react";
import { useUserStore } from "../../stores/userStore";

type MenuItem = {
  name: string;
  href: string;
  icon?: React.ReactNode;
};

type NavItem = MenuItem & {
  children?: MenuItem[];
};

interface MenuProps {
  children: React.ReactNode;
  items: MenuItem[];
  isCollapsed: boolean;
  defaultOpen?: boolean;
}

// 角色中英文映射
const roleMap: Record<string, string> = {
  '面试官': 'Interviewer',
  'CEO': 'CEO',
  'HR': 'HR',
};

const translateRole = (role: string | undefined): string => {
  if (!role) return '';
  return roleMap[role] || role;
};

const Menu = ({ children, items, isCollapsed, defaultOpen = false }: MenuProps) => {
  const [isOpened, setIsOpened] = useState(defaultOpen);
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = items.some(item => location.pathname === item.href || location.pathname.startsWith(item.href + '/'));

  useEffect(() => {
    if (isActive && !isCollapsed) {
      setIsOpened(true);
    }
  }, [isActive, isCollapsed]);

  if (isCollapsed) {
    return (
      <div className="relative group">
        <button
          className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors duration-150 ${
            isActive
              ? "bg-blue-50 text-blue-600"
              : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
          }`}
        >
          <div className="flex items-center">{children}</div>
        </button>
        <div className="absolute left-full top-0 ml-1 hidden group-hover:block z-50">
          <div className="bg-white rounded-lg shadow-lg border py-1.5 min-w-[140px]">
            {items.map((item, idx) => (
              <button
                key={idx}
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-x-2 px-3 py-2 text-sm transition-colors duration-150 ${
                  location.pathname === item.href
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.icon && <span className="text-gray-600">{item.icon}</span>}
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors duration-150 ${
          isActive && !isOpened
            ? "bg-blue-50 text-blue-600"
            : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
        }`}
        onClick={() => setIsOpened((v) => !v)}
        aria-expanded={isOpened}
      >
        <div className="flex items-center gap-x-2">{children}</div>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpened ? "rotate-180" : ""}`}
        />
      </button>

      {isOpened && (
        <ul className="ml-4 pl-2 text-sm font-normal mt-1">
          {items.map((item, idx) => (
            <li key={idx}>
              <button
                onClick={() => navigate(item.href)}
                className={`w-full flex items-center gap-x-2 p-2 rounded-lg transition-colors duration-150 ${
                  location.pathname === item.href || location.pathname.startsWith(item.href + '/')
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                }`}
              >
                {item.icon && <span className="text-gray-600">{item.icon}</span>}
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface SidebarProps {
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
}

export const Sidebar = ({ onLogout, isCollapsed, onToggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUserStore();

  const setIsCollapsed = onToggleCollapse;

  const navigation: NavItem[] = [
    {
      href: "/statistics",
      name: "数据统计",
      icon: <BarChart3 className="w-5 h-5" />,
    },
  ];

  const jdSubMenu: MenuItem[] = [
    { name: "JD生成", href: "/jd/generate", icon: <Sparkles className="w-4 h-4" /> },
    { name: "JD管理", href: "/jd/manage", icon: <ListTodo className="w-4 h-4" /> },
  ];

  const todoSubMenu: MenuItem[] = [
    { name: "简历待筛选", href: "/todo/resume-screening", icon: <FileSearch className="w-4 h-4" /> },
    { name: "待面试", href: "/todo/interview", icon: <Calendar className="w-4 h-4" /> },
    { name: "谈薪&背调", href: "/todo/salary-negotiation", icon: <Handshake className="w-4 h-4" /> },
  ];

  const otherNavigation: NavItem[] = [
    {
      href: "/candidate/list",
      name: "候选人管理",
      icon: <Users className="w-5 h-5" />,
    },
    {
      href: "/talent-pool",
      name: "人才储备",
      icon: <Archive className="w-5 h-5" />,
    },
    (user?.role === 'HR' || user?.role === 'CEO')
      ? {
          href: "/system-manage",
          name: "系统管理",
          icon: <Settings className="w-5 h-5" />,
        }
      : {
          href: "/profile",
          name: "个人信息",
          icon: <User className="w-5 h-5" />,
        },
    {
      href: "/recruitment-log",
      name: "招聘日志",
      icon: <BookOpen className="w-5 h-5" />,
    },
  ];

  const navsFooter: MenuItem[] = [];

  const isMenuActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const handleNavigate = (href: string) => {
    if (href !== '#') {
      navigate(href);
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 h-full bg-white transition-all duration-300 z-40 ${
        isCollapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex flex-col h-full">
        {/* 用户信息 + 折叠按钮 */}
        <div className={`${isCollapsed ? "px-2 py-3" : "px-3 py-3"}`}>
          <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-x-2"}`}>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-medium flex-shrink-0">
              {user?.name?.charAt(0) || user?.username?.charAt(0) || <User className="w-4 h-4" />}
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <span className="block text-gray-700 text-sm font-medium truncate">
                    {user?.name || user?.username}
                  </span>
                  <span className="block text-gray-400 text-xs">{translateRole(user?.role)}</span>
                </div>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  title="收起菜单"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="mt-2 w-full flex items-center justify-center p-1 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="展开菜单"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 导航菜单 */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="text-sm font-normal space-y-4">
            {navigation.map((item, idx) => (
              <li key={idx}>
                <button
                  onClick={() => handleNavigate(item.href)}
                  className={`w-full flex items-center gap-x-2 p-2 rounded-lg transition-colors duration-150 ${
                    isMenuActive(item.href)
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                  } ${isCollapsed ? "justify-center" : ""}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <span className={isMenuActive(item.href) ? "text-blue-600" : "text-gray-600"}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span>{item.name}</span>}
                </button>
              </li>
            ))}

            <li>
              <Menu items={jdSubMenu} isCollapsed={isCollapsed} defaultOpen={true}>
                <FileText className={`w-5 h-5 ${
                  jdSubMenu.some(item => isMenuActive(item.href)) ? "text-blue-600" : "text-gray-600"
                }`} />
                {!isCollapsed && <span>JD生成与管理</span>}
              </Menu>
            </li>

            <li>
              <Menu items={todoSubMenu} isCollapsed={isCollapsed}>
                <Bell className={`w-5 h-5 ${
                  todoSubMenu.some(item => isMenuActive(item.href)) ? "text-blue-600" : "text-gray-600"
                }`} />
                {!isCollapsed && <span>我的待办</span>}
              </Menu>
            </li>

            {otherNavigation.map((item, idx) => (
              <li key={idx}>
                <button
                  onClick={() => handleNavigate(item.href)}
                  className={`w-full flex items-center gap-x-2 p-2 rounded-lg transition-colors duration-150 ${
                    isMenuActive(item.href)
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                  } ${isCollapsed ? "justify-center" : ""}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <span className={isMenuActive(item.href) ? "text-blue-600" : "text-gray-600"}>
                    {item.icon}
                  </span>
                  {!isCollapsed && <span>{item.name}</span>}
                </button>
              </li>
            ))}
          </ul>

          {/* 底部菜单 */}
          <div className="pt-3 mt-3">
            <ul className="text-sm font-normal space-y-2">
              {navsFooter.map((item, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => handleNavigate(item.href)}
                    className={`w-full flex items-center gap-x-2 p-2 rounded-lg transition-colors duration-150 text-gray-600 hover:bg-gray-50 active:bg-gray-100 ${
                      isCollapsed ? "justify-center" : ""
                    }`}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <span className="text-gray-600">{item.icon}</span>
                    {!isCollapsed && <span>{item.name}</span>}
                  </button>
                </li>
              ))}

              <li>
                <button
                  onClick={onLogout}
                  className={`w-full flex items-center gap-x-2 p-2 rounded-lg transition-colors duration-150 text-red-500 hover:bg-red-50 active:bg-red-100 ${
                    isCollapsed ? "justify-center" : ""
                  }`}
                  title={isCollapsed ? "退出登录" : undefined}
                >
                  <LogOut className="w-5 h-5" />
                  {!isCollapsed && <span>退出登录</span>}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
