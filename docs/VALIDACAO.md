# Validação

Os resultados da versão 2.2.0 estão em [ALTERACOES_V2.md](../ALTERACOES_V2.md). `npm test` executa testes sintéticos e da conversão Orthanc; seis testes de integração com as fixtures CT-RATE ficam como *skip* quando esses arquivos não estão disponíveis localmente. `npm run test:orthanc` testa a importação por meio de um servidor Orthanc simulado. A suíte Python usa dados sintéticos. Consulte as instruções no [README](../README.md).
