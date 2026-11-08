package br.com.scada.simulation;

import java.util.*;

/** Stateless project simulation: no shared state, devices, addresses or executable expressions. */
public final class ProjectSimulation {
    private ProjectSimulation() {}
    public record Variable(String name, String dataType, String unit, Object initial, Double min, Double max) {}
    public record TankRule(String levelTag, String enableTag, Double fillRate, Double drainRate, String permitTag) {}
    public record Request(List<Variable> variables, Map<String, Object> values, TankRule rule, Double seconds) {}
    public record Result(String source, Map<String, Object> values) {}

    public static Result evaluate(Request request) {
        if (request == null || request.variables() == null || request.values() == null || request.variables().size() > 32
                || request.values().size() > 32) throw invalid();
        Map<String, Object> result = new LinkedHashMap<>();
        for (Variable variable : request.variables()) {
            if (variable == null || variable.name() == null || !variable.name().matches("[A-Z][A-Z0-9_.]{0,63}")
                    || Set.of("TQ001.LEVEL", "P001.RUNNING", "TQ001.TEMPERATURE").contains(variable.name())
                    || result.containsKey(variable.name()) || variable.unit() == null || variable.unit().length() > 16
                    || variable.unit().chars().anyMatch(c -> c < 32) || variable.min() == null || variable.max() == null || !Double.isFinite(variable.min()) || !Double.isFinite(variable.max())
                    || variable.min() < -1_000_000 || variable.max() > 1_000_000 || variable.min() >= variable.max()) throw invalid();
            validateValue(variable, variable.initial());
            Object value = request.values().containsKey(variable.name()) ? request.values().get(variable.name()) : variable.initial();
            validateValue(variable, value);
            result.put(variable.name(), value);
        }
        if (!result.keySet().containsAll(request.values().keySet())) throw invalid();
        double seconds = request.seconds() == null ? 0 : request.seconds();
        if (!Double.isFinite(seconds) || seconds < 0 || seconds > 1) throw invalid();
        if (request.rule() != null) {
            TankRule rule = request.rule();
            Variable level = request.variables().stream().filter(v -> v.name().equals(rule.levelTag()) && "DOUBLE".equals(v.dataType())).findFirst().orElseThrow(ProjectSimulation::invalid);
            if (!(result.get(rule.enableTag()) instanceof Boolean enabled)
                    || rule.fillRate() == null || rule.drainRate() == null
                    || !Double.isFinite(rule.fillRate()) || !Double.isFinite(rule.drainRate())
                    || rule.fillRate() < 0 || rule.fillRate() > 1000 || rule.drainRate() < 0 || rule.drainRate() > 1000) throw invalid();
            double previous = ((Number) result.get(level.name())).doubleValue();
            boolean permitted = true;
            if (rule.permitTag() != null) {
                if (!(result.get(rule.permitTag()) instanceof Boolean state)) throw invalid();
                permitted = state;
            }
            double rate = (enabled && permitted ? rule.fillRate() : 0) - rule.drainRate();
            double next = Math.clamp(previous + rate * seconds, level.min(), level.max());
            result.put(level.name(), next);
        } else if (seconds != 0) throw invalid();
        return new Result("SIMULATED", result);
    }
    private static void validateValue(Variable variable, Object value) {
        if ("BOOLEAN".equals(variable.dataType())) {
            if (!(value instanceof Boolean)) throw invalid();
        } else if ("DOUBLE".equals(variable.dataType())) {
            if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())
                    || number.doubleValue() < variable.min() || number.doubleValue() > variable.max()) throw invalid();
        } else throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Tags, tipos ou valores fora dos limites da simulação."); }
}
