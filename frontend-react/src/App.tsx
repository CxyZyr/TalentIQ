import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { JDGeneratePage } from './pages/JDGeneratePage';
import { JDManagePage } from './pages/JDManagePage';
import { JDEditPage } from './pages/JDEditPage';
import { CandidateListPage } from './pages/CandidateListPage';
import CandidateDetailPage from './pages/CandidateDetailPage';
import { RecruitmentLogPage } from './pages/RecruitmentLogPage';
import { SystemManagePage } from './pages/SystemManagePage';
import { TalentPoolPage } from './pages/TalentPoolPage';
import { ResumeScreeningPage } from './pages/ResumeScreeningPage';
import ResumeScreeningDetailPage from './pages/ResumeScreeningDetailPage';
import { InterviewListPage } from './pages/InterviewListPage';
import { InterviewProcessPage } from './pages/InterviewProcessPage';
import { InterviewRoomPage } from './pages/InterviewRoomPage';
import { SalaryNegotiationPage } from './pages/SalaryNegotiationPage';
import SalaryNegotiationProcessPage from './pages/SalaryNegotiationProcessPage';
import ProfilePage from './pages/ProfilePage';
import { MainLayout } from './components/layout/MainLayout';
import { GlobalRecordingIndicator } from './components/ui/global-recording-indicator';
import { useUserStore } from './stores/userStore';
import {
  FileSearch,
  Calendar,
  Archive,
  Settings,
  BookOpen,
} from 'lucide-react';

// 受保护路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useUserStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// 公开路由组件（已登录则跳转首页）
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useUserStore();

  if (isAuthenticated) {
    return <Navigate to="/statistics" replace />;
  }

  return <>{children}</>;
}

// 带布局的受保护路由
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useUserStore();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <ProtectedRoute>
      <MainLayout onLogout={handleLogout}>
        {children}
      </MainLayout>
    </ProtectedRoute>
  );
}

function App() {
  const handleLoginSuccess = () => {
    window.location.href = '/statistics';
  };

  return (
    <BrowserRouter>
      <GlobalRecordingIndicator />
      <Routes>
        {/* 登录页面 */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage onLoginSuccess={handleLoginSuccess} />
            </PublicRoute>
          }
        />

        {/* 数据统计 */}
        <Route
          path="/statistics"
          element={
            <ProtectedLayout>
              <StatisticsPage />
            </ProtectedLayout>
          }
        />

        {/* JD生成与管理 */}
        <Route
          path="/jd/generate"
          element={
            <ProtectedLayout>
              <JDGeneratePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/jd/manage"
          element={
            <ProtectedLayout>
              <JDManagePage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/jd/edit/:id"
          element={
            <ProtectedLayout>
              <JDEditPage />
            </ProtectedLayout>
          }
        />

        {/* 我的待办 */}
        <Route
          path="/todo/resume-screening"
          element={
            <ProtectedLayout>
              <ResumeScreeningPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/resume-screening/:id"
          element={
            <ProtectedLayout>
              <ResumeScreeningDetailPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/interview"
          element={
            <ProtectedLayout>
              <InterviewListPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/interview/process/:id"
          element={
            <ProtectedLayout>
              <InterviewProcessPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/interview/room/:id"
          element={
            <ProtectedLayout>
              <InterviewRoomPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/salary-negotiation"
          element={
            <ProtectedLayout>
              <SalaryNegotiationPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/todo/salary-negotiation/process/:id"
          element={
            <ProtectedLayout>
              <SalaryNegotiationProcessPage />
            </ProtectedLayout>
          }
        />

        {/* 候选人管理 */}
        <Route
          path="/candidate/list"
          element={
            <ProtectedLayout>
              <CandidateListPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/candidate/detail/:id"
          element={
            <ProtectedLayout>
              <CandidateDetailPage />
            </ProtectedLayout>
          }
        />

        {/* 人才储备 */}
        <Route
          path="/talent-pool"
          element={
            <ProtectedLayout>
              <TalentPoolPage />
            </ProtectedLayout>
          }
        />

        {/* 系统管理（用户管理 + 部门管理） */}
        <Route
          path="/system-manage"
          element={
            <ProtectedLayout>
              <SystemManagePage />
            </ProtectedLayout>
          }
        />

        {/* 个人信息 */}
        <Route
          path="/profile"
          element={
            <ProtectedLayout>
              <ProfilePage />
            </ProtectedLayout>
          }
        />

        {/* 招聘日志 */}
        <Route
          path="/recruitment-log"
          element={
            <ProtectedLayout>
              <RecruitmentLogPage />
            </ProtectedLayout>
          }
        />

        {/* 默认重定向 */}
        <Route path="/" element={<Navigate to="/statistics" replace />} />
        <Route path="*" element={<Navigate to="/statistics" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
