import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import FundListPage from '@/pages/FundListPage'
import FundDetailPage from '@/pages/FundDetailPage'
import CommitmentListPage from '@/pages/CommitmentListPage'
import CommitmentDetailPage from '@/pages/CommitmentDetailPage'
import InvestorListPage from '@/pages/InvestorListPage'
import ScheduleListPage from '@/pages/ScheduleListPage'
import DocumentListPage from '@/pages/DocumentListPage'
import EmailLogPage from '@/pages/EmailLogPage'
import TemplatePage from '@/pages/TemplatePage'
import UserSettingsPage from '@/pages/UserSettingsPage'
import IntakeFormPage from '@/pages/IntakeFormPage'
import { Toaster } from '@/components/ui/toaster'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* 비로그인 공개 출자의향서 페이지 */}
        <Route path="/intake/:fundCode" element={<IntakeFormPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/funds" element={<FundListPage />} />
          <Route path="/funds/:id" element={<FundDetailPage />} />
          <Route path="/commitments" element={<CommitmentListPage />} />
          <Route path="/commitments/:id" element={<CommitmentDetailPage />} />
          <Route path="/investors" element={<InvestorListPage />} />
          <Route path="/schedules" element={<ScheduleListPage />} />
          <Route path="/documents" element={<DocumentListPage />} />
          <Route path="/email-logs" element={<EmailLogPage />} />
          <Route path="/templates" element={<TemplatePage />} />
          <Route path="/settings/users" element={<UserSettingsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
