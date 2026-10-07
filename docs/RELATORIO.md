# Relatório de implementação — módulo de Frota

## Situação

Publicado em 07/10/2026 no Render, commit ddaa96b. O usuário autorizou expressamente qualquer visitante sem login a consultar e alterar frota, motoristas e custos. Migração aplicada e planilha atual importada: 30 registros. A reimportação do mesmo arquivo ignorou os 30 registros, sem duplicar.

## Implementado no código

- Segundo agrupamento expansível Dashboard da Frota, com oito telas e alternância para KM.
- Filtros combinados de período, operação, placa e motorista.
- KPIs de KM, placas/motoristas com atividade, diesel, pedágio e custo variável conhecido.
- Fichas por caminhão e motorista, evolução temporal, históricos e comparativo de operações.
- Formulário para adicionar/editar, seleção múltipla e exclusão lógica.
- Importação XLSX/XLS/ODS/CSV com cabeçalhos após títulos, números brasileiros, datas curtas e intervalos.
- Prévia, operação ajustável por linha, bloqueios e alertas antes de confirmar.
- Layout oficial e exportação com aba reimportável e relatório calculado.
- Erros de sincronização visíveis; nenhum dado simulado no código de produção.

## Reutilizado

Tema, navegação expansível, cards, tabelas, SheetJS já existente e REST Supabase. O script inline de KM é idêntico à base auditada. Não há migração ou alteração de km_registros.

## Banco aplicado

frota_operacoes, frota_registros, frota_importacoes e frota_config. Auditoria privada frota_private.audit_logs. Caminhões, motoristas, abastecimentos e pedágios são views security_invoker, sem valores redundantes. Trigger calcula KM e normaliza placa/motorista. Índice único e RPC transacional evitam reimportação e conflitos concorrentes. Identidade da viagem: data + operação + placa + KM inicial + partida + rota; mudanças de motorista, final ou custos geram conflito para edição, não novo registro silencioso. Exclusão lógica preserva auditoria.

## Cálculos

KM calculado = final − inicial quando disponíveis; caso contrário usa KM total informado e sinaliza falta de hodômetro. Combustível/KM = soma diesel / soma KM. Pedágio/KM = soma pedágio / soma KM. Custo variável conhecido = diesel informado + pedágio informado; custo/KM = soma desses custos / soma KM. Razões sem denominador válido não são exibidas como zero. KM/l exige cobertura completa de litros nos registros com KM, sem alegar consumo real de tanque a tanque.

## Validações

Estrutura, datas, intervalo, placas, motorista, números não negativos, litros/preço positivos quando preenchidos, KM final maior/igual ao inicial, informado versus calculado, litros × preço, duplicação/conflictos e continuidade histórica do hodômetro. Alertas relativos à mediana com amostra mínima e fatores configuráveis. Campos ausentes permanecem null. Viagem com intervalo entra inteira quando cruza o período filtrado.

## Testes efetivamente executados

16 verificações Node passaram: formatos brasileiros; datas e intervalos; normalização; KM divergente/incompleto; custos e litros; filtros; duplicados/conflitos; múltiplas viagens; correção de final; continuidade; XLSX de ida/volta; cabeçalhos; planilha real atual; preservação byte a byte do script de KM. Sintaxe JS e git diff --check passaram.

A planilha real atual enviada em 07/10 foi lida integralmente. A última linha passou a ter hodômetro final preenchido; seus novos valores foram usados na reconciliação. As inconsistências de continuidade da origem são mantidas e sinalizadas, sem correção automática. Dados de origem não são incluídos no repositório público.

## Regressão e pendências

Preservação byte a byte do código KM verificada. REST anônima e RPC real validadas: 30 inseridos, segunda importação com 0 inseridos e 30 duplicados, totais reconciliados, 30 entradas de auditoria. A tabela KM permaneceu com 123 registros, sem escrita desta implementação. Render confirmou deploy live. No navegador publicado foram confirmados menu expansível, KM sincronizado, visão geral da Frota com dados reais e último registro atualizado. CRUD manual completo, downloads e responsividade ainda não foram testados em navegador.

## Recomendação

Preferir login e autorização por equipe/operação para a área da Frota. O modelo sem login da área KM é herdado, não uma garantia de privacidade. Manutenção, pneus e outros custos ficam fora desta etapa.
