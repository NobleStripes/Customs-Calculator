import { getDatabase } from '../db/database'
import axios from 'axios'

const EXCHANGE_RATES_API = 'https://api.exchangerate-api.com/v4/latest'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

export class CurrencyConverter {
  private db = getDatabase()

  private normalizeCurrencyCode(currency: string): string {
    return currency.trim().toUpperCase()
  }

  /**
   * Convert currency
   */
  async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<{
    originalAmount: number
    originalCurrency: string
    convertedAmount: number
    targetCurrency: string
    rate: number
    source: 'cache' | 'live' | 'fallback' | 'identity'
    timestamp: string
  }> {
    try {
      const from = this.normalizeCurrencyCode(fromCurrency)
      const to = this.normalizeCurrencyCode(toCurrency)

      if (from === to) {
        return {
          originalAmount: amount,
          originalCurrency: from,
          convertedAmount: amount,
          targetCurrency: to,
          rate: 1,
          source: 'identity',
          timestamp: new Date().toISOString(),
        }
      }

      const { rate, source } = await this.getExchangeRate(from, to)

      const convertedAmount = amount * rate

      return {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount,
        targetCurrency: to,
        rate,
        source,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error('Error converting currency:', error)
      throw new Error(`Failed to convert currency: ${String(error)}`)
    }
  }

  async getRate(fromCurrency: string, toCurrency: string): Promise<{
    fromCurrency: string
    toCurrency: string
    rate: number
    source: 'cache' | 'live' | 'fallback' | 'identity'
    timestamp: string
  }> {
    const from = this.normalizeCurrencyCode(fromCurrency)
    const to = this.normalizeCurrencyCode(toCurrency)

    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: 1,
        source: 'identity',
        timestamp: new Date().toISOString(),
      }
    }

    const { rate, source } = await this.getExchangeRate(from, to)
    return {
      fromCurrency: from,
      toCurrency: to,
      rate,
      source,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Get exchange rate with caching
   */
  private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<{
    rate: number
    source: 'cache' | 'live' | 'fallback'
  }> {
    return new Promise(async (resolve, reject) => {
      const pair = `${fromCurrency}_${toCurrency}`

      // Try to get from cache first
      this.db.get(
        'SELECT rate, last_updated FROM exchange_rates WHERE currency_pair = ?',
        [pair],
        async (err, row: any) => {
          if (err) {
            reject(err)
            return
          }

          if (row) {
            const cacheAge = Date.now() - new Date(row.last_updated).getTime()
            if (cacheAge < CACHE_DURATION) {
              resolve({ rate: row.rate, source: 'cache' })
              return
            }
          }

          // Fetch from API
          try {
            const liveRate = await this.fetchExchangeRate(fromCurrency, toCurrency)
            const rate = liveRate ?? this.getFallbackRate(fromCurrency, toCurrency)
            const source: 'live' | 'fallback' = liveRate ? 'live' : 'fallback'

            // Update cache
            this.db.run(
              `INSERT INTO exchange_rates (currency_pair, rate, last_updated)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(currency_pair) DO UPDATE SET
                 rate = excluded.rate,
                 last_updated = CURRENT_TIMESTAMP`,
              [pair, rate],
              (err) => {
                if (err) {
                  console.warn('Could not cache exchange rate:', err)
                }
              }
            )

            resolve({ rate, source })
          } catch (error) {
            console.error('Error getting exchange rate:', error)
            resolve({ rate: this.getFallbackRate(fromCurrency, toCurrency), source: 'fallback' })
          }
        }
      )
    })
  }

  /**
   * Fetch exchange rate from external API
   */
  private async fetchExchangeRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
    try {
      const response = await axios.get(`${EXCHANGE_RATES_API}/${fromCurrency}`, {
        timeout: 5000,
      })

      const rate = response.data.rates[toCurrency]

      if (!rate) {
        throw new Error(`Exchange rate for ${toCurrency} not found`)
      }

      return rate
    } catch (error) {
      console.error('Error fetching from exchange rate API:', error)
      return null
    }
  }

  /**
   * Get fallback exchange rates (for offline mode)
   */
  private getFallbackRate(fromCurrency: string, toCurrency: string): number {
    // Simplified fallback rates (against USD)
    const rates: Record<string, number> = {
      USD: 1,
      PHP: 56,
      EUR: 0.92,
      CNY: 7.24,
      SGD: 1.35,
      JPY: 149.5,
      GBP: 0.79,
      INR: 83.12,
    }

    const fromRate = rates[fromCurrency] || 1
    const toRate = rates[toCurrency] || 1

    return toRate / fromRate
  }

  /**
   * Get conversion matrix for common currencies
   */
  async getConversionMatrix(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
    try {
      const normalizedBaseCurrency = this.normalizeCurrencyCode(baseCurrency)
      const response = await axios.get(`${EXCHANGE_RATES_API}/${normalizedBaseCurrency}`, {
        timeout: 5000,
      })

      return response.data.rates as Record<string, number>
    } catch (error) {
      console.error('Error fetching conversion matrix:', error)
      const rates: Record<string, number> = {
        USD: 1,
        PHP: 56,
        EUR: 0.92,
        CNY: 7.24,
        SGD: 1.35,
        JPY: 149.5,
        GBP: 0.79,
        INR: 83.12,
      }
      return rates
    }
  }

  /**
   * Convert to Philippine Peso (common use case)
   */
  async convertToPhilippinePeso(amount: number, currency: string): Promise<number> {
    try {
      const result = await this.convert(amount, currency, 'PHP')
      return result.convertedAmount
    } catch (error) {
      console.error('Error converting to PHP:', error)
      throw error
    }
  }

  /**
   * Clear old exchange rate cache
   */
  clearOldCache(): void {
    try {
      const maxAge = CACHE_DURATION / 1000 // Convert to seconds
      this.db.run(
        `DELETE FROM exchange_rates WHERE julianday('now') - julianday(last_updated) > ?`,
        [maxAge / 86400], // Convert to days
        (err) => {
          if (err) {
            console.warn('Error clearing exchange rate cache:', err)
          }
        }
      )
    } catch (error) {
      console.warn('Error clearing exchange rate cache:', error)
    }
  }
}
