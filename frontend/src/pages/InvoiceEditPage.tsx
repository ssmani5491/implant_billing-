import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, extractErrorMessage } from '../api/client';
import { PAYMENT_MODE_OPTIONS } from '../constants/invoiceOptions';
import { VendorDocumentsSection, useVendors } from '../components/VendorDocumentsSection';
import type { InvoiceDetail, PaymentMode } from '../types';

export function InvoiceEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const vendors = useVendors();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [patientUhid, setPatientUhid] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('');
  const [patientMobile, setPatientMobile] = useState('');
  const [patientAddress, setPatientAddress] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [department, setDepartment] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [insuranceCompany, setInsuranceCompany] = useState('');
  const [tpaApprovalNo, setTpaApprovalNo] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadInvoice = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await apiClient.get<InvoiceDetail>(`/invoices/${id}`);
      setInvoice(data);
      setPatientUhid(data.patient_uhid);
      setPatientName(data.patient_name);
      setPatientAge(data.patient_age || '');
      setPatientGender(data.patient_gender || '');
      setPatientMobile(data.patient_mobile || '');
      setPatientAddress(data.patient_address || '');
      setDoctorName(data.doctor_name || '');
      setDepartment(data.department || '');
      setPaymentMode(data.payment_mode);
      setInvoiceDate(data.invoice_date);
      setInsuranceCompany(data.insurance_company || '');
      setTpaApprovalNo(data.tpa_approval_no || '');
    } catch (err) {
      setLoadError(extractErrorMessage(err, 'Failed to load invoice.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.put(`/invoices/${id}`, {
        patient_uhid: patientUhid,
        patient_name: patientName,
        patient_age: patientAge,
        patient_gender: patientGender,
        patient_mobile: patientMobile,
        patient_address: patientAddress,
        doctor_name: doctorName,
        department,
        payment_mode: paymentMode,
        invoice_date: invoiceDate,
        insurance_company: insuranceCompany,
        tpa_approval_no: tpaApprovalNo,
      });
      navigate(`/invoices/${id}`);
    } catch (err) {
      setSaveError(extractErrorMessage(err, 'Failed to save invoice.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page">Loading...</div>;
  if (loadError) return <div className="page"><div className="alert alert-error">{loadError}</div></div>;
  if (!invoice) return null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Edit Invoice {invoice.invoice_no}</h1>
        <Link to={`/invoices/${invoice.id}`}>
          <button type="button" className="btn-secondary">
            Cancel
          </button>
        </Link>
      </div>

      <p className="hint">
        Line items, quantities, and totals can't be changed here — only patient details, doctor/department, payment
        mode, and insurance info. To fix billed items, cancel this invoice and create a new one.
      </p>

      <section className="card">
        <h2>Patient</h2>
        <div className="form-grid">
          <label>
            UHID
            <input value={patientUhid} onChange={(e) => setPatientUhid(e.target.value)} />
          </label>
          <label>
            Name
            <input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          </label>
          <label>
            Age
            <input value={patientAge} onChange={(e) => setPatientAge(e.target.value)} />
          </label>
          <label>
            Gender
            <input value={patientGender} onChange={(e) => setPatientGender(e.target.value)} />
          </label>
          <label>
            Mobile
            <input value={patientMobile} onChange={(e) => setPatientMobile(e.target.value)} />
          </label>
          <label>
            Address
            <input value={patientAddress} onChange={(e) => setPatientAddress(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Invoice Details</h2>
        <div className="form-grid">
          <label>
            Doctor Name
            <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
          </label>
          <label>
            Department
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <label>
            Invoice Date
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label>
            Payment Mode
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}>
              {PAYMENT_MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Insurance Company
            <input value={insuranceCompany} onChange={(e) => setInsuranceCompany(e.target.value)} />
          </label>
          <label>
            TPA Approval No.
            <input value={tpaApprovalNo} onChange={(e) => setTpaApprovalNo(e.target.value)} />
          </label>
        </div>
      </section>

      {saveError && <div className="alert alert-error">{saveError}</div>}

      <div className="form-actions">
        <button onClick={handleSave} disabled={saving || !patientUhid.trim() || !patientName.trim()}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <VendorDocumentsSection
        mode="upload"
        vendors={vendors}
        invoiceId={invoice.id}
        documents={invoice.vendor_documents}
        onChanged={loadInvoice}
      />
    </div>
  );
}
