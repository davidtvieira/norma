package com.norma.dataset.service;

import com.norma.dataset.dto.CounterRequest;
import com.norma.dataset.dto.CounterResponse;
import com.norma.dataset.dto.DatasetImportResponse;
import com.norma.dataset.dto.FindRequest;
import com.norma.dataset.dto.FindResponse;
import com.norma.dataset.dto.LookupRequest;
import com.norma.dataset.dto.LookupResponse;
import com.norma.dataset.dto.NodeRequest;
import com.norma.dataset.dto.NodeResponse;
import com.norma.dataset.dto.RowData;
import com.norma.dataset.dto.SheetData;
import com.norma.dataset.dto.SumRequest;
import com.norma.dataset.dto.SumResponse;
import com.norma.dataset.dto.TranslatorRequest;
import com.norma.dataset.dto.TranslatorResponse;
import com.norma.dataset.dto.TranslatorRule;
import com.norma.dataset.service.OperationSupport.FindOutcome;
import com.norma.dataset.service.OperationSupport.MatchMode;
import com.norma.dataset.service.OperationSupport.SumOutcome;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Runs the single-operation live-editor endpoints (lookup/sum/find/counter/node/translator)
 * against a dataset previously imported and kept in memory by {@link DatasetStore} — callers
 * reference it by id instead of resending the parsed JSON. Used while a model is being built in
 * the editor, one field at a time; see {@link ModelExecutionService} for registering/running a
 * whole model (its operations, chained references, and graph resolution) at once instead — that
 * split mirrors the two request shapes: this service reads straight off typed request DTOs,
 * {@link ModelExecutionService} reads off a kind's untyped {@code Map<String,Object>} fields.
 * Range/match/translate mechanics both services need are shared via {@link OperationSupport}
 * rather than duplicated between them.
 */
@Service
public class DatasetOperationService {

    private final DatasetStore datasetStore;

    public DatasetOperationService(DatasetStore datasetStore) {
        this.datasetStore = datasetStore;
    }

    public LookupResponse lookup(LookupRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData searchSheet = OperationSupport.sheetAt(dataset, request.searchSheetIndex(), "onde procurar");
        SheetData resultSheet = OperationSupport.sheetAt(dataset, request.resultSheetIndex(), "a devolver");

        String normalizedQuery = request.query() == null ? "" : request.query().trim();
        MatchMode matchMode = MatchMode.from(request.matchMode());

        Optional<RowData> matchRow = searchSheet.rows().stream()
                .filter(row -> row.rowIndex() >= request.startRow())
                .filter(row -> OperationSupport.matches(
                        OperationSupport.cellValue(row, request.searchColumn()), normalizedQuery, matchMode,
                        request.tokenIgnoreSpaces(), request.tokenIgnoreDashes()))
                .findFirst();

        if (matchRow.isEmpty()) {
            return new LookupResponse(false, null, null);
        }

        Optional<RowData> resultRow = request.searchSheetIndex() == request.resultSheetIndex()
                ? matchRow
                : resultSheet.rows().stream()
                        .filter(row -> row.rowIndex() == matchRow.get().rowIndex())
                        .findFirst();

        if (resultRow.isEmpty()) {
            return new LookupResponse(false, null, null);
        }

        return new LookupResponse(true, OperationSupport.cellValue(resultRow.get(), request.resultColumn()), matchRow.get().rowIndex());
    }

    public SumResponse sum(SumRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData sheet = OperationSupport.sheetAt(dataset, request.sheetIndex(), "a somar");
        OperationSupport.validateRange(request.startRow(), request.endRow(), request.startColumn(), request.endColumn());

        SumOutcome outcome = OperationSupport.sumRange(sheet, request.startRow(), request.endRow(), request.startColumn(), request.endColumn());
        return new SumResponse(outcome.total(), outcome.cellsSummed());
    }

    public FindResponse find(FindRequest request) {
        DatasetImportResponse dataset = datasetStore.get(request.datasetId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Conjunto de dados não encontrado. Volte a importar o ficheiro."));

        SheetData sheet = OperationSupport.sheetAt(dataset, request.sheetIndex(), "onde procurar");
        OperationSupport.validateRange(request.startRow(), request.endRow(), request.startColumn(), request.endColumn());
        String normalizedQuery = request.query() == null ? "" : request.query().trim();

        FindOutcome outcome = OperationSupport.findInRange(sheet, request.startRow(), request.endRow(), request.startColumn(), request.endColumn(), normalizedQuery);
        return new FindResponse(outcome.found(), outcome.rowIndex(), outcome.columnIndex());
    }

    /**
     * Adds up however many already-resolved values it's given — the live-editor counterpart of a
     * counter operation's own model-run computation, called the same way lookup/sum's own live
     * endpoints are while a model is being built (see DatasetOperationController), just with no
     * dataset to look anything up against: each value was already resolved client-side (a typed
     * literal, or another operation's own live result) before this is ever called.
     */
    public CounterResponse counter(CounterRequest request) {
        List<String> values = request.values() == null ? List.of() : request.values();
        if (values.isEmpty()) {
            throw new IllegalArgumentException("O contador não tem nenhuma entrada.");
        }

        double total = 0;
        for (String value : values) {
            total += OperationSupport.parseCounterEntry(value);
        }
        return new CounterResponse(total);
    }

    /**
     * Passes a value straight through — the live-editor counterpart of a node operation's own
     * model-run computation, called the same way lookup/sum/counter's own live endpoints are
     * while a model is being built. A node does no computation and has no dataset dependency;
     * this exists purely so a node's own result-reporting (and therefore its testSignal-gated
     * "Testar modelo" flow) works the same way every other kind's does.
     */
    public NodeResponse node(NodeRequest request) {
        return new NodeResponse(request.value() == null ? "" : request.value());
    }

    /**
     * Translates a value against a user-defined source-to-target mapping table — the live-editor
     * counterpart of a translator operation's own model-run computation, called the same way
     * every other kind's own live endpoint is while a model is being built. No dataset
     * dependency, same as counter/node: the rules are entirely user-defined, not read from any
     * table. A value with no matching rule is a request error, not a quiet non-match — unlike
     * lookup/find, which treat "nothing matched" as a legitimate, non-error result.
     */
    public TranslatorResponse translator(TranslatorRequest request) {
        List<TranslatorRule> rules = OperationSupport.validateTranslatorRules(request.rules());
        String normalizedInput = request.input() == null ? "" : request.input().trim();
        return new TranslatorResponse(OperationSupport.translate(rules, normalizedInput));
    }
}
