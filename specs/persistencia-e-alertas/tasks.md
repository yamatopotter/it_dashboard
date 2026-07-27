# Tasks

- [ ] T1. `prisma/schema.prisma`: campos SMTP em `SystemConfig`, campos NVR
      + vínculo canal/câmera em `Device`, campos de disco em `DeviceStatus`,
      novo model `NvrChannelIssue`; gerar e aplicar migration (incluindo o
      índice único parcial manual).
- [ ] T2. `lib/crypto.ts`: `resolveNvrCredentials()` e `resolveSmtpPassword()`.
- [ ] T3. `npm install nodemailer` + `lib/email.ts` (`sendEmail`).
- [ ] T4. `worker/monitors/nvr.ts`: cliente HTTP Digest Auth próprio,
      `getChannelTitles`/`findMediaFiles`/`validateRecording` (porta do
      Python), `checkDiskHealth`.
- [ ] T5. `worker/scheduler.ts`: segundo interval por device DVR,
      `runNvrChecks` (upsert/resolução/dedup de `NvrChannelIssue` + envio
      de e-mail), tudo isolado em try/catch por device.
- [ ] T6. `lib/schemas/device.ts` + rotas `app/api/devices*`: campos novos
      no Zod schema, `sanitizeDevice()` removendo `nvrUserEnc`/`nvrPassEnc`.
- [ ] T7. `app/api/admin/config/route.ts`: campos `smtp*`/`alertEmailTo`,
      encriptando a senha só quando enviada.
- [ ] T8. `GET /api/devices/[id]/nvr-issues` (paginado, estilo `/api/incidents`).
- [ ] T9. UI: `device-form-protocols.tsx` (bloco NVR + vínculo câmera↔canal),
      `system-client.tsx` (card SMTP), `devices/[id]/page.tsx` (tabela de
      canais + saúde de disco).
- [ ] T10. Comentário em `scripts/nvd/recording_validator.py` marcando
      como ferramenta manual, fora do pipeline automatizado.
- [ ] T11. Testes: `worker/monitors/nvr.ts` (fixtures simuladas, sem NVD
      real) e lógica de dedup/resolução em `worker/scheduler.ts`.
- [ ] T12. Verificação: `npm run db:generate`, `npx tsc --noEmit`, `npm test`.
