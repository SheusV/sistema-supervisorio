export function Process({
  level,
  running,
  temperature,
}: {
  level: number | null;
  running: boolean | null;
  temperature: number | null;
}) {
  return (
    <svg
      className="process"
      viewBox="0 0 900 420"
      role="img"
      aria-label={`Tanque TQ-001: ${level === null ? "nível indisponível" : `nível ${level.toFixed(1)} por cento`}`}
    >
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#dfe7ed" />
        </pattern>
        <clipPath id="tank">
          <rect x="350" y="79" width="220" height="250" rx="24" />
        </clipPath>
        <linearGradient id="water" x2="0" y2="1">
          <stop stopColor="#5dcfc1" />
          <stop offset="1" stopColor="#159c94" />
        </linearGradient>
      </defs>
      <rect width="900" height="420" fill="url(#grid)" />
      <text x="65" y="100" className="diagram-label">
        ALIMENTAÇÃO
      </text>
      <path d="M65 215 H350 M570 275 H760 V335 H820" className="pipe" />
      {running === true && <path d="M65 215 H350" className="flow" />}
      <path d="M375 330 V358 M545 330 V358" stroke="#8193a4" strokeWidth="9" />
      <rect
        x="350"
        y="79"
        width="220"
        height="250"
        rx="24"
        fill="#f3f7fa"
        stroke="#8497a8"
        strokeWidth="3"
      />
      <g clipPath="url(#tank)">
        <rect
          data-testid="tank-water"
          x="351"
          y={329 - (level ?? 0) * 2.5}
          width="218"
          height={(level ?? 0) * 2.5}
          fill="url(#water)"
          style={{ transition: "y 850ms ease, height 850ms ease" }}
        />
      </g>
      {[0, 25, 50, 75, 100].map((n) => (
        <g key={n}>
          <line
            x1="585"
            x2="595"
            y1={329 - n * 2.5}
            y2={329 - n * 2.5}
            stroke="#91a0af"
          />
          <text x="603" y={334 - n * 2.5} className="scale">
            {n}%
          </text>
        </g>
      ))}
      <text x="460" y="49" textAnchor="middle" className="equipment-title">
        TQ-001
      </text>
      <text x="460" y="198" textAnchor="middle" className="tank-value">
        {level === null ? "—" : `${level.toFixed(1)}%`}
      </text>
      <text x="460" y="222" textAnchor="middle" className="tank-caption">
        {level === null ? "INDISPONÍVEL" : "NÍVEL SIMULADO"}
      </text>
      <text x="460" y="390" textAnchor="middle" className="diagram-label">
        TANQUE DE PROCESSO
      </text>
      <circle
        cx="195"
        cy="215"
        r="36"
        fill={running === true ? "#e0f5ef" : "#eef1f4"}
        stroke={running === true ? "#139a80" : "#8193a4"}
        strokeWidth="3"
      />
      <g className={running === true ? "rotor spinning" : "rotor"}>
        <path
          d="M195 190 L208 217 L183 226 Z"
          fill={running === true ? "#139a80" : "#8193a4"}
        />
      </g>
      <text x="195" y="280" textAnchor="middle" className="equipment-title">
        P-001
      </text>
      <text x="195" y="303" textAnchor="middle" className="diagram-label">
        {running === null ? "INDISPONÍVEL" : running ? "EM OPERAÇÃO" : "PARADA"}
      </text>
      <rect
        className="temperature-panel"
        x="702"
        y="106"
        width="150"
        height="85"
        rx="10"
        fill="white"
        stroke="#dce4eb"
      />
      <text x="720" y="132" className="diagram-label">
        TT-001 · TEMP.
      </text>
      <text x="720" y="166" className="temperature">
        {temperature === null ? "—" : `${temperature.toFixed(1)} °C`}
      </text>
      <path
        d="M702 150 H660 V175 H570"
        stroke="#9bafbd"
        strokeDasharray="4 5"
        fill="none"
      />
      <text x="742" y="372" className="diagram-label">
        SAÍDA
      </text>
    </svg>
  );
}
