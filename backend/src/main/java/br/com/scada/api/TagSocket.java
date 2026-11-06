package br.com.scada.api;

import br.com.scada.simulation.TankSimulator;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class TagSocket extends TextWebSocketHandler {
    private final TankSimulator simulator;
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<String, WebSocketSession> clients = new ConcurrentHashMap<>();

    public TagSocket(TankSimulator simulator, ObjectMapper mapper) {
        this.simulator = simulator;
        this.mapper = mapper;
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession session) {
        var safeSession = new ConcurrentWebSocketSessionDecorator(session, 2000, 65536);
        clients.put(session.getId(), safeSession);
        send(safeSession, mapper.writeValueAsString(simulator.current()));
    }

    @Scheduled(fixedRateString = "${scada.simulation-period-ms:1000}")
    public synchronized void broadcast() {
        String payload = mapper.writeValueAsString(simulator.advance(Instant.now()));
        clients.values().forEach(session -> send(session, payload));
    }

    private void send(WebSocketSession session, String payload) {
        try {
            if (session.isOpen()) session.sendMessage(new TextMessage(payload));
            else clients.remove(session.getId());
        } catch (IOException | RuntimeException exception) {
            clients.remove(session.getId());
            try { session.close(CloseStatus.SERVER_ERROR); } catch (IOException ignored) { }
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        // This stream is outbound only: no tag writes or control commands exist.
        session.close(CloseStatus.POLICY_VIOLATION);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        clients.remove(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws IOException {
        clients.remove(session.getId());
        session.close(CloseStatus.SERVER_ERROR);
    }
}
