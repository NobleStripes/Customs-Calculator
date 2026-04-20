declare module 'pdfkit' {
  import { Writable } from 'stream'

  type TextOptions = {
    align?: 'left' | 'center' | 'right' | 'justify'
    underline?: boolean
  }

  class PDFDocument {
    constructor(options?: Record<string, unknown>)
    pipe(destination: Writable): Writable
    on(event: 'data', listener: (chunk: Buffer | Uint8Array) => void): this
    on(event: 'end', listener: () => void): this
    on(event: 'error', listener: (error: Error) => void): this
    fontSize(size: number): this
    fillColor(color: string): this
    text(text: string, options?: TextOptions): this
    moveDown(lines?: number): this
    end(): void
  }

  export default PDFDocument
}