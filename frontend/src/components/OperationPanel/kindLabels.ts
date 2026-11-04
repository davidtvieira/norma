/** Overrides the API's (English) labels with their Portuguese display names — the id is still
 * what's sent to/matched against the API, only the label shown in the UI is translated here. */
export const KIND_LABELS: Record<string, string> = {
  lookup: 'Pesquisa aninhada',
  node: 'Nó',
  find: 'Localizar',
  translator: 'Tradutor',
  selector: 'Seletor',
  iterator: 'Iterador',
  calc: 'Calcular',
  page: 'Seletor de página',
  formatter: 'Formatador de entrada',
  filter: 'Filtro',
  combined: 'Saída combinada',
};

/** A one-line description of what each operation kind does, shown when picking one to add. */
export const KIND_DESCRIPTIONS: Record<string, string> = {
  lookup: 'Procura um valor numa coluna e devolve o valor correspondente de outra.',
  node: 'Guarda um valor para outras operações o usarem.',
  find: 'Procura um valor num intervalo e devolve a posição (linha, coluna): serve para escolher a coluna de uma Pesquisa pelo cabeçalho.',
  translator: 'Troca valores por outros, segundo regras definidas por si: valores exatos ou intervalos de números.',
  selector: 'Escolhe um dos seus valores pelo número da posição.',
  iterator: 'Repete o modelo inteiro por cada página de um intervalo.',
  calc: 'Soma, subtrai, multiplica ou divide dois ou mais valores.',
  page: 'Escolhe a página dos dados que as outras operações vão ler.',
  formatter: 'Define o tipo e os limites (tamanho máximo, número, obrigatório…) das entradas que escolher.',
  filter: 'Só deixa passar as entradas que cumprem uma condição (um valor ou um intervalo); as outras são ignoradas.',
  combined: 'Junta dois valores num só cartão de saída: um valor principal e um detalhe (por exemplo, a avaliação e os valores contados). É sempre uma saída.',
};
