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
 * Downloads the given input values as a JSON file (see OperationPanel/ModelCard's own "Guardar
 * teste" toolbar button), the same download-a-Blob pattern App.tsx's own exportModel uses for the
 * model itself.
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

/** What a file that is not a test says — whatever is wrong with it (not JSON, a model, an entry without name or value...). */
export const NOT_A_TEST_MESSAGE = 'Não é um teste válido.';

/** What a test whose inputs are not the model's says. */
export const INPUTS_MISMATCH_MESSAGE = 'Os inputs do teste não correspondem ao modelo.';

/**
 * Reads the text of a test file, strictly: it must be a JSON object with an `inputs` list in which every entry has a
 * `name` and a `value` (a number is taken as its text) — an entry that doesn't is an error, not something to skip, so a
 * file that is not a test never loads half of itself. Throws {@link NOT_A_TEST_MESSAGE} on anything else.
 */
export function parseTestCaseText(text: string): TestCaseFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_TEST_MESSAGE);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(NOT_A_TEST_MESSAGE);
  const raw = parsed as Record<string, unknown>;
  if (!Array.isArray(raw.inputs) || raw.inputs.length === 0) throw new Error(NOT_A_TEST_MESSAGE);
  if (raw.modelName !== undefined && typeof raw.modelName !== 'string') throw new Error(NOT_A_TEST_MESSAGE);

  const inputs: TestCaseInput[] = [];
  for (const item of raw.inputs) {
    const entry = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null;
    const value = entry && (typeof entry.value === 'number' && Number.isFinite(entry.value) ? String(entry.value) : entry.value);
    if (!entry || typeof entry.name !== 'string' || entry.name.trim() === '' || typeof value !== 'string') {
      throw new Error(NOT_A_TEST_MESSAGE);
    }
    inputs.push({ name: entry.name, value });
  }

  return { modelName: typeof raw.modelName === 'string' ? raw.modelName : '', inputs };
}

/**
 * The counterpart of downloadTestCase — parses a previously saved file back into its input
 * name/value pairs (see OperationPanel/ModelCard's own "Importar teste"/"Carregar teste (JSON)"
 * toolbar button); see parseTestCaseText for what a valid file is.
 */
export async function parseTestCaseFile(file: File): Promise<TestCaseFile> {
  return parseTestCaseText(await file.text());
}

/**
 * Whether a test file belongs to the model it is being loaded into: its inputs must be the model's inputs — the same
 * names, each as many times as the model has it (names are all that identifies an input across sessions, see
 * TestCaseInput). Returns {@link INPUTS_MISMATCH_MESSAGE} when it does not, null when it does; nothing is loaded then.
 */
export function checkTestCaseMatches(testCase: TestCaseFile, modelInputNames: string[]): string | null {
  const count = (names: string[]) =>
    names.reduce((counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1), new Map<string, number>());
  const inFile = count(testCase.inputs.map((input) => input.name));
  const inModel = count(modelInputNames);
  const same = inFile.size === inModel.size && [...inModel].every(([name, times]) => inFile.get(name) === times);
  return same ? null : INPUTS_MISMATCH_MESSAGE;
}
