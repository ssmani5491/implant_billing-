import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { amountInWords } from '../utils/amountInWords';
import letterhead from '../assets/hospital-letterhead.png';
import type { InvoiceDetail, PaymentMode } from '../types';
import './InvoicePrint.css';

const BILL_TITLES: Record<PaymentMode, string> = {
  Cash: 'CASH BILL',
  Card: 'CARD BILL',
  UPI: 'CARD BILL',
  Insurance: 'INSURANCE BILL',
  Cheque: 'CHEQUE BILL',
};

function formatBillDate(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return isoDateTime;

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${day}/${month}/${year} ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}

export function InvoicePrint() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiClient.get<InvoiceDetail>(`/invoices/${id}`);
        setInvoice(data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load invoice.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="print-page-status">Loading...</div>;
  if (error) return <div className="print-page-status print-page-error">{error}</div>;
  if (!invoice) return null;

  const billTitle = BILL_TITLES[invoice.payment_mode] || 'CASH BILL';

  return (
    <div className="bill-page">
      <div className="bill-toolbar no-print">
        <button onClick={() => window.print()}>Print</button>
      </div>

      <div className="bill-sheet">
        <img src={letterhead} alt="GG Hospital" className="bill-letterhead" />

        <div className="bill-title">- {billTitle}</div>

        <table className="bill-info-table">
          <tbody>
            <tr>
              <td className="bill-label">Patient ID</td>
              <td className="bill-value">{invoice.patient_uhid}</td>
              <td className="bill-label">Bill #</td>
              <td className="bill-value">{invoice.invoice_no}</td>
            </tr>
            <tr>
              <td className="bill-label">Patient Name</td>
              <td className="bill-value">{invoice.patient_name}</td>
              <td className="bill-label">Bill Date</td>
              <td className="bill-value">{formatBillDate(invoice.created_at)}</td>
            </tr>
            <tr>
              <td className="bill-label">Age &amp; Gender</td>
              <td className="bill-value">
                {invoice.patient_age ? `${invoice.patient_age} Y` : '-'} / {invoice.patient_gender || '-'}
              </td>
              <td className="bill-label">Doctor</td>
              <td className="bill-value">{invoice.doctor_name || '-'}</td>
            </tr>
            <tr>
              <td className="bill-label">Contact No.</td>
              <td className="bill-value">{invoice.patient_mobile || '-'}</td>
              <td className="bill-label">Department</td>
              <td className="bill-value">{invoice.department || '-'}</td>
            </tr>
            <tr>
              <td className="bill-label">Address</td>
              <td className="bill-value">{invoice.patient_address || '-'}</td>
              <td className="bill-label">Scheme</td>
              <td className="bill-value">{invoice.insurance_company || '-'}</td>
            </tr>
          </tbody>
        </table>

        <table className="bill-items-table">
          <thead>
            <tr>
              <th className="bill-col-sl">Sl#</th>
              <th className="bill-col-desc">Description</th>
              <th className="bill-col-qty">Qty</th>
              <th className="bill-col-amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((line, index) => (
              <tr key={line.id}>
                <td className="bill-col-sl">{index + 1}</td>
                <td className="bill-col-desc">{line.item_name}</td>
                <td className="bill-col-qty">{Number(line.quantity).toFixed(2)}</td>
                <td className="bill-col-amount">{Number(line.line_total).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bill-subtotal-row">
              <td colSpan={3}></td>
              <td className="bill-col-amount">{Number(invoice.subtotal).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <table className="bill-totals-table">
          <tbody>
            <tr>
              <td className="bill-totals-label">Gross Amount</td>
              <td className="bill-totals-value">{Number(invoice.subtotal).toFixed(2)}</td>
            </tr>
            <tr className="bill-totals-final">
              <td className="bill-totals-label">Patient Payable</td>
              <td className="bill-totals-value">{Number(invoice.total_amount).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="bill-amount-words">
          Patient Payable : {amountInWords(Number(invoice.total_amount))}
        </div>

        <div className="bill-footer">
          <div className="bill-footer-left">Payment Mode : {invoice.payment_mode}</div>
          <div className="bill-footer-right">
            <div>Signature &amp; Stamp</div>
            <div>Cashier : {invoice.created_by_name || '-'}</div>
          </div>
        </div>

        <div className="bill-note">
          <span>N.B: Computer Generated Bill Signature Not Required</span>
          <span className="bill-page-no">Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}
