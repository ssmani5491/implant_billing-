import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, extractErrorMessage, openAuthenticatedFile } from '../api/client';
import { Pagination } from '../components/Pagination';
import type { MasterOption, VendorDocumentReportRow } from '../types';

interface ReportResponse {
  data: VendorDocumentReportRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function VendorDocumentsReportPage() {
  const [rows, setRows] = useState<VendorDocumentReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<MasterOption[]>([]);
  const [patientUhid, setPatientUhid] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [vendorId, setVendorId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    apiClient
      .get<MasterOption[]>('/vendors')
      .then(({ data }) => setVendors(data))
      .catch(() => setVendors([]));
  }, []);

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<ReportResponse>('/vendor-documents', {
        params: {
          page: targetPage,
          limit: 20,
          patient_uhid: patientUhid || undefined,
          invoice_no: invoiceNo || undefined,
          vendor_id: vendorId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setRows(data.data);
      setPage(data.page);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load vendor documents.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const handleViewFile = async (row: VendorDocumentReportRow) => {
    try {
      await openAuthenticatedFile(`/invoices/${row.invoice_id}/vendor-documents/${row.document_id}/file`);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to open file.'));
    }
  };

  return (
    <div className="page">
      <h1>Vendor Documents</h1>

      <form className="filter-bar" onSubmit={handleFilter}>
        <input placeholder="Patient UHID" value={patientUhid} onChange={(e) => setPatientUhid(e.target.value)} />
        <input placeholder="Invoice No." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient UHID</th>
                <th>Patient Name</th>
                <th>Invoice No.</th>
                <th>Invoice Date</th>
                <th>Vendor</th>
                <th>Vendor Invoice No.</th>
                <th>Vendor Invoice Date</th>
                <th>File</th>
                <th>Uploaded By</th>
                <th>Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.document_id}>
                  <td>{row.patient_uhid}</td>
                  <td>{row.patient_name}</td>
                  <td>
                    <Link to={`/invoices/${row.invoice_id}`}>{row.invoice_no}</Link>
                  </td>
                  <td>{row.invoice_date}</td>
                  <td>{row.vendor_name}</td>
                  <td>{row.vendor_invoice_no || '-'}</td>
                  <td>{row.vendor_invoice_date || '-'}</td>
                  <td>
                    <button type="button" className="link-button" onClick={() => handleViewFile(row)}>
                      {row.original_filename}
                    </button>
                  </td>
                  <td>{row.uploaded_by_name || '-'}</td>
                  <td>{row.uploaded_at}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-row">
                    No vendor documents found for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination page={page} totalPages={totalPages} onChange={load} />
        </>
      )}
    </div>
  );
}
