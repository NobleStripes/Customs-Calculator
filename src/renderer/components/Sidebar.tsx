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
          aria-current={currentPage === 'calculator' ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">📊</span>
          <span>Calculator</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'batch' ? 'active' : ''}`}
          onClick={() => onPageChange('batch')}
          aria-current={currentPage === 'batch' ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">📁</span>
          <span>Batch Import</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'tariff-browser' ? 'active' : ''}`}
          onClick={() => onPageChange('tariff-browser')}
          aria-current={currentPage === 'tariff-browser' ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">🗂️</span>
          <span>Tariff Browser</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'admin' ? 'active' : ''}`}
          onClick={() => onPageChange('admin')}
          aria-current={currentPage === 'admin' ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">🛠️</span>
          <span>Admin</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`}
          onClick={() => onPageChange('settings')}
          aria-current={currentPage === 'settings' ? 'page' : undefined}
        >
          <span className="icon" aria-hidden="true">⚙️</span>
          <span>Settings</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <p className="version">v0.6.0</p>
      </div>
    </aside>
  )
}
