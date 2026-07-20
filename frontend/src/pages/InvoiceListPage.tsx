import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { Pagination } from '../components/Pagination';
import type { InvoiceListItem, PaginatedResponse } from '../types';

export function InvoiceListPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [invoiceNo, setInvoiceNo] = useState('');
  const [patientUhid, setPatientUhid] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PaginatedResponse<InvoiceListItem>>('/invoices', {
        params: {
          page: targetPage,
          pageSize: 20,
          invoice_no: invoiceNo || undefined,
          patient_uhid: patientUhid || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      setInvoices(data.data);
      setPage(data.page);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load invoices.'));
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

  return (
    <div className="page">
      <h1>Invoices</h1>

      <form className="filter-bar" onSubmit={handleFilter}>
        <input placeholder="Invoice No." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        <input placeholder="Patient UHID" value={patientUhid} onChange={(e) => setPatientUhid(e.target.value)} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit">Filter</button>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice No.</th>
                <th>Date</th>
                <th>Patient</th>
                <th>UHID</th>
                <th>Total</th>
                <th>Status</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link to={`/invoices/${inv.id}`}>{inv.invoice_no}</Link>
                  </td>
                  <td>{inv.invoice_date}</td>
                  <td>{inv.patient_name}</td>
                  <td>{inv.patient_uhid}</td>
                  <td>₹{Number(inv.total_amount).toFixed(2)}</td>
                  <td>{inv.status}</td>
                  <td>
                    <span className={`approval-badge approval-badge-${inv.approval_status}`}>
                      {inv.approval_status}
                    </span>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-row">
                    No invoices found.
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
