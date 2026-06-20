import pool from "../config/database.js";

/**
 * Organiser KYC + bank payout details. The organiser fills these from their
 * dashboard; saving (re)submits the profile for review by setting kyc_status
 * back to PENDING. An admin then approves/rejects via /admin/organizers/:id/kyc.
 */
const KYC_WRITABLE = [
  "pan", "gst_number",
  "bank_account_holder", "bank_account_number", "bank_ifsc", "bank_name",
  "pan_doc_url", "gst_doc_url"
];

const pick = (body, allowed) => {
  const out = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k] === "" ? null : body[k];
  }
  return out;
};

export const getOrganiserKycService = async (organizerId) => {
  const [[row]] = await pool.query(
    `SELECT id, organization_name, contact_email, kyc_status, kyc_submitted_at,
            pan, gst_number, bank_account_holder, bank_account_number, bank_ifsc, bank_name,
            pan_doc_url, gst_doc_url
     FROM organizers WHERE id = ? LIMIT 1`,
    [organizerId]
  );
  if (!row) throw new Error("Organiser not found");
  return row;
};

export const saveOrganiserKycService = async (organizerId, body) => {
  const data = pick(body, KYC_WRITABLE);

  // Minimal sanity checks on the payout essentials when provided.
  if (data.bank_account_number && !/^[0-9]{6,20}$/.test(String(data.bank_account_number))) {
    throw new Error("Bank account number must be 6–20 digits");
  }
  if (data.bank_ifsc && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(data.bank_ifsc))) {
    throw new Error("Invalid IFSC code");
  }

  const cols = Object.keys(data);
  // Saving always (re)submits for review → back to PENDING with a fresh timestamp.
  const setSql = [...cols.map((c) => `${c} = ?`), "kyc_status = 'PENDING'", "kyc_submitted_at = NOW()"].join(", ");
  await pool.query(
    `UPDATE organizers SET ${setSql} WHERE id = ?`,
    [...cols.map((c) => data[c]), organizerId]
  );
  return getOrganiserKycService(organizerId);
};
