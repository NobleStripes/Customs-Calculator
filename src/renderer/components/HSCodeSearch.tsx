import React, { useEffect, useRef, useState } from 'react'
import { appApi } from '../lib/appApi'
import './HSCodeSearch.css'

interface HSCodeSearchProps {
  onSelect: (code: string) => void
  selectedCode: string
}

interface HSCodeSuggestion {
  code: string
  description: string
  category: string
}

export const HSCodeSearch: React.FC<HSCodeSearchProps> = ({
  onSelect,
  selectedCode,
}) => {
  const [query, setQuery] = useState(selectedCode)
  const [suggestions, setSuggestions] = useState<HSCodeSuggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [searchError, setSearchError] = useState<string | null>(null)
  const latestRequestIdRef = useRef(0)

  useEffect(() => {
    const searchHS = async () => {
      const normalizedQuery = query.trim()
      if (normalizedQuery.length < 2) {
        setSuggestions([])
        setActiveIndex(-1)
        setSearchError(null)
        return
      }

      const requestId = latestRequestIdRef.current + 1
      latestRequestIdRef.current = requestId
      setLoading(true)
      setSearchError(null)

      try {
        const result = await appApi.searchHSCodes(normalizedQuery)

        if (latestRequestIdRef.current !== requestId) {
          return
        }

        if (result.success) {
          setSuggestions(result.data || [])
          setActiveIndex(-1)
          setIsOpen(true)
          return
        }

        setSuggestions([])
        setActiveIndex(-1)
        setIsOpen(true)
        setSearchError(result.error || 'Unable to load HS code suggestions. Try again.')
      } catch (error) {
        if (latestRequestIdRef.current !== requestId) {
          return
        }

        setSuggestions([])
        setActiveIndex(-1)
        setIsOpen(true)
        setSearchError('Unable to load HS code suggestions. Try again.')
        console.error('HS code search error:', error)
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setLoading(false)
        }
      }
    }

    const timer = setTimeout(searchHS, 300)
    return () => clearTimeout(timer)
  }, [query])

  const resolveBestMatch = (value: string): HSCodeSuggestion | undefined => {
    const normalizedValue = value.trim().toUpperCase()
    const compactValue = normalizedValue.replace(/\./g, '')

    return suggestions.find((item) => {
      const normalizedCode = item.code.toUpperCase()
      const compactCode = normalizedCode.replace(/\./g, '')
      return normalizedCode === normalizedValue || compactCode === compactValue
    })
  }

  const handleSelect = (code: string) => {
    setQuery(code)
    setSearchError(null)
    onSelect(code)
    setActiveIndex(-1)
    setIsOpen(false)
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!isOpen || suggestions.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
      return
    }

    if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        event.preventDefault()
        handleSelect(suggestions[activeIndex].code)
        return
      }

      const bestMatch = resolveBestMatch(query)
      if (bestMatch) {
        event.preventDefault()
        handleSelect(bestMatch.code)
      }

      return
    }

    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div className="hs-code-search">
      <div className="search-input-wrapper">
        <input
          type="text"
          value={isOpen ? query : selectedCode}
          onChange={(e) => {
            const nextValue = e.target.value
            setQuery(nextValue)
            setSearchError(null)
            onSelect(nextValue.trim().toUpperCase())
          }}
          onFocus={() => {
            setQuery(selectedCode)
            setIsOpen(true)
          }}
          onBlur={() => {
            setTimeout(() => {
              const bestMatch = resolveBestMatch(query)
              if (bestMatch) {
                handleSelect(bestMatch.code)
                return
              }

              setIsOpen(false)
              setActiveIndex(-1)
            }, 120)
          }}
          onKeyDown={handleKeyDown}
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
              className={`suggestion-item ${activeIndex === index ? 'active' : ''}`}
              onClick={() => handleSelect(item.code)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="code">{item.code}</span>
              <span className="description">{item.description}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && searchError && !loading && (
        <div className="suggestions-dropdown" role="status" aria-live="polite">
          <div className="suggestion-item search-error">
            {searchError}
          </div>
        </div>
      )}

      {isOpen && query.trim().length >= 2 && suggestions.length === 0 && !loading && !searchError && (
        <div className="suggestions-dropdown">
          <div className="suggestion-item no-results">
            No HS codes found for &quot;{query}&quot;
          </div>
        </div>
      )}
    </div>
  )
}
