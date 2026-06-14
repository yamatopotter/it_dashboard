# Deploy WatchIT Tower em VPS Linux

Guia de produção para Ubuntu/Debian. Pressupõe um servidor com acesso root e domínio ou IP fixo.

---

## Requisitos

- Ubuntu 22.04+ ou Debian 12+
- Node.js 20 LTS (`nvm` recomendado)
- Docker Engine + Docker Compose v2
- nginx
- Usuário sem root para rodar a aplicação (ex.: `watchit`)

---

## 1. Criar usuário de serviço

```bash
useradd -m -s /bin/bash watchit
# Adicionar ao grupo docker para rodar compose sem sudo
usermod -aG docker watchit
```

---

## 2. Clonar o repositório

```bash
su - watchit
git clone https://github.com/seu-usuario/it_dashboard.git /home/watchit/app
cd /home/watchit/app
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Valores obrigatórios em produção:

```env
DATABASE_URL="postgresql://it_dashboard:SENHA_FORTE@localhost:5432/it_dashboard"
NEXTAUTH_SECRET="string-aleatoria-de-no-minimo-32-caracteres"
NEXTAUTH_URL="https://seu-dominio.com"
ENCRYPTION_KEY="string-hex-de-exatamente-64-caracteres"
WEBHOOK_SECRET="string-aleatoria-de-no-minimo-32-caracteres"

# Opcional — alerta quando o worker parar
WORKER_STALE_WEBHOOK_URL="https://hooks.slack.com/..."
```

Gerar valores seguros:
```bash
# NEXTAUTH_SECRET / WEBHOOK_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (64 hex chars = 32 bytes)
openssl rand -hex 32
```

---

## 4. Subir o banco de dados

```bash
docker compose up -d
# Aguardar o healthcheck ficar healthy
docker compose ps
```

---

## 5. Instalar dependências e buildar

```bash
npm ci
npm run db:migrate
npm run db:generate
npm run build
npm run create-user   # criar o usuário admin inicial
```

---

## 6. Configurar units systemd

Criar os dois arquivos como `root`:

### `/etc/systemd/system/watchit-web.service`

```ini
[Unit]
Description=WatchIT Tower — Next.js
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=watchit
WorkingDirectory=/home/watchit/app
EnvironmentFile=/home/watchit/app/.env
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=watchit-web

[Install]
WantedBy=multi-user.target
```

### `/etc/systemd/system/watchit-worker.service`

```ini
[Unit]
Description=WatchIT Tower — Monitoring Worker
After=watchit-web.service
Wants=watchit-web.service

[Service]
Type=simple
User=watchit
WorkingDirectory=/home/watchit/app
EnvironmentFile=/home/watchit/app/.env
ExecStart=/usr/bin/node --import tsx/esm worker/index.ts
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=watchit-worker

[Install]
WantedBy=multi-user.target
```

Ativar e iniciar:

```bash
systemctl daemon-reload
systemctl enable watchit-web watchit-worker
systemctl start watchit-web watchit-worker

# Verificar
systemctl status watchit-web
systemctl status watchit-worker
journalctl -u watchit-worker -f
```

---

## 7. Configurar nginx

### `/etc/nginx/sites-available/watchit`

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Tamanho máximo de upload (bulk import, etc.)
    client_max_body_size 2m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/watchit /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# TLS com Let's Encrypt
apt install certbot python3-certbot-nginx
certbot --nginx -d seu-dominio.com
```

---

## 8. Atualizar o sistema

```bash
su - watchit
cd /home/watchit/app
git pull
npm ci
npm run db:migrate
npm run build

sudo systemctl restart watchit-web watchit-worker
```

---

## Troubleshooting rápido

| Problema | Comando |
|---|---|
| Ver logs da aplicação | `journalctl -u watchit-web -n 100` |
| Ver logs do worker | `journalctl -u watchit-worker -n 100` |
| Worker não aparece como "ok" | Checar se `watchit-worker.service` está ativo |
| Banco inacessível | `docker compose ps` — verificar se container está `healthy` |
| Porta 3000 já em uso | `lsof -i :3000` |
