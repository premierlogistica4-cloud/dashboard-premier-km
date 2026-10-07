# Evolução da frota — auditoria e arquitetura

Base auditada: commit 2239ed874a4deda3cad327fcce05b5482900180e, 07/10/2026.

O projeto tem uma única página index.html. As seis telas do módulo KM alternam por classes CSS; cálculos e importação XLSX rodam no navegador. A REST API Supabase persiste km_registros (118 linhas, 33.741 KM realizados e 35.606 KM Google no início da auditoria). Não há login. RLS está habilitada, com leitura/escrita compartilhada para anon e authenticated. O refresh ocorre a cada 30 segundos. Não há backend próprio, componentes ou framework a migrar.

Reutilização: cores, cards, painéis, tabelas, menu expansível, SheetJS 0.18.5 e conexão Supabase. O código de KM e sua tabela ficam preservados; a frota recebe arquivos JS/CSS próprios e identificadores prefixados.

Modelo: operações de referência, registros históricos por viagem, importações idempotentes, configurações compartilhadas, auditoria privada. Caminhões, motoristas, abastecimentos e pedágios são projeções do registro histórico, evitando duplicação de valores. Uma placa pode ter vários motoristas e operações. As exclusões são lógicas e auditadas. O banco calcula KM e impede duplicidade, inclusive em importações concorrentes.

Planilha de referência: ODS com 30 linhas de distribuição, três placas, dois motoristas, cabeçalho na segunda linha, datas dd/mm/aa, um intervalo de três dias, dinheiro em formato brasileiro e último hodômetro inicialmente incompleto, preenchido na versão atual enviada em 07/10. A fonte não contém litros nem pedágios. Há saltos/descontinuidades reais; não corrigir por adivinhação. O trajeto de Brasília está explícito na descrição. A importação mostra o mapeamento de PREMIER para São Paulo, FAZENDA para Fazenda e BRASÍLIA explícita para Brasília antes da confirmação; permite mudar a operação na prévia.

Filtros de período incluem viagens cujo intervalo cruza o período, por inteiro, sem inventar distribuição diária. Gráficos de KM usam a data de conclusão; custos são registrados na data inicial. Contagens de ativos significam veículos/motoristas com registros no período, não cadastro de disponibilidade operacional.

Custos: combustível + pedágios informados; campos ausentes são null, distintos de zero. Razões usam somas, nunca média simples de razões. KM/l só aparece com cobertura de litros em todos os registros com KM e é identificado como razão dos registros, sem alegar consumo de tanque a tanque. Dados incompletos permanecem pendentes, com gastos conhecidos preservados.

Limitação herdada: acesso compartilhado sem autenticação. Não equivale a área privada. Recomendação futura: login e autorização por equipe/operação antes de usar dados que precisem de acesso restrito. Os problemas preexistentes de importação/Google zero no KM não são alterados nesta evolução para preservar seu funcionamento.
