# Relatório de implementação — módulo de Frota

## Situação

Proposta preparada em branch separado. NÃO publicada no site e NÃO aplicada ao banco. A revisão automática rejeitou a migração por conceder acesso anônimo aos novos dados de motoristas e custos. A decisão de acesso precisa ser confirmada: área compartilhada sem login ou área restrita autenticada.

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

## Banco proposto, ainda não aplicado

frota_operacoes, frota_registros, frota_importacoes e frota_config. Auditoria privada frota_private.audit_logs. Caminhões, motoristas, abastecimentos e pedágios são views security_invoker, sem valores redundantes. Trigger calcula KM e normaliza placa/motorista. Índice único e RPC transacional evitam reimportação e conflitos concorrentes. Identidade da viagem: data + operação + placa + KM inicial + partida + rota; mudanças de motorista, final ou custos geram conflito para edição, não novo registro silencioso. Exclusão lógica preserva auditoria.

## Cálculos

KM calculado = final − inicial quando disponíveis; caso contrário usa KM total informado e sinaliza falta de hodômetro. Combustível/KM = soma diesel / soma KM. Pedágio/KM = soma pedágio / soma KM. Custo variável conhecido = diesel informado + pedágio informado; custo/KM = soma desses custos / soma KM. Razões sem denominador válido não são exibidas como zero. KM/l exige cobertura completa de litros nos registros com KM, sem alegar consumo real de tanque a tanque.

## Validações

Estrutura, datas, intervalo, placas, motorista, números não negativos, litros/preço positivos quando preenchidos, KM final maior/igual ao inicial, informado versus calculado, litros × preço, duplicação/conflictos e continuidade histórica do hodômetro. Alertas relativos à mediana com amostra mínima e fatores configuráveis. Campos ausentes permanecem null. Viagem com intervalo entra inteira quando cruza o período filtrado.

## Testes efetivamente executados

16 verificações Node passaram: formatos brasileiros; datas e intervalos; normalização; KM divergente/incompleto; custos e litros; filtros; duplicados/conflitos; múltiplas viagens; correção de final; continuidade; XLSX de ida/volta; cabeçalhos; planilha real atual; preservação byte a byte do script de KM. Sintaxe JS e git diff --check passaram.

A planilha real atual enviada em 07/10 foi lida integralmente. A última linha passou a ter hodômetro final preenchido; seus novos valores foram usados na reconciliação. As inconsistências de continuidade da origem são mantidas e sinalizadas, sem correção automática. Dados de origem não são incluídos no repositório público.

## Regressão e pendências

Preservação do código KM verificada, mas NÃO equivale a regressão completa em navegador. O navegador remoto não conseguiu acessar o servidor local de testes (ERR_CONNECTION_REFUSED). Não foram confirmados visualmente layout/responsividade, downloads ou CRUD. A RPC, triggers, RLS, auditoria e sincronização do novo banco não foram executados porque a migração foi rejeitada. Falta concluir esses testes, persistir os dados autorizados e publicar após a decisão de acesso. Nenhum desses itens é declarado 100% funcional em produção.

## Recomendação

Preferir login e autorização por equipe/operação para a área da Frota. O modelo sem login da área KM é herdado, não uma garantia de privacidade. Manutenção, pneus e outros custos ficam fora desta etapa.
