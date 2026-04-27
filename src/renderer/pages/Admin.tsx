import React, { useCallback, useEffect, useState } from 'react'
import { appApi } from '../lib/appApi'
import './Admin.css'

type ReviewRow = {
  id: number
  row_number: number
  raw_payload: string
  normalized_payload: string | null
  confidence_score: number
  review_notes: string | null
  created_at: string
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

type Tab = 'review' | 'jobs' | 'audit'

const formatPct = (v: number | null): string =>
  v !== null ? `${(v * 100).toFixed(2)}%` : '—'

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const PAGE_SIZE = 20

export const Admin: React.FC = () => {
  const [tab, setTab] = useState<Tab>('review')

  // Review Queue state
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState<Record<number, string>>({})

  // Import Jobs state
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)

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

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  useEffect(() => {
    if (tab === 'audit') {
      loadAudit(auditHsFilter, auditOffset)
    }
  }, [tab, auditHsFilter, auditOffset, loadAudit])

  const handleSelectJob = (jobId: number) => {
    setSelectedJobId(jobId)
    loadReviewRows(jobId)
  }

  const handleReview = async (row: ReviewRow, action: 'approve' | 'reject') => {
    if (!selectedJobId) return
    setReviewError(null)
    try {
      await appApi.reviewRow({
        importJobId: selectedJobId,
        rowId: row.id,
        action,
        notes: actionNotes[row.id] || undefined,
      })
      setReviewRows((prev) => prev.filter((r) => r.id !== row.id))
    } catch (err) {
      setReviewError(String(err))
    }
  }

  const jobsWithPending = jobs.filter((j) => j.pending_review_rows > 0)

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
      </div>

      {/* Review Queue */}
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

              {selectedJobId && reviewLoading && <p className="admin-loading">Loading rows...</p>}
              {reviewError && <div className="admin-error">{reviewError}</div>}

              {selectedJobId && !reviewLoading && reviewRows.length === 0 && (
                <p className="admin-empty">No pending rows for this job.</p>
              )}

              {reviewRows.map((row) => {
                let normalized: Record<string, unknown> | null = null
                try {
                  if (row.normalized_payload) normalized = JSON.parse(row.normalized_payload)
                } catch { /* skip */ }

                return (
                  <div key={row.id} className="review-row-card">
                    <div className="review-row-meta">
                      <span>Row #{row.row_number}</span>
                      <span>Confidence: {row.confidence_score}%</span>
                      <span>{formatDate(row.created_at)}</span>
                    </div>

                    {normalized && (
                      <table className="review-data-table">
                        <tbody>
                          {Object.entries(normalized).map(([k, v]) => (
                            <tr key={k}>
                              <th>{k}</th>
                              <td>{String(v ?? '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {!normalized && (
                      <pre className="review-raw">{row.raw_payload}</pre>
                    )}

                    <div className="review-row-actions">
                      <input
                        type="text"
                        placeholder="Optional notes"
                        value={actionNotes[row.id] || ''}
                        onChange={(e) => setActionNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      />
                      <button className="btn btn-success" onClick={() => handleReview(row, 'approve')}>
                        Approve
                      </button>
                      <button className="btn btn-danger" onClick={() => handleReview(row, 'reject')}>
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Import Jobs */}
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
                        {job.pending_review_rows > 0 ? (
                          <span className="badge">{job.pending_review_rows}</span>
                        ) : (
                          job.pending_review_rows
                        )}
                      </td>
                      <td>{job.error_rows}</td>
                      <td>{formatDate(job.started_at)}</td>
                      <td>{job.completed_at ? formatDate(job.completed_at) : '—'}</td>
                      <td>
                        {job.pending_review_rows > 0 && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => { setTab('review'); handleSelectJob(job.id) }}
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

      {/* Rate Change Audit */}
      {tab === 'audit' && (
        <div className="admin-panel">
          <div className="audit-toolbar">
            <input
              type="text"
              placeholder="Filter by HS Code (e.g. 8471.30)"
              value={auditHsFilter}
              onChange={(e) => { setAuditHsFilter(e.target.value); setAuditOffset(0) }}
              className="audit-search"
            />
            <button className="btn btn-outline btn-sm" onClick={() => loadAudit(auditHsFilter, auditOffset)}>
              Refresh
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
                    <th>Changed At</th>
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
                      <td>{entry.reason || '—'}</td>
                      <td>{formatDate(entry.changed_at)}</td>
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
                ← Prev
              </button>
              <span>Page {Math.floor(auditOffset / PAGE_SIZE) + 1}</span>
              <button
                className="btn btn-outline btn-sm"
                disabled={auditRows.length < PAGE_SIZE}
                onClick={() => setAuditOffset((prev) => prev + PAGE_SIZE)}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
