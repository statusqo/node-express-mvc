/**
 * XML signing and ZKI generation for Croatian fiscalisation.
 *
 * ZKI (Zaštitni kod izdavatelja) — Issuer Protection Code:
 *   1. Concatenate: OIB + datetime + seqNum + premisesId + deviceId + grandTotal
 *   2. RSA-SHA1 sign the string using the private key from the FINA .p12 certificate
 *   3. MD5-hash the raw signature bytes → 32-char lowercase hex string
 *
 * XML signing uses XMLDSig (xml-crypto) with the same certificate.
 */
const forge  = require("node-forge");
const crypto = require("crypto");
const { SignedXml } = require("xml-crypto");
const path   = require("path");
const fs     = require("fs");
const { getFiscalizationConfig, resolveCertPath } = require("../../config/fiscalization");

// ─── Certificate cache ────────────────────────────────────────────────────────
let _certCache = null;

/**
 * Load and cache the FINA .p12 certificate.
 * Extracts private key (PEM), public certificate (PEM), and company OIB from CN.
 *
 * @returns {{ privateKeyPem: string, certPem: string, companyOib: string }}
 */
function loadCertificate() {
  if (_certCache) return _certCache;

  const config   = getFiscalizationConfig();
  const certPath = resolveCertPath(config.certPath);

  if (!certPath || !fs.existsSync(certPath)) {
    throw new Error(`FINA certificate not found at: ${certPath || "(FINA_CERT_PATH not set)"}`);
  }

  const p12Buffer = fs.readFileSync(certPath);
  const p12Der    = forge.util.createBuffer(p12Buffer.toString("binary"));
  const p12Asn1   = forge.asn1.fromDer(p12Der);
  const p12       = forge.pkcs12.pkcs12FromAsn1(p12Asn1, config.certPassword);

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag  = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag) throw new Error("FINA certificate: private key bag not found in .p12 file.");
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

  // Extract all certificates from the .p12 (leaf + chain).
  // The first certBag is the leaf (end-entity) certificate; the rest are intermediates/root.
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const allCertBags = certBags[forge.pki.oids.certBag] || [];
  if (allCertBags.length === 0) throw new Error("FINA certificate: certificate bag not found in .p12 file.");
  const certBag  = allCertBags[0];
  const certPem  = forge.pki.certificateToPem(certBag.cert);
  // Chain PEMs: any additional certs (intermediate CAs) bundled in the .p12
  const chainPems = allCertBags.slice(1).map((b) => forge.pki.certificateToPem(b.cert));

  // Extract company OIB (11 digits) from certificate subject.
  // FINA demo certs embed it in organizationName (e.g. "ACME HR33307656573").
  // Production certs may use serialNumber ("OIB:33307656573") or CN.
  const subject = certBag.cert.subject;
  let companyOib = "";
  for (const attr of subject.attributes) {
    if (attr.value) {
      const match = String(attr.value).match(/(\d{11})/);
      if (match) { companyOib = match[1]; break; }
    }
  }
  if (!companyOib) {
    throw new Error("Could not extract company OIB from FINA certificate. Check the certificate subject fields.");
  }

  _certCache = { privateKeyPem, certPem, chainPems, companyOib };
  return _certCache;
}

/**
 * Clear the certificate cache (e.g. after cert rotation).
 */
function clearCertCache() {
  _certCache = null;
}

/**
 * Compute ZKI — the Issuer Protection Code.
 *
 * Input string: "OIB" + "DatVrijeme" + "BrOznRac" + "OznPoslPr" + "OznNapUr" + "IznosUkupno"
 * All fields separated by newline (\n) as per FINA spec.
 *
 * @param {object} params
 * @param {string} params.companyOib          - 11-digit company OIB
 * @param {string} params.fiscalDatetime      - "DD.MM.YYYYTHH:mm:ss" formatted datetime
 * @param {string} params.sequenceNum         - Invoice sequence number (e.g. "42")
 * @param {string} params.premisesId          - Business premises ID (e.g. "INTERNET1")
 * @param {string} params.deviceId            - Device ID (e.g. "1")
 * @param {string} params.grandTotal          - Total amount formatted to 2 decimals (e.g. "150.00")
 * @param {string} params.privateKeyPem       - RSA private key in PEM format
 * @returns {string} 32-char lowercase hex ZKI
 */
function computeZki({ companyOib, fiscalDatetime, sequenceNum, premisesId, deviceId, grandTotal, privateKeyPem }) {
  const input = [companyOib, fiscalDatetime, sequenceNum, premisesId, deviceId, grandTotal].join("\n");

  // RSA-SHA1 sign
  const sign      = crypto.createSign("RSA-SHA1");
  sign.update(input, "utf8");
  const signature = sign.sign(privateKeyPem); // Buffer

  // MD5 of signature bytes → 32 hex chars
  const md5 = crypto.createHash("md5").update(signature).digest("hex");
  return md5;
}

/**
 * Sign the SOAP XML using XMLDSig (xml-crypto).
 * The signed element is the tns:Racun element identified by its Id attribute.
 *
 * @param {string} xmlString     - Unsigned SOAP XML
 * @param {string} privateKeyPem - RSA private key PEM
 * @param {string} certPem       - Certificate PEM (included in KeyInfo)
 * @returns {string} Signed SOAP XML
 */
/**
 * Sign the SOAP XML using XMLDSig (xml-crypto).
 * Pass the full certificate chain (leaf + intermediates) so FINA can validate
 * without out-of-band CA lookups. The leaf cert must be first.
 *
 * @param {string} xmlString     - Unsigned SOAP XML
 * @param {string} privateKeyPem - RSA private key PEM
 * @param {string} certPem       - Leaf certificate PEM
 * @param {string[]} [chainPems] - Intermediate/root CA PEMs (optional)
 * @returns {string} Signed SOAP XML
 */
function signXml(xmlString, privateKeyPem, certPem, chainPems = []) {
  // Pass the full certificate chain as a concatenated PEM string.
  // xml-crypto v6 `getKeyInfoContent` extracts all PEM blocks from `publicCert`
  // and emits one <X509Certificate> per cert inside a single <X509Data>.
  // FINA validates the chain from what's embedded in the request — omitting the
  // intermediate CA cert is the most common cause of the s002 rejection.
  const allCertsPem = [certPem, ...chainPems].join("\n");

  const sig = new SignedXml({
    privateKey:  privateKeyPem,
    publicCert:  allCertsPem,
    signatureAlgorithm:       "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });

  // Use URI="" (sign the whole document) + enveloped-signature transform.
  // This avoids adding an Id attribute to tns:Racun, which would be rejected
  // by FINA's strict XSD schema validation (s001: undefined attribute Id).
  sig.addReference({
    xpath: "/*",       // select root element; combined with isEmptyUri avoids adding Id to tns:Racun
    uri: "",
    isEmptyUri: true,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });

  // Place the Signature element inside tns:RacunZahtjev (after tns:Racun) — required by FINA spec.
  // Without a location hint, xml-crypto appends it to the root element (outside soapenv:Body).
  sig.computeSignature(xmlString, {
    location: {
      reference: "//*[local-name(.)='RacunZahtjev']",
      action: "append",
    },
  });
  return sig.getSignedXml();
}

module.exports = { loadCertificate, clearCertCache, computeZki, signXml };
