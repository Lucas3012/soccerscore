import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, ensureSchema } from "@/lib/db";

/**
 * Simulated PIX confirmation. Marks the pending deposit as paid and credits
 * the balance — a real gateway would call a webhook instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isInteger(transactionId)) {
    return NextResponse.json({ ok: false, error: "Depósito inválido." }, { status: 400 });
  }

  await ensureSchema();
  const tx = await db().transaction("write");
  try {
    const found = await tx.execute({
      sql: `SELECT id, amount_cents FROM transactions
            WHERE id = ? AND user_id = ? AND type = 'deposit' AND method = 'pix' AND status = 'pending'`,
      args: [transactionId, user.id],
    });
    const row = found.rows[0];
    if (!row) {
      await tx.rollback();
      return NextResponse.json(
        { ok: false, error: "Depósito pendente não encontrado." },
        { status: 404 },
      );
    }

    const amount = Number(row.amount_cents);
    await tx.execute({
      sql: "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
      args: [amount, user.id],
    });
    await tx.execute({
      sql: "UPDATE transactions SET status = 'confirmed', detail = detail || ' (confirmado — demo)' WHERE id = ?",
      args: [transactionId],
    });
    await tx.commit();

    return NextResponse.json({ ok: true, amountCents: amount });
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  }
}
