/**
 * Builds the SOAP XML envelope for a Croatian fiscalisation (RacunZahtjev) request.
 *
 * Spec: Tehnička specifikacija za fiskalizaciju — Porezna uprava RH
 * Namespace: tns = http://www.apis-it.hr/fin/2012/types/f73
 */
const { create } = require("xmlbuilder2");

const TNS = "http://www.apis-it.hr/fin/2012/types/f73";
const SOAP_ENV = "http://schemas.xmlsoap.org/soap/envelope/";

/**
 * Format a JS Date to the Croatian fiscalisation datetime format: DD.MM.YYYYTHH:mm:ss
 * @param {Date} date
 * @returns {string}
 */
function formatFiskalDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const dd   = String(d.getDate()).padStart(2, "0");
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, "0");
  const min  = String(d.getMinutes()).padStart(2, "0");
  const ss   = String(d.getSeconds()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy}T${hh}:${min}:${ss}`;
}

/**
 * Round a number to 2 decimal places and return as string.
 * @param {number} n
 * @returns {string}
 */
function toAmount(n) {
  return Number(n).toFixed(2);
}

/**
 * Group invoice lines by VAT rate and compute base (osnovica) and VAT amount (iznos) per group.
 * Lines with null vatRate are treated as 0% (exempt) with a warning already logged upstream.
 *
 * All prices are gross (VAT-inclusive). Net = gross / (1 + rate/100).
 *
 * @param {Array<{price: number, quantity: number, vatRate: number|null}>} lines
 * @returns {Array<{stopaPdv: number, osnovica: string, iznos: string, ukupno: string}>}
 */
function buildPdvGroups(lines) {
  const groups = new Map(); // vatRate -> { grossTotal }

  for (const line of lines) {
    const rate = line.vatRate != null ? Number(line.vatRate) : 0;
    const lineGross = Number(line.price) * (line.quantity || 1);
    const existing = groups.get(rate) || { grossTotal: 0 };
    existing.grossTotal += lineGross;
    groups.set(rate, existing);
  }

  return Array.from(groups.entries()).map(([rate, { grossTotal }]) => {
    const divisor = 1 + rate / 100;
    // Work in integer cents to avoid floating-point rounding drift.
    // iznos is derived from rounded grossCents - rounded osnovicaCents so that
    // osnovica + iznos always sums to exactly gross (required by FINA validation).
    const grossCents    = Math.round(grossTotal * 100);
    const osnovicaCents = Math.round(grossCents / divisor);
    const iznosCents    = grossCents - osnovicaCents;
    return {
      stopaPdv: rate,
      osnovica: toAmount(osnovicaCents / 100),
      iznos:    toAmount(iznosCents / 100),
      ukupno:   toAmount(grossTotal),
    };
  });
}

/**
 * Build the unsigned SOAP XML for a RacunZahtjev (invoice fiscalisation request).
 *
 * @param {object} params
 * @param {string}   params.messageId           - UUID for the SOAP message
 * @param {Date}     params.sentAt              - When the request is sent
 * @param {string}   params.companyOib          - Company OIB (from certificate)
 * @param {boolean}  params.inVatSystem         - Whether company is in VAT system (u sustavu PDV-a)
 * @param {Date}     params.invoiceDate         - Invoice date/time
 * @param {string}   params.fiscalInvoiceNumber - "SEQ/PREMISES/DEVICE"
 * @param {string}   params.sequenceLabel       - "P" (reusable/poslovni prostor) or "N" (device)
 * @param {string}   params.paymentMethod       - "G" gotovina | "K" kartica | "T" transakcijski | "O" ostalo
 * @param {string}   params.operatorOib         - Operator/cashier OIB
 * @param {string}   params.zkiCode             - Pre-computed ZKI (Zaštitni kod)
 * @param {number}   params.grandTotal          - Total invoice amount (gross)
 * @param {Array}    params.lines               - Order lines [{price, quantity, vatRate}]
 * @param {boolean}  [params.naknada=false]     - Late submission flag
 * @returns {string} Unsigned SOAP XML string
 *
 * NOTE on storno invoices (f73 namespace / Fiskalizacija 1.x):
 *   The 2012 FINA API (namespace f73) does NOT include a StornRac element.
 *   A storno is submitted as a plain new invoice with negative amounts.
 *   The application tracks the cancellation relationship internally via
 *   stornoOfInvoiceId on the Invoice model. If the system is ever upgraded
 *   to Fiskalizacija 2.0 (different namespace), StornRac support can be added.
 */
function buildRacunZahtjev(params) {
  const {
    messageId,
    sentAt,
    companyOib,
    inVatSystem,
    invoiceDate,
    fiscalInvoiceNumber,
    sequenceLabel = "P",
    paymentMethod = "K",
    operatorOib,
    zkiCode,
    grandTotal,
    lines,
    naknada = false,
  } = params;

  const [seqNum, premisesId, deviceId] = fiscalInvoiceNumber.split("/");
  const pdvGroups = buildPdvGroups(lines);

  const root = create({ version: "1.0", encoding: "UTF-8" })
    .ele(SOAP_ENV, "soapenv:Envelope", {
      "xmlns:soapenv": SOAP_ENV,
      "xmlns:tns": TNS,
    })
      .ele(SOAP_ENV, "soapenv:Header").up()
      .ele(SOAP_ENV, "soapenv:Body")
        .ele(TNS, "tns:RacunZahtjev")
          .ele(TNS, "tns:Zaglavlje")
            .ele(TNS, "tns:IdPoruke").txt(messageId).up()
            .ele(TNS, "tns:DatumVrijeme").txt(formatFiskalDate(sentAt)).up()
          .up()
          .ele(TNS, "tns:Racun");

  // ── Mandatory invoice fields ─────────────────────────────────────────────
  root
    .ele(TNS, "tns:Oib").txt(companyOib).up()
    .ele(TNS, "tns:USustPdv").txt(inVatSystem ? "true" : "false").up()
    .ele(TNS, "tns:DatVrijeme").txt(formatFiskalDate(invoiceDate)).up()
    .ele(TNS, "tns:OznSlijed").txt(sequenceLabel).up()
    .ele(TNS, "tns:BrRac")
      .ele(TNS, "tns:BrOznRac").txt(seqNum).up()
      .ele(TNS, "tns:OznPosPr").txt(premisesId).up()
      .ele(TNS, "tns:OznNapUr").txt(deviceId).up()
    .up();

  // ── PDV breakdown ────────────────────────────────────────────────────────
  if (inVatSystem && pdvGroups.length > 0) {
    const pdvEle = root.ele(TNS, "tns:Pdv");
    for (const g of pdvGroups) {
      pdvEle
        .ele(TNS, "tns:Porez")
          .ele(TNS, "tns:Stopa").txt(toAmount(g.stopaPdv)).up()
          .ele(TNS, "tns:Osnovica").txt(g.osnovica).up()
          .ele(TNS, "tns:Iznos").txt(g.iznos).up()
        .up();
    }
  }

  // ── Totals and identifiers ───────────────────────────────────────────────
  root
    .ele(TNS, "tns:IznosUkupno").txt(toAmount(grandTotal)).up()
    .ele(TNS, "tns:NacinPlac").txt(paymentMethod).up()
    .ele(TNS, "tns:OibOper").txt(operatorOib).up()
    .ele(TNS, "tns:ZastKod").txt(zkiCode).up()
    .ele(TNS, "tns:NakDost").txt(naknada ? "true" : "false").up();

  return root.end({ prettyPrint: false });
}

module.exports = { buildRacunZahtjev, buildPdvGroups, formatFiskalDate };
