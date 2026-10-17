import { createHash } from "node:crypto";

/**
 * Minimal PIX BR Code (EMV) payload generator used for the simulated
 * deposits. No real acquiring bank is involved — the payload is static and
 * meant for demonstration only.
 */

function emv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

function normalizeAscii(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .slice(0, max);
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixCharge = {
  payload: string;
  txid: string;
};

export function buildPixPayload(amountCents: number, reference: string): PixCharge {
  const amount = (amountCents / 100).toFixed(2);
  const txid = (normalizeAscii(reference, 25) || "SOCCERSCORE").replace(/[^A-Z0-9]/g, "");
  const merchantAccount =
    emv("00", "br.gov.bcb.pix") + emv("01", "deposito@soccerscore.demo");
  const payload =
    emv("00", "01") +
    emv("26", merchantAccount) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount) +
    emv("58", "BR") +
    emv("59", "SOCCERSCORE") +
    emv("60", "SAO PAULO") +
    emv("62", emv("05", txid || "SCORE")) +
    "6304";
  return { payload: `${payload}${crc16(payload)}`, txid };
}

export function paymentReference(userId: number): string {
  const digest = createHash("sha1")
    .update(`${userId}:${Date.now()}:soccerscore`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `SC${userId}${digest}`;
}
