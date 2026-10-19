package com.norma.dataset.config;

import io.swagger.v3.oas.models.tags.Tag;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Fixes the order the API groups appear in Swagger UI — the dataset-reading operations last, after
 * the dataset-free ones. springdoc collects each controller's {@code @Tag} in scan order (and can
 * list one twice), so the collected tags are merged by name, keeping the description, and sorted
 * here; a tag not listed in {@link #ORDER} goes after the listed ones.
 */
@Configuration
public class OpenApiConfig {

    private static final List<String> ORDER = List.of("NRM", "Models", "Dataset", "Operations", "Dataset operations");

    @Bean
    public OpenApiCustomizer tagOrderCustomizer() {
        return openApi -> {
            if (openApi.getTags() == null) {
                return;
            }
            Map<String, Tag> byName = new LinkedHashMap<>();
            for (Tag tag : openApi.getTags()) {
                Tag known = byName.get(tag.getName());
                if (known == null || (known.getDescription() == null && tag.getDescription() != null)) {
                    byName.put(tag.getName(), tag);
                }
            }
            openApi.setTags(byName.values().stream()
                    .sorted((a, b) -> Integer.compare(rank(a.getName()), rank(b.getName())))
                    .toList());
        };
    }

    private static int rank(String name) {
        int index = ORDER.indexOf(name);
        return index < 0 ? ORDER.size() : index;
    }
}
