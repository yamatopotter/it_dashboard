import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLinkTraffic } from "@/worker/monitors/link-traffic";

const schema = z.object({
  mikrotikDeviceId: z.string().min(1),
  mikrotikInterface: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  const { mikrotikDeviceId, mikrotikInterface } = parsed.data;

  const device = await db.device.findUnique({ where: { id: mikrotikDeviceId } });
  if (!device) {
    return NextResponse.json({ error: "Dispositivo não encontrado" }, { status: 404 });
  }
  if (!device.routerosEnabled || !device.routerosUser || !device.routerosPass) {
    return NextResponse.json(
      { error: `Dispositivo "${device.name}" não tem RouterOS API habilitado ou credenciais configuradas` },
      { status: 422 },
    );
  }

  try {
    const result = await checkLinkTraffic(
      device.ip,
      device.routerosUser,
      device.routerosPass,
      device.routerosPort,
      mikrotikInterface,
    );
    return NextResponse.json({ ok: true, downloadBps: result.downloadBps, uploadBps: result.uploadBps });
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);

    // Map common RouterOS errors to user-friendly messages
    let message = `Falha ao conectar: ${raw}`;
    if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout/i.test(raw)) {
      message = `Não foi possível conectar ao Mikrotik ${device.ip}:${device.routerosPort} — verifique IP, porta e se a API RouterOS está habilitada`;
    } else if (/auth|login|password|user/i.test(raw)) {
      message = `Credenciais inválidas para ${device.name} — verifique usuário e senha do RouterOS`;
    } else if (/no such interface|interface.*not found|invalid value/i.test(raw)) {
      message = `Interface "${mikrotikInterface}" não encontrada em ${device.name} — verifique o nome exato (ex: ether1, sfp-sfpplus1)`;
    }

    return NextResponse.json({ error: message }, { status: 422 });
  }
}
