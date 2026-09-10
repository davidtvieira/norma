/** One designated-input operation's test value, keyed by its display *name* — not its internal
 * operation id, which regenerates every time a model's entries are (re)created (e.g. on
 * re-import, see OperationPanel's generateEntryId), so name is the only identifier stable enough
 * to still match the right field on a later session. */
export interface TestCaseInput {
  name: string;
  value: string;
}

export interface TestCaseFile {
  modelName: string;
  inputs: TestCaseInput[];
}

/**
 * Downloads the given input values as a JSON file (see TestValuesModal's "Guardar teste"), the
 * same download-a-Blob pattern App.tsx's own exportModel uses for the model itself.
 */
export function downloadTestCase(modelName: string, inputs: TestCaseInput[]): void {
  const file: TestCaseFile = { modelName, inputs };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${modelName.trim() || 'modelo'}.teste.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The counterpart of downloadTestCase — parses a previously saved file back into its input
 * name/value pairs (see TestValuesModal's "Carregar teste"). Throws with a user-facing
 * (Portuguese) message on anything malformed rather than silently producing a partial result.
 */
export async function parseTestCaseFile(file: File): Promise<TestCaseFile> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Ficheiro de teste inválido: não é um JSON válido.');
  }

  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as Record<string, unknown>).inputs)) {
    throw new Error('Ficheiro de teste inválido.');
  }

  const raw = parsed as { modelName?: unknown; inputs: unknown[] };
  const inputs = raw.inputs.filter(
    (item): item is TestCaseInput =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === 'string' &&
      typeof (item as Record<string, unknown>).value === 'string',
  );

  if (inputs.length === 0) {
    throw new Error('Ficheiro de teste inválido: não tem nenhum valor de input.');
  }

  return { modelName: typeof raw.modelName === 'string' ? raw.modelName : '', inputs };
}
