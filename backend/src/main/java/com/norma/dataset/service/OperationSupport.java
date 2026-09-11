package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.TranslatorRule;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Cell/range/matching/number-formatting logic shared by {@link DatasetOperationService} (the
 * single-operation live-editor endpoints) and {@link ModelExecutionService} (model registration
 * and graph-resolved runs) — split out so neither service has to depend on the other just to
 * reuse this, and so the two remain free to evolve their own (already quite different) request
 * shapes independently: the live endpoints read straight off typed DTOs, the model runner reads
 * off a kind's untyped {@code Map<String,Object>} fields instead.
 */
final class OperationSupport {

    private OperationSupport() {
    }

    /** Lookup's search-column comparison: the whole cell must match the query exactly (EQUALS,
     * the original behavior), just contain it somewhere (CONTAINS), or exactly match one of the
     * cell's separator-split pieces (TOKEN_EQUALS) — see {@link #matches}. */
    enum MatchMode {
        EQUALS, CONTAINS, TOKEN_EQUALS;

        /** Null/blank (a model saved before this field existed, or an omitted request field) is
         * treated as EQUALS, so nothing already built or saved changes behavior. */
        static MatchMode from(String raw) {
            if (raw == null || raw.isBlank() || "equals".equalsIgnoreCase(raw)) {
                return EQUALS;
            }
            if ("contains".equalsIgnoreCase(raw)) {
                return CONTAINS;
            }
            if ("tokenEquals".equalsIgnoreCase(raw)) {
                return TOKEN_EQUALS;
            }
            throw new IllegalArgumentException("Tipo de comparação inválido: " + raw);
        }
    }

    record SumOutcome(double total, int cellsSummed) {
    }

    record FindOutcome(boolean found, Integer rowIndex, Integer columnIndex) {
    }

    static SheetData sheetAt(DatasetImportResponse dataset, int sheetIndex, String role) {
        List<SheetData> sheets = dataset.sheets();
        if (sheets == null || sheetIndex < 0 || sheetIndex >= sheets.size()) {
            throw new IllegalArgumentException("Índice de tabela inválido (" + role + "): " + sheetIndex);
        }
        return sheets.get(sheetIndex);
    }

    static Object cellValue(RowData row, int columnIndex) {
        // findFirst() wraps the element in Optional.of internally, which throws on a null
        // element — so find the (non-null) CellData first and only then read its (possibly
        // null, e.g. a blank cell) value via Optional.map.
        return row.cells().stream()
                .filter(cell -> cell.columnIndex() == columnIndex)
                .findFirst()
                .map(CellData::value)
                .orElse(null);
    }

    static void validateRange(int startRow, int endRow, int startColumn, int endColumn) {
        if (startRow < 0 || startColumn < 0) {
            throw new IllegalArgumentException("O intervalo não pode começar numa linha ou coluna negativa.");
        }
        if (endRow < startRow || endColumn < startColumn) {
            throw new IllegalArgumentException("O fim do intervalo não pode ser anterior ao início.");
        }
    }

    static SumOutcome sumRange(SheetData sheet, int startRow, int endRow, int startColumn, int endColumn) {
        double total = 0;
        int cellsSummed = 0;
        for (RowData row : sheet.rows()) {
            if (row.rowIndex() < startRow || row.rowIndex() > endRow) {
                continue;
            }
            for (int column = startColumn; column <= endColumn; column++) {
                Object value = cellValue(row, column);
                if (value instanceof Number number) {
                    total += number.doubleValue();
                    cellsSummed++;
                }
            }
        }
        return new SumOutcome(total, cellsSummed);
    }

    /** Scans the range row by row, then column by column within each row, for the first cell
     * matching {@code normalizedQuery} — shared by the live find endpoint and computeFind. */
    static FindOutcome findInRange(SheetData sheet, int startRow, int endRow, int startColumn, int endColumn, String normalizedQuery) {
        for (RowData row : sheet.rows()) {
            if (row.rowIndex() < startRow || row.rowIndex() > endRow) {
                continue;
            }
            for (int column = startColumn; column <= endColumn; column++) {
                if (matches(cellValue(row, column), normalizedQuery)) {
                    return new FindOutcome(true, row.rowIndex(), column);
                }
            }
        }
        return new FindOutcome(false, null, null);
    }

    /** find/translator's own matching — always exact, same as lookup's own default (see the
     * {@link MatchMode}-aware overload below, which only lookup's two entry points call). */
    static boolean matches(Object cellValue, String normalizedQuery) {
        return matches(cellValue, normalizedQuery, MatchMode.EQUALS, false, false);
    }

    static boolean matches(Object cellValue, String normalizedQuery, MatchMode matchMode, boolean tokenIgnoreSpaces, boolean tokenIgnoreDashes) {
        if (cellValue == null) {
            return false;
        }
        String normalizedCell = String.valueOf(cellValue).trim();
        return switch (matchMode) {
            case EQUALS -> normalizedCell.equalsIgnoreCase(normalizedQuery);
            case CONTAINS -> normalizedCell.toLowerCase().contains(normalizedQuery.toLowerCase());
            case TOKEN_EQUALS -> matchesTokenEquals(normalizedCell, normalizedQuery, tokenIgnoreSpaces, tokenIgnoreDashes);
        };
    }

    /**
     * TOKEN_EQUALS: splits the cell on runs of whichever separator characters are enabled (space,
     * "-", or both) and checks whether any resulting piece exactly (case-insensitively) equals
     * the query — unlike CONTAINS, a query of "0" never matches a cell of "10" (no separator
     * between them makes it one piece, "10"), but does match a cell of "1 -0" (splits into "1"
     * and "0"). Neither separator enabled degenerates to plain EQUALS (the whole cell as one
     * piece), which is a reasonable, harmless default rather than an error.
     */
    private static boolean matchesTokenEquals(String normalizedCell, String normalizedQuery, boolean tokenIgnoreSpaces, boolean tokenIgnoreDashes) {
        if (!tokenIgnoreSpaces && !tokenIgnoreDashes) {
            return normalizedCell.equalsIgnoreCase(normalizedQuery);
        }
        String separatorClass = (tokenIgnoreSpaces ? "\\s" : "") + (tokenIgnoreDashes ? "\\-" : "");
        for (String token : normalizedCell.split("[" + separatorClass + "]+")) {
            String trimmedToken = token.trim();
            if (!trimmedToken.isEmpty() && trimmedToken.equalsIgnoreCase(normalizedQuery)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Rejects an empty rule table, a rule with no source value, and — the rule this whole
     * operation exists to enforce — two rules sharing the same (trimmed, case-insensitive) source
     * value, which would leave the translation for that value ambiguous. Several rules sharing the
     * same target is fine (many sources translating to one target is the normal case), only
     * duplicate sources are rejected. Shared by both the live translator endpoint and a
     * translator operation's own model-run computation.
     */
    static List<TranslatorRule> validateTranslatorRules(List<TranslatorRule> rules) {
        List<TranslatorRule> nonNullRules = rules == null ? List.of() : rules;
        if (nonNullRules.isEmpty()) {
            throw new IllegalArgumentException("O tradutor não tem nenhuma regra.");
        }
        Set<String> seenSources = new HashSet<>();
        for (TranslatorRule rule : nonNullRules) {
            String from = rule.from() == null ? "" : rule.from().trim();
            if (from.isEmpty()) {
                throw new IllegalArgumentException("Uma das regras do tradutor não tem valor de origem.");
            }
            if (!seenSources.add(from.toLowerCase())) {
                throw new IllegalArgumentException("Duas regras do tradutor não podem ter o mesmo valor de origem: " + from);
            }
        }
        return nonNullRules;
    }

    /**
     * The actual source→target lookup, once {@code rules} is already known valid (see
     * {@link #validateTranslatorRules}) — a plain linear scan for the (trimmed, case-insensitive)
     * matching source, same match semantics as {@link #matches} (lookup/find's own). No matching
     * rule is a request error, not a null result.
     */
    static String translate(List<TranslatorRule> rules, String normalizedInput) {
        return rules.stream()
                .filter(rule -> rule.from() != null && rule.from().trim().equalsIgnoreCase(normalizedInput))
                .findFirst()
                .map(TranslatorRule::to)
                .orElseThrow(() -> new IllegalArgumentException("Não existe nenhuma regra para o valor: " + normalizedInput));
    }

    static double parseCounterEntry(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("O contador tem uma entrada sem valor.");
        }
        try {
            return Double.parseDouble(trimmed.replace(',', '.'));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("O contador tem uma entrada que não é numérica: " + trimmed);
        }
    }

    /**
     * Mirrors {@link DatasetParserService}'s own cell-value normalization — the single copy both
     * that service (parsing whole-number cells) and {@link ModelExecutionService} (stringifying a
     * whole-number sum/counter result so it matches a whole-number cell the same way, "24" not
     * "24.0") now share, instead of each keeping its own independent copy.
     */
    static Object normalizeNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return (long) value;
        }
        return value;
    }
}
