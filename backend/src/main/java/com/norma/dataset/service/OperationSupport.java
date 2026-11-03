package com.norma.dataset.service;

import com.norma.dataset.dto.CellData;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.TranslatorRule;
import com.norma.dataset.dto.ValueFormat;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.math.BigDecimal;
import java.math.BigInteger;
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
            throw new IllegalArgumentException("Invalid comparison type: " + raw);
        }
    }

    record FindOutcome(boolean found, Integer rowIndex, Integer columnIndex, String value) {
    }

    static SheetData sheetAt(DatasetImportResponse dataset, int sheetIndex, String role) {
        List<SheetData> sheets = dataset.sheets();
        if (sheets == null || sheetIndex < 0 || sheetIndex >= sheets.size()) {
            throw new IllegalArgumentException("Invalid table index (" + role + "): " + sheetIndex);
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
            throw new IllegalArgumentException("The range cannot start at a negative row or column.");
        }
        if (endRow < startRow || endColumn < startColumn) {
            throw new IllegalArgumentException("The end of the range cannot be before its start.");
        }
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
                    return new FindOutcome(true, row.rowIndex(), column, String.valueOf(cellValue(row, column)));
                }
            }
        }
        return new FindOutcome(false, null, null, null);
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
    /** The translator type whose rules are numeric intervals; anything else (or none) is the fixed one. */
    static boolean isRangeTranslator(String type) {
        return "range".equalsIgnoreCase(type == null ? "" : type.trim());
    }

    /** {@link #validateTranslatorRules(List)} for either kind of translator. */
    static List<TranslatorRule> validateTranslatorRules(String type, List<TranslatorRule> rules) {
        return isRangeTranslator(type) ? validateRangeRules(rules) : validateTranslatorRules(rules);
    }

    /**
     * A range translator needs at least one rule; each rule has at least one bound, every bound is a number, a lower
     * bound is not above its upper one, and no two intervals share a value (bounds are inclusive, so 1–5 and 5–9
     * overlap). Returns the rules unchanged.
     */
    private static List<TranslatorRule> validateRangeRules(List<TranslatorRule> rules) {
        List<TranslatorRule> nonNullRules = rules == null ? List.of() : rules;
        if (nonNullRules.isEmpty()) {
            throw new IllegalArgumentException("The translator has no rules.");
        }
        List<double[]> intervals = new ArrayList<>();
        for (TranslatorRule rule : nonNullRules) {
            Double min = parseBound(rule.min());
            Double max = parseBound(rule.max());
            if (min == null && max == null) {
                throw new IllegalArgumentException("One of the translator ranges has no bounds.");
            }
            if (min != null && max != null && min > max) {
                throw new IllegalArgumentException("A translator range starts above where it ends: " + rule.min().trim() + " to " + rule.max().trim());
            }
            intervals.add(new double[] {min == null ? Double.NEGATIVE_INFINITY : min, max == null ? Double.POSITIVE_INFINITY : max});
        }
        intervals.sort(Comparator.comparingDouble(interval -> interval[0]));
        for (int i = 1; i < intervals.size(); i++) {
            if (intervals.get(i - 1)[1] >= intervals.get(i)[0]) {
                throw new IllegalArgumentException("Two translator ranges overlap.");
            }
        }
        return nonNullRules;
    }

    /** A range bound: empty is "no limit" (null), anything else must be a number (a decimal comma is accepted). */
    private static Double parseBound(String bound) {
        String trimmed = bound == null ? "" : bound.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        try {
            double parsed = Double.parseDouble(trimmed.replace(',', '.'));
            if (Double.isNaN(parsed) || Double.isInfinite(parsed)) {
                throw new NumberFormatException();
            }
            return parsed;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("A translator range has a bound that is not a number: " + trimmed);
        }
    }

    static List<TranslatorRule> validateTranslatorRules(List<TranslatorRule> rules) {
        List<TranslatorRule> nonNullRules = rules == null ? List.of() : rules;
        if (nonNullRules.isEmpty()) {
            throw new IllegalArgumentException("The translator has no rules.");
        }
        Set<String> seenSources = new HashSet<>();
        for (TranslatorRule rule : nonNullRules) {
            String from = rule.from() == null ? "" : rule.from().trim();
            if (from.isEmpty()) {
                throw new IllegalArgumentException("One of the translator rules has no source value.");
            }
            if (!seenSources.add(from.toLowerCase())) {
                throw new IllegalArgumentException("Two translator rules cannot have the same source value: " + from);
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
    /** {@link #translate(List, String)} for either kind of translator: a range one reads the input as a number. */
    static String translate(String type, List<TranslatorRule> rules, String normalizedInput) {
        if (!isRangeTranslator(type)) {
            return translate(rules, normalizedInput);
        }
        double value;
        try {
            value = Double.parseDouble(normalizedInput.replace(',', '.'));
            if (Double.isNaN(value) || Double.isInfinite(value)) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("The value is not a number, so no range can contain it: " + normalizedInput);
        }
        for (TranslatorRule rule : rules) {
            Double min = parseBound(rule.min());
            Double max = parseBound(rule.max());
            if ((min == null || value >= min) && (max == null || value <= max)) {
                return rule.to();
            }
        }
        throw new IllegalArgumentException("No range contains the value: " + normalizedInput);
    }

    static String translate(List<TranslatorRule> rules, String normalizedInput) {
        return rules.stream()
                .filter(rule -> rule.from() != null && rule.from().trim().equalsIgnoreCase(normalizedInput))
                .findFirst()
                .map(TranslatorRule::to)
                .orElseThrow(() -> new IllegalArgumentException("No rule exists for the value: " + normalizedInput));
    }

    static double parseCounterEntry(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("O contador tem uma entrada sem valor.");
        }
        try {
            return Double.parseDouble(trimmed.replace(',', '.'));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("The counter has an input that is not numeric: " + trimmed);
        }
    }

    /**
     * Parses a selector's index (zero-based, so index 1 of a, b, c is b): a whole number, with a
     * decimal comma or a trailing ".0" tolerated since a chained index may come from a numeric
     * result — a fractional or non-numeric one is a request error, not rounded.
     */
    static int parseSelectorIndex(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("The selector has no condition.");
        }
        double parsed;
        try {
            parsed = Double.parseDouble(trimmed.replace(',', '.'));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("The selector condition is not numeric: " + trimmed);
        }
        if (parsed != Math.rint(parsed) || Double.isInfinite(parsed) || Math.abs(parsed) > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("The selector condition must be a whole number: " + trimmed);
        }
        return (int) parsed;
    }

    /** Rejects an index outside {@code 0..count-1}, or a selector with nothing to pick from. */
    static void validateSelectorIndex(int index, int count) {
        if (count == 0) {
            throw new IllegalArgumentException("The selector has no inputs.");
        }
        if (index < 0 || index >= count) {
            throw new IllegalArgumentException(
                    "The selector condition " + index + " is out of range (it has " + count + " inputs, numbered from 0).");
        }
    }

    /**
     * Mirrors {@link DatasetParserService}'s own cell-value normalization — the single copy both
     * that service (parsing whole-number cells) and {@link ModelExecutionService} (stringifying a
     * whole-number counter result so it matches a whole-number cell the same way, "24" not
     * "24.0") now share, instead of each keeping its own independent copy.
     */
    /** Parses a decimal number (a comma is accepted as the decimal separator) for the calc operation. */
    /** One value of a calc made with a list: a blank one says so, any other that is not a number says which input it is. */
    static double parseCalcInput(String value, int position) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Input " + position + " has no value.");
        }
        return parseNumber(value, "input " + position);
    }

    static double parseNumber(String value, String fieldName) {
        String trimmed = value == null ? "" : value.trim();
        try {
            double parsed = Double.parseDouble(trimmed.replace(',', '.'));
            if (Double.isNaN(parsed) || Double.isInfinite(parsed)) {
                throw new NumberFormatException();
            }
            return parsed;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Invalid number in " + fieldName + ": " + trimmed);
        }
    }

    /**
     * Checks {@code value} against a formatter's rules and returns it as the model carries it on: unchanged for a text,
     * a number written canonically ("007" and "7.50" become "7" and "7.5"). An empty value is refused when the formatter
     * is required and otherwise left as it is. Anything that breaks a rule is an {@link IllegalArgumentException} that
     * says which one.
     */
    static String applyFormat(ValueFormat format, String value) {
        String type = format.type() == null || format.type().isBlank() ? "text" : format.type();
        if (format.minLength() != null && format.maxLength() != null && format.minLength() > format.maxLength()) {
            throw new IllegalArgumentException("The minimum length cannot be greater than the maximum length.");
        }
        if (format.min() != null && format.max() != null && format.min().compareTo(format.max()) > 0) {
            throw new IllegalArgumentException("The minimum cannot be greater than the maximum.");
        }
        String text = value == null ? "" : value;
        if (text.trim().isEmpty()) {
            if (Boolean.TRUE.equals(format.required())) {
                throw new IllegalArgumentException("A value is required.");
            }
            return text;
        }
        return switch (type) {
            case "text" -> {
                int length = text.codePointCount(0, text.length());
                if (format.minLength() != null && length < format.minLength()) {
                    throw new IllegalArgumentException("At least " + format.minLength() + " characters are needed (it has " + length + ").");
                }
                if (format.maxLength() != null && length > format.maxLength()) {
                    throw new IllegalArgumentException("At most " + format.maxLength() + " characters are allowed (it has " + length + ").");
                }
                yield text;
            }
            case "integer" -> {
                String trimmed = text.trim();
                if (!trimmed.matches("[+-]?\\d+")) {
                    throw new IllegalArgumentException("Not a whole number.");
                }
                yield checkRange(format, new BigDecimal(new BigInteger(trimmed.startsWith("+") ? trimmed.substring(1) : trimmed))).toPlainString();
            }
            case "decimal" -> {
                String trimmed = text.trim().replace(',', '.');
                BigDecimal number;
                try {
                    number = new BigDecimal(trimmed);
                } catch (NumberFormatException ex) {
                    throw new IllegalArgumentException("Not a number.");
                }
                BigDecimal checked = checkRange(format, number);
                yield checked.signum() == 0 ? "0" : checked.stripTrailingZeros().toPlainString();
            }
            default -> throw new IllegalArgumentException("Unknown value type: " + type);
        };
    }

    private static BigDecimal checkRange(ValueFormat format, BigDecimal number) {
        if (format.min() != null && number.compareTo(format.min()) < 0) {
            throw new IllegalArgumentException("Must be at least " + format.min().toPlainString() + ".");
        }
        if (format.max() != null && number.compareTo(format.max()) > 0) {
            throw new IllegalArgumentException("Must be at most " + format.max().toPlainString() + ".");
        }
        return number;
    }

    /**
     * Applies one of the calc operation's arithmetic operations to two numbers, then its output
     * format: {@code round} gives a rounded integer, {@code abs} the absolute value, anything else
     * (including {@code none}) the result as is. Dividing by zero is an error.
     */
    static Object calculate(double a, double b, String operation, String format) {
        return calculateAll(List.of(a, b), operation, format);
    }

    /**
     * Applies an arithmetic operation across any number of values, from left to right: {@code add} and {@code multiply}
     * combine them all, {@code subtract} and {@code divide} take the first and then subtract or divide by each of the
     * rest in turn (the first minus the second minus the third…), so with two values it is exactly a - b or a / b.
     * Subtract and divide need at least two values.
     */
    static Object calculateAll(List<Double> values, String operation, String format) {
        if (values.isEmpty()) {
            throw new IllegalArgumentException("The calculation has no values.");
        }
        String name = operation == null ? "" : operation;
        if (("subtract".equals(name) || "divide".equals(name)) && values.size() < 2) {
            throw new IllegalArgumentException("Subtract and divide need at least two values.");
        }
        double result = values.get(0);
        for (int index = 1; index < values.size(); index++) {
            double next = values.get(index);
            result = switch (name) {
                case "add" -> result + next;
                case "subtract" -> result - next;
                case "multiply" -> result * next;
                case "divide" -> {
                    if (next == 0) {
                        throw new IllegalArgumentException("Division by zero.");
                    }
                    yield result / next;
                }
                default -> throw new IllegalArgumentException("Unknown calc operation: " + operation);
            };
        }
        if (values.size() == 1 && !("add".equals(name) || "multiply".equals(name))) {
            throw new IllegalArgumentException("Unknown calc operation: " + operation);
        }
        if ("round".equals(format)) {
            return Math.round(result);
        }
        if ("abs".equals(format)) {
            result = Math.abs(result);
        }
        return normalizeNumber(result);
    }

    static Object normalizeNumber(double value) {
        if (value == Math.rint(value) && !Double.isInfinite(value)) {
            return (long) value;
        }
        return value;
    }
}
