# Worker do Drive na VPS

O app, o painel e a sincronizacao executam na VPS. O worker encontra alteracoes na pasta do Google Drive, publica trabalhos no Supabase e processa um arquivo por vez. Assim, documentos grandes nao competem por memoria com o atendimento dos especialistas.

## Pre-requisitos

- VPS Linux com systemd, Python 3.10+ e acesso de saida a Google e Supabase.
- Usuario de sistema `guapu` sem privilegios administrativos.
- Clone deste repositorio em `/opt/guapu` e ambiente virtual em `/opt/guapu/.venv`.
- Arquivo da conta de servico do Google em um caminho protegido, fora do repositorio.

## Arquivo de ambiente

Crie `/etc/guapu/worker.env`, de propriedade de `root:guapu` e permissao `640`. Ele deve conter as mesmas variaveis usadas pela ingestao, sem aspas desnecessarias:

```env
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<chave-secreta-atual>
GOOGLE_API_KEY=<chave-gemini>
GOOGLE_SERVICE_ACCOUNT_FILE=/etc/guapu/google-service-account.json
DRIVE_FOLDER_ID=<id-da-pasta-do-cliente>
RAG_TABLE_NAME=documents
```

Inclua outras variaveis presentes em `.env.example` se forem necessarias ao ambiente. Nunca copie esse arquivo para o Git ou para logs.

## Instalacao

```bash
sudo useradd --system --home /opt/guapu --shell /usr/sbin/nologin guapu
sudo install -d -o guapu -g guapu /opt/guapu /etc/guapu
sudo -u guapu git clone https://github.com/lecele/Guapu.git /opt/guapu
sudo -u guapu python3 -m venv /opt/guapu/.venv
sudo -u guapu /opt/guapu/.venv/bin/pip install -r /opt/guapu/requirements.txt
sudo install -o root -g root -m 644 deploy/guapu-drive-sync-worker.service /etc/systemd/system/
sudo install -o root -g root -m 644 deploy/guapu-drive-sync-queue.service /etc/systemd/system/
sudo install -o root -g root -m 644 deploy/guapu-drive-sync-queue.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now guapu-drive-sync-worker.service guapu-drive-sync-queue.timer
```

## Verificacao

```bash
sudo systemctl status guapu-drive-sync-worker.service
sudo systemctl list-timers guapu-drive-sync-queue.timer
sudo journalctl -u guapu-drive-sync-worker.service -f
```

Para uma primeira execucao controlada, pare temporariamente o worker continuo e rode `sudo -u guapu /opt/guapu/.venv/bin/python queue_drive_sync.py`; depois acompanhe os logs e reative o servico. Os trabalhos, tentativas e erros ficam registrados em `drive_sync_jobs` no Supabase.

## Atualizacao

```bash
sudo -u guapu git -C /opt/guapu pull --ff-only
sudo -u guapu /opt/guapu/.venv/bin/pip install -r /opt/guapu/requirements.txt
sudo systemctl restart guapu-drive-sync-worker.service
```

O workflow do GitHub Actions permanece apenas como acionamento manual de contingencia; o processamento normal ocorre pelo timer e worker da VPS. O GitHub nao deve processar o acervo inteiro em runners efemeros.
