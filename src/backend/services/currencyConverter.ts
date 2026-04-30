import { getDatabase } from '../db/database'
import axios from 'axios'
import { getRuntimeSettings } from './runtimeSettings'

const EXCHANGE_RATES_API = 'https://api.exchangerate-api.com/v4/latest'

// BOC publishes weekly exchange rates for customs valuation purposes.
// The table is on this page (HTML table with currency code and PHP rate).
const BOC_EXCHANGE_RATE_URL = 'https://customs.gov.ph/exchange-rates/'

// BOC rates are valid for one week; cache them with a 7-day TTL.
const BOC_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

type ExchangeRateCacheRow = {
  rate: number
  last_updated: string
}

export class CurrencyConverter {
  private db = getDatabase()

  private getCacheDurationMs(): number {
    return getRuntimeSettings().fxCacheTtlHours * 60 * 60 * 1000
  }

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
    source: 'cache' | 'live' | 'fallback' | 'identity' | 'boc'
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
    source: 'cache' | 'live' | 'fallback' | 'identity' | 'boc'
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
   * Fetch the BOC weekly exchange rate (PHP per 1 unit of foreign currency).
   * Returns null if the page is unavailable or the currency is not listed.
   */
  private async fetchBocExchangeRate(fromCurrency: string): Promise<number | null> {
    if (fromCurrency === 'PHP') return 1
    try {
      const response = await axios.get<string>(BOC_EXCHANGE_RATE_URL, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CustomsCalc/2026)' },
        responseType: 'text',
      })
      const html: string = response.data

      // BOC rate table rows look like:  <td>USD</td><td>56.25</td>  (various whitespace)
      // We scan all <tr> blocks for a cell containing the target currency code.
      const upperCurrency = fromCurrency.toUpperCase()
      const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let match: RegExpExecArray | null
      while ((match = rowPattern.exec(html)) !== null) {
        const row = match[1]
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
          (m) => m[1].replace(/<[^>]+>/g, '').trim()
        )
        if (cells.length >= 2 && cells[0].toUpperCase() === upperCurrency) {
          const rate = parseFloat(cells[1].replace(/,/g, ''))
          if (Number.isFinite(rate) && rate > 0) {
            return rate
          }
        }
      }
      return null
    } catch (error) {
      console.warn('BOC exchange rate fetch failed:', error)
      return null
    }
  }

  /**
   * Get exchange rate with caching
   */
  private async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<{
    rate: number
    source: 'cache' | 'live' | 'fallback' | 'boc'
  }> {
    return new Promise((resolve, reject) => {
      const pair = `${fromCurrency}_${toCurrency}`
      const bocPair = `BOC_${fromCurrency}_${toCurrency}`
      const settings = getRuntimeSettings()

      // Try to get from cache first (check BOC cache if preferred)
      this.db.get(
        'SELECT rate, last_updated FROM exchange_rates WHERE currency_pair = ?',
        [settings.fxPreferBocRate ? bocPair : pair],
        async (err, row: ExchangeRateCacheRow | undefined) => {
          if (err) {
            reject(err)
            return
          }

          const bocCacheTtl = BOC_CACHE_TTL_MS
          if (row) {
            const cacheAge = Date.now() - new Date(row.last_updated).getTime()
            const ttl = settings.fxPreferBocRate ? bocCacheTtl : this.getCacheDurationMs()
            if (cacheAge < ttl) {
              resolve({ rate: row.rate, source: settings.fxPreferBocRate ? 'boc' : 'cache' })
              return
            }
          }

          // If BOC is preferred, try BOC first (only for X→PHP or PHP→X pairs)
          if (settings.fxPreferBocRate && (toCurrency === 'PHP' || fromCurrency === 'PHP')) {
            try {
              const foreignCurrency = toCurrency === 'PHP' ? fromCurrency : toCurrency
              const bocPhpRate = await this.fetchBocExchangeRate(foreignCurrency)
              if (bocPhpRate !== null) {
                const rate = toCurrency === 'PHP' ? bocPhpRate : 1 / bocPhpRate
                this.db.run(
                  `INSERT INTO exchange_rates (currency_pair, rate, last_updated)
                   VALUES (?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(currency_pair) DO UPDATE SET
                     rate = excluded.rate,
                     last_updated = CURRENT_TIMESTAMP`,
                  [bocPair, rate],
                  (dbErr) => { if (dbErr) console.warn('Could not cache BOC exchange rate:', dbErr) }
                )
                resolve({ rate, source: 'boc' })
                return
              }
            } catch (bocError) {
              console.warn('BOC rate fetch error, falling back to market rate:', bocError)
            }
          }

          // Fall through to market rate cache
          this.db.get(
            'SELECT rate, last_updated FROM exchange_rates WHERE currency_pair = ?',
            [pair],
            async (err2, marketRow: ExchangeRateCacheRow | undefined) => {
              if (err2) {
                reject(err2)
                return
              }

              if (marketRow) {
                const cacheAge = Date.now() - new Date(marketRow.last_updated).getTime()
                if (cacheAge < this.getCacheDurationMs()) {
                  resolve({ rate: marketRow.rate, source: 'cache' })
                  return
                }
              }

              // Fetch from market API
              try {
                const liveRate = await this.fetchExchangeRate(fromCurrency, toCurrency)
                const rate = liveRate ?? this.getFallbackRate(fromCurrency, toCurrency)
                const source: 'live' | 'fallback' = liveRate ? 'live' : 'fallback'

                this.db.run(
                  `INSERT INTO exchange_rates (currency_pair, rate, last_updated)
                   VALUES (?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(currency_pair) DO UPDATE SET
                     rate = excluded.rate,
                     last_updated = CURRENT_TIMESTAMP`,
                  [pair, rate],
                  (dbErr) => { if (dbErr) console.warn('Could not cache exchange rate:', dbErr) }
                )

                resolve({ rate, source })
              } catch (error) {
                console.error('Error getting exchange rate:', error)
                resolve({ rate: this.getFallbackRate(fromCurrency, toCurrency), source: 'fallback' })
              }
            }
          )
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
      const maxAge = this.getCacheDurationMs() / 1000
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
