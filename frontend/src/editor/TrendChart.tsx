import { useEffect, useRef } from "react";
import { init, use, type ECharts } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Sample } from "./alarmHistory";

use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);
const clockLabel = (at: number) => new Date(at).toLocaleTimeString("pt-BR");

export default function TrendChart({ samples, unit, min, max, limit, dark }: {
  samples: Sample[]; unit: string; min: number; max: number; limit?: number; dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const instance = init(host.current);
    chart.current = instance;
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(host.current);
    return () => { resize.disconnect(); instance.dispose(); chart.current = null; };
  }, []);
  useEffect(() => {
    const ink = dark ? "#c4d6df" : "#445968";
    const line = dark ? "#72dccc" : "#117d73";
    chart.current?.setOption({
      animation: false, useUTC: false, grid: { left: 64, right: 30, top: 38, bottom: 38 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      xAxis: { type: "time", axisLabel: { color: ink, hideOverlap: true, formatter: clockLabel }, splitNumber: 4 },
      yAxis: { type: "value", min, max, name: unit, nameTextStyle: { color: ink }, axisLabel: { color: ink, formatter: (value: number) => value.toLocaleString("pt-BR") },
        splitLine: { lineStyle: { color: dark ? "#324554" : "#dde4e8" } } },
      series: [{ type: "line", name: unit || "Valor", showSymbol: samples.length < 25, symbolSize: 5,
        itemStyle: { color: line }, lineStyle: { color: line, width: 2 }, connectNulls: false,
        data: samples.map(s => [s.at, s.value]),
        markLine: { silent: true, symbol: "none", label: { position: "insideEndTop", formatter: "Limite {c}", color: ink },
          lineStyle: { color: dark ? "#ffa981" : "#af4c20", type: "dashed" },
          data: limit === undefined ? [] : [{ yAxis: limit }] } }],
    });
  }, [samples, dark, unit, min, max, limit]);
  return <div className="trend-chart" ref={host} role="img" aria-label={`Tendência de ${unit || "valor"} ao longo do tempo. ${samples.filter(s => s.value !== null).length} amostras.`} />;
}
