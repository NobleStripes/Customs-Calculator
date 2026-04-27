import React from 'react'
import './Sidebar.css'

interface SidebarProps {
  currentPage: 'calculator' | 'batch' | 'tariff-browser' | 'admin' | 'settings'
  onPageChange: (page: 'calculator' | 'batch' | 'tariff-browser' | 'admin' | 'settings') => void
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Customs Calculator</h1>
        <p>Philippines</p>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentPage === 'calculator' ? 'active' : ''}`}
          onClick={() => onPageChange('calculator')}
        >
          <span className="icon">📊</span>
          <span>Calculator</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'batch' ? 'active' : ''}`}
          onClick={() => onPageChange('batch')}
        >
          <span className="icon">📁</span>
          <span>Batch Import</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'tariff-browser' ? 'active' : ''}`}
          onClick={() => onPageChange('tariff-browser')}
        >
          <span className="icon">🗂️</span>
          <span>Tariff Browser</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'admin' ? 'active' : ''}`}
          onClick={() => onPageChange('admin')}
        >
          <span className="icon">🛠️</span>
          <span>Admin</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
          onClick={() => onPageChange('settings')}
        >
          <span className="icon">⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <p className="version">v0.3.0</p>
      </div>
    </aside>
  )
}
