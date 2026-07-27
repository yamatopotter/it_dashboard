import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { resolveSmtpPassword } from "@/lib/crypto";
import { log } from "@/lib/logger";

interface SendEmailInput {
  subject: string;
  text: string;
  to?: string; // sobrescreve SystemConfig.alertEmailTo quando informado
}

// SMTP é uma capacidade opcional do sistema — se não estiver configurada em
// /system, não deve derrubar o worker nem o chamador. Falhas reais de envio
// (host fora do ar, auth inválida) propagam para o chamador decidir o retry.
export async function sendEmail({ subject, text, to }: SendEmailInput): Promise<void> {
  const config = await db.systemConfig.findUnique({ where: { id: 1 } });

  if (!config?.smtpEnabled || !config.smtpHost || !config.smtpUser) {
    log("warn", "E-mail não enviado — SMTP desabilitado ou incompleto em /system", { subject });
    return;
  }

  const recipients = to ?? config.alertEmailTo;
  if (!recipients) {
    log("warn", "E-mail não enviado — nenhum destinatário configurado (alertEmailTo)", { subject });
    return;
  }

  const password = resolveSmtpPassword(config);

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure, // true = TLS implícito (465), false = STARTTLS (587)
    auth: password ? { user: config.smtpUser, pass: password } : undefined,
  });

  await transporter.sendMail({
    from: config.smtpFrom || config.smtpUser,
    to: recipients,
    subject,
    text,
  });
}
