import React, { useState, useEffect } from 'react'
import './HSCodeSearch.css'

interface HSCodeSearchProps {
  onSelect: (code: string) => void
  selectedCode: string
}

export const HSCodeSearch: React.FC<HSCodeSearchProps> = ({
  onSelect,
  selectedCode,
}) => {
  const [query, setQuery] = useState(selectedCode)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const searchHS = async () => {
      if (query.length < 2) {
        setSuggestions([])
        return
      }

      setLoading(true)
      try {
        const result = await (window as any).electronAPI.searchHSCodes(query)
        if (result.success) {
          setSuggestions(result.data || [])
          setIsOpen(true)
        }
      } catch (error) {
        console.error('HS code search error:', error)
      } finally {
        setLoading(false)
      }
    }

    const timer = setTimeout(searchHS, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (code: string) => {
    setQuery(code)
    onSelect(code)
    setIsOpen(false)
  }

  return (
    <div className="hs-code-search">
      <div className="search-input-wrapper">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search by code (e.g., 8471, 6204) or description"
          className="search-input"
        />
        {loading && <span className="search-loader">🔍</span>}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((item, index) => (
            <button
              key={index}
              className="suggestion-item"
              onClick={() => handleSelect(item.code)}
            >
              <span className="code">{item.code}</span>
              <span className="description">{item.description}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && suggestions.length === 0 && !loading && (
        <div className="suggestions-dropdown">
          <div className="suggestion-item no-results">
            No HS codes found for "{query}"
          </div>
        </div>
      )}
    </div>
  )
}
