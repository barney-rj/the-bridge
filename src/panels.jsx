/**
 * The Bridge — Generalised Panel Renderers
 *
 * Tab panel components for the control room dashboard. Each receives:
 * { data, theme, onSelect, selectedItem, onAction }
 *
 * All panels are data-driven and theme-aware. Import primitives from './components'.
 */

import React, { useState } from "react";
import {
  Pill,
  StatusDot,
  HealthDot,
  ProgressBar,
  ActionIcon,
  HelpCallout,
  HelpIcon,
  EmptyState,
  ConfirmationPanel,
} from "./components";
import { ageLabel, stageForTask } from "./dispatcherClient";

/**
 * EntityGrid — Generalised agent/entity grid with tier filtering and ring visualisation
 * data: { entities: [...], hideRingViz?: boolean }
 */
export const EntityGrid = ({ data, theme: T, onSelect, selectedItem, onAction }) => {
  const [selectedTier, setSelectedTier] = useState("ALL");

  if (!data || !data.entities) return <div style={{ color: T?.textTert }}>No entities</div>;

  const entities = data.entities;
  const tiers = ["T0", "T1", "T2", "T3", "T4"];
  const filteredEntities = selectedTier === "ALL" 
    ? entities 
    : entities.filter(e => e.tier === selectedTier);

  // Ring visualisation: concentric circles
  const rr = { T0: [160, 160], T1: [240, 160], T2: [320, 160], T3: [400, 160], T4: [480, 160] };
  const ringCounts = {};
  entities.forEach(e => { ringCounts[e.tier] = (ringCounts[e.tier] || 0) + 1; });

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", fontFamily: T?.font }}>
      {/* Left panel: tier filter + grid */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${T?.border}` }}>
        {/* Tier filter buttons */}
        <div style={{ padding: 16, borderBottom: `1px solid ${T?.border}` }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelectedTier("ALL")}
              style={{
                padding: "6px 12px",
                background: selectedTier === "ALL" ? T?.tier?.T2 : T?.card,
                border: `1px solid ${selectedTier === "ALL" ? T?.tier?.T2 : T?.border}`,
                borderRadius: 4,
                color: selectedTier === "ALL" ? "#111" : T?.text,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ALL ({entities.length})
            </button>
            {tiers.map(tier => (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                style={{
                  padding: "6px 12px",
                  background: selectedTier === tier ? T?.tier?.[tier] : T?.card,
                  border: `1px solid ${selectedTier === tier ? T?.tier?.[tier] : T?.border}`,
                  borderRadius: 4,
                  color: selectedTier === tier ? "#111" : T?.text,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tier} ({ringCounts[tier] || 0})
              </button>
            ))}
          </div>
        </div>

        {/* Entity grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filteredEntities.map(entity => (
              <div
                key={entity.id}
                onClick={() => onSelect(entity)}
                style={{
                  background: selectedItem?.id === entity.id ? T?.card + "80" : T?.card,
                  border: `1px solid ${selectedItem?.id === entity.id ? T?.tier?.T2 : T?.border}`,
                  borderRadius: 8,
                  padding: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: T?.text }}>{entity.name}</div>
                    <div style={{ fontSize: 9, color: T?.textSec }}>{entity.role}</div>
                  </div>
                  <ActionIcon onClick={(event) => { event.stopPropagation(); onAction?.(entity); }} help={entity.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
                  <HealthDot state={entity.health || "G"} size={8} label={false} theme={T} />
                  <StatusDot status={entity.status || "concept"} theme={T} />
                  <Pill label={entity.tier} color={T?.tier?.[entity.tier]} small theme={T} />
                </div>
                {entity.status && (
                  <div style={{ fontSize: 9, color: T?.textSec }}>
                    {entity.status.charAt(0).toUpperCase() + entity.status.slice(1)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: ring visualisation */}
      {!data.hideRingViz && (
        <div style={{ width: 600, background: T?.panel, borderLeft: `1px solid ${T?.border}`, padding: 16, overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T?.textTert, textTransform: "uppercase", marginBottom: 12 }}>Ring Topology</div>
          <svg width="560" height="300" style={{ background: T?.bg }}>
            {/* Concentric circles */}
            {[100, 180, 260, 340, 420].map((r, i) => (
              <circle key={i} cx="280" cy="150" r={r} fill="none" stroke={T?.border} strokeWidth="1" opacity="0.3" />
            ))}
            {/* Entities positioned by tier */}
            {filteredEntities.map((entity, i) => {
              const tier = entity.tier;
              const [cx, cy] = rr[tier] || [280, 150];
              const color = T?.health?.[entity.health || "G"] || "#555";
              return (
                <g key={entity.id}>
                  <circle cx={cx} cy={cy} r="6" fill={color} />
                  <text x={cx} y={cy + 12} fontSize="8" fill={T?.textSec} textAnchor="middle">
                    {entity.name.slice(0, 5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
};

/**
 * KanbanBoard — Column-based task board (from Build Backlog)
 * data: { columns: [{ id, name }, ...], items: [...] }
 */
export const KanbanBoard = ({ data, theme: T, onSelect, selectedItem, onAction }) => {
  if (!data || !data.columns || !data.items) return <div>No data</div>;

  const { columns, items } = data;

  return (
    <div style={{ display: "flex", gap: 12, padding: 16, overflowX: "auto", flex: 1 }}>
      {columns.map(col => {
        const colItems = items.filter(item => item.stage === col.id || item.column === col.id);
        return (
          <div
            key={col.id}
            style={{
              minWidth: 320,
              background: T?.panel,
              border: `1px solid ${T?.border}`,
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 12, color: T?.text }}>
              {col.name} ({colItems.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {colItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => onSelect(item)}
                  style={{
                    background: T?.card,
                    border: `1px solid ${selectedItem?.id === item.id ? T?.tier?.T2 : T?.border}`,
                    borderRadius: 6,
                    padding: 10,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 11, color: T?.text }}>
                      {item.title || item.name}
                    </div>
                    <ActionIcon onClick={(event) => { event.stopPropagation(); onAction?.(item); }} help={item.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 4 }}>
                    {item.health && <HealthDot state={item.health} size={8} label={false} theme={T} />}
                    {item.priority && <Pill label={item.priority} color={T?.tier?.T1} small theme={T} />}
                  </div>
                  <div style={{ fontSize: 9, color: T?.textSec }}>
                    Owner: {item.owner || "Unassigned"} {item.age && ` | ${item.age} days old`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * CapabilitiesGrid — Grouped capabilities with evidence text
 * data: { capabilities: [{ category, name, evidence }, ...] }
 */
export const CapabilitiesGrid = ({ data, theme: T, onSelect }) => {
  if (!data || !data.capabilities) return <div>No capabilities</div>;

  const grouped = {};
  data.capabilities.forEach(cap => {
    if (!grouped[cap.category]) grouped[cap.category] = [];
    grouped[cap.category].push(cap);
  });

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      {Object.entries(grouped).map(([category, caps]) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T?.tier?.T2, textTransform: "uppercase", marginBottom: 12 }}>
            {category}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {caps.map((cap, i) => (
              <div
                key={i}
                onClick={() => onSelect(cap)}
                style={{
                  background: T?.card,
                  border: `1px solid ${T?.border}`,
                  borderRadius: 8,
                  padding: 12,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: T?.tier?.T2, width: 24, textAlign: "center" }}>
                    {i + 1}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 11, color: T?.text }}>
                    {cap.name}
                  </span>
                </div>
                {cap.evidence && (
                  <div style={{ fontSize: 9, color: T?.textSec, lineHeight: 1.4 }}>
                    {cap.evidence}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * PatternsGrid — Pattern cards with live/partial/archived status
 * data: { patterns: [{ name, status, description }, ...] }
 */
export const PatternsGrid = ({ data, theme: T, onSelect, selectedItem }) => {
  if (!data || !data.patterns) return <div>No patterns</div>;

  const statusColors = {
    live: T?.health?.Gr,
    partial: T?.health?.A,
    archived: T?.health?.Bl,
  };

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {data.patterns.map(pattern => (
          <div
            key={pattern.name}
            onClick={() => onSelect(pattern)}
            style={{
              background: T?.card,
              border: `1px solid ${selectedItem?.name === pattern.name ? T?.tier?.T2 : T?.border}`,
              borderRadius: 8,
              padding: 12,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: T?.text }}>
                {pattern.name}
              </div>
              <StatusDot status={pattern.status} theme={T} />
            </div>
            <Pill
              label={pattern.status}
              color={statusColors[pattern.status] || T?.border}
              small
              theme={T}
            />
            {pattern.description && (
              <div style={{ fontSize: 9, color: T?.textSec, marginTop: 8, lineHeight: 1.4 }}>
                {pattern.description}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * IntegrationsGrid — Connected system cards with type and status
 * data: { integrations: [{ name, type, status }, ...] }
 */
export const IntegrationsGrid = ({ data, theme: T, onSelect, selectedItem }) => {
  if (!data || !data.integrations) return <div>No integrations</div>;

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {data.integrations.map(int => (
          <div
            key={int.name}
            onClick={() => onSelect(int)}
            style={{
              background: T?.card,
              border: `1px solid ${selectedItem?.name === int.name ? T?.tier?.T2 : T?.border}`,
              borderRadius: 8,
              padding: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: T?.text }}>
                {int.name}
              </div>
              <StatusDot status={int.status} pulse={int.status === "active"} theme={T} />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              <Pill label={int.type} color={T?.tier?.T2 + "33"} fg={T?.tier?.T2} small theme={T} />
              <Pill label={int.status} color={T?.status?.[int.status] || T?.border} small theme={T} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * MetricsPanel — Metric cards + activity bars
 * data: { metrics: [{ name, value, unit, trend }, ...], activityBars?: [...] }
 */
export const MetricsPanel = ({ data, theme: T }) => {
  if (!data || !data.metrics) return <div>No metrics</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: 16 }}>
      {data.metrics.map((metric, i) => (
        <div
          key={i}
          style={{
            background: T?.card,
            border: `1px solid ${T?.border}`,
            borderRadius: 8,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 10, color: T?.textSec, marginBottom: 6 }}>
            {metric.name}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T?.tier?.T2, marginBottom: 8 }}>
            {metric.value}
            <span style={{ fontSize: 10, color: T?.textTert }}> {metric.unit}</span>
          </div>
          {metric.trend && (
            <ProgressBar pct={metric.trend} color={T?.tier?.T3} width={100} theme={T} />
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * ObjectiveStack — Numbered prioritised list with progress and health
 * data: { objectives: [{ code, name, progress, health, category }, ...] }
 */
export const ObjectiveStack = ({ data, theme: T, onSelect, selectedItem, onAction }) => {
  if (!data || !data.objectives) return <div>No objectives</div>;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      {data.objectives.map((obj, i) => (
        <div
          key={obj.code}
          onClick={() => onSelect(obj)}
          style={{
            background: T?.card,
            border: `1px solid ${selectedItem?.code === obj.code ? T?.tier?.T2 : T?.border}`,
            borderRadius: 8,
            padding: 12,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: T?.tier?.T2,
                color: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: T?.text, marginBottom: 4 }}>
                {obj.name}
              </div>
              <div style={{ fontSize: 9, color: T?.textTert, marginBottom: 6 }}>
                {obj.code}
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
                <HealthDot state={obj.health || "G"} size={8} label={false} theme={T} />
                {obj.category && <Pill label={obj.category} color={T?.tier?.T1} small theme={T} />}
              </div>
              {obj.progress !== undefined && (
                <ProgressBar pct={obj.progress} color={T?.tier?.T3} width={120} theme={T} />
              )}
            </div>
            <ActionIcon onClick={() => onAction?.(obj)} help={obj.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * LiveTaskBoard — Dispatcher-backed estate-agent assignments
 */
export const LiveTaskBoard = ({ data, theme: T, onSelect, selectedItem, onAction, liveTasks = [], liveTaskStatus, onRefreshTasks }) => {
  const help = data?.help?.liveBoard;
  const columns = [
    { id: "intake", name: "Intake", hint: "Pending coordinator tasks" },
    { id: "prep", name: "Preparation", hint: "Pending child handoffs" },
    { id: "live", name: "Live Work", hint: "Claimed or in progress" },
    { id: "blocked", name: "Blocked", hint: "Needs input or approval" },
    { id: "done", name: "Done", hint: "Resolved or superseded" },
  ];
  const byColumn = Object.fromEntries(columns.map((column) => [column.id, []]));
  liveTasks.forEach((task) => {
    const stage = stageForTask(task);
    byColumn[stage]?.push(task);
  });
  const statusColor =
    liveTaskStatus?.state === "ok"
      ? T?.tier?.T3
      : liveTaskStatus?.state === "error"
        ? T?.tier?.T0
        : T?.tier?.T2;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <HelpCallout title="Live Board" help={help} theme={T} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={() => onAction?.({ id: "new-assignment", name: "New assignment", title: "New assignment", skill: "case" })}
          style={{
            background: T?.tier?.T2,
            border: "none",
            borderRadius: 6,
            color: "#111",
            cursor: "pointer",
            fontFamily: T?.font,
            fontSize: 12,
            fontWeight: 800,
            padding: "9px 12px",
          }}
        >
          + Assign Work
        </button>
        <button
          onClick={onRefreshTasks}
          style={{
            background: T?.card,
            border: `1px solid ${T?.border}`,
            borderRadius: 6,
            color: T?.text,
            cursor: "pointer",
            fontFamily: T?.font,
            fontSize: 11,
            fontWeight: 700,
            padding: "8px 10px",
          }}
        >
          Refresh
        </button>
        <div style={{ color: statusColor, fontSize: 11, fontWeight: 700 }}>
          {liveTaskStatus?.message || "Assignments"}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(190px, 1fr))", gap: 12, flex: 1, minHeight: 0 }}>
        {columns.map((column) => (
          <div
            key={column.id}
            style={{
              background: T?.panel,
              border: `1px solid ${T?.border}`,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={{ padding: 10, borderBottom: `1px solid ${T?.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ color: T?.text, fontSize: 12, fontWeight: 800 }}>{column.name}</div>
                <Pill label={String(byColumn[column.id].length)} color={T?.tier?.T2} fg="#111" small theme={T} />
              </div>
              <div style={{ color: T?.textTert, fontSize: 9, marginTop: 4 }}>{column.hint}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              {byColumn[column.id].map((task) => (
                <div
                  key={task.id}
                  onClick={() => onSelect(task)}
                  style={{
                    background: T?.card,
                    border: `1px solid ${selectedItem?.id === task.id ? T?.tier?.T2 : T?.border}`,
                    borderRadius: 7,
                    cursor: "pointer",
                    padding: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ color: T?.text, fontSize: 11, fontWeight: 800, lineHeight: 1.35 }}>
                      {task.title || task.topic}
                    </div>
                    <ActionIcon onClick={() => onAction?.(task)} help={task.help || "Open this assignment with its current dispatcher context."} theme={T} />
                  </div>
                  <div style={{ color: T?.textTert, fontSize: 9, marginTop: 6, lineHeight: 1.35 }}>
                    {task.to_agent}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    <Pill label={task.status} color={statusColorFor(task.status, T)} small theme={T} />
                    <Pill label={task.priority || "normal"} color={priorityColorFor(task.priority, T)} fg="#111" small theme={T} />
                    {task.created_at && <Pill label={ageLabel(task.created_at)} color={T?.border} small theme={T} />}
                  </div>
                  {task.response && (
                    <div style={{ color: T?.textSec, fontSize: 9, lineHeight: 1.45, marginTop: 8 }}>
                      {task.response.replace(/\s+/g, " ").slice(0, 180)}
                    </div>
                  )}
                </div>
              ))}
              {byColumn[column.id].length === 0 && (
                <EmptyState title="No assignments" description={column.hint} theme={T} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * TenantIdentityPanel — Auth-derived tenant, branch, requester, and dispatcher scope.
 */
export const TenantIdentityPanel = ({ data, theme: T, dispatcher, dispatcherIdentity, dispatcherStatus }) => {
  const tenant = dispatcherIdentity?.tenant || data?.tenant || {};
  const branch = dispatcherIdentity?.branch || data?.branch || {};
  const requester = dispatcherIdentity?.requester || {};
  const scope = dispatcherIdentity?.scope || {};
  const statusColor =
    dispatcherStatus?.state === "ok"
      ? T?.tier?.T3
      : dispatcherStatus?.state === "error"
        ? T?.tier?.T0
        : T?.tier?.T2;

  const cards = [
    { label: "Tenant", value: tenant.name || tenant.id || "Not loaded", sub: tenant.id },
    { label: "Branch", value: branch.name || branch.id || "Not loaded", sub: branch.id },
    { label: "Requester", value: requester.name || requester.email || requester.id || "Not loaded", sub: requester.role },
    { label: "Dispatcher", value: scope.teamId || "Scoped by /me", sub: scope.useCaseId },
  ];

  return (
    <div style={surfaceGridStyle()}>
      <div style={wideSurfaceStyle(T)}>
        <div style={surfaceHeaderStyle(T)}>
          <div>
            <div style={surfaceKickerStyle(T)}>Tenant Context</div>
            <div style={surfaceTitleStyle(T)}>{tenant.name || "Dispatcher identity"}</div>
          </div>
          <Pill label={dispatcherStatus?.state || "unknown"} color={statusColor} fg={dispatcherStatus?.state === "loading" ? "#111" : "#fff"} small theme={T} />
        </div>
        <div style={{ color: T?.textSec, fontSize: 11, lineHeight: 1.5 }}>
          {dispatcherStatus?.message || "Identity is loaded from /bridge-api/me and used to scope task reads and writes."}
        </div>
      </div>

      {cards.map((card) => (
        <div key={card.label} style={surfaceCardStyle(T)}>
          <div style={surfaceKickerStyle(T)}>{card.label}</div>
          <div style={{ color: T?.text, fontSize: 15, fontWeight: 800, marginTop: 6 }}>{card.value}</div>
          {card.sub && <div style={{ color: T?.textTert, fontSize: 10, marginTop: 4 }}>{card.sub}</div>}
        </div>
      ))}

      <div style={wideSurfaceStyle(T)}>
        <div style={surfaceKickerStyle(T)}>Scope</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {scope.teamId && <Pill label={`team ${scope.teamId}`} color={(T?.tier?.T2 || "#4fc3f7") + "33"} fg={T?.tier?.T2 || "#4fc3f7"} small theme={T} />}
          {scope.useCaseId && <Pill label={`use case ${scope.useCaseId}`} color={(T?.tier?.T3 || "#66bb6a") + "33"} fg={T?.tier?.T3 || "#66bb6a"} small theme={T} />}
          {scope.coordinatorBusAddress && <Pill label={scope.coordinatorBusAddress} color={(T?.tier?.T1 || "#f5a623") + "33"} fg={T?.tier?.T1 || "#f5a623"} small theme={T} />}
          {!scope.teamId && !scope.useCaseId && !scope.coordinatorBusAddress && (
            <span style={{ color: T?.textTert, fontSize: 11 }}>No dispatcher scope returned yet.</span>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * ImportReviewPanel — Operational import batches before they become branch work.
 */
export const ImportReviewPanel = ({ data, theme: T, onSelect, selectedItem, onAction, onCreateImport, appStatus }) => {
  const imports = data?.importReviews || [];
  const help = data?.help?.imports || {};
  const [entityType, setEntityType] = useState("contacts");
  const [filename, setFilename] = useState("manual-import.csv");
  const [csvText, setCsvText] = useState("name,email,phone\n");
  const [submitState, setSubmitState] = useState({ state: "idle", message: "" });

  const submitImport = async () => {
    if (!onCreateImport) return;
    setSubmitState({ state: "submitting", message: "Validating import" });
    try {
      const rows = parseCsvRows(csvText);
      await onCreateImport({
        source: "manual_csv",
        entity_type: entityType,
        filename,
        rows,
        idempotency_key: stableImportIdempotencyKey(entityType, filename, csvText),
      });
      setSubmitState({ state: "submitted", message: `${rows.length} row${rows.length === 1 ? "" : "s"} staged` });
    } catch (error) {
      setSubmitState({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.9fr) minmax(320px, 1.1fr)", gap: 12, padding: 16, overflowY: "auto" }}>
      <div style={surfaceCardStyle(T)}>
        <div style={surfaceHeaderStyle(T)}>
          <div>
            <div style={surfaceKickerStyle(T)}>Manual CSV Import</div>
            <div style={surfaceTitleStyle(T)}>Stage branch data</div>
          </div>
          <Pill label={appStatus?.state || "ready"} color={appStatus?.state === "error" ? T?.tier?.T0 : T?.tier?.T2} fg="#111" small theme={T} />
        </div>
        <HelpCallout help={help.panel || "Contacts, properties, instructions, applicants, viewings, offers, sales, lettings, tenancies, tasks, and documents can be staged for review."} theme={T} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={surfaceKickerStyle(T)}>Entity</span>
              <HelpIcon help={help.entityType} label="Entity help" theme={T} />
            </span>
            <select value={entityType} onChange={(event) => setEntityType(event.target.value)} style={fieldStyle(T)}>
              {["contacts", "properties", "instructions", "applicants", "viewings", "offers", "sales", "lettings", "tenancies", "tasks", "documents"].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={surfaceKickerStyle(T)}>Filename</span>
              <HelpIcon help={help.filename} label="Filename help" theme={T} />
            </span>
            <input value={filename} onChange={(event) => setFilename(event.target.value)} style={fieldStyle(T)} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={surfaceKickerStyle(T)}>CSV Rows</span>
            <HelpIcon help={help.csvRows} label="CSV rows help" theme={T} />
          </span>
          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            style={{ ...fieldStyle(T), minHeight: 170, resize: "vertical", lineHeight: 1.45 }}
          />
        </div>
        <button
          onClick={submitImport}
          disabled={!onCreateImport || submitState.state === "submitting"}
          style={{ ...smallActionStyle(T), opacity: !onCreateImport || submitState.state === "submitting" ? 0.6 : 1 }}
        >
          {submitState.state === "submitting" ? "Staging..." : "Stage Import"}
        </button>
        {submitState.message && (
          <div style={{ ...bodyTextStyle(T), color: submitState.state === "error" ? T?.tier?.T0 : T?.tier?.T3 }}>
            {submitState.message}
          </div>
        )}
      </div>

      <div style={listSurfaceStyle({ padding: 0 })}>
        {imports.length === 0 && <EmptyState title="No imports pending review" description={help.empty} theme={T} />}
        {imports.map((batch) => (
        <div
          key={batch.id}
          onClick={() => onSelect?.(batch)}
          style={selectableSurfaceStyle(T, selectedItem?.id === batch.id)}
        >
          <div style={surfaceHeaderStyle(T)}>
            <div>
              <div style={surfaceKickerStyle(T)}>{batch.source}</div>
              <div style={surfaceTitleStyle(T)}>{batch.name}</div>
            </div>
            <Pill label={batch.status} color={statusColorFor(batch.status, T)} small theme={T} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <Pill label={`${batch.records || 0} records`} color={(T?.tier?.T2 || "#4fc3f7") + "33"} fg={T?.tier?.T2 || "#4fc3f7"} small theme={T} />
            <Pill label={`${batch.exceptions || 0} exceptions`} color={batch.exceptions ? T?.tier?.T1 : T?.border} small theme={T} />
            {batch.branch && <Pill label={batch.branch} color={(T?.tier?.T3 || "#66bb6a") + "33"} fg={T?.tier?.T3 || "#66bb6a"} small theme={T} />}
          </div>
          {batch.summary && <div style={bodyTextStyle(T)}>{batch.summary}</div>}
          {batch.nextAction && (
            <button onClick={(event) => { event.stopPropagation(); onAction?.(batch); }} style={smallActionStyle(T)}>
            Review Import
          </button>
        )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * CaseDetailPanel — Lightweight branch case list and selected case detail.
 */
export const CaseDetailPanel = ({ data, theme: T, onSelect }) => {
  const cases = data?.cases || [];
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id || "");
  const selected = cases.find((caseItem) => caseItem.id === selectedCaseId) || cases[0];
  if (!cases.length) return <EmptyState title="No cases configured" theme={T} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 0.85fr) minmax(320px, 1.15fr)", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
        {cases.map((caseItem) => (
          <div
            key={caseItem.id}
            onClick={() => {
              setSelectedCaseId(caseItem.id);
              onSelect?.(caseItem);
            }}
            style={selectableSurfaceStyle(T, selected?.id === caseItem.id)}
          >
            <div style={surfaceKickerStyle(T)}>{caseItem.ref}</div>
            <div style={surfaceTitleStyle(T)}>{caseItem.title}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              <Pill label={caseItem.stage} color={statusColorFor(caseItem.stage, T)} small theme={T} />
              <Pill label={caseItem.priority || "normal"} color={priorityColorFor(caseItem.priority, T)} fg="#111" small theme={T} />
            </div>
          </div>
        ))}
      </div>

      <div style={surfaceCardStyle(T)}>
        <div style={surfaceHeaderStyle(T)}>
          <div>
            <div style={surfaceKickerStyle(T)}>{selected?.ref}</div>
            <div style={surfaceTitleStyle(T)}>{selected?.title}</div>
          </div>
          <Pill label={selected?.owner || "unassigned"} color={(T?.tier?.T2 || "#4fc3f7") + "33"} fg={T?.tier?.T2 || "#4fc3f7"} small theme={T} />
        </div>
        {selected?.summary && <div style={bodyTextStyle(T)}>{selected.summary}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 12 }}>
          <Fact label="Vendor / Client" value={selected?.client} theme={T} />
          <Fact label="Property" value={selected?.property} theme={T} />
          <Fact label="Next Milestone" value={selected?.nextMilestone} theme={T} />
          <Fact label="Due" value={selected?.due} theme={T} />
        </div>
        {selected?.risks?.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={surfaceKickerStyle(T)}>Risks</div>
            {selected.risks.map((risk) => (
              <div key={risk} style={bodyTextStyle(T)}>{risk}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * ApprovalQueuePanel — Human approval gates awaiting decision.
 */
export const ApprovalQueuePanel = ({ data, theme: T, onSelect, selectedItem, onAction, onDecideApproval, dispatcherIdentity }) => {
  const approvals = data?.approvals || [];
  const [pendingDecision, setPendingDecision] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [auditNote, setAuditNote] = useState("");
  const [decisionState, setDecisionState] = useState({ state: "idle", message: "" });
  const help = data?.help?.approvals || {};
  if (!approvals.length) return <EmptyState title="No approvals queued" description={help.empty} theme={T} />;

  const decide = async (approval, decision, note) => {
    if (!onDecideApproval) return;
    setPendingDecision(`${approval.id}:${decision}`);
    setDecisionState({ state: "submitting", message: `Submitting ${decision}` });
    try {
      await onDecideApproval(approval.id, decision, note || `${decision} from cockpit approval queue`);
      setDecisionState({ state: "submitted", message: `Approval ${decision}` });
      setConfirmation(null);
      setAuditNote("");
    } catch (error) {
      setDecisionState({ state: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setPendingDecision("");
    }
  };

  return (
    <div style={listSurfaceStyle()}>
      <div style={wideSurfaceStyle(T)}>
        <HelpCallout title="Approval Gates" help={help.panel || "Approve or reject only after checking the gate, case, consequence, requester, scope, and audit note."} theme={T} />
      </div>
      {decisionState.message && (
        <div style={wideSurfaceStyle(T)}>
          <div style={{ color: decisionState.state === "error" ? T?.tier?.T0 : T?.tier?.T3, fontSize: 11, fontWeight: 800 }}>
            {decisionState.message}
          </div>
        </div>
      )}
      {approvals.map((approval) => (
        <div
          key={approval.id}
          onClick={() => onSelect?.(approval)}
          style={selectableSurfaceStyle(T, selectedItem?.id === approval.id)}
        >
          <div style={surfaceHeaderStyle(T)}>
            <div>
              <div style={surfaceKickerStyle(T)}>{approval.gate}</div>
              <div style={surfaceTitleStyle(T)}>{approval.title}</div>
            </div>
            <Pill label={approval.status} color={statusColorFor(approval.status, T)} small theme={T} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <Pill label={approval.caseRef} color={(T?.tier?.T2 || "#4fc3f7") + "33"} fg={T?.tier?.T2 || "#4fc3f7"} small theme={T} />
            <Pill label={approval.approver || "unassigned"} color={(T?.tier?.T3 || "#66bb6a") + "33"} fg={T?.tier?.T3 || "#66bb6a"} small theme={T} />
            {approval.due && <Pill label={approval.due} color={T?.border} small theme={T} />}
          </div>
          {approval.reason && <div style={bodyTextStyle(T)}>{approval.reason}</div>}
          {confirmation?.approval?.id === approval.id && (
            <ConfirmationPanel
              title={`${confirmation.decision === "approved" ? "Approve" : "Reject"} gate`}
              actionLabel={confirmation.decision === "approved" ? "Confirm approval" : "Confirm rejection"}
              confirmTone={confirmation.decision === "rejected" ? "danger" : "normal"}
              auditNote={auditNote}
              onAuditNoteChange={setAuditNote}
              onCancel={() => {
                setConfirmation(null);
                setAuditNote("");
              }}
              onConfirm={() => decide(approval, confirmation.decision, auditNote)}
              disabled={!auditNote.trim() || Boolean(pendingDecision)}
              details={[
                { label: "Gate", value: approval.gate },
                { label: "Case", value: approval.caseRef },
                { label: "Consequence", value: approval.consequence || approval.reason },
                { label: "Requester", value: approval.requester || dispatcherIdentity?.requester?.name || dispatcherIdentity?.requester?.email },
                { label: "Scope", value: approval.scope || dispatcherIdentity?.scope?.useCaseId || dispatcherIdentity?.scope?.teamId },
              ]}
              theme={T}
            />
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={(event) => { event.stopPropagation(); onAction?.(approval); }} style={smallActionStyle(T)}>
              Open Gate
            </button>
            {approval.status !== "approved" && approval.status !== "rejected" && (
              <>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmation({ approval, decision: "approved" });
                    setAuditNote(`Approved ${approval.gate} for ${approval.caseRef}: `);
                  }}
                  disabled={!onDecideApproval || Boolean(pendingDecision)}
                  style={{ ...smallActionStyle(T), color: T?.tier?.T3 || "#66bb6a", borderColor: (T?.tier?.T3 || "#66bb6a") + "55" }}
                >
                  {pendingDecision === `${approval.id}:approved` ? "Approving..." : "Approve"}
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmation({ approval, decision: "rejected" });
                    setAuditNote(`Rejected ${approval.gate} for ${approval.caseRef}: `);
                  }}
                  disabled={!onDecideApproval || Boolean(pendingDecision)}
                  style={{ ...smallActionStyle(T), color: T?.tier?.T0 || "#e94560", borderColor: (T?.tier?.T0 || "#e94560") + "55" }}
                >
                  {pendingDecision === `${approval.id}:rejected` ? "Rejecting..." : "Reject"}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * AuditTrailPanel — Recent dispatcher and branch operations events.
 */
export const AuditTrailPanel = ({ data, theme: T, onSelect, selectedItem }) => {
  const events = data?.auditEvents || [];
  if (!events.length) return <EmptyState title="No audit events" theme={T} />;

  return (
    <div style={listSurfaceStyle()}>
      {events.map((event) => (
        <div
          key={event.id}
          onClick={() => onSelect?.(event)}
          style={selectableSurfaceStyle(T, selectedItem?.id === event.id)}
        >
          <div style={surfaceHeaderStyle(T)}>
            <div>
              <div style={surfaceKickerStyle(T)}>{event.at}</div>
              <div style={surfaceTitleStyle(T)}>{event.action}</div>
            </div>
            <Pill label={event.status || "logged"} color={statusColorFor(event.status, T)} small theme={T} />
          </div>
          <div style={{ color: T?.textSec, fontSize: 10, marginTop: 8 }}>
            {event.actor} {"->"} {event.target}
          </div>
          {event.summary && <div style={bodyTextStyle(T)}>{event.summary}</div>}
        </div>
      ))}
    </div>
  );
};

/**
 * AdminIntegrationSettingsPanel — Read-only tenant integration posture.
 */
export const AdminIntegrationSettingsPanel = ({ data, theme: T, onSelect, selectedItem }) => {
  const settings = data?.adminIntegrations || data?.integrations || [];
  if (!settings.length) return <EmptyState title="No admin integrations configured" theme={T} />;

  return (
    <div style={listSurfaceStyle()}>
      {settings.map((setting) => (
        <div
          key={setting.id || setting.name}
          onClick={() => onSelect?.(setting)}
          style={selectableSurfaceStyle(T, selectedItem?.id === setting.id || selectedItem?.name === setting.name)}
        >
          <div style={surfaceHeaderStyle(T)}>
            <div>
              <div style={surfaceKickerStyle(T)}>{setting.type}</div>
              <div style={surfaceTitleStyle(T)}>{setting.name}</div>
            </div>
            <Pill label={setting.status} color={statusColorFor(setting.status, T)} small theme={T} />
          </div>
          {setting.description && <div style={bodyTextStyle(T)}>{setting.description}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 12 }}>
            {Object.entries(setting.settings || setting.metrics || {}).map(([key, value]) => (
              <Fact key={key} label={key} value={maskSettingValue(key, value)} theme={T} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * TaskBoard — Filterable task cards with expandable detail
 * data: { tasks: [{ id, title, kso, status, gragbb, desc }, ...], filters: { ksos: [...], types: [...] } }
 */
export const TaskBoard = ({ data, theme: T, onSelect, selectedItem, onAction }) => {
  const [filterKso, setFilterKso] = useState("all");
  const [filterType, setFilterType] = useState("all");

  if (!data || !data.tasks) return <div>No tasks</div>;

  const { tasks, filters = { ksos: [], types: [] } } = data;
  const filtered = tasks.filter(
    t => (filterKso === "all" || t.kso === filterKso) && (filterType === "all" || t.type === filterType)
  );
  const urgentCount = filtered.filter(t => t.gragbb === "R" || t.gragbb === "A").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Filters */}
      <div style={{ padding: 12, borderBottom: `1px solid ${T?.border}`, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <select
          value={filterKso}
          onChange={(e) => setFilterKso(e.target.value)}
          style={{
            background: T?.card,
            border: `1px solid ${T?.border}`,
            color: T?.text,
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 10,
          }}
        >
          <option value="all">All KSOs</option>
          {filters.ksos?.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            background: T?.card,
            border: `1px solid ${T?.border}`,
            color: T?.text,
            borderRadius: 4,
            padding: "6px 8px",
            fontSize: 10,
          }}
        >
          <option value="all">All Types</option>
          {filters.types?.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ flex: 1, textAlign: "right", fontSize: 9, color: T?.textSec }}>
          {filtered.length} | {urgentCount} urgent
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(task => (
          <div
            key={task.id}
            onClick={() => onSelect(task)}
            style={{
              background: T?.card,
              border: `1px solid ${selectedItem?.id === task.id ? T?.tier?.T2 : T?.border}`,
              borderRadius: 6,
              padding: 10,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: T?.text }}>
                {task.title}
              </div>
              <ActionIcon onClick={(event) => { event.stopPropagation(); onAction?.(task); }} help={task.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {task.gragbb && <HealthDot state={task.gragbb} size={8} label={false} theme={T} />}
              {task.kso && <Pill label={task.kso} color={T?.tier?.T1} small theme={T} />}
              {task.status && <Pill label={task.status} color={T?.status?.[task.status] || T?.border} small theme={T} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * OutcomeGrid — Outcome tiles with health and category labels
 * data: { outcomes: [{ code, name, health, category }, ...] }
 */
export const OutcomeGrid = ({ data, theme: T, onSelect, selectedItem }) => {
  if (!data || !data.outcomes) return <div>No outcomes</div>;

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {data.outcomes.map(outcome => (
          <div
            key={outcome.code}
            onClick={() => onSelect(outcome)}
            style={{
              background: T?.card,
              border: `1px solid ${selectedItem?.code === outcome.code ? T?.tier?.T2 : T?.border}`,
              borderRadius: 8,
              padding: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 12, color: T?.text, marginBottom: 6 }}>
              {outcome.name}
            </div>
            <div style={{ fontSize: 9, color: T?.textTert, marginBottom: 8 }}>
              {outcome.code}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <HealthDot state={outcome.health} size={10} label={true} theme={T} />
              {outcome.category && <Pill label={outcome.category} color={T?.tier?.T1} small theme={T} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * QuadrantBalance — Quadrant cards showing worst-case health rollup
 * data: { quadrants: [{ name, klos: [code, ...] }, ...], klos: [{ code, health }, ...] }
 */
export const QuadrantBalance = ({ data, theme: T, onSelect, selectedItem }) => {
  if (!data || !data.quadrants) return <div>No quadrants</div>;

  const { quadrants, klos = [] } = data;
  const kloMap = Object.fromEntries(klos.map(k => [k.code, k.health]));

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, overflowY: "auto" }}>
      {quadrants.map(quad => {
        const quadKlos = quad.klos || [];
        const worstCase = quadKlos.some(k => kloMap[k] === "R")
          ? "R"
          : quadKlos.some(k => kloMap[k] === "A")
          ? "A"
          : quadKlos.some(k => kloMap[k] === "Gr")
          ? "Gr"
          : "G";

        return (
          <div
            key={quad.name}
            onClick={() => onSelect(quad)}
            style={{
              background: T?.card,
              border: `1px solid ${selectedItem?.name === quad.name ? T?.tier?.T2 : T?.border}`,
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: T?.text, marginBottom: 10 }}>
              {quad.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <HealthDot state={worstCase} size={12} label={true} theme={T} />
              <span style={{ fontSize: 10, color: T?.textSec }}>Worst Case</span>
            </div>
            <div style={{ fontSize: 9, color: T?.textTert }}>
              {quadKlos.length} outcomes tracked
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * DriftDetection — Filters and shows Red/Amber health items
 * data: { entities: [...], objectives: [...] }
 */
export const DriftDetection = ({ data, theme: T, onSelect, selectedItem, onAction }) => {
  if (!data) return <div>No data</div>;

  const redItems = [];
  const amberItems = [];

  if (data.entities) {
    data.entities.forEach(e => {
      if (e.health === "R") redItems.push({ type: "entity", ...e });
      else if (e.health === "A") amberItems.push({ type: "entity", ...e });
    });
  }

  if (data.objectives) {
    data.objectives.forEach(o => {
      if (o.health === "R") redItems.push({ type: "objective", ...o });
      else if (o.health === "A") amberItems.push({ type: "objective", ...o });
    });
  }

  return (
    <div style={{ padding: 16, overflowY: "auto" }}>
      {/* Red Items */}
      {redItems.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T?.health?.R,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Critical ({redItems.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {redItems.map(item => (
              <div
                key={item.id || item.code}
                onClick={() => onSelect(item)}
                style={{
                  background: (T?.health?.R || "#e94560") + "15",
                  border: `1px solid ${(T?.health?.R || "#e94560") + "44"}`,
                  borderRadius: 6,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 11, color: T?.text }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 9, color: T?.textSec }}>
                      {item.type} {item.kso && `| ${item.kso}`}
                    </div>
                  </div>
                  <ActionIcon onClick={(event) => { event.stopPropagation(); onAction?.(item); }} help={item.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Amber Items */}
      {amberItems.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: T?.health?.A,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            At Risk ({amberItems.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {amberItems.map(item => (
              <div
                key={item.id || item.code}
                onClick={() => onSelect(item)}
                style={{
                  background: (T?.health?.A || "#f5a623") + "15",
                  border: `1px solid ${(T?.health?.A || "#f5a623") + "44"}`,
                  borderRadius: 6,
                  padding: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 11, color: T?.text }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 9, color: T?.textSec }}>
                      {item.type} {item.kso && `| ${item.kso}`}
                    </div>
                  </div>
                  <ActionIcon onClick={(event) => { event.stopPropagation(); onAction?.(item); }} help={item.help || data?.help?.actionIcons || "Open an action session for this item."} theme={T} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {redItems.length === 0 && amberItems.length === 0 && (
        <div style={{ textAlign: "center", color: T?.textSec, fontSize: 11 }}>
          All systems healthy
        </div>
      )}
    </div>
  );
};

function EmptyPanel({ label, theme: T }) {
  return (
    <div style={{ color: T?.textTert, fontSize: 12, padding: 20 }}>
      {label}
    </div>
  );
}

function Fact({ label, value, theme: T }) {
  return (
    <div style={{ background: T?.panel, border: `1px solid ${T?.border}`, borderRadius: 6, padding: 9 }}>
      <div style={surfaceKickerStyle(T)}>{label}</div>
      <div style={{ color: T?.text, fontSize: 11, fontWeight: 700, marginTop: 4 }}>{value || "Not set"}</div>
    </div>
  );
}

function surfaceGridStyle() {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    padding: 16,
    overflowY: "auto",
  };
}

function listSurfaceStyle(overrides = {}) {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    alignContent: "start",
    gap: 12,
    padding: 16,
    overflowY: "auto",
    ...overrides,
  };
}

function surfaceCardStyle(T) {
  return {
    background: T?.card,
    border: `1px solid ${T?.border}`,
    borderRadius: 8,
    padding: 12,
  };
}

function wideSurfaceStyle(T) {
  return {
    ...surfaceCardStyle(T),
    gridColumn: "1 / -1",
  };
}

function selectableSurfaceStyle(T, selected) {
  return {
    ...surfaceCardStyle(T),
    border: `1px solid ${selected ? T?.tier?.T2 : T?.border}`,
    cursor: "pointer",
  };
}

function surfaceHeaderStyle(T) {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  };
}

function surfaceKickerStyle(T) {
  return {
    color: T?.textTert,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  };
}

function surfaceTitleStyle(T) {
  return {
    color: T?.text,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.35,
    marginTop: 4,
  };
}

function bodyTextStyle(T) {
  return {
    color: T?.textSec,
    fontSize: 10,
    lineHeight: 1.5,
    marginTop: 10,
  };
}

function smallActionStyle(T) {
  return {
    background: (T?.tier?.T2 || "#4fc3f7") + "22",
    border: `1px solid ${(T?.tier?.T2 || "#4fc3f7") + "55"}`,
    borderRadius: 6,
    color: T?.tier?.T2 || "#4fc3f7",
    cursor: "pointer",
    fontFamily: T?.font,
    fontSize: 10,
    fontWeight: 800,
    marginTop: 12,
    padding: "7px 9px",
  };
}

function fieldStyle(T) {
  return {
    background: T?.panel || "#12121a",
    border: `1px solid ${T?.border || "#2a2a35"}`,
    borderRadius: 6,
    color: T?.text || "#fff",
    fontFamily: T?.font || "sans-serif",
    fontSize: 11,
    padding: "8px 9px",
    width: "100%",
    boxSizing: "border-box",
  };
}

function parseCsvRows(text) {
  const rows = splitCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) throw new Error("CSV must include a header row and at least one data row");
  const headers = rows[0].map((cell) => cell.trim()).filter(Boolean);
  if (!headers.length) throw new Error("CSV header row is empty");
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicate) throw new Error(`CSV header is duplicated: ${duplicate}`);
  return rows.slice(1).map((row, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() || "";
    });
    if (Object.values(record).every((value) => value === "")) throw new Error(`CSV row ${rowIndex + 2} is empty`);
    return record;
  });
}

function stableImportIdempotencyKey(entityType, filename, csvText) {
  const normalized = csvText.replace(/\r\n/g, "\n").trim();
  return `manual_csv:${entityType}:${filename.trim() || "manual-import.csv"}:${hashString(normalized)}`;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function splitCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV has an unterminated quoted value");
  row.push(cell);
  rows.push(row);
  return rows;
}

function maskSettingValue(key, value) {
  if (value === undefined || value === null || value === "") return "Not set";
  if (/token|secret|password|key/i.test(key)) return value ? "Set" : "Not set";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function statusColorFor(status, T) {
  if (status === "resolved" || status === "superseded") return T?.tier?.T3 || "#66bb6a";
  if (status === "approved" || status === "loaded" || status === "complete") return T?.tier?.T3 || "#66bb6a";
  if (status === "blocked") return T?.tier?.T0 || "#e94560";
  if (status === "in_progress" || status === "acknowledged") return T?.tier?.T2 || "#4fc3f7";
  if (status === "pending" || status === "review" || status === "queued") return T?.tier?.T1 || "#f5a623";
  return T?.tier?.T1 || "#f5a623";
}

function priorityColorFor(priority, T) {
  if (priority === "critical") return T?.tier?.T0 || "#e94560";
  if (priority === "high") return T?.tier?.T1 || "#f5a623";
  if (priority === "low") return T?.textTert || "#666";
  return T?.tier?.T2 || "#4fc3f7";
}
