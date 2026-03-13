/**
 * Sends the signed SOAP XML to the Croatian Tax Administration (Porezna uprava)
 * and parses the JIR (Jedinstveni identifikator računa) from the response.
 *
 * Endpoint URLs:
 *   Demo:       https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest
 *   Production: https://cis.porezna-uprava.hr:8449/FiskalizacijaService
 */
const axios = require("axios");
const https  = require("https");
const { XMLParser } = require("fast-xml-parser");
const { getFiscalizationConfig } = require("../../config/fiscalization");

// Demo endpoint uses a FINA/APIS-IT CA not included in Node's bundled CA store.
// In demo mode we skip SSL verification (safe for a test-only endpoint).
// Production always uses full verification.
const _demoAgent = new https.Agent({ rejectUnauthorized: false });

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,   // strip namespace prefixes so we can find elements by local name
});

/**
 * POST the signed SOAP XML to the FINA endpoint and return { jir, rawResponse }.
 *
 * On HTTP errors or FINA fault responses this throws with a descriptive message
 * so the caller can record the error without crashing the invoice flow.
 *
 * @param {string} signedXml - Fully signed SOAP envelope XML
 * @returns {Promise<{ jir: string, rawResponse: string }>}
 */
async function sendToTaxAdmin(signedXml) {
  const config = getFiscalizationConfig();

  let response;
  try {
    response = await axios.post(config.endpoint, signedXml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction":   "",
      },
      timeout: config.timeoutMs,
      // Return the raw string even on 4xx/5xx so we can log the fault
      validateStatus: () => true,
      // Demo endpoint uses a CA not in Node's bundle — skip verification there only
      ...(config.environment === "demo" && { httpsAgent: _demoAgent }),
    });
  } catch (networkErr) {
    throw new Error(`FINA network error: ${networkErr.message}`);
  }

  const rawResponse = String(response.data || "");

  // Parse response XML (attempt even on 5xx — FINA often returns Greske inside a 500)
  let parsed;
  try {
    parsed = parser.parse(rawResponse);
  } catch {
    throw new Error(`FINA response is not valid XML. Status: ${response.status}. Body: ${rawResponse.substring(0, 300)}`);
  }

  // Walk envelope → body → RacunOdgovor or Fault
  const envelope = parsed?.Envelope || parsed?.["soapenv:Envelope"] || {};
  const body     = envelope?.Body || envelope?.["soapenv:Body"] || {};

  // Check for SOAP Fault
  const fault = body?.Fault;
  if (fault) {
    const faultString = fault?.faultstring || fault?.Reason?.Text || JSON.stringify(fault);
    throw new Error(`FINA SOAP fault: ${faultString}`);
  }

  // Extract RacunOdgovor (success) or Odgovor (error — FINA uses this on HTTP 500)
  const racunOdgovor = body?.RacunOdgovor || body?.Odgovor;
  if (!racunOdgovor) {
    throw new Error(`FINA response missing RacunOdgovor element. HTTP ${response.status}. Body: ${rawResponse.substring(0, 500)}`);
  }

  // Check for application-level errors (Greske element)
  const greske = racunOdgovor?.Greske;
  if (greske) {
    const greska = greske?.Greska;
    const msgs   = Array.isArray(greska) ? greska : [greska];
    const details = msgs.map((g) => `[${g?.SifraGreske || "?"}] ${g?.PorukaGreske || JSON.stringify(g)}`).join("; ");
    throw new Error(`FINA returned error(s): ${details}`);
  }

  // Extract JIR
  const jir = racunOdgovor?.Jir;
  if (!jir || typeof jir !== "string" || jir.trim().length === 0) {
    throw new Error(`FINA response missing JIR. RacunOdgovor: ${JSON.stringify(racunOdgovor)}`);
  }

  return { jir: jir.trim(), rawResponse };
}

module.exports = { sendToTaxAdmin };
