package com.norma.dataset.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allows a frontend served from a different origin than this API to call it. Defaults (see
 * application.yml's {@code norma.cors.allowed-origins}) to just the Vite dev server's own default
 * port — the standard dev flow never actually needs even that much, since Vite's own dev-server
 * proxy (frontend/vite.config.ts) forwards /api calls to this backend itself, so the browser only
 * ever talks to Vite's origin. The wider-open {@code "*"} this used to allow unconditionally is
 * still available by setting the property to {@code "*"} (e.g. for a tunnel/proxy scenario where
 * the dev server's own origin isn't known ahead of time) but is no longer the default — set it
 * explicitly, and never in a deployment reachable beyond your own machine.
 */
@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public WebCorsConfig(@Value("${norma.cors.allowed-origins}") String allowedOrigins) {
        this.allowedOrigins = allowedOrigins.split(",");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        var mapping = registry.addMapping("/api/**").allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
        if (allowedOrigins.length == 1 && "*".equals(allowedOrigins[0].trim())) {
            mapping.allowedOriginPatterns("*");
        } else {
            mapping.allowedOrigins(allowedOrigins);
        }
    }
}
