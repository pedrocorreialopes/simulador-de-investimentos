# TesouroSimula — Simulador de Investimentos do Tesouro Direto

Simulador educacional e independente que ajuda o usuário a estimar o rendimento de investimentos em títulos públicos do **Tesouro Direto** (Tesouro Selic, Tesouro IPCA+ e Tesouro Prefixado, incluindo variantes com juros semestrais), comparando-os com Poupança, CDB e LCI/LCA, e oferecendo recomendações personalizadas conforme objetivo e perfil do investidor.

> ⚠️ **Aviso**: este projeto não possui vínculo com o Tesouro Nacional, o Banco Central ou a B3. É uma ferramenta educacional com fins de simulação; não constitui recomendação de investimento. Sempre confirme taxas reais em [tesourodireto.com.br](https://www.tesourodireto.com.br).

## 🎯 Objetivo do projeto

Permitir que qualquer pessoa, mesmo sem conhecimento técnico, consiga:
- Simular quanto renderia um investimento no Tesouro Direto informando valor inicial, aporte mensal e prazo;
- Entender o impacto do Imposto de Renda regressivo e da taxa de custódia da B3 no resultado líquido;
- Comparar visualmente o título escolhido com Poupança, CDB (100% CDI) e LCI/LCA (90% CDI);
- Receber sugestões de qual título combina melhor com seu objetivo (reserva de emergência, aposentadoria, compra de bem, viagem, educação) e perfil (conservador, moderado, arrojado);
- Aprender os conceitos básicos de cada título público através de conteúdo educativo e FAQ.

## ✅ Funcionalidades implementadas

### 1. Simulador completo
- Seleção visual entre 5 tipos de título: **Tesouro Selic**, **Tesouro IPCA+**, **IPCA+ com juros semestrais**, **Tesouro Prefixado** e **Prefixado com juros semestrais**.
- Campos de entrada: valor inicial, aporte mensal, prazo (anos + meses), taxas específicas de cada título e taxa de administração da corretora (opcional).
- Campos de perfil: objetivo do investimento e perfil de risco (conservador/moderado/arrojado).

### 2. Motor de cálculo financeiro
- Capitalização mensal com aportes recorrentes.
- **Taxa de custódia B3**: 0,20% ao ano sobre o saldo que exceder R$ 10.000, descontada proporcionalmente todo mês.
- **Imposto de Renda regressivo** aplicado sobre o rendimento total, conforme prazo total da aplicação:
  - até 180 dias → 22,5%
  - de 181 a 360 dias → 20%
  - de 361 a 720 dias → 17,5%
  - acima de 720 dias → 15%
- Cálculo de rentabilidade líquida total e anualizada.
- Tabela detalhada ano a ano (total investido, valor bruto, taxas acumuladas, valor líquido).

### 3. Integração com dados oficiais (Banco Central do Brasil)
- Busca automática, via API pública SGS do BCB, da:
  - **Taxa Selic meta vigente** (série 432);
  - **IPCA acumulado em 12 meses** (série 13522).
- Exibição em destaque no topo da página, com data da última atualização.
- Fallback automático para valores de referência caso a API esteja indisponível (tratamento de erro sem quebrar a experiência).
- Os campos de taxa do formulário são pré-preenchidos com os valores oficiais, mas podem ser editados livremente pelo usuário.

### 4. Visualização de dados (Chart.js)
- Gráfico de evolução do investimento (total investido x valor bruto x valor líquido estimado) ao longo do tempo.
- Gráfico comparativo entre o título escolhido, Poupança, CDB 100% CDI e LCI/LCA 90% CDI, usando a mesma metodologia de aportes e prazo.

### 5. Recomendações personalizadas
- Motor de regras que cruza objetivo + prazo + perfil informados para sugerir o título mais adequado, com explicação textual.
- Lista de cuidados importantes (marcação a mercado, diversificação, etc.).
- Lista ilustrativa de corretoras que costumam oferecer taxa zero de administração para operar Tesouro Direto (informação educativa, sujeita a mudanças).

### 6. Conteúdo educativo
- Seção "Aprenda" explicando cada tipo de título, IR regressivo, taxa de custódia B3 e segurança do investimento.
- FAQ em formato acordeão com as dúvidas mais comuns.

### 7. Interface
- Design moderno, responsivo (mobile/tablet/desktop), com paleta inspirada em identidade visual "institucional/financeira" (verde + dourado).
- Navegação por âncoras, menu mobile com toggle, cards interativos de seleção de título, KPIs destacados e tabela responsiva com rolagem horizontal.

## 🗂️ Estrutura de arquivos

```
index.html          → Página única com todas as seções (Hero, Simulador, Resultados, Comparativo, Recomendações, Aprenda, FAQ)
css/style.css        → Design system completo (cores, tipografia, componentes, responsividade)
js/main.js           → Motor de simulação financeira, integração com API do BCB, gráficos (Chart.js) e lógica de recomendação
README.md            → Este documento
```

## 🔗 Entradas / navegação da aplicação

Como é uma SPA estática de página única, a navegação ocorre por âncoras internas:

| Âncora | Seção |
|---|---|
| `index.html#top` | Topo / Hero com taxas oficiais |
| `index.html#simulador-section` | Formulário de simulação |
| `index.html#resultados-section` | KPIs, gráfico de evolução e tabela ano a ano |
| `index.html#comparativo-section` | Gráfico comparativo com Poupança/CDB/LCI |
| `index.html#recomendacao-section` | Sugestões personalizadas e corretoras |
| `index.html#aprenda-section` | Conteúdo educativo sobre os títulos |
| `index.html#faq-section` | Perguntas frequentes |

Não há parâmetros de URL — toda a interação ocorre via formulário client-side.

## 🌐 API externa utilizada

- **Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS)**
  - Taxa Selic meta: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json`
  - IPCA acumulado 12 meses: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json`
  - API pública, sem autenticação, com suporte a CORS — compatível com chamada direta via `fetch()` no navegador.

Nenhuma tabela de dados (RESTful Table API) é utilizada neste projeto, pois toda a simulação é client-side e não há necessidade de persistência de dados do usuário.

## 🚧 Funcionalidades não implementadas (possíveis evoluções)

- Persistência de simulações salvas por usuário (exigiria autenticação e armazenamento — poderia usar a RESTful Table API para salvar cenários).
- Busca automática das taxas específicas de cada título (IPCA+ e Prefixado) diretamente no Tesouro Direto — hoje esses campos usam valores editáveis manualmente pelo usuário, pois a API pública do Tesouro Transparente não é acessível via CORS de forma simples no navegador.
- Exportação de relatório em PDF/Excel (exigiria geração server-side ou biblioteca client-side adicional).
- Simulação de resgate antecipado com estimativa de marcação a mercado (modelo de precificação de título por curva de juros).
- Modo comparação lado a lado entre múltiplos títulos do Tesouro simultaneamente (hoje é 1 título selecionado x Poupança/CDB/LCI).
- Internacionalização (atualmente apenas em pt-BR).

## 🔜 Próximos passos recomendados

1. Adicionar opção de salvar/comparar múltiplas simulações usando a RESTful Table API (tabela `simulacoes`).
2. Implementar cálculo de marcação a mercado para resgates antecipados de títulos prefixados/IPCA+.
3. Adicionar mais fontes de dados abertos (ex: taxas negociadas do Tesouro Direto do dia, se uma API CORS-friendly estiver disponível).
4. Testes de usabilidade com usuários iniciantes em investimentos para simplificar ainda mais os termos técnicos.

## 🛠️ Tecnologias utilizadas

- HTML5 semântico
- CSS3 (design system próprio, sem framework)
- JavaScript (vanilla, ES6+)
- [Chart.js](https://www.chartjs.org/) — gráficos de evolução e comparação
- [Font Awesome](https://fontawesome.com/) — ícones
- Google Fonts (Poppins + Inter)
- API pública SGS do Banco Central do Brasil

## 📦 Modelo de dados

Este projeto **não utiliza tabelas de dados persistentes** — toda a simulação é calculada em tempo real no navegador (client-side), a partir dos valores informados no formulário e das taxas obtidas da API do BCB. Não há backend, banco de dados ou autenticação.

## 🚀 Publicação

Para publicar o site e obter uma URL pública, utilize a aba **Publish** da plataforma — ela cuidará de todo o processo de deploy automaticamente.
