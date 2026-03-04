import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Scatter, ScatterChart, ComposedChart,
} from 'recharts';
import { ImputationModelResult, Well, Measurement } from '../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ModelTimeSeriesProps {
  model: ImputationModelResult;
  well: Well;
  measurements: Measurement[];
  showCombined: boolean;
  onToggleCombined: () => void;
  lengthUnit: 'ft' | 'm';
}

const ModelTimeSeries: React.FC<ModelTimeSeriesProps> = ({
  model, well, measurements, showCombined, onToggleCombined, lengthUnit,
}) => {
  const [logExpanded, setLogExpanded] = useState(false);

  const wellMetrics = model.wellMetrics[well.id];

  // Get original WTE measurements for this well
  const wteMeas = useMemo(() =>
    measurements.filter(m => m.wellId === well.id && m.dataType === 'wte')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  [measurements, well.id]);

  // Get model data rows for this well
  const modelRows = useMemo(() =>
    model.data.filter(r => r.well_id === well.id).sort((a, b) => a.date.localeCompare(b.date)),
  [model.data, well.id]);

  // Build chart data
  const chartData = useMemo(() => {
    if (showCombined) {
      // Combined view: red for PCHIP, blue for ELM
      return modelRows.map(row => ({
        date: new Date(row.date).getTime(),
        pchip: row.pchip,
        elm: row.pchip !== null ? null : row.model,
      }));
    } else {
      // Uncombined view: green dots for measurements, red/blue lines
      const dataMap = new Map<number, any>();

      // Add model rows (monthly grid: 1st of each month)
      const modelTimestamps: number[] = [];
      for (const row of modelRows) {
        const ts = new Date(row.date).getTime();
        modelTimestamps.push(ts);
        dataMap.set(ts, {
          date: ts,
          model: row.model,
          pchip: row.pchip,
        });
      }

      // Snap measurement dots to nearest monthly grid date so they don't
      // break the PCHIP/ELM lines (measurements between grid dates would
      // create entries with undefined pchip, severing connectNulls={false} lines).
      // Measurements outside the model range keep their real dates so the
      // chart x-axis expands to show them.
      const modelMin = modelTimestamps.length > 0 ? modelTimestamps[0] : Infinity;
      const modelMax = modelTimestamps.length > 0 ? modelTimestamps[modelTimestamps.length - 1] : -Infinity;
      for (const m of wteMeas) {
        const ts = new Date(m.date).getTime();
        let snapTs = ts;
        if (ts >= modelMin && ts <= modelMax) {
          // Inside model range: snap to nearest grid date
          let bestDist = Infinity;
          for (const mt of modelTimestamps) {
            const dist = Math.abs(mt - ts);
            if (dist < bestDist) { bestDist = dist; snapTs = mt; }
          }
        }
        const existing = dataMap.get(snapTs) || { date: snapTs };
        existing.measurement = m.value;
        dataMap.set(snapTs, existing);
      }

      return Array.from(dataMap.values()).sort((a, b) => a.date - b.date);
    }
  }, [modelRows, wteMeas, showCombined]);

  // Compute tight Y domain from all values
  const yDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const d of chartData) {
      for (const key of ['pchip', 'elm', 'model', 'measurement'] as const) {
        const v = d[key];
        if (v != null && isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!isFinite(min)) return [0, 1];
    const pad = (max - min) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [chartData]);

  const formatDate = (ts: number) => new Date(ts).getFullYear().toString();

  // Generate ticks at Jan 1 of each year
  const yearTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    const minTs = chartData[0].date;
    const maxTs = chartData[chartData.length - 1].date;
    const startYear = new Date(minTs).getFullYear();
    const endYear = new Date(maxTs).getFullYear();
    const ticks: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      ticks.push(new Date(y, 0, 1).getTime());
    }
    return ticks;
  }, [chartData]);

  if (modelRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        No model data for this well
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with toggle and metrics */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-amber-800">Model: {model.title}</span>
          <button
            onClick={onToggleCombined}
            className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${
              showCombined
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            {showCombined ? 'Combined' : 'Separated'}
          </button>
        </div>
        {wellMetrics && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
              R² = {wellMetrics.r2.toFixed(3)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
              RMSE = {wellMetrics.rmse.toFixed(2)} {lengthUnit}
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={yearTicks}
              tickFormatter={formatDate}
              stroke="#94a3b8"
              fontSize={10}
            />
            <YAxis stroke="#94a3b8" fontSize={10} domain={yDomain} tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
            <Tooltip
              labelFormatter={(ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }}
              formatter={(value: number, name: string) => [
                value?.toFixed(2) ?? 'N/A',
                name === 'measurement' ? 'Measured' : name === 'pchip' ? 'PCHIP' : name === 'elm' ? 'ELM' : name === 'model' ? 'ELM' : name
              ]}
            />

            {showCombined ? (
              <>
                <Line
                  type="monotone"
                  dataKey="pchip"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  name="PCHIP"
                  animationDuration={400}
                />
                <Line
                  type="monotone"
                  dataKey="elm"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  name="ELM"
                  animationDuration={400}
                />
              </>
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey="pchip"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  name="PCHIP"
                  animationDuration={400}
                />
                <Line
                  type="monotone"
                  dataKey="model"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  name="ELM"
                  animationDuration={400}
                />
                <Line
                  type="monotone"
                  dataKey="measurement"
                  stroke="none"
                  dot={{ fill: '#22c55e', r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                  name="Measured"
                  isAnimationActive={false}
                />
              </>
            )}

            {!showCombined && <Legend />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Collapsible log */}
      {model.log && model.log.length > 0 && (
        <div className="border-t border-slate-200">
          <button
            onClick={() => setLogExpanded(!logExpanded)}
            className="w-full flex items-center gap-1 px-3 py-1 text-[10px] text-slate-500 hover:bg-slate-50"
          >
            {logExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Processing Log ({model.log.length} entries)
          </button>
          {logExpanded && (
            <div className="max-h-[120px] overflow-y-auto px-3 py-1 bg-slate-900 font-mono text-[10px] text-slate-300 space-y-0.5">
              {model.log.map((msg, i) => (
                <div key={i} className={msg.startsWith('ERROR') ? 'text-red-400' : msg.includes('R²') ? 'text-emerald-400' : ''}>
                  {msg}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelTimeSeries;
