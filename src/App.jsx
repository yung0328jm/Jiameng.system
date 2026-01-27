import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Home from './pages/Home'
import EngineeringSchedule from './pages/EngineeringSchedule'
import Calendar from './pages/Calendar'
import VehicleInfo from './pages/VehicleInfo'
import Memo from './pages/Memo'
import CompanyActivities from './pages/CompanyActivities'
import DropdownManagement from './pages/DropdownManagement'
import UserManagement from './pages/UserManagement'
import ProjectDeficiencyTracking from './pages/ProjectDeficiencyTracking'
import PersonalPerformance from './pages/PersonalPerformance'
import ExchangeShop from './pages/ExchangeShop'
import Exchange from './pages/Exchange'
import MyBackpack from './pages/MyBackpack'
import CheckIn from './pages/CheckIn'
import TripReport from './pages/TripReport'
import LeaveApplication from './pages/LeaveApplication'
import { getAuthStatus, saveAuthStatus, clearAuthStatus } from './utils/authStorage'
import { initializeAdminUser } from './utils/storage'
import { isSupabaseEnabled, syncFromSupabase } from './utils/supabaseSync'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getAuthStatus())
  const [syncReady, setSyncReady] = useState(() => !isSupabaseEnabled())

  useEffect(() => {
    // 从本地存储恢复认证状态
    setIsAuthenticated(getAuthStatus())
    // 初始化默认管理者账户（如果不存在）
    initializeAdminUser()
  }, [])

  useEffect(() => {
    if (isAuthenticated && isSupabaseEnabled()) {
      setSyncReady(false)
      syncFromSupabase().finally(() => setSyncReady(true))
    } else {
      setSyncReady(true)
    }
  }, [isAuthenticated])

  const syncLoading = (
    <div className="min-h-screen flex items-center justify-center bg-charcoal">
      <p className="text-white">正在同步…</p>
    </div>
  )
  const withSync = (el) => (syncReady ? el : syncLoading)

  const handleLogin = () => {
    setIsAuthenticated(true)
    saveAuthStatus(true)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    clearAuthStatus()
    // 导航到登录页面
    window.location.href = '/login'
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
            <Navigate to="/dashboard" replace /> : 
            <Login onLogin={handleLogin} />
          } 
        />
        <Route 
          path="/register" 
          element={
            isAuthenticated ? 
            <Navigate to="/dashboard" replace /> : 
            <Register />
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            isAuthenticated ? 
            withSync(<Dashboard onLogout={handleLogout} />) : 
            <Navigate to="/login" replace />
          } 
        />
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} 
        />
        <Route path="/home" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="home" />) : <Navigate to="/login" replace />} />
        <Route path="/engineering-schedule" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="engineering" />) : <Navigate to="/login" replace />} />
        <Route path="/calendar" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="calendar" />) : <Navigate to="/login" replace />} />
        <Route path="/vehicle-info" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="vehicle" />) : <Navigate to="/login" replace />} />
        <Route path="/memo" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="memo" />) : <Navigate to="/login" replace />} />
        <Route path="/company-activities" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="activities" />) : <Navigate to="/login" replace />} />
        <Route path="/dropdown-management" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="management" />) : <Navigate to="/login" replace />} />
        <Route path="/user-management" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="user-management" />) : <Navigate to="/login" replace />} />
        <Route path="/project-deficiency" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="deficiency" />) : <Navigate to="/login" replace />} />
        <Route path="/personal-performance" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="performance" />) : <Navigate to="/login" replace />} />
        <Route path="/exchange-shop" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="exchange-shop" />) : <Navigate to="/login" replace />} />
        <Route path="/exchange" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="exchange" />) : <Navigate to="/login" replace />} />
        <Route path="/my-backpack" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="my-backpack" />) : <Navigate to="/login" replace />} />
        <Route path="/check-in" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="check-in" />) : <Navigate to="/login" replace />} />
        <Route path="/trip-report" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="trip-report" />) : <Navigate to="/login" replace />} />
        <Route path="/leave-application" element={isAuthenticated ? withSync(<Dashboard onLogout={handleLogout} activeTab="leave-application" />) : <Navigate to="/login" replace />} />
      </Routes>
    </Router>
  )
}

export default App
