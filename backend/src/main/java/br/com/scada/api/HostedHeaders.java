package br.com.scada.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Browser restrictions for the public simulation, served behind a TLS proxy. */
@Component
@Profile("hosted")
public class HostedHeaders extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
            + "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        chain.doFilter(request, response);
    }
}
