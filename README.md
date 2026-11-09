# Disk Ingressos — ERP de Controle de Ajustes de Sistemas, Homologação QA & Gestão 5W2H

Sistema ERP local e de rede interna da **Disk Ingressos**, focado no controle de ajustes da plataforma, fila de homologação QA (`TESTAR DISK` / `TESTE OK` / `Guilherme`), acompanhamento dos planos de ação **5W2H** (`5W`, `2H`, `EXE`, `DASH`) e parametrização de regras do Financeiro.

---

## 1. Onde ficam hospedadas as Tarefas e Informações (Operação 100% Local & Rede Interna)

1. **Banco de Dados PostgreSQL Persistente Local:**
   - Localizado em: `E:\PLANO DE AÇÃO ERP\data\pgdata`
   - Todas as alterações feitas na tela do ERP ficam gravadas permanentemente no disco local, com trilha completa na tabela `auditoria`.

2. **Planilhas Excel Sincronizadas em Mão Dupla (`Planilha Excel ⇄ ERP`):**
   - Pasta original: `D:\backupwindows\VINA\`
   - Pasta espelhada do projeto: `E:\PLANO DE AÇÃO ERP\data\`
   - Planilhas monitoradas em tempo real (a cada 3 segundos):
     - `Planilha de Plano de Ação 5W2H SUPORTE2.xlsx` (`25` planos `5W` + `168` ajustes `2H` + `EXE`)
     - `Planilha_de_Plano_de_Ação_5W2H_financeiro.xlsx` (`38` planos `5W` + `34` ajustes `2H`)
     - `datas das solicitaçoes e ajustes.xlsx` (`445` solicitações `Plan1` + quadro `Plan2` + `79` homologados `Plan3`)
   - **Da Planilha para o ERP:** Salvar qualquer alteração no Excel atualiza automaticamente o ERP.
   - **Do ERP para a Planilha:** Alterar status, aprovar `TESTE OK`, mover para `TESTAR DISK` ou marcar um ajuste do Guilherme como `Testado ☑️` no ERP grava diretamente na célula exata do arquivo `.xlsx` preservando 100% das cores, fórmulas e imagens originais.

---

## 2. Como Iniciar e Acessar (No seu PC ou na Rede Interna da Empresa)

### Opção A — Com 2 cliques (Windows)
Dê dois cliques no arquivo **`INICIAR_ERP_DISK.bat`** na pasta `E:\PLANO DE AÇÃO ERP`. Ele inicia o servidor e abre o navegador automaticamente.

### Opção B — Pelo Terminal
```powershell
npm start
```

### Endereços de Acesso
- **No seu computador:** `http://localhost:3001`
- **Em outros computadores da mesma Rede Interna / Wi-Fi da empresa:** `http://<IP_DO_SEU_PC>:3001` (ex.: descubra seu IP rodando `ipconfig` no terminal).

---

## 3. Backup Local (Banco + Planilhas)

Para gerar um arquivo `.zip` com cópia completa do banco PostgreSQL (`data/pgdata`) e das 3 planilhas Excel dentro da pasta `backups/`:

```powershell
npm run backup
```
