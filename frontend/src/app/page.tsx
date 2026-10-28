
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Wind,
} from "lucide-react";

type WindRecord = {
  startTime: string;
  publishTime?: string;
  generation_actual: number;
  generation_forecast: number;
  error: number;
};

type ApiResponse = {
  data?: WindRecord[];
  count?: number;
  source?: string;
  period?: string;
  detail?: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const numberFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default function Home() {
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [records, setRecords] = useState<WindRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });

      const response = await fetch(
        `${API_URL}/api/forecast?${params.toString()}`
      );

      const result: ApiResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Could not load wind data.");
      }

      const validRecords = (result.data || []).filter(
        (item) =>
          Number.isFinite(Number(item.generation_actual)) &&
          Number.isFinite(Number(item.generation_forecast))
      );

      setRecords(
        validRecords.map((item) => ({
          ...item,
          generation_actual: Number(item.generation_actual),
          generation_forecast: Number(item.generation_forecast),
          error:
            Number(item.generation_forecast) -
            Number(item.generation_actual),
        }))
      );
    } catch (err) {
      setRecords([]);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred."
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    if (!records.length) {
      return { mae: 0, rmse: 0, bias: 0 };
    }

    const errors = records.map((row) => row.error);
    const mae =
      errors.reduce((sum, value) => sum + Math.abs(value), 0) /
      errors.length;
    const rmse = Math.sqrt(
      errors.reduce((sum, value) => sum + value * value, 0) /
        errors.length
    );
    const bias =
      errors.reduce((sum, value) => sum + value, 0) / errors.length;

    return { mae, rmse, bias };
  }, [records]);

  const chartData = useMemo(
    () =>
      records.map((row) => ({
        time: new Date(row.startTime).toLocaleString("en-GB", {
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        }),
        actual: row.generation_actual,
        forecast: row.generation_forecast,
      })),
    [records]
  );

  const averageActual = records.length
    ? records.reduce((sum, row) => sum + row.generation_actual, 0) /
      records.length
    : 0;

  const averageForecast = records.length
    ? records.reduce((sum, row) => sum + row.generation_forecast, 0) /
      records.length
    : 0;

  return (
    <main className="min-h-screen bg-[#FAF9F6] text-[#20332F]">
      <header className="border-b border-[#E5E5DC] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#12544F] p-3 text-white">
              <Wind size={25} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight md:text-2xl">
                WindCast Analytics
              </h1>
              <p className="text-sm text-gray-500">
                UK wind generation · Forecast performance
              </p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-[#C9E2D5] bg-[#F0F8F3] px-3 py-2 text-sm text-[#12544F] sm:flex">
            <span className="h-2 w-2 rounded-full bg-green-600" />
            Elexon BMRS data
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-7 px-5 py-8 md:px-8">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.15em] text-[#C66B13]">
            Energy intelligence
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Wind generation overview
          </h2>
          <p className="mt-2 max-w-2xl text-gray-600">
            Compare forecast and actual wind power generation to understand
            prediction errors and support day-ahead procurement decisions.
          </p>
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-[#E5E5DC] bg-white p-5 shadow-sm md:flex-row md:items-end">
          <div className="flex-1">
            <label
              htmlFor="startDate"
              className="mb-2 block text-sm font-medium"
            >
              Start date
            </label>
            <input
              id="startDate"
              type="date"
              min="2026-01-01"
              max="2026-01-31"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-[#12544F]"
            />
          </div>

          <div className="flex-1">
            <label
              htmlFor="endDate"
              className="mb-2 block text-sm font-medium"
            >
              End date
            </label>
            <input
              id="endDate"
              type="date"
              min={startDate || "2026-01-01"}
              max="2026-01-31"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-[#12544F]"
            />
          </div>

          <button
            onClick={() => void loadData()}
            disabled={loading || startDate > endDate}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#12544F] px-5 py-3 font-semibold text-white transition hover:bg-[#0D403C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading..." : "Refresh data"}
          </button>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            <AlertCircle className="mt-0.5 shrink-0" size={20} />
            <div>
              <p className="font-semibold">Unable to load data</p>
              <p className="mt-1 break-words text-sm">{error}</p>
              <p className="mt-2 text-sm">
                Check that FastAPI is running at {API_URL} and that the
                selected dates are valid.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Matched intervals"
            value={numberFormat.format(records.length)}
            subtitle="Forecast and actual pairs"
            icon={<Activity size={20} />}
          />
          <MetricCard
            title="Mean absolute error"
            value={`${numberFormat.format(metrics.mae)} MW`}
            subtitle="Lower is better"
            icon={<BarChart3 size={20} />}
          />
          <MetricCard
            title="Root mean squared error"
            value={`${numberFormat.format(metrics.rmse)} MW`}
            subtitle="Penalizes larger errors"
            icon={<Wind size={20} />}
          />
          <MetricCard
            title="Forecast bias"
            value={`${metrics.bias > 0 ? "+" : ""}${numberFormat.format(metrics.bias)} MW`}
            subtitle="Positive = overforecast"
            icon={<Activity size={20} />}
          />
        </div>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#E5E5DC] bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Average actual generation</p>
            <p className="mt-2 text-2xl font-bold">
              {numberFormat.format(averageActual)}{" "}
              <span className="text-sm font-medium text-gray-500">MW</span>
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5E5DC] bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Average forecast generation</p>
            <p className="mt-2 text-2xl font-bold">
              {numberFormat.format(averageForecast)}{" "}
              <span className="text-sm font-medium text-gray-500">MW</span>
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E5E5DC] bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <h3 className="text-lg font-bold">Actual vs. forecast</h3>
            <p className="mt-1 text-sm text-gray-500">
              Wind generation over the selected period, in MW (UTC).
            </p>
          </div>

          {loading && records.length === 0 ? (
            <div className="flex h-80 items-center justify-center text-gray-500">
              <RefreshCw className="mr-2 animate-spin" size={20} />
              Loading generation data...
            </div>
          ) : records.length === 0 ? (
            <div className="flex h-80 items-center justify-center text-center text-gray-500">
              No matched records found for this period.
            </div>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 15, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E9E9E2" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    minTickGap={35}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    width={65}
                    tickFormatter={(value: number) =>
                      `${Math.round(value / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => [
                      `${numberFormat.format(Number(value))} MW`,
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual generation"
                    stroke="#12544F"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast generation"
                    stroke="#FF9100"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#E5E5DC] bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-2 border-b border-[#E5E5DC] p-5 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-bold">Generation records</h3>
              <p className="mt-1 text-sm text-gray-500">
                {records.length} matched intervals · Times shown in UTC
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#FDF4D2] px-3 py-1 text-xs font-semibold text-[#79520A]">
              Forecast − actual = error
            </span>
          </div>

          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="sticky top-0 bg-[#F5F5EF] text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-5 py-3">Delivery time (UTC)</th>
                  <th className="px-5 py-3 text-right">Actual (MW)</th>
                  <th className="px-5 py-3 text-right">Forecast (MW)</th>
                  <th className="px-5 py-3 text-right">Error (MW)</th>
                  <th className="px-5 py-3">Published (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEA]">
                {records.map((row, index) => (
                  <tr
                    key={`${row.startTime}-${index}`}
                    className="transition hover:bg-[#FAF9F6]"
                  >
                    <td className="whitespace-nowrap px-5 py-3">
                      {formatDate(row.startTime)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {numberFormat.format(row.generation_actual)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {numberFormat.format(row.generation_forecast)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-semibold tabular-nums ${
                        row.error > 0
                          ? "text-[#B65B10]"
                          : row.error < 0
                            ? "text-[#12544F]"
                            : "text-gray-600"
                      }`}
                    >
                      {row.error > 0 ? "+" : ""}
                      {numberFormat.format(row.error)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {row.publishTime ? formatDate(row.publishTime) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="pb-4 text-center text-xs leading-5 text-gray-500">
          Data source: Elexon BMRS. Metrics are calculated from matched
          forecast and actual records returned by the backend. Confirm the
          forecast publication cutoff and interval alignment before using
          these results for procurement decisions.
        </footer>
      </section>
    </main>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E5DC] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className="rounded-lg bg-[#EAF3EF] p-2 text-[#12544F]">
          {icon}
        </div>
      </div>
      <p className="mt-4 break-words text-2xl font-bold tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
    </div>
  );
}
