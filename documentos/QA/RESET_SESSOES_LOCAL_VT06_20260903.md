# Reset controlado das sessões locais — VT-06

**Data:** 03/09/2026  
**Alvo:** `/opt/srpa-backend/sessions_db.json` na VPS  
**Escopo:** somente o arquivo local do backend Vital; Supabase e `sessions_legacy` não foram alterados.

## Evidências

- Contagem antes do reset: **68 sessões**.
- Backup criado antes da alteração: `/root/codex-backups/sessions_db.json.pre-reset-20260903T155621Z`.
- Integridade do backup: SHA-256 idêntico ao arquivo original antes do reset: `f17805c6f86fa7aa4c598d7679fcae37316a105d36bdc125936198af4855c4aa`.
- Ação executada: arquivo local substituído por um array JSON vazio (`[]`), proprietário `root:root`.
- Contagem após o reset: **0 sessões**.

## Validação pública do painel

`GET https://vital.agentesnasaude.com.br/api/dashboard-data` retornou HTTP 200 com:

```json
{
  "kpis": {
    "total_sessoes": 0,
    "tempo_medio_segundos": 0,
    "nota_media": null,
    "cenarios_ativos": 4
  },
  "sessoes": [],
  "persistencia": {
    "banco_ok": true,
    "ultimo_erro": null,
    "falhas": 0,
    "fonte": "supabase+local"
  }
}
```

## Resultado

O VT-06 foi validado: as 68 sessões antigas deixaram de aparecer nos KPIs, o banco continua acessível e não houve perda do histórico persistido no Supabase. O backup permanece preservado para recuperação manual, se necessário.
