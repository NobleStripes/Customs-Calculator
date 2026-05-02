import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { appApi, type ReviewRowProvenance } from '../lib/appApi'
import './Admin.css'

type ReviewRow = {
  id: number
  source_id: number
  source_name: string
  source_type: string
  source_reference: string | null
  import_job_status: string
  row_number: number
  raw_payload: string
  normalized_payload: string | null
  confidence_score: number
  review_notes: string | null
  created_at: string
}

type ConflictNormalizedPayload = {
  type: 'conflict-tariff-rate'
  incoming: Record<string, unknown>
  existing: Record<string, unknown>
}

type ImportJob = {
  id: number
  source_id: number
  status: string
  total_rows: number
  imported_rows: number
  pending_review_rows: number
  error_rows: number
  started_at: string
  completed_at: string | null
}

type AuditEntry = {
  id: number
  hs_code: string
  old_duty_rate: number | null
  new_duty_rate: number | null
  old_vat_rate: number | null
  new_vat_rate: number | null
  old_surcharge_rate: number | null
  new_surcharge_rate: number | null
  reason: string | null
  source_id: number | null
  import_job_id: number | null
  changed_at: string
}

const getAuditActor = (entry: AuditEntry, sources: TariffSource[]): string => {
  const source = sources.find((s) => s.id === entry.source_id)
  if (!source) {
    return entry.source_id != null ? `Source #${entry.source_id}` : 'Unknown'
  }

  if (source.source_type.includes('auto-fetch')) {
    return `System AutoFetcher (${source.source_name})`
  }

  return source.source_name || 'Admin'
}

type TariffSource = {
  id: number
  source_name: string
  source_type: string
  source_reference: string | null
  status: string
  fetched_at: string
  imported_at: string | null
  notes?: string | null
  created_at?: string
}

type SourceGovernanceRow = {
  source: TariffSource
  latestJob: ImportJob | null
}

type CatalogHealth = {
  totalHsCodes: number
  hsCodesWithApprovedMfnRate: number
  mfnCoveragePercent: number
  pendingReviewRows: number
  latestFullSyncAt: string | null
  latestFullSyncStatus: string | null
  importFailureCountLast30d: number
  recommendedCutover: boolean
}

type TariffImportPreviewRow = {
  rowNumber: number
  raw: Record<string, unknown>
  normalized?: Record<string, unknown>
  errors: string[]
}

type TariffImportPreviewResult = {
  totalRows: number
  validRows: number
  invalidRows: number
  rows: TariffImportPreviewRow[]
}

type TariffImportResult = {
  sourceId: number
  importJobId: number
  totalRows: number
  importedRows: number
  pendingReviewRows: number
  errorRows: number
  duplicateRows: number
  conflictRows: number
  skippedRows: number
  status: 'completed' | 'completed_with_errors' | 'failed'
}

type TariffUploadMode = 'csv-text' | 'file-binary'

type Tab = 'review' | 'jobs' | 'audit' | 'sources'

const PAGE_SIZE = 20
const DEFAULT_CONFIDENCE_FILTER = 100
const LOW_CONFIDENCE_THRESHOLD = 70
const DEFAULT_TARIFF_SOURCE_TYPE = 'tariff-rates'
const DEFAULT_TARIFF_SOURCE_NAME = 'Admin tariff import'
const TARIFF_IMPORT_TEMPLATE_CSV = [
  'hsCode,scheduleCode,description,category,dutyRate,vatRate,surchargeRate,effectiveDate,endDate,notes,confidenceScore',
  '8471.30,MFN,Portable automatic data processing machines,Electronics,5,12,0,2025-01-01,,Baseline MFN schedule import,100',
].join('\n')

const formatPct = (v: number | null): string => (v !== null ? `${(v * 100).toFixed(2)}%` : '-')

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const normalizeText = (value: string): string => value.trim().toLowerCase()

const toCsvCell = (value: string | number | null): string => {
  const serialized = String(value ?? '')
  if (serialized.includes(',') || serialized.includes('"') || serialized.includes('\n')) {
    return `"${serialized.replace(/"/g, '""')}"`
  }
  return serialized
}

const downloadCsv = (fileName: string, rows: Array<Array<string | number | null>>): void => {
  const content = rows.map((row) => row.map(toCsvCell).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

const parseNormalizedRow = (row: ReviewRow): Record<string, unknown> | null => {
  try {
    if (!row.normalized_payload) return null
    return JSON.parse(row.normalized_payload) as Record<string, unknown>
  } catch {
    return null
  }
}

const parseConflictPayload = (row: ReviewRow): ConflictNormalizedPayload | null => {
  const normalized = parseNormalizedRow(row)
  if (!normalized) {
    return null
  }

  if (
    normalized.type === 'conflict-tariff-rate' &&
    typeof normalized.incoming === 'object' &&
    normalized.incoming !== null &&
    typeof normalized.existing === 'object' &&
    normalized.existing !== null
  ) {
    return {
      type: 'conflict-tariff-rate',
      incoming: normalized.incoming as Record<string, unknown>,
      existing: normalized.existing as Record<string, unknown>,
    }
  }

  return null
}

export const Admin: React.FC = () => {
  const [tab, setTab] = useState<Tab>('review')

  // Review Queue state
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState<Record<number, string>>({})
  const [selectedReviewRowIds, setSelectedReviewRowIds] = useState<number[]>([])
  const [bulkNotes, setBulkNotes] = useState('')
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewConfidenceMax, setReviewConfidenceMax] = useState(DEFAULT_CONFIDENCE_FILTER)
  const [provenanceByRowId, setProvenanceByRowId] = useState<Record<number, ReviewRowProvenance>>({})
  const [provenanceLoadingRowId, setProvenanceLoadingRowId] = useState<number | null>(null)

  // Import Jobs state
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)

  // Sources state
  const [sources, setSources] = useState<TariffSource[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [sourceSearch, setSourceSearch] = useState('')
  const [sourceStatusFilter, setSourceStatusFilter] = useState<'all' | 'pending-review' | 'error' | 'healthy'>('all')
  const [catalogHealth, setCatalogHealth] = useState<CatalogHealth | null>(null)
  const [tariffImportSourceName, setTariffImportSourceName] = useState(DEFAULT_TARIFF_SOURCE_NAME)
  const [tariffImportSourceType, setTariffImportSourceType] = useState(DEFAULT_TARIFF_SOURCE_TYPE)
  const [tariffImportSourceReference, setTariffImportSourceReference] = useState('')
  const [tariffImportCsvText, setTariffImportCsvText] = useState(TARIFF_IMPORT_TEMPLATE_CSV)
  const [tariffImportFileName, setTariffImportFileName] = useState('')
  const [tariffImportFileContentBase64, setTariffImportFileContentBase64] = useState('')
  const [tariffImportUploadMode, setTariffImportUploadMode] = useState<TariffUploadMode>('csv-text')
  const [tariffAutoApproveThreshold, setTariffAutoApproveThreshold] = useState('85')
  const [tariffForceApprove, setTariffForceApprove] = useState(false)
  const [tariffPreview, setTariffPreview] = useState<TariffImportPreviewResult | null>(null)
  const [tariffPreviewLoading, setTariffPreviewLoading] = useState(false)
  const [tariffImportLoading, setTariffImportLoading] = useState(false)
  const [tariffImportError, setTariffImportError] = useState<string | null>(null)
  const [tariffImportSuccess, setTariffImportSuccess] = useState<TariffImportResult | null>(null)

  // Audit state
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditHsFilter, setAuditHsFilter] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)

  const loadJobs = useCallback(async () => {
    setJobsLoading(true)
    setJobsError(null)
    try {
      const result = await appApi.getImportJobs()
      if (result.success && result.data) {
        setJobs(result.data as ImportJob[])
      }
    } catch (err) {
      setJobsError(String(err))
    } finally {
      setJobsLoading(false)
    }
  }, [])

  const loadReviewRows = useCallback(async (jobId: number) => {
    setReviewLoading(true)
    setReviewError(null)
    setSelectedReviewRowIds([])

    try {
      const result = await appApi.getPendingReviewRows({ importJobId: jobId })
      if (result.success && result.data) {
        setReviewRows(result.data as ReviewRow[])
      }
    } catch (err) {
      setReviewError(String(err))
    } finally {
      setReviewLoading(false)
    }
  }, [])

  const loadAudit = useCallback(async (hsCode: string, offset: number) => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const result = await appApi.getRateChangeAudit({ hsCode: hsCode || undefined, limit: PAGE_SIZE, offset })
      if (result.success && result.data) {
        setAuditRows(result.data as AuditEntry[])
      }
    } catch (err) {
      setAuditError(String(err))
    } finally {
      setAuditLoading(false)
    }
  }, [])

  const loadSources = useCallback(async () => {
    setSourcesLoading(true)
    setSourcesError(null)
    try {
      const result = await appApi.getTariffSources(200)
      if (result.success && result.data) {
        setSources(result.data as TariffSource[])
      }
    } catch (err) {
      setSourcesError(String(err))
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  const loadCatalogHealth = useCallback(async () => {
    try {
      const result = await appApi.getCatalogHealth()
      if (result.success && result.data) {
        setCatalogHealth(result.data as CatalogHealth)
      }
    } catch {
      setCatalogHealth(null)
    }
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadJobs()
      void loadSources()
      void loadCatalogHealth()
    }, 0)

    return () => clearTimeout(handle)
  }, [loadJobs, loadSources, loadCatalogHealth])

  useEffect(() => {
    const handle = setTimeout(() => {
      if (tab === 'audit') {
        void loadAudit(auditHsFilter, auditOffset)
      }

      if (tab === 'sources') {
        void loadSources()
        void loadCatalogHealth()
      }
    }, 0)

    return () => clearTimeout(handle)
  }, [tab, auditHsFilter, auditOffset, loadAudit, loadSources, loadCatalogHealth])

  const jobsWithPending = useMemo(() => jobs.filter((j) => j.pending_review_rows > 0), [jobs])

  const sourceGovernanceRows = useMemo<SourceGovernanceRow[]>(() => {
    const latestJobBySource = new Map<number, ImportJob>()
    for (const job of jobs) {
      if (!latestJobBySource.has(job.source_id)) {
        latestJobBySource.set(job.source_id, job)
      }
    }

    return sources.map((source) => ({
      source,
      latestJob: latestJobBySource.get(source.id) || null,
    }))
  }, [sources, jobs])

  const filteredSourceRows = useMemo(() => {
    const search = normalizeText(sourceSearch)
    return sourceGovernanceRows.filter(({ source, latestJob }) => {
      const sourceBlob = normalizeText(`${source.source_name} ${source.source_type} ${source.source_reference || ''}`)
      const matchesSearch = !search || sourceBlob.includes(search)

      const hasPending = (latestJob?.pending_review_rows || 0) > 0
      const hasErrors = (latestJob?.error_rows || 0) > 0 || latestJob?.status === 'failed'
      const isHealthy = !hasPending && !hasErrors

      let matchesStatus = true
      if (sourceStatusFilter === 'pending-review') matchesStatus = hasPending
      if (sourceStatusFilter === 'error') matchesStatus = hasErrors
      if (sourceStatusFilter === 'healthy') matchesStatus = isHealthy

      return matchesSearch && matchesStatus
    })
  }, [sourceGovernanceRows, sourceSearch, sourceStatusFilter])

  const sourceSummary = useMemo(() => {
    const totalSources = sourceGovernanceRows.length
    const sourcesWithPending = sourceGovernanceRows.filter((r) => (r.latestJob?.pending_review_rows || 0) > 0).length
    const sourcesWithErrors = sourceGovernanceRows.filter((r) => (r.latestJob?.error_rows || 0) > 0 || r.latestJob?.status === 'failed').length
    const pendingRows = sourceGovernanceRows.reduce((acc, row) => acc + (row.latestJob?.pending_review_rows || 0), 0)

    const completionRates = sourceGovernanceRows
      .map((row) => {
        const total = row.latestJob?.total_rows || 0
        if (total <= 0) return null
        const imported = row.latestJob?.imported_rows || 0
        return imported / total
      })
      .filter((rate): rate is number => typeof rate === 'number')

    const averageCompletion = completionRates.length
      ? Math.round((completionRates.reduce((acc, rate) => acc + rate, 0) / completionRates.length) * 100)
      : 0

    return {
      totalSources,
      sourcesWithPending,
      sourcesWithErrors,
      pendingRows,
      averageCompletion,
    }
  }, [sourceGovernanceRows])

  const filteredReviewRows = useMemo(() => {
    const search = normalizeText(reviewSearch)

    return reviewRows.filter((row) => {
      if (row.confidence_score > reviewConfidenceMax) {
        return false
      }

      if (!search) {
        return true
      }

      const normalized = parseNormalizedRow(row)
      const normalizedBlob = normalized ? normalizeText(JSON.stringify(normalized)) : ''
      const rawBlob = normalizeText(row.raw_payload)
      return rawBlob.includes(search) || normalizedBlob.includes(search)
    })
  }, [reviewRows, reviewSearch, reviewConfidenceMax])

  const reviewSelectionCount = selectedReviewRowIds.length

  const reviewConfidenceSummary = useMemo(() => {
    if (filteredReviewRows.length === 0) {
      return {
        lowConfidenceCount: 0,
        averageConfidence: 0,
      }
    }

    const lowConfidenceCount = filteredReviewRows.filter((row) => row.confidence_score < LOW_CONFIDENCE_THRESHOLD).length
    const averageConfidence = Math.round(
      filteredReviewRows.reduce((acc, row) => acc + row.confidence_score, 0) / filteredReviewRows.length
    )

    return {
      lowConfidenceCount,
      averageConfidence,
    }
  }, [filteredReviewRows])

  const handleSelectJob = (jobId: number) => {
    setSelectedJobId(jobId)
    void loadReviewRows(jobId)
  }

  const toggleReviewRowSelection = (rowId: number) => {
    setSelectedReviewRowIds((prev) => {
      if (prev.includes(rowId)) {
        return prev.filter((id) => id !== rowId)
      }
      return [...prev, rowId]
    })
  }

  const toggleSelectAllFilteredRows = () => {
    const filteredIds = filteredReviewRows.map((row) => row.id)
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedReviewRowIds.includes(id))

    if (allSelected) {
      setSelectedReviewRowIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
      return
    }

    setSelectedReviewRowIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  const handleReview = async (row: ReviewRow, action: 'approve' | 'reject') => {
    if (!selectedJobId) return
    setReviewError(null)
    setReviewSubmitting(true)

    try {
      const result = await appApi.reviewRow({
        importJobId: selectedJobId,
        rowId: row.id,
        action,
        notes: actionNotes[row.id] || undefined,
      })

      if (!result.success) {
        throw new Error(result.error || 'Unable to complete review action')
      }

      setReviewRows((prev) => prev.filter((r) => r.id !== row.id))
      setSelectedReviewRowIds((prev) => prev.filter((id) => id !== row.id))
      setProvenanceByRowId((prev) => {
        const next = { ...prev }
        delete next[row.id]
        return next
      })
      void loadJobs()
      void loadSources()
      void loadCatalogHealth()
    } catch (err) {
      setReviewError(String(err))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleBulkReview = async (action: 'approve' | 'reject') => {
    if (!selectedJobId || selectedReviewRowIds.length === 0) return

    setReviewError(null)
    setReviewSubmitting(true)

    try {
      const result = await appApi.reviewRowsBulk({
        importJobId: selectedJobId,
        rowIds: selectedReviewRowIds,
        action,
        notes: bulkNotes || undefined,
      })

      if (!result.success) {
        throw new Error(result.error || 'At least one bulk review action failed')
      }

      setReviewRows((prev) => prev.filter((row) => !selectedReviewRowIds.includes(row.id)))
      setSelectedReviewRowIds([])
      setBulkNotes('')
      setProvenanceByRowId((prev) => {
        const next = { ...prev }
        selectedReviewRowIds.forEach((id) => delete next[id])
        return next
      })
      void loadJobs()
      void loadSources()
      void loadCatalogHealth()
    } catch (err) {
      setReviewError(String(err))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleLoadProvenance = async (row: ReviewRow) => {
    setReviewError(null)
    setProvenanceLoadingRowId(row.id)

    try {
      const result = await appApi.getReviewRowProvenance({ rowId: row.id })
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Unable to load provenance')
      }

      setProvenanceByRowId((prev) => ({ ...prev, [row.id]: result.data }))
    } catch (err) {
      setReviewError(String(err))
    } finally {
      setProvenanceLoadingRowId((current) => (current === row.id ? null : current))
    }
  }

  const handleExportAuditCsv = () => {
    if (auditRows.length === 0) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`rate-change-audit-${timestamp}.csv`, [
      [
        'id',
        'hs_code',
        'old_duty_rate',
        'new_duty_rate',
        'old_vat_rate',
        'new_vat_rate',
        'old_surcharge_rate',
        'new_surcharge_rate',
        'reason',
        'source_id',
        'import_job_id',
        'updated_by',
        'changed_at',
      ],
      ...auditRows.map((row) => [
        row.id,
        row.hs_code,
        row.old_duty_rate,
        row.new_duty_rate,
        row.old_vat_rate,
        row.new_vat_rate,
        row.old_surcharge_rate,
        row.new_surcharge_rate,
        row.reason,
        row.source_id,
        row.import_job_id,
        getAuditActor(row, sources),
        row.changed_at,
      ]),
    ])
  }

  const handleDownloadTariffTemplate = () => {
    downloadCsv(
      'tariff-import-template.csv',
      TARIFF_IMPORT_TEMPLATE_CSV.split('\n').map((line) => line.split(','))
    )
  }

  const handleTariffFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const isWorkbook = /\.(xlsx|xls)$/i.test(file.name)
      setTariffImportFileName(file.name)
      setTariffImportError(null)
      setTariffImportSuccess(null)
      setTariffPreview(null)

      if (isWorkbook) {
        const buffer = await file.arrayBuffer()
        setTariffImportFileContentBase64(arrayBufferToBase64(buffer))
        setTariffImportCsvText('')
        setTariffImportUploadMode('file-binary')
      } else {
        const text = await file.text()
        setTariffImportCsvText(text)
        setTariffImportFileContentBase64('')
        setTariffImportUploadMode('csv-text')
      }

      if (!tariffImportSourceReference.trim()) {
        setTariffImportSourceReference(file.name)
      }
      if (tariffImportSourceName === DEFAULT_TARIFF_SOURCE_NAME) {
        setTariffImportSourceName(file.name.replace(/\.[^.]+$/, ''))
      }
    } catch (error) {
      setTariffImportError(`Failed to read file: ${String(error)}`)
    } finally {
      event.target.value = ''
    }
  }

  const handlePreviewTariffImport = async () => {
    const csvText = tariffImportCsvText.trim()
    const hasWorkbookPayload = tariffImportUploadMode === 'file-binary' && Boolean(tariffImportFileContentBase64)

    if (!csvText && !hasWorkbookPayload) {
      setTariffImportError('Paste CSV content or choose a CSV/XLS/XLSX file before previewing.')
      setTariffPreview(null)
      return
    }

    setTariffPreviewLoading(true)
    setTariffImportError(null)
    setTariffImportSuccess(null)

    try {
      const result = await appApi.previewTariffImport(
        hasWorkbookPayload
          ? {
              contentBase64: tariffImportFileContentBase64,
              fileName: tariffImportFileName || 'tariff-import.xlsx',
            }
          : { csvText }
      )
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Preview failed')
      }

      setTariffPreview(result.data as TariffImportPreviewResult)
    } catch (error) {
      setTariffImportError(String(error))
      setTariffPreview(null)
    } finally {
      setTariffPreviewLoading(false)
    }
  }

  const handleRunTariffImport = async () => {
    const csvText = tariffImportCsvText.trim()
    const hasWorkbookPayload = tariffImportUploadMode === 'file-binary' && Boolean(tariffImportFileContentBase64)

    if (!csvText && !hasWorkbookPayload) {
      setTariffImportError('Paste CSV content or choose a CSV/XLS/XLSX file before importing.')
      return
    }

    if (!tariffImportSourceName.trim()) {
      setTariffImportError('Source name is required before importing.')
      return
    }

    setTariffImportLoading(true)
    setTariffImportError(null)
    setTariffImportSuccess(null)

    try {
      const parsedThreshold = Number(tariffAutoApproveThreshold)
      const result = await appApi.importTariffData({
        sourceName: tariffImportSourceName.trim(),
        sourceType: tariffImportSourceType.trim() || DEFAULT_TARIFF_SOURCE_TYPE,
        sourceReference: tariffImportSourceReference.trim() || tariffImportFileName || undefined,
        ...(hasWorkbookPayload
          ? {
              contentBase64: tariffImportFileContentBase64,
              fileName: tariffImportFileName || 'tariff-import.xlsx',
            }
          : { csvText }),
        autoApproveThreshold: Number.isFinite(parsedThreshold) ? parsedThreshold : undefined,
        forceApprove: tariffForceApprove,
      })

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Import failed')
      }

      setTariffImportSuccess(result.data as TariffImportResult)
      await Promise.all([loadJobs(), loadSources(), loadCatalogHealth()])
    } catch (error) {
      setTariffImportError(String(error))
    } finally {
      setTariffImportLoading(false)
    }
  }

  const handleExportTariffPreviewCsv = () => {
    if (!tariffPreview) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`tariff-import-preview-${timestamp}.csv`, [
      ['row_number', 'status', 'hs_code', 'schedule_code', 'duty_rate', 'vat_rate', 'effective_date', 'notes', 'errors'],
      ...tariffPreview.rows.map((row) => {
        const normalized = row.normalized || {}
        return [
          row.rowNumber,
          row.errors.length > 0 ? 'invalid' : 'valid',
          String(normalized.hsCode ?? row.raw.hsCode ?? ''),
          String(normalized.scheduleCode ?? row.raw.scheduleCode ?? 'MFN'),
          String(normalized.dutyRate ?? row.raw.dutyRate ?? ''),
          String(normalized.vatRate ?? row.raw.vatRate ?? ''),
          String(normalized.effectiveDate ?? row.raw.effectiveDate ?? ''),
          String(normalized.notes ?? row.raw.notes ?? ''),
          row.errors.join('; '),
        ]
      }),
    ])
  }

  const handleExportSourceGovernanceCsv = () => {
    if (filteredSourceRows.length === 0) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`tariff-source-governance-${timestamp}.csv`, [
      ['source_id', 'source_name', 'source_type', 'status', 'reference', 'fetched_at', 'imported_at', 'latest_job_id', 'latest_job_status', 'pending_review_rows', 'error_rows'],
      ...filteredSourceRows.map(({ source, latestJob }) => [
        source.id,
        source.source_name,
        source.source_type,
        source.status,
        source.source_reference || '',
        source.fetched_at,
        source.imported_at || '',
        latestJob?.id ?? '',
        latestJob?.status || '',
        latestJob?.pending_review_rows ?? 0,
        latestJob?.error_rows ?? 0,
      ]),
    ])
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>Admin / Data Management</h1>
        <p>Review imported tariff data, manage import jobs, and inspect rate-change history.</p>
      </header>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
          Review Queue {jobsWithPending.length > 0 && <span className="badge">{jobsWithPending.reduce((acc, j) => acc + j.pending_review_rows, 0)}</span>}
        </button>
        <button className={`admin-tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>
          Import Jobs
        </button>
        <button className={`admin-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
          Rate Change Audit
        </button>
        <button className={`admin-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>
          Tariff Sources
        </button>
      </div>

      {tab === 'review' && (
        <div className="admin-panel">
          <div className="review-layout">
            <aside className="review-jobs-list">
              <h3>Jobs with pending rows</h3>
              {jobsLoading && <p className="admin-loading">Loading jobs...</p>}
              {jobsWithPending.length === 0 && !jobsLoading && (
                <p className="admin-empty">No pending review rows.</p>
              )}
              {jobsWithPending.map((job) => (
                <button
                  key={job.id}
                  className={`review-job-item ${selectedJobId === job.id ? 'selected' : ''}`}
                  onClick={() => handleSelectJob(job.id)}
                >
                  <span>Job #{job.id}</span>
                  <span className="badge">{job.pending_review_rows} pending</span>
                </button>
              ))}
            </aside>

            <div className="review-rows-panel">
              {!selectedJobId && (
                <p className="admin-empty">Select a job on the left to see its pending rows.</p>
              )}

              {selectedJobId && (
                <div className="review-toolbar">
                  <div className="review-toolbar-group">
                    <input
                      type="text"
                      placeholder="Search payload text..."
                      className="audit-search"
                      value={reviewSearch}
                      onChange={(e) => setReviewSearch(e.target.value)}
                    />
                    <label className="review-confidence-filter">
                      Max confidence: <strong>{reviewConfidenceMax}%</strong>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={reviewConfidenceMax}
                        onChange={(e) => setReviewConfidenceMax(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <div className="review-toolbar-group">
                    <span className="review-selected-count">Selected: {reviewSelectionCount}</span>
                    <span className="review-selected-count">Low confidence (&lt; {LOW_CONFIDENCE_THRESHOLD}%): {reviewConfidenceSummary.lowConfidenceCount}</span>
                    <span className="review-selected-count">Average confidence: {reviewConfidenceSummary.averageConfidence}%</span>
                  </div>
                </div>
              )}

              {selectedJobId && reviewLoading && <p className="admin-loading">Loading rows...</p>}
              {reviewError && <div className="admin-error">{reviewError}</div>}

              {selectedJobId && !reviewLoading && reviewRows.length === 0 && (
                <p className="admin-empty">No pending rows for this job.</p>
              )}

              {selectedJobId && filteredReviewRows.length > 0 && (
                <div className="review-bulk-actions">
                  <button className="btn btn-outline btn-sm" onClick={toggleSelectAllFilteredRows} disabled={reviewSubmitting}>
                    Select / Unselect Filtered
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setSelectedReviewRowIds([])} disabled={reviewSubmitting || reviewSelectionCount === 0}>
                    Clear Selection
                  </button>
                  <input
                    type="text"
                    placeholder="Optional bulk notes"
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    disabled={reviewSubmitting}
                  />
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => void handleBulkReview('approve')}
                    disabled={reviewSubmitting || reviewSelectionCount === 0}
                  >
                    Approve Selected
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => void handleBulkReview('reject')}
                    disabled={reviewSubmitting || reviewSelectionCount === 0}
                  >
                    Reject Selected
                  </button>
                </div>
              )}

              {filteredReviewRows.map((row) => {
                const normalized = parseNormalizedRow(row)
                const conflictPayload = parseConflictPayload(row)
                const isSelected = selectedReviewRowIds.includes(row.id)
                const provenance = provenanceByRowId[row.id]

                return (
                  <div key={row.id} className={`review-row-card ${isSelected ? 'selected' : ''}`}>
                    <div className="review-row-meta">
                      <label className="review-row-select">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReviewRowSelection(row.id)}
                          disabled={reviewSubmitting}
                        />
                        <span>Select</span>
                      </label>
                      <span>Row #{row.row_number}</span>
                      <span>Confidence: {row.confidence_score}%</span>
                      <span>Source: {row.source_name}</span>
                      <span>Type: {row.source_type}</span>
                      <span>{formatDate(row.created_at)}</span>
                    </div>

                    {row.source_reference && (
                      <div className="review-row-meta">
                        <span>Reference: {row.source_reference}</span>
                        <span>Job status: {row.import_job_status}</span>
                      </div>
                    )}

                    {conflictPayload && (
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Existing</th>
                              <th>Incoming</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(new Set([...Object.keys(conflictPayload.existing), ...Object.keys(conflictPayload.incoming)])).sort().map((key) => (
                              <tr key={key}>
                                <td>{key}</td>
                                <td>{String(conflictPayload.existing[key] ?? '-')}</td>
                                <td>{String(conflictPayload.incoming[key] ?? '-')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {!conflictPayload && normalized && (
                      <table className="review-data-table">
                        <tbody>
                          {Object.entries(normalized).map(([k, v]) => (
                            <tr key={k}>
                              <th>{k}</th>
                              <td>{String(v ?? '-')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {!normalized && <pre className="review-raw">{row.raw_payload}</pre>}

                    <div className="review-row-actions">
                      <button
                        className="btn btn-outline"
                        onClick={() => void handleLoadProvenance(row)}
                        disabled={reviewSubmitting || provenanceLoadingRowId === row.id}
                      >
                        {provenanceLoadingRowId === row.id ? 'Loading provenance...' : 'View Provenance'}
                      </button>
                      <input
                        type="text"
                        placeholder="Optional notes"
                        value={actionNotes[row.id] || ''}
                        onChange={(e) => setActionNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        disabled={reviewSubmitting}
                      />
                      <button className="btn btn-success" onClick={() => void handleReview(row, 'approve')} disabled={reviewSubmitting}>
                        {conflictPayload ? 'Use Incoming' : 'Approve'}
                      </button>
                      <button className="btn btn-danger" onClick={() => void handleReview(row, 'reject')} disabled={reviewSubmitting}>
                        {conflictPayload ? 'Keep Existing' : 'Reject'}
                      </button>
                    </div>

                    {provenance && (
                      <div className="table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Provenance</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(provenance).map(([key, value]) => (
                              <tr key={key}>
                                <td>{key}</td>
                                <td>{typeof value === 'string' ? value : JSON.stringify(value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="admin-panel">
          {jobsError && <div className="admin-error">{jobsError}</div>}
          {jobsLoading && <p className="admin-loading">Loading jobs...</p>}
          {!jobsLoading && jobs.length === 0 && <p className="admin-empty">No import jobs found.</p>}
          {!jobsLoading && jobs.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Source ID</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Imported</th>
                    <th>Pending Review</th>
                    <th>Errors</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>#{job.id}</td>
                      <td>{job.source_id}</td>
                      <td>
                        <span className={`status-badge status-${job.status.replace(/_/g, '-')}`}>{job.status}</span>
                      </td>
                      <td>{job.total_rows}</td>
                      <td>{job.imported_rows}</td>
                      <td>
                        {job.pending_review_rows > 0 ? <span className="badge">{job.pending_review_rows}</span> : job.pending_review_rows}
                      </td>
                      <td>{job.error_rows}</td>
                      <td>{formatDate(job.started_at)}</td>
                      <td>{job.completed_at ? formatDate(job.completed_at) : '-'}</td>
                      <td>
                        {job.pending_review_rows > 0 && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setTab('review')
                              handleSelectJob(job.id)
                            }}
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="admin-panel">
          {/* ── Summary Cards ─────────────────────────────────────── */}
          {(() => {
            const lastImport = sources
              .map((s) => s.imported_at)
              .filter(Boolean)
              .sort()
              .at(-1)
            const lastImportSource = lastImport
              ? sources.find((s) => s.imported_at === lastImport)?.source_name ?? '—'
              : '—'
            const mostRecent = auditRows[0]?.changed_at
            const mostRecentActor = auditRows[0] ? getAuditActor(auditRows[0], sources) : '—'
            return (
              <div className="audit-summary-cards">
                <div className="audit-summary-card">
                  <span className="audit-summary-label">Last Tariff Update</span>
                  <span className="audit-summary-value">{lastImport ? formatDate(lastImport) : 'No data'}</span>
                  <span className="audit-summary-meta">{lastImportSource} • {mostRecentActor}</span>
                </div>
                <div className="audit-summary-card">
                  <span className="audit-summary-label">Total Rate Changes</span>
                  <span className="audit-summary-value">{auditRows.length}{auditRows.length === PAGE_SIZE ? '+' : ''}</span>
                  <span className="audit-summary-meta">{auditHsFilter ? `filtered: ${auditHsFilter}` : 'current page'}</span>
                </div>
                <div className="audit-summary-card">
                  <span className="audit-summary-label">Most Recent Change</span>
                  <span className="audit-summary-value">{mostRecent ? formatDate(mostRecent) : '—'}</span>
                  <span className="audit-summary-meta">{auditRows[0]?.hs_code ?? ''}</span>
                </div>
              </div>
            )
          })()}

          <div className="audit-toolbar">
            <input
              type="text"
              placeholder="Filter by HS Code (e.g. 8471.30)"
              value={auditHsFilter}
              onChange={(e) => {
                setAuditHsFilter(e.target.value)
                setAuditOffset(0)
              }}
              className="audit-search"
            />
            <button className="btn btn-outline btn-sm" onClick={() => void loadAudit(auditHsFilter, auditOffset)}>
              Refresh
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleExportAuditCsv} disabled={auditRows.length === 0}>
              Export CSV
            </button>
          </div>

          {auditError && <div className="admin-error">{auditError}</div>}
          {auditLoading && <p className="admin-loading">Loading audit log...</p>}
          {!auditLoading && auditRows.length === 0 && <p className="admin-empty">No audit entries found.</p>}

          {!auditLoading && auditRows.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>HS Code</th>
                    <th>Old Duty</th>
                    <th>New Duty</th>
                    <th>Old VAT</th>
                    <th>New VAT</th>
                    <th>Old Surcharge</th>
                    <th>New Surcharge</th>
                    <th>Reason</th>
                    <th>Updated By</th>
                    <th>Changed At</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((entry) => (
                    <tr key={entry.id}>
                      <td><code>{entry.hs_code}</code></td>
                      <td>{formatPct(entry.old_duty_rate)}</td>
                      <td>{formatPct(entry.new_duty_rate)}</td>
                      <td>{formatPct(entry.old_vat_rate)}</td>
                      <td>{formatPct(entry.new_vat_rate)}</td>
                      <td>{formatPct(entry.old_surcharge_rate)}</td>
                      <td>{formatPct(entry.new_surcharge_rate)}</td>
                      <td>{entry.reason || '-'}</td>
                      <td>{getAuditActor(entry, sources)}</td>
                      <td>{formatDate(entry.changed_at)}</td>
                      <td>{sources.find((s) => s.id === entry.source_id)?.source_name ?? (entry.source_id != null ? `Source #${entry.source_id}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!auditLoading && (
            <div className="pagination">
              <button
                className="btn btn-outline btn-sm"
                disabled={auditOffset === 0}
                onClick={() => setAuditOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              >
                Prev
              </button>
              <span>Page {Math.floor(auditOffset / PAGE_SIZE) + 1}</span>
              <button
                className="btn btn-outline btn-sm"
                disabled={auditRows.length < PAGE_SIZE}
                onClick={() => setAuditOffset((prev) => prev + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'sources' && (
        <div className="admin-panel">
          <section className="tariff-import-panel">
            <div className="tariff-import-header">
              <div>
                <h2>Tariff Import Workspace</h2>
                <p>Download the template, stage a CSV, preview normalization results, then import into the review workflow.</p>
              </div>
              <div className="tariff-import-actions">
                <button className="btn btn-outline btn-sm" onClick={handleDownloadTariffTemplate}>
                  Download CSV Template
                </button>
                <label className="btn btn-outline btn-sm tariff-file-button">
                  Load CSV/XLSX File
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => void handleTariffFileSelected(event)}
                  />
                </label>
              </div>
            </div>

            <div className="tariff-import-grid">
              <label>
                <span>Source name</span>
                <input
                  type="text"
                  value={tariffImportSourceName}
                  onChange={(event) => setTariffImportSourceName(event.target.value)}
                  placeholder="Admin tariff import"
                />
              </label>
              <label>
                <span>Source type</span>
                <select value={tariffImportSourceType} onChange={(event) => setTariffImportSourceType(event.target.value)}>
                  <option value="tariff-rates">Tariff rates</option>
                  <option value="tariff-commission">Tariff Commission</option>
                  <option value="boc">BOC</option>
                  <option value="manual-curation">Manual curation</option>
                </select>
              </label>
              <label>
                <span>Source reference</span>
                <input
                  type="text"
                  value={tariffImportSourceReference}
                  onChange={(event) => setTariffImportSourceReference(event.target.value)}
                  placeholder="URL, circular number, or file name"
                />
              </label>
              <label>
                <span>Auto-approve threshold</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={tariffAutoApproveThreshold}
                  onChange={(event) => setTariffAutoApproveThreshold(event.target.value)}
                />
              </label>
            </div>

            <div className="tariff-import-meta">
              <label className="tariff-toggle">
                <input
                  type="checkbox"
                  checked={tariffForceApprove}
                  onChange={(event) => setTariffForceApprove(event.target.checked)}
                />
                <span>Force approve valid rows</span>
              </label>
              <span className="tariff-import-file">Loaded file: {tariffImportFileName || 'None'}</span>
            </div>

            {tariffImportUploadMode === 'file-binary' && tariffImportFileName && (
              <div className="tariff-import-hint">
                Workbook upload ready: {tariffImportFileName}. Preview/import will use the uploaded workbook instead of textarea CSV.
              </div>
            )}

            <label className="tariff-import-csv-field">
              <span>Tariff CSV content</span>
              <textarea
                value={tariffImportCsvText}
                onChange={(event) => {
                  setTariffImportCsvText(event.target.value)
                  setTariffImportFileContentBase64('')
                  setTariffImportUploadMode('csv-text')
                  setTariffImportFileName('')
                  setTariffPreview(null)
                  setTariffImportSuccess(null)
                }}
                placeholder="Paste tariff import CSV here"
                rows={12}
              />
            </label>

            <div className="tariff-import-hint">
              Required columns: <code>hsCode</code>, <code>dutyRate</code>. Recommended columns: <code>scheduleCode</code>, <code>description</code>, <code>vatRate</code>, <code>surchargeRate</code>, <code>effectiveDate</code>, <code>endDate</code>, <code>notes</code>, <code>confidenceScore</code>.
            </div>

            <div className="tariff-import-actions-row">
              <button className="btn btn-primary" onClick={() => void handlePreviewTariffImport()} disabled={tariffPreviewLoading || tariffImportLoading}>
                {tariffPreviewLoading ? 'Previewing...' : 'Preview Import'}
              </button>
              <button
                className="btn btn-success"
                onClick={() => void handleRunTariffImport()}
                disabled={tariffImportLoading || tariffPreviewLoading || !tariffPreview || tariffPreview.validRows === 0}
              >
                {tariffImportLoading ? 'Importing...' : 'Import Tariff Rows'}
              </button>
            </div>

            {tariffImportError && <div className="admin-error">{tariffImportError}</div>}

            {tariffImportSuccess && (
              <div className="tariff-import-summary success">
                <strong>Import completed.</strong> Job #{tariffImportSuccess.importJobId} created with {tariffImportSuccess.importedRows} imported rows, {tariffImportSuccess.pendingReviewRows} pending review rows, and {tariffImportSuccess.errorRows} error rows.
              </div>
            )}

            {tariffPreview && (
              <div className="tariff-preview-block">
                <div className="tariff-preview-metrics">
                  <div className="metric-card">
                    <p className="metric-label">Total Rows</p>
                    <p className="metric-value">{tariffPreview.totalRows}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Valid Rows</p>
                    <p className="metric-value">{tariffPreview.validRows}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Invalid Rows</p>
                    <p className="metric-value">{tariffPreview.invalidRows}</p>
                  </div>
                </div>

                <div className="tariff-preview-actions">
                  <button className="btn btn-outline btn-sm" onClick={handleExportTariffPreviewCsv}>
                    Export Preview CSV
                  </button>
                </div>

                <div className="table-wrap tariff-preview-table-wrap">
                  <table className="admin-table tariff-preview-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Status</th>
                        <th>HS Code</th>
                        <th>Schedule</th>
                        <th>Duty</th>
                        <th>VAT</th>
                        <th>Effective Date</th>
                        <th>Notes / Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tariffPreview.rows.map((row) => {
                        const normalized = row.normalized || {}
                        return (
                          <tr key={row.rowNumber} className={row.errors.length > 0 ? 'preview-invalid-row' : 'preview-valid-row'}>
                            <td>{row.rowNumber}</td>
                            <td>{row.errors.length > 0 ? 'Invalid' : 'Valid'}</td>
                            <td>{String(normalized.hsCode ?? row.raw.hsCode ?? '-')}</td>
                            <td>{String(normalized.scheduleCode ?? row.raw.scheduleCode ?? 'MFN')}</td>
                            <td>{String(normalized.dutyRate ?? row.raw.dutyRate ?? '-')}</td>
                            <td>{String(normalized.vatRate ?? row.raw.vatRate ?? '-')}</td>
                            <td>{String(normalized.effectiveDate ?? row.raw.effectiveDate ?? '-')}</td>
                            <td>
                              {row.errors.length > 0
                                ? row.errors.join('; ')
                                : String(normalized.notes ?? row.raw.notes ?? 'Ready for import')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <div className="source-governance-summary">
            <div className="metric-card">
              <p className="metric-label">Total Sources</p>
              <p className="metric-value">{sourceSummary.totalSources}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">With Pending Review</p>
              <p className="metric-value">{sourceSummary.sourcesWithPending}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">With Errors</p>
              <p className="metric-value">{sourceSummary.sourcesWithErrors}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Pending Rows</p>
              <p className="metric-value">{sourceSummary.pendingRows}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Avg Import Completion</p>
              <p className="metric-value">{sourceSummary.averageCompletion}%</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">MFN Coverage</p>
              <p className="metric-value">{catalogHealth ? `${catalogHealth.mfnCoveragePercent}%` : '-'}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Latest Full Sync</p>
              <p className="metric-value">{catalogHealth?.latestFullSyncAt ? formatDate(catalogHealth.latestFullSyncAt) : '-'}</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Cutover Ready</p>
              <p className="metric-value">{catalogHealth?.recommendedCutover ? 'Yes' : 'No'}</p>
            </div>
          </div>

          <div className="sources-toolbar">
            <input
              type="text"
              placeholder="Search source name, type, or reference"
              value={sourceSearch}
              onChange={(e) => setSourceSearch(e.target.value)}
              className="source-search"
            />
            <select
              className="source-filter"
              value={sourceStatusFilter}
              onChange={(e) => setSourceStatusFilter(e.target.value as 'all' | 'pending-review' | 'error' | 'healthy')}
            >
              <option value="all">All source states</option>
              <option value="pending-review">Pending review</option>
              <option value="error">Error states</option>
              <option value="healthy">Healthy</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => void loadSources()}>
              Refresh
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleExportSourceGovernanceCsv} disabled={filteredSourceRows.length === 0}>
              Export Sources CSV
            </button>
          </div>

          {sourcesError && <div className="admin-error">{sourcesError}</div>}
          {sourcesLoading && <p className="admin-loading">Loading tariff sources...</p>}
          {!sourcesLoading && filteredSourceRows.length === 0 && <p className="admin-empty">No tariff sources found.</p>}
          {!sourcesLoading && filteredSourceRows.length > 0 && (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Reference</th>
                    <th>Fetched</th>
                    <th>Imported</th>
                    <th>Latest Job</th>
                    <th>Pending Review</th>
                    <th>Error Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSourceRows.map(({ source, latestJob }) => (
                    <tr key={source.id}>
                      <td>{source.source_name}</td>
                      <td>{source.source_type}</td>
                      <td>{source.status}</td>
                      <td>{source.source_reference || '-'}</td>
                      <td>{formatDate(source.fetched_at)}</td>
                      <td>{source.imported_at ? formatDate(source.imported_at) : '-'}</td>
                      <td>{latestJob ? `${latestJob.status} (#${latestJob.id})` : '-'}</td>
                      <td>{latestJob?.pending_review_rows || 0}</td>
                      <td>{latestJob?.error_rows || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
