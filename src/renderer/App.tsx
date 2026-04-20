import React, { useEffect, useState } from 'react'
import { Calculator } from './pages/Calculator'
import { BatchImport } from './pages/BatchImport'
import { TariffBrowser } from './pages/TariffBrowser'
import { Sidebar } from './components/Sidebar'
import { appApi } from './lib/appApi'
import './App.css'

function App() {
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<'calculator' | 'batch' | 'tariff-browser'>('calculator')

  useEffect(() => {
    const initApp = async () => {
      try {
        const result = await appApi.initDB()
        if (result.success) {
          setInitialized(true)
        } else {
          setError(result.error || 'Database initialization failed')
        }
      } catch (err) {
        setError(String(err))
      }
    }

    initApp()
  }, [])

  if (error) {
    return (
      <div className="error-container">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="loading-container">
        <h1>Loading...</h1>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="main-content">
        {currentPage === 'calculator' && <Calculator />}
        {currentPage === 'batch' && <BatchImport />}
        {currentPage === 'tariff-browser' && <TariffBrowser />}
      </main>
    </div>
  )
}

export default App
