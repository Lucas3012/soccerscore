import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/auth";
import { ensureSchema, run } from "@/lib/db";
import { MAX_DEPOSIT_CENTS, MIN_DEPOSIT_CENTS } from "@/lib/money";
import { buildPixPayload, paymentReference } from "@/lib/pix";
import { credit } from "@/lib/wallet";

function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function expiryValid(value: string): boolean {
  const match = /^(\d{2})\/?(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const method = String(body.method ?? "");
  const amountCents = Number(body.amountCents ?? 0);

  if (!Number.isInteger(amountCents) || amountCents < MIN_DEPOSIT_CENTS || amountCents > MAX_DEPOSIT_CENTS) {
    return NextResponse.json(
      { ok: false, error: "Valor de depósito entre R$ 10,00 e R$ 5.000,00." },
      { status: 400 },
    );
  }

  await ensureSchema();

  if (method === "pix") {
    const reference = paymentReference(user.id);
    const charge = buildPixPayload(amountCents, reference);
    const qr = await QRCode.toDataURL(charge.payload, { margin: 1, width: 320 });
    const insert = await run(
      `INSERT INTO transactions (user_id, type, method, amount_cents, status, detail, created_at)
       VALUES (?, 'deposit', 'pix', ?, 'pending', ?, ?)`,
      [user.id, amountCents, charge.txid, Date.now()],
    );
    return NextResponse.json({
      ok: true,
      method: "pix",
      transactionId: Number(insert.lastInsertRowid),
      amountCents,
      payload: charge.payload,
      qr,
      txid: charge.txid,
    });
  }

  if (method === "card") {
    const card = (body.card ?? {}) as Record<string, unknown>;
    const number = String(card.number ?? "");
    const holder = String(card.holder ?? "").trim();
    const expiry = String(card.expiry ?? "");
    const cvv = String(card.cvv ?? "").replace(/\D/g, "");

    if (!luhnValid(number)) {
      return NextResponse.json({ ok: false, error: "Número do cartão inválido." }, { status: 400 });
    }
    if (holder.length < 3) {
      return NextResponse.json({ ok: false, error: "Nome impresso no cartão inválido." }, { status: 400 });
    }
    if (!expiryValid(expiry)) {
      return NextResponse.json({ ok: false, error: "Validade do cartão inválida." }, { status: 400 });
    }
    if (cvv.length < 3 || cvv.length > 4) {
      return NextResponse.json({ ok: false, error: "CVV inválido." }, { status: 400 });
    }

    const last4 = number.replace(/\D/g, "").slice(-4);
    await credit(user.id, amountCents, "deposit", "card", `Cartão de crédito ****${last4} (simulado)`);

    return NextResponse.json({ ok: true, method: "card", amountCents, approved: true });
  }

  return NextResponse.json({ ok: false, error: "Método de depósito não suportado." }, { status: 400 });
}
