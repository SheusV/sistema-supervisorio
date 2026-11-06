package br.com.scada.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebConfiguration implements WebSocketConfigurer {
    private final TagSocket socket;
    private final String[] origins;

    public WebConfiguration(TagSocket socket, @Value("${scada.allowed-origins}") String[] origins) {
        this.socket = socket;
        this.origins = origins;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(socket, "/ws/tags").setAllowedOrigins(origins);
    }
}
