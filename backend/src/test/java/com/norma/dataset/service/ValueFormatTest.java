package com.norma.dataset.service;

import com.norma.dataset.dto.ValueFormat;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The rules of a formatter operation: what {@link OperationSupport#applyFormat} accepts and how it refuses the rest. */
class ValueFormatTest {

    private static ValueFormat text(Boolean required, Integer minLength, Integer maxLength) {
        return new ValueFormat("text", required, minLength, maxLength, null, null);
    }

    private static ValueFormat number(String type, String min, String max) {
        return new ValueFormat(type, null, null, null, min == null ? null : new BigDecimal(min), max == null ? null : new BigDecimal(max));
    }

    @Test
    void aTextWithinItsLengthsIsAcceptedUnchanged() {
        assertThat(OperationSupport.applyFormat(text(null, 2, 5), "  ab ")).isEqualTo("  ab ");
        assertThat(OperationSupport.applyFormat(text(null, null, 5), "12345")).isEqualTo("12345");
    }

    @Test
    void aTextTooLongOrTooShortIsRefusedSayingWhy() {
        assertThatThrownBy(() -> OperationSupport.applyFormat(text(null, null, 5), "123456"))
                .hasMessage("At most 5 characters are allowed (it has 6).");
        assertThatThrownBy(() -> OperationSupport.applyFormat(text(null, 3, null), "ab"))
                .hasMessage("At least 3 characters are needed (it has 2).");
    }

    @Test
    void lengthsCountCharactersNotBytes() {
        assertThat(OperationSupport.applyFormat(text(null, null, 3), "ção")).isEqualTo("ção");
        assertThat(OperationSupport.applyFormat(text(null, null, 1), "😀")).isEqualTo("😀");
    }

    @Test
    void anEmptyValueIsRefusedOnlyWhenRequired() {
        assertThatThrownBy(() -> OperationSupport.applyFormat(text(true, null, null), "  ")).hasMessage("A value is required.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(new ValueFormat("integer", true, null, null, null, null), null))
                .hasMessage("A value is required.");
        // Not required: an empty value passes whatever the other rules, a number's included.
        assertThat(OperationSupport.applyFormat(text(false, 3, 5), "")).isEmpty();
        assertThat(OperationSupport.applyFormat(number("integer", "1", "9"), " ")).isEqualTo(" ");
    }

    @Test
    void anIntegerMustBeWholeAndWithinItsRange() {
        assertThat(OperationSupport.applyFormat(number("integer", "1", "10"), " 007 ")).isEqualTo("7");
        assertThat(OperationSupport.applyFormat(number("integer", null, null), "+5")).isEqualTo("5");
        assertThat(OperationSupport.applyFormat(number("integer", null, null), "-12")).isEqualTo("-12");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("integer", null, null), "1.5")).hasMessage("Not a whole number.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("integer", null, null), "abc")).hasMessage("Not a whole number.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("integer", "1", "10"), "0")).hasMessage("Must be at least 1.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("integer", "1", "10"), "11")).hasMessage("Must be at most 10.");
    }

    @Test
    void aDecimalAcceptsACommaAndIsWrittenCanonically() {
        assertThat(OperationSupport.applyFormat(number("decimal", null, null), "7,50")).isEqualTo("7.5");
        assertThat(OperationSupport.applyFormat(number("decimal", null, null), "100")).isEqualTo("100");
        assertThat(OperationSupport.applyFormat(number("decimal", null, null), "0.000")).isEqualTo("0");
        assertThat(OperationSupport.applyFormat(number("decimal", "0.5", "2.5"), "1.25")).isEqualTo("1.25");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("decimal", null, null), "1,2,3")).hasMessage("Not a number.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("decimal", "0.5", null), "0.4")).hasMessage("Must be at least 0.5.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("decimal", null, "2.5"), "2.51")).hasMessage("Must be at most 2.5.");
    }

    @Test
    void aMissingTypeMeansTextAndAnUnknownOneIsRefused() {
        assertThat(OperationSupport.applyFormat(new ValueFormat(null, null, null, 3, null, null), "abc")).isEqualTo("abc");
        assertThatThrownBy(() -> OperationSupport.applyFormat(new ValueFormat("date", null, null, null, null, null), "2026-01-01"))
                .hasMessage("Unknown value type: date");
    }

    @Test
    void contradictoryLimitsAreRefused() {
        assertThatThrownBy(() -> OperationSupport.applyFormat(text(null, 5, 3), "abcd"))
                .hasMessage("The minimum length cannot be greater than the maximum length.");
        assertThatThrownBy(() -> OperationSupport.applyFormat(number("integer", "9", "1"), "5"))
                .hasMessage("The minimum cannot be greater than the maximum.");
    }
}
