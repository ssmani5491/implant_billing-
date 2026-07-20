const express = require('express');
const { withConnection } = require('../db/oracle');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Admission lookup against the real HIS schema (confirmed against the hospital's
// Oracle DB — see backend/scripts/debugHis.js for how this was diagnosed).
//
// DISREQUESTDETL (discharge request detail) is joined with a LEFT JOIN, not an
// INNER JOIN: a currently-admitted patient has no discharge request row yet, so
// an inner join here would silently exclude every admitted (non-discharged)
// patient — which is exactly what caused "No patient found" for real, admitted
// patients (e.g. GG00238841) even though they exist in IPADMISS. The discharge
// fields (DISC_REQ_DATE etc.) are already nullable on the API response — they
// simply come back null for patients who haven't been discharged yet.
//
// Age/gender/mobile/address come straight off IPADMISS itself (confirmed present
// via backend/scripts/debugHis.js — PTC_SEX, PTN_YEARAGE, PTC_MOBILE, and address
// lines). Address is stored as up to 4 free-text lines in two possible places:
// IPC_PRADD1-4 (permanent address) and PTC_LOADD1-4 (local/current address). In
// practice PTC_LOADD tends to be populated when IPC_PRADD is blank (and vice
// versa), so both are coalesced together, line by line, then joined.
const PATIENT_LOOKUP_SQL = `
  SELECT A.IPD_DATE AS ADMISSION_DATE,
    A.PT_NO AS PT_NO,
    A.PTC_PTNAME AS PT_NAME,
    A.PTC_SEX AS PT_SEX,
    A.PTN_YEARAGE AS PT_AGE,
    A.PTC_MOBILE AS PT_MOBILE,
    NVL(A.IPC_PRADD1, A.PTC_LOADD1) AS ADDR_LINE1,
    NVL(A.IPC_PRADD2, A.PTC_LOADD2) AS ADDR_LINE2,
    NVL(A.IPC_PRADD3, A.PTC_LOADD3) AS ADDR_LINE3,
    NVL(A.IPC_PRADD4, A.PTC_LOADD4) AS ADDR_LINE4,
    B.DOC_NAME AS DOCTOR,
    C.DPC_DESC AS DEPARTMENT,
    F.BDC_NO AS BED,
    G.NSC_DESC AS NUR_STATION,
    E.REQ_DATE AS DISC_REQ_DATE,
    A.IPD_DISC AS DISC_ENTRY_TIME,
    A.DMD_DATE AS DISC_BILLED_TIME
  FROM IPADMISS A, DOCTOR B, DEPARTMENT C, SPECIALITY D, BED F, NURSTATION G, DISREQUESTDETL E
  WHERE A.DO_CODE = B.DO_CODE
    AND B.SP_CODE = D.SP_CODE
    AND C.DP_CODE = D.DP_CODE
    AND A.BD_CODE = F.BD_CODE
    AND F.NS_CODE = G.NS_CODE
    AND A.PT_NO = :uhid
    AND A.IP_NO = E.IP_NO (+)
  ORDER BY A.IPD_DATE DESC
`;

function formatGender(sexCode) {
  if (sexCode === 'M') return 'Male';
  if (sexCode === 'F') return 'Female';
  return sexCode || null;
}

function formatAddress(row) {
  const lines = [row.ADDR_LINE1, row.ADDR_LINE2, row.ADDR_LINE3, row.ADDR_LINE4].filter(Boolean);
  return lines.length > 0 ? lines.join(', ') : null;
}

router.get('/:uhid', requireAuth, async (req, res) => {
  const { uhid } = req.params;

  if (!uhid || !uhid.trim()) {
    return res.status(400).json({ error: 'UHID is required.' });
  }

  const trimmedUhid = uhid.trim();

  console.debug('HIS patient lookup: executing query', {
    sql: PATIENT_LOOKUP_SQL,
    binds: { uhid: trimmedUhid },
  });

  let result;
  try {
    result = await withConnection((conn) =>
      conn.execute(PATIENT_LOOKUP_SQL, { uhid: trimmedUhid }, { maxRows: 1 })
    );
  } catch (err) {
    // A real connection/query failure — log full detail server-side (table names,
    // Oracle error code) for debugging, but never leak raw Oracle internals to the client.
    console.error('HIS patient lookup: query/connection error', {
      uhid: trimmedUhid,
      table: 'IPADMISS (+ DOCTOR, DEPARTMENT, SPECIALITY, BED, NURSTATION, DISREQUESTDETL)',
      code: err.code,
      message: err.message,
    });
    return res.status(500).json({
      error: 'Unable to reach the Hospital Information System right now. Please try again or enter patient details manually.',
    });
  }

  // Query succeeded but returned no rows — a genuine "not found", distinct from the
  // error case above.
  const row = result.rows && result.rows[0];
  if (!row) {
    console.debug('HIS patient lookup: no matching row', { uhid: trimmedUhid });
    return res.status(404).json({ error: 'No patient found with this UHID.' });
  }

  res.json({
    uhid: row.PT_NO,
    name: row.PT_NAME,
    age: row.PT_AGE,
    gender: formatGender(row.PT_SEX),
    mobile: row.PT_MOBILE,
    address: formatAddress(row),
    doctor: row.DOCTOR,
    department: row.DEPARTMENT,
    bed: row.BED,
    nurseStation: row.NUR_STATION,
    admissionDate: row.ADMISSION_DATE,
    dischargeRequestDate: row.DISC_REQ_DATE,
    dischargeEntryTime: row.DISC_ENTRY_TIME,
    dischargeBilledTime: row.DISC_BILLED_TIME,
  });
});

module.exports = router;
