import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Briefcase,
  Users,
  FileText,
  Calendar,
  Mail,
  FileCode,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    label: '대시보드',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: '펀드 관리',
    href: '/funds',
    icon: Briefcase,
  },
  {
    label: '투자자 관리',
    href: '/investors',
    icon: Users,
  },
  {
    label: '출자의향',
    href: '/commitments',
    icon: FileText,
  },
]

const operationItems = [
  {
    label: '일정 관리',
    href: '/schedules',
    icon: Calendar,
  },
  {
    label: '문서 관리',
    href: '/documents',
    icon: FileCode,
  },
  {
    label: '이메일 로그',
    href: '/email-logs',
    icon: Mail,
  },
  {
    label: '템플릿 관리',
    href: '/templates',
    icon: FileText,
  },
]

const settingItems = [
  {
    label: '사용자 설정',
    href: '/settings/users',
    icon: Settings,
  },
]

export default function Layout() {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()
  const [operationOpen, setOperationOpen] = useState(true)
  const [settingOpen, setSettingOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initials = profile?.name
    ? profile.name.slice(0, 2).toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() ?? 'U'

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 min-w-64 bg-sidebar text-sidebar-foreground h-full overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60 font-medium uppercase tracking-wider">
            VC Fund Operations
          </p>
          <h1 className="text-sidebar-foreground font-bold text-lg leading-tight mt-1">
            펀드 운영 시스템
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}

          {/* Operations group */}
          <div className="pt-2">
            <button
              onClick={() => setOperationOpen((v) => !v)}
              className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
            >
              운영
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform',
                  operationOpen && 'rotate-180'
                )}
              />
            </button>
            {operationOpen &&
              operationItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
          </div>

          {/* Settings group */}
          {profile?.role === 'admin' && (
            <div className="pt-2">
              <button
                onClick={() => setSettingOpen((v) => !v)}
                className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
              >
                설정
                <ChevronDown
                  className={cn(
                    'h-3 w-3 transition-transform',
                    settingOpen && 'rotate-180'
                  )}
                />
              </button>
              {settingOpen &&
                settingItems.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
            </div>
          )}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sidebar-foreground text-sm font-medium truncate">
                {profile?.name ?? '사용자'}
              </p>
              <p className="text-sidebar-foreground/60 text-xs truncate">
                {profile?.email}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            로그아웃
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}
