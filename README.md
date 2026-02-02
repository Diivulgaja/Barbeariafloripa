# Ricardo Barbershop — Estrutura de Publicação + Hardening (Front + Supabase)

⚠️ Importante: **nenhum projeto web é “100% seguro”**, mas esta estrutura deixa o seu site **bem mais protegido** e pronto para publicar com boas práticas:
- Segurança real no banco via **RLS (Row Level Security)** no Supabase
- Proteções de navegador via **headers** (CSP, HSTS, X-Frame-Options, etc.)
- Separação de arquivos (HTML/CSS/JS) para manutenção
- Remoção de “demo forced” e correções de JS que quebravam o site

---

## 1) Como usar (publicação rápida)
Você vai publicar a pasta **public/**.

### Se for Netlify
1. Faça upload do conteúdo desta pasta no seu repositório (ou arraste no Netlify).
2. Copie o arquivo `deploy/netlify/_headers` para dentro de `public/_headers` (na raiz da pasta public).
3. Publique.

### Se for Vercel
1. Faça upload do projeto no GitHub.
2. No root do projeto, copie `deploy/vercel/vercel.json` para `vercel.json`.
3. Em Vercel, configure o projeto como “Static” apontando para `public/`.

### Se for Host (cPanel/HostGator)
1. Faça upload dos arquivos dentro de `public/` para `public_html`.
2. **Headers/CSP**: ideal usar `.htaccess`. Se quiser, me diga o host que eu gero um `.htaccess` pronto.

---

## 2) Config do Supabase
Edite: `public/assets/config.js`

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

✅ `anon key` pode ficar no front (ela é pública mesmo).  
❌ Nunca coloque **service_role key** no front.

---

## 3) Segurança de verdade: RLS no Supabase (obrigatório)
Abra o Supabase → SQL Editor → cole e rode:

- `supabase/001_appointments_rls.sql`

Isso:
- ativa RLS na tabela `appointments`
- faz o cliente enxergar/salvar **apenas seus dados**

> Se você ainda não criou a tabela, use o arquivo `supabase/000_schema.sql` primeiro.

---

## 4) Anti-conflito de horário (recomendado)
O arquivo `supabase/002_unique_slot.sql` cria uma “trava” para impedir dois agendamentos iguais
(no mesmo dia/hora, para o mesmo barbeiro).

---

## 5) Observações
- Admin: este pacote mantém o “painel” visual, mas a segurança real precisa vir de:
  - usuários admin via tabela `profiles` + RLS,
  - ou por um backend / edge function.
- Se você quiser, eu adapto para **Admin real** (is_admin) com policies separadas.

---

## Estrutura
- `public/` → site pronto para subir
- `deploy/` → headers para Netlify/Vercel
- `supabase/` → SQL para schema + RLS + constraints
