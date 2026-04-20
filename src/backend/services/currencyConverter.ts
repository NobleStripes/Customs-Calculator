import { getDatabase } from '../db/database'
import axios from 'axios'

const EXCHANGE_RATES_API = 'https://api.exchangerate-api.com/v4/latest'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

export class CurrencyConverter {
  private db = getDatabase()

  /**
   * Convert currency
   */
  async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<{
    originalAmount: number
    originalCurrency: string
    convertedAmount: number
    targetCurrency: string
    rate: number
    timestamp: string
  }> {
    try {
      if (fromCurrency === toCurrency) {
        return {
          originalAmount: amount,
          originalCurrency: fromCurrency,
          convertedAmount: amount,
          targetCurrency: toCurrency,
          rate: 1,
          timestamp: new Date().toISOString(),
        }
      }

      const pair = `${fromCurrency}_${toCurrency}`
      const rate = await this.getExchangeRate(fromCurrency, toCurrency)

      const convertedAmount = amount * rate

      return {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount,
        targetCurrency: toCurrency,
        rate,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error('Error converting currency:', error)
      throw new Error(`Failed to convert currency: ${String(error)}`)
    }
  }

  /**
   * Get exchange rate with caching
   */
  private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    return new Promise(async (resolve, reject) => {
      const pair = `${fromCurrency}_${toCurrency}`

      // Try to get from cache first
      this.db.get(
        'SELECT rate, last_updated FROM exchange_rates WHERE currency_pair = ?',
        [pair],
        async (err, row: any) => {
          if (row) {
            const cacheAge = Date.now() - new Date(row.last_updated).getTime()
            if (cacheAge < CACHE_DURATION) {
              resolve(row.rate)
              return
            }
          }

          // Fetch from API
          try {
            const rate = await this.fetchExchangeRate(fromCurrency, toCurrency)

            // Update cache
            this.db.run(
              'INSERT OR REPLACE INTO exchange_rates (currency_pair, rate) VALUES (?, ?)',
              [pair, rate],
              (err) => {
                if (err) {
                  console.warn('Could not cache exchange rate:', err)
                }
              }
            )

            resolve(rate)
          } catch (error) {
            console.error('Error getting exchange rate:', error)
            resolve(1) // Fallback
          }
        }
      )
    })
  }

  /**
   * Fetch exchange rate from external API
   */
  private async fetchExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
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
      // Return fallback rates
      return this.getFallbackRate(fromCurrency, toCurrency)
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
      const response = await axios.get(`${EXCHANGE_RATES_API}/${baseCurrency}`, {
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
