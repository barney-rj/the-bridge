/**
 * The Bridge — Reusable Primitive Components
 *
 * Generic, theme-driven React components for building control room dashboards.
 * All components receive `theme` (or abbreviated `T`) as a prop.
 *
 * Export as named exports. Theme structure:
 * {
 *   bg, card, panel, statsBar, border,
 *   text, textSec, textTert, textMuted,
 *   tier: { T0, T1, T2, T3, T4 },
 *   status: { active, staged, planned, concept, gap },
 *   health: { G, R, A, Gr, B, Bl },
 *   font
 * }
 */

import React, { useId, useState, useEffect } from "react";

/**
 * Pill — Inline badge/tag component
 * @param {string} label — Display text
 * @param {string} color — Background color (hex or named)
 * @param {string} fg — Foreground text color (default: #fff)
 * @param {boolean} small — Compact size (default: false)
 * @param {object} theme — Theme object with color tokens
 */
export const Pill = ({ label, color, fg = "#fff", small, theme: T }) => (
  <span
    style={{
      display: "inline-block",
      padding: small ? "1px 5px" : "2px 8px",
      borderRadius: 10,
      background: color,
      color: fg,
      fontSize: small ? 8 : 9,
      fontWeight: 700,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </span>
);

export const Tooltip = ({ content, children, theme: T, placement = "top" }) => {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  if (!content) return children;

  const child = React.Children.only(children);
  const vertical = placement === "bottom" ? { top: "calc(100% + 7px)" } : { bottom: "calc(100% + 7px)" };
  const describedBy = [child.props["aria-describedby"], tooltipId].filter(Boolean).join(" ");

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {React.cloneElement(child, {
        "aria-describedby": describedBy,
        onClick: (event) => {
          child.props.onClick?.(event);
          setOpen(true);
        },
      })}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...vertical,
            zIndex: 500,
            width: 240,
            maxWidth: "min(240px, 80vw)",
            background: T?.panel || "#12121a",
            border: `1px solid ${T?.border || "#2a2a35"}`,
            borderRadius: 6,
            boxShadow: "0 10px 28px rgba(0,0,0,0.36)",
            color: T?.textSec || "#999",
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1.45,
            padding: "8px 9px",
            textTransform: "none",
            whiteSpace: "normal",
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
};

export const HelpIcon = ({ help, label = "Help", theme: T }) => {
  if (!help) return null;
  return (
    <Tooltip content={help} theme={T}>
      <button
        type="button"
        aria-label={label}
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `1px solid ${(T?.border || "#2a2a35")}`,
          background: (T?.tier?.T2 || "#4fc3f7") + "18",
          color: T?.tier?.T2 || "#4fc3f7",
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        ?
      </button>
    </Tooltip>
  );
};

export const HelpCallout = ({ title, children, help, theme: T }) => {
  const content = children || help;
  if (!content) return null;
  return (
    <section
      aria-label={title || "Help"}
      style={{
        background: (T?.tier?.T2 || "#4fc3f7") + "10",
        border: `1px solid ${(T?.tier?.T2 || "#4fc3f7") + "3d"}`,
        borderRadius: 8,
        color: T?.textSec || "#999",
        fontSize: 11,
        lineHeight: 1.55,
        marginBottom: 12,
        padding: "10px 12px",
      }}
    >
      {title && (
        <div style={{ color: T?.text || "#fff", fontSize: 11, fontWeight: 800, marginBottom: 4 }}>
          {title}
        </div>
      )}
      <div>{content}</div>
    </section>
  );
};

export const EmptyState = ({ title = "No data", description, action, theme: T }) => (
  <div
    role="status"
    style={{
      border: `1px dashed ${T?.border || "#2a2a35"}`,
      borderRadius: 8,
      color: T?.textTert || "#666",
      fontSize: 12,
      lineHeight: 1.5,
      padding: 20,
      textAlign: "center",
    }}
  >
    <div style={{ color: T?.textSec || "#999", fontWeight: 800 }}>{title}</div>
    {description && <div style={{ marginTop: 5 }}>{description}</div>}
    {action && <div style={{ marginTop: 12 }}>{action}</div>}
  </div>
);

export const ConfirmationPanel = ({
  title = "Confirm decision",
  actionLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "normal",
  details = [],
  auditNote,
  onAuditNoteChange,
  onConfirm,
  onCancel,
  disabled,
  theme: T,
}) => {
  const confirmColor = confirmTone === "danger" ? T?.tier?.T0 || "#e94560" : T?.tier?.T3 || "#66bb6a";
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{
        background: T?.panel || "#12121a",
        border: `1px solid ${confirmColor}66`,
        borderRadius: 8,
        marginTop: 12,
        padding: 12,
      }}
    >
      <div style={{ color: T?.text || "#fff", fontSize: 12, fontWeight: 800 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 10 }}>
        {details.map((detail) => (
          <div key={detail.label} style={{ background: T?.card || "#16161e", border: `1px solid ${T?.border || "#2a2a35"}`, borderRadius: 6, padding: 8 }}>
            <div style={{ color: T?.textTert || "#666", fontSize: 8, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>{detail.label}</div>
            <div style={{ color: T?.textSec || "#999", fontSize: 10, fontWeight: 700, lineHeight: 1.4, marginTop: 4 }}>{detail.value || "Not set"}</div>
          </div>
        ))}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
        <span style={{ color: T?.textTert || "#666", fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Audit Note
        </span>
        <textarea
          value={auditNote}
          onChange={(event) => onAuditNoteChange?.(event.target.value)}
          style={{
            background: T?.card || "#16161e",
            border: `1px solid ${T?.border || "#2a2a35"}`,
            borderRadius: 6,
            color: T?.text || "#fff",
            fontFamily: T?.font || "sans-serif",
            fontSize: 10,
            lineHeight: 1.45,
            minHeight: 64,
            padding: 8,
            resize: "vertical",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <button type="button" onClick={onCancel} style={secondaryButtonStyle(T)}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} disabled={disabled} style={{ ...secondaryButtonStyle(T), borderColor: `${confirmColor}66`, color: confirmColor, opacity: disabled ? 0.55 : 1 }}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

/**
 * StatusDot — Colored status indicator with optional pulse
 * @param {string} status — Key into theme.status (e.g., "active", "staged")
 * @param {boolean} pulse — Show pulse animation (default: false)
 * @param {object} theme — Theme object
 */
export const StatusDot = ({ status, pulse, theme: T }) => {
  const color = (T && T.status && T.status[status]) || "#555";
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: 8,
        height: 8,
      }}
    >
      {pulse && (
        <span
          style={{
            position: "absolute",
            top: -2,
            left: -2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: color,
            opacity: 0.3,
            animation: "pulse 3s ease-in-out infinite",
          }}
        />
      )}
      <span
        style={{
          display: "block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
        }}
      />
    </span>
  );
};

/**
 * HealthDot — 6-state health indicator (GRAGBB)
 * Maps to theme.health[state]: G, R, A, Gr, B, Bl
 * @param {string} state — Health state code
 * @param {number} size — Dot diameter in px (default: 10)
 * @param {boolean} label — Show text label (default: true)
 * @param {object} theme — Theme object
 */
export const HealthDot = ({ state, size = 10, label = true, theme: T }) => {
  const colors = T?.health || {
    G: "#555",
    R: "#e94560",
    A: "#f5a623",
    Gr: "#66bb6a",
    B: "#4fc3f7",
    Bl: "#333",
  };
  const labels = {
    G: "Grey",
    R: "Red",
    A: "Amber",
    Gr: "Green",
    B: "Blue",
    Bl: "Black",
  };
  const color = colors[state] || "#555";
  const hasOutline = state === "G";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          border: hasOutline ? "1px solid #444" : "none",
          flexShrink: 0,
        }}
      />
      {label && (
        <span style={{ fontSize: 9, color: T?.textSec || "#999" }}>
          {labels[state]}
        </span>
      )}
    </span>
  );
};

/**
 * ProgressBar — Thin inline progress bar with percentage label
 * @param {number} pct — Percentage (0–100)
 * @param {string} color — Bar color (hex)
 * @param {number} width — Bar width in px (default: 80)
 * @param {object} theme — Theme object
 */
export const ProgressBar = ({ pct, color, width = 80, theme: T }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    <span
      style={{
        width,
        height: 4,
        borderRadius: 2,
        background: T?.card || "#2a2a35",
      }}
    >
      <span
        style={{
          display: "block",
          width: `${pct}%`,
          height: 4,
          borderRadius: 2,
          background: color,
          transition: "width 0.5s",
        }}
      />
    </span>
    <span style={{ fontSize: 9, color: T?.textTert || "#666" }}>
      {Math.round(pct)}%
    </span>
  </span>
);

/**
 * ActionIcon — Small circular button for launching actions (chat, command, etc.)
 * Uses theme.tier.T2 for color by default.
 * @param {function} onClick — Click handler
 * @param {object} theme — Theme object
 */
export const ActionIcon = ({ onClick, help, label = "Start action", theme: T }) => {
  const color = T?.tier?.T2 || "#4fc3f7";
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{
        background: color + "22",
        border: `1px solid ${color}55`,
        borderRadius: "50%",
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.2s",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill={color}
        stroke="none"
      >
        <path d="M12 2C6.48 2 2 6.04 2 11c0 2.76 1.36 5.22 3.5 6.84V22l3.73-2.04c.87.24 1.8.37 2.77.37 5.52 0 10-4.04 10-9S17.52 2 12 2z" />
      </svg>
    </button>
  );
  return help ? (
    <Tooltip content={help} theme={T}>
      {button}
    </Tooltip>
  ) : button;
};

/**
 * DetailDrawer — Right-side detail panel for entity inspection
 * Shows name, health, risks, wins, entity details, and action launcher.
 * @param {object} item — Entity object with name, health, role, owner, etc.
 * @param {function} onClose — Close handler
 * @param {function} onAction — Action/chat launcher handler
 * @param {object} theme — Theme object
 */
export const DetailDrawer = ({ item, onClose, onAction, theme: T }) => {
  if (!item) return null;

  const healthState = item.health || item.gragbb || "G";
  const healthColor = T?.health?.[healthState] || "#555";
  const healthLabels = {
    G: "Grey",
    R: "Red",
    A: "Amber",
    Gr: "Green",
    B: "Blue",
    Bl: "Black",
  };

  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        background: T?.panel || "#12121a",
        borderLeft: `1px solid ${T?.border || "#2a2a35"}`,
        padding: 16,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: T?.text || "#fff" }}>
            {item.name || item.title || item.topic || "Untitled"}
          </div>
          {item.role && (
            <div
              style={{
                fontSize: 11,
                color: T?.tier?.T1 || "#f5a623",
                fontWeight: 600,
              }}
            >
              {item.role}
            </div>
          )}
          {item.owner && (
            <div style={{ fontSize: 10, color: T?.textSec || "#999" }}>
              Owner: {item.owner}
            </div>
          )}
          {item.kso && (
            <div style={{ fontSize: 9, color: T?.tier?.T1 || "#f5a623" }}>
              KSO: {item.kso}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: T?.textTert || "#666",
            fontSize: 16,
            cursor: "pointer",
            padding: 4,
          }}
        >
          x
        </button>
      </div>

      {/* Health Status Box */}
      <div
        style={{
          background: healthColor + "15",
          border: `1px solid ${healthColor}44`,
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: T?.textTert || "#666",
            }}
          >
            Health Status
          </span>
          <HealthDot state={healthState} size={12} theme={T} />
        </div>
        <div
          style={{
            fontSize: 11,
            color: T?.textSec || "#999",
            lineHeight: 1.6,
          }}
        >
          {item.explain || item.gragbbExplain || "No detail available."}
        </div>
      </div>

      {/* Details */}
      {item.description && (
        <div
          style={{
            background: T?.card || "#16161e",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 11,
            color: T?.textSec || "#999",
            lineHeight: 1.55,
          }}
        >
          {item.description}
        </div>
      )}

      {item.response && (
        <div
          style={{
            background: (T?.tier?.T3 || "#66bb6a") + "12",
            border: `1px solid ${(T?.tier?.T3 || "#66bb6a") + "44"}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 11,
            color: T?.textSec || "#999",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {item.response}
        </div>
      )}

      {/* Risks */}
      {item.risks && item.risks.length > 0 && (
        <div
          style={{
            background: T?.card || "#16161e",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            border: `1px solid ${T?.border || "#2a2a35"}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T?.health?.R || "#e94560",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Risks
          </div>
          {item.risks.map((r, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: T?.textSec || "#999",
                lineHeight: 1.6,
                paddingLeft: 12,
                borderLeft: `2px solid ${(T?.health?.R || "#e94560") + "33"}`,
                marginBottom: 4,
              }}
            >
              {r}
            </div>
          ))}
        </div>
      )}

      {/* Wins / Evidence */}
      {item.wins && item.wins.length > 0 && (
        <div
          style={{
            background: T?.card || "#16161e",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            border: `1px solid ${T?.border || "#2a2a35"}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T?.health?.Gr || "#66bb6a",
              letterSpacing: 0.5,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Evidence / Wins
          </div>
          {item.wins.map((w, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: T?.textSec || "#999",
                lineHeight: 1.6,
                paddingLeft: 12,
                borderLeft: `2px solid ${(T?.health?.Gr || "#66bb6a") + "33"}`,
                marginBottom: 4,
              }}
            >
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Entity Details (Tier, Status, etc.) */}
      {(item.tier || item.status || item.surfaces) && (
        <div
          style={{
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {item.tier && (
            <Pill
              label={item.tier}
              color={T?.tier?.[item.tier] || "#555"}
              theme={T}
            />
          )}
          {item.status && (
            <Pill
              label={item.status}
              color={(T?.status?.[item.status] || "#555") + "33"}
              fg={T?.status?.[item.status] || "#555"}
              theme={T}
            />
          )}
          {item.surfaces &&
            item.surfaces.map((s) => (
              <Pill
                key={s}
                label={s}
                color={
                  {
                    CW: "#e94560",
                    WEB: "#4fc3f7",
                    CODE: "#66bb6a",
                    CHAT: "#f5a623",
                  }[s] || "#555"
                }
                fg={s === "CW" ? "#fff" : "#111"}
                small
                theme={T}
              />
            ))}
        </div>
      )}

      {/* Metrics */}
      {item.busMessages !== undefined && item.busMessages > 0 && (
        <div
          style={{
            background: T?.card || "#16161e",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
            border: `1px solid ${T?.border || "#2a2a35"}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: T?.textTert || "#666",
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            Bus Activity
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: T?.tier?.T2 || "#4fc3f7",
            }}
          >
            {item.busMessages}{" "}
            <span style={{ fontSize: 10, color: T?.textTert || "#666" }}>
              messages
            </span>
          </div>
        </div>
      )}

      {/* Connections */}
      {item.connections && item.connections.length > 0 && (
        <div
          style={{
            background: T?.card || "#16161e",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
            border: `1px solid ${T?.border || "#2a2a35"}`,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: T?.textTert || "#666",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Connections
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {item.connections.map((c) => (
              <Pill
                key={c}
                label={c}
                color={(T?.tier?.T2 || "#4fc3f7") + "33"}
                fg={T?.tier?.T2 || "#4fc3f7"}
                small
                theme={T}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action Launcher */}
      <div
        style={{
          background: (T?.tier?.T2 || "#4fc3f7") + "0a",
          borderRadius: 8,
          padding: 12,
          border: `1px solid ${(T?.tier?.T2 || "#4fc3f7") + "33"}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={T?.tier?.T2 || "#4fc3f7"}
            stroke="none"
          >
            <path d="M12 2C6.48 2 2 6.04 2 11c0 2.76 1.36 5.22 3.5 6.84V22l3.73-2.04c.87.24 1.8.37 2.77.37 5.52 0 10-4.04 10-9S17.52 2 12 2z" />
          </svg>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: T?.tier?.T2 || "#4fc3f7",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Start Action
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: T?.textSec || "#999",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          Open a session with context-aware starter prompt included.
        </div>
        <button
          onClick={() => onAction?.(item)}
          style={{
            width: "100%",
            background: `linear-gradient(135deg, ${T?.tier?.T2 || "#4fc3f7"}, ${T?.tier?.T3 || "#66bb6a"})`,
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            color: "#111",
            fontWeight: 700,
            fontSize: 11,
            cursor: "pointer",
            fontFamily: T?.font || "sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <path d="M12 2C6.48 2 2 6.04 2 11c0 2.76 1.36 5.22 3.5 6.84V22l3.73-2.04c.87.24 1.8.37 2.77.37 5.52 0 10-4.04 10-9S17.52 2 12 2z" />
          </svg>
          Start Session
        </button>
      </div>
    </div>
  );
};

/**
 * ActionLauncher — Slide-in panel for launching actions with editable prompt
 * @param {object} item — Entity context
 * @param {function} onClose — Close handler
 * @param {function} getStarterPrompt — Function to generate context-aware prompts
 * @param {string} actionLabel — Button label (default: "Start Session")
 * @param {object} theme — Theme object
 */
export const ActionLauncher = ({
  item,
  onClose,
  getStarterPrompt,
  actionLabel = "Assign Work",
  theme: T,
  dispatcher,
  dispatcherIdentity,
  dispatcherStatus,
  taskTemplates = [],
  onSubmit,
  help = {},
}) => {
  const initialTemplate = taskTemplates.find((template) => template.id === item?.template_id) || taskTemplates[0];
  const [templateId, setTemplateId] = useState(initialTemplate?.id || "");
  const [clientRef, setClientRef] = useState(() => makeClientRef(dispatcherIdentity));
  const [title, setTitle] = useState(item?.title || item?.name || "");
  const [propertyRef, setPropertyRef] = useState(item?.property_ref || "");
  const [jurisdiction, setJurisdiction] = useState("England");
  const [priority, setPriority] = useState(item?.priority || "normal");
  const [deadline, setDeadline] = useState(item?.due || "");
  const [desiredOutcome, setDesiredOutcome] = useState(item?.description || item?.explain || getStarterPrompt?.(item) || "");
  const [evidence, setEvidence] = useState("");
  const [humanGates, setHumanGates] = useState([]);
  const [submitState, setSubmitState] = useState({ state: "idle", message: "", taskId: "" });

  useEffect(() => {
    const nextTemplate = taskTemplates.find((template) => template.id === item?.template_id) || taskTemplates[0];
    setTemplateId(nextTemplate?.id || "");
    setClientRef(makeClientRef(dispatcherIdentity));
    setTitle(item?.title || item?.name || "");
    setPropertyRef(item?.property_ref || "");
    setJurisdiction("England");
    setPriority(item?.priority || "normal");
    setDeadline(item?.due || "");
    setDesiredOutcome(item?.description || item?.explain || getStarterPrompt?.(item) || "");
    setEvidence("");
    setHumanGates([]);
    setSubmitState({ state: "idle", message: "", taskId: "" });
  }, [item, getStarterPrompt, taskTemplates, dispatcherIdentity]);

  const skillName = item?.skill || (item?.code ? "ships-computer" : "cowork");
  const template = taskTemplates.find((candidate) => candidate.id === templateId) || initialTemplate;
  const requesterLabel =
    dispatcherIdentity?.requester?.name ||
    dispatcherIdentity?.requester?.email ||
    dispatcherIdentity?.requester?.id ||
    "";
  const branchLabel =
    dispatcherIdentity?.branch?.name ||
    dispatcherIdentity?.branch?.id ||
    dispatcherIdentity?.tenant?.name ||
    dispatcherIdentity?.tenant?.id ||
    "";
  const identityReady = !dispatcher || Boolean(requesterLabel);
  const preview = buildAssignmentBody({
    template,
    title,
    propertyRef,
    jurisdiction,
    priority,
    deadline,
    desiredOutcome,
    evidence,
    humanGates,
  });
  const gateOptions = [
    "AML / sanctions",
    "Client money / deposit",
    "Keys / access",
    "Publication approval",
    "Final terms / contract",
    "Complaint settlement",
  ];

  const fieldHelp = typeof help === "object" ? help : {};
  const inputStyle = {
    background: T?.card || "#16161e",
    border: `1px solid ${T?.border || "#2a2a35"}`,
    borderRadius: 6,
    color: T?.text || "#fff",
    fontFamily: T?.font || "sans-serif",
    fontSize: 11,
    padding: "8px 10px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 9,
    fontWeight: 800,
    color: T?.textTert || "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  };

  const copyPrompt = async () => {
    setSubmitState({ state: "submitting", message: "Copying prompt", taskId: "" });
    try {
      await navigator.clipboard.writeText(desiredOutcome);
      setSubmitState({ state: "submitted", message: "Prompt copied", taskId: "" });
    } catch (error) {
      setSubmitState({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
        taskId: "",
      });
    }
  };

  if (!dispatcher) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 460,
          background: T?.panel || "#12121a",
          borderLeft: `2px solid ${T?.tier?.T2 || "#4fc3f7"}`,
          boxShadow: "-4px 0 30px rgba(0,0,0,0.5)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          fontFamily: T?.font || "sans-serif",
        }}
      >
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${T?.border || "#2a2a35"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: T?.text || "#fff" }}>{actionLabel}</div>
            <div style={{ fontSize: 10, color: T?.tier?.T2 || "#4fc3f7", fontWeight: 600 }}>/{skillName}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: T?.textTert || "#666",
              fontSize: 18,
              cursor: "pointer",
            }}
          >
            x
          </button>
        </div>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T?.border || "#2a2a35"}` }}>
          <div style={labelStyle}>Context</div>
          <div style={{ fontWeight: 700, fontSize: 12, color: T?.text }}>
            {item?.name || item?.title || item?.topic || "New action"}
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <label style={labelStyle}>Prompt</label>
              <HelpIcon help={fieldHelp.prompt || "Edit the starter prompt before copying it into a separate work session."} label="Prompt help" theme={T} />
            </div>
            <textarea
              value={desiredOutcome}
              onChange={(event) => setDesiredOutcome(event.target.value)}
              style={{ ...inputStyle, minHeight: 280, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${T?.border || "#2a2a35"}` }}>
          <button
            onClick={copyPrompt}
            disabled={submitState.state === "submitting" || !desiredOutcome.trim()}
            style={{
              width: "100%",
              background: `linear-gradient(135deg, ${T?.tier?.T2 || "#4fc3f7"}, ${T?.tier?.T3 || "#66bb6a"})`,
              border: "none",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#111",
              fontWeight: 800,
              fontSize: 13,
              cursor: submitState.state === "submitting" ? "wait" : "pointer",
              opacity: submitState.state === "submitting" || !desiredOutcome.trim() ? 0.55 : 1,
              fontFamily: T?.font || "sans-serif",
            }}
          >
            {submitState.state === "submitting" ? "Copying..." : "Copy Prompt"}
          </button>
          {submitState.message && (
            <div
              style={{
                marginTop: 10,
                color: submitState.state === "error" ? T?.tier?.T0 || "#e94560" : T?.tier?.T3 || "#66bb6a",
                fontSize: 10,
                lineHeight: 1.4,
              }}
            >
              {submitState.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (!onSubmit || !dispatcher) return;
    if (!identityReady) {
      setSubmitState({
        state: "error",
        message: "Dispatcher identity has not loaded from /bridge-api/me",
        taskId: "",
      });
      return;
    }
    setSubmitState({ state: "submitting", message: "Submitting assignment", taskId: "" });
    try {
      const result = await onSubmit({
        title: title.trim(),
        topic: template?.topic || title,
        body: preview,
        priority,
        client_ref: clientRef,
        template_id: template?.id,
        property_ref: propertyRef.trim(),
        jurisdiction,
        deadline,
        desired_outcome: desiredOutcome.trim(),
        evidence: evidence.trim(),
        human_gates: humanGates,
      });
      setSubmitState({
        state: "submitted",
        message: result?.deduped ? "Existing assignment loaded" : "Assignment submitted",
        taskId: result?.task?.id || "",
      });
    } catch (error) {
      setSubmitState({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
        taskId: "",
      });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 460,
        background: T?.panel || "#12121a",
        borderLeft: `2px solid ${T?.tier?.T2 || "#4fc3f7"}`,
        boxShadow: "-4px 0 30px rgba(0,0,0,0.5)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        fontFamily: T?.font || "sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${T?.border || "#2a2a35"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              color: T?.text || "#fff",
            }}
          >
            {actionLabel}
          </div>
          <div
            style={{
              fontSize: 10,
              color: T?.tier?.T2 || "#4fc3f7",
              fontWeight: 600,
            }}
          >
            /{skillName}
          </div>
          <div
            style={{
              fontSize: 9,
              color: identityReady ? T?.textTert || "#666" : T?.tier?.T0 || "#e94560",
              marginTop: 3,
            }}
          >
            {requesterLabel ? `Requester: ${requesterLabel}` : dispatcherStatus?.message || "Loading requester"}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: T?.textTert || "#666",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          x
        </button>
      </div>

      {/* Context Section */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${T?.border || "#2a2a35"}`,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: T?.textTert || "#666",
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          Context
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          {item?.health && (
            <HealthDot state={item.health} size={10} theme={T} />
          )}
          <span style={{ fontWeight: 700, fontSize: 12, color: T?.text }}>
            {item?.name || item?.title || item?.topic || "New assignment"}
          </span>
        </div>
        {item?.role && (
          <div
            style={{
              fontSize: 9,
              color: T?.tier?.T1 || "#f5a623",
              fontWeight: 600,
            }}
          >
            {item.role}
          </div>
        )}
        {(item?.desc || item?.description) && (
          <div
            style={{
              fontSize: 9,
              color: T?.textSec || "#999",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {item.desc || item.description}
          </div>
        )}
        {(branchLabel || dispatcherIdentity?.scope?.teamId || dispatcherIdentity?.scope?.useCaseId) && (
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            {branchLabel && (
              <Pill label={branchLabel} color={(T?.tier?.T2 || "#4fc3f7") + "33"} fg={T?.tier?.T2 || "#4fc3f7"} small theme={T} />
            )}
            {dispatcherIdentity?.scope?.teamId && (
              <Pill label={dispatcherIdentity.scope.teamId} color={(T?.tier?.T3 || "#66bb6a") + "33"} fg={T?.tier?.T3 || "#66bb6a"} small theme={T} />
            )}
            {dispatcherIdentity?.scope?.useCaseId && (
              <Pill label={dispatcherIdentity.scope.useCaseId} color={(T?.tier?.T1 || "#f5a623") + "33"} fg={T?.tier?.T1 || "#f5a623"} small theme={T} />
            )}
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Template</label>
            <HelpIcon help={fieldHelp.template || "Choose the operating template that frames the assignment body and routing instructions."} label="Template help" theme={T} />
          </div>
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} style={inputStyle}>
            {taskTemplates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Title</label>
            <HelpIcon help={fieldHelp.title || "Use a specific title that the dispatcher and assignee can audit later."} label="Title help" theme={T} />
          </div>
          <input value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Property / Case Ref</label>
            <HelpIcon help={fieldHelp.propertyRef || "Attach a case, property, client, or file reference when one exists."} label="Property ref help" theme={T} />
          </div>
          <input value={propertyRef} onChange={(event) => setPropertyRef(event.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <label style={labelStyle}>Jurisdiction</label>
              <HelpIcon help={fieldHelp.jurisdiction || "Jurisdiction controls the policy context for property and compliance work."} label="Jurisdiction help" theme={T} />
            </div>
            <select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} style={inputStyle}>
              <option>England</option>
              <option>Wales</option>
              <option>Scotland</option>
              <option>Northern Ireland</option>
            </select>
          </div>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <label style={labelStyle}>Priority</label>
              <HelpIcon help={fieldHelp.priority || "Priority should reflect operational risk and deadline pressure, not general importance."} label="Priority help" theme={T} />
            </div>
            <select value={priority} onChange={(event) => setPriority(event.target.value)} style={inputStyle}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Deadline</label>
            <HelpIcon help={fieldHelp.deadline || "Set a concrete due date when the task has a gate, client promise, or SLA."} label="Deadline help" theme={T} />
          </div>
          <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Desired Outcome</label>
            <HelpIcon help={fieldHelp.desiredOutcome || "Describe the business outcome, owner, and stopping condition for the assignee."} label="Desired outcome help" theme={T} />
          </div>
          <textarea
            value={desiredOutcome}
            onChange={(event) => setDesiredOutcome(event.target.value)}
            style={{ ...inputStyle, minHeight: 72, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Evidence / Notes</label>
            <HelpIcon help={fieldHelp.evidence || "Include source facts, caveats, and constraints. Do not paste secrets."} label="Evidence help" theme={T} />
          </div>
          <textarea
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            style={{ ...inputStyle, minHeight: 78, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Human Gates</label>
            <HelpIcon help={fieldHelp.humanGates || "Select any decision that must stop for a human before messages, publication, funds, or final terms proceed."} label="Human gates help" theme={T} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {gateOptions.map((gate) => (
              <label key={gate} style={{ display: "flex", alignItems: "center", gap: 6, color: T?.textSec, fontSize: 10 }}>
                <input
                  type="checkbox"
                  checked={humanGates.includes(gate)}
                  onChange={(event) =>
                    setHumanGates((current) =>
                      event.target.checked ? [...current, gate] : current.filter((item) => item !== gate)
                    )
                  }
                />
                {gate}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <label style={labelStyle}>Preview</label>
            <HelpIcon help={fieldHelp.preview || "This is the exact assignment body submitted to the dispatcher."} label="Preview help" theme={T} />
          </div>
          <div
            style={{
              ...inputStyle,
              whiteSpace: "pre-wrap",
              minHeight: 130,
              maxHeight: 220,
              overflowY: "auto",
              lineHeight: 1.45,
            }}
          >
            {preview}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${T?.border || "#2a2a35"}` }}>
        {submitState.state === "submitted" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: T?.tier?.T3 || "#66bb6a", fontWeight: 800, marginBottom: 6 }}>
              {submitState.message}
            </div>
            <div style={{ fontSize: 10, color: T?.textSec || "#999", marginBottom: 10 }}>
              {submitState.taskId}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: `1px solid ${T?.border || "#2a2a35"}`,
                borderRadius: 6,
                color: T?.textSec || "#999",
                padding: "8px 14px",
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: T?.font || "sans-serif",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <button
            onClick={submit}
            disabled={submitState.state === "submitting" || !title.trim() || !desiredOutcome.trim() || !identityReady}
            style={{
              width: "100%",
              background: `linear-gradient(135deg, ${T?.tier?.T2 || "#4fc3f7"}, ${T?.tier?.T3 || "#66bb6a"})`,
              border: "none",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#111",
              fontWeight: 800,
              fontSize: 13,
              cursor: submitState.state === "submitting" ? "wait" : "pointer",
              opacity: submitState.state === "submitting" || !title.trim() || !desiredOutcome.trim() || !identityReady ? 0.55 : 1,
              fontFamily: T?.font || "sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {submitState.state === "submitting" ? "Submitting..." : identityReady ? actionLabel : "Waiting for /me"}
          </button>
        )}
        {submitState.state === "error" && (
          <div style={{ marginTop: 10, color: T?.tier?.T0 || "#e94560", fontSize: 10, lineHeight: 1.4 }}>
            {submitState.message}
          </div>
        )}
      </div>
    </div>
  );
};

function buildAssignmentBody({ template, title, propertyRef, jurisdiction, priority, deadline, desiredOutcome, evidence, humanGates }) {
  return [
    `Assignment: ${title || "Untitled estate-agent task"}`,
    `Template: ${template?.name || "General estate-agent work"}`,
    `Jurisdiction: ${jurisdiction || "England"}`,
    `Priority: ${priority || "normal"}`,
    propertyRef ? `Property / case ref: ${propertyRef}` : "Property / case ref: Not provided",
    deadline ? `Deadline: ${deadline}` : "Deadline: Not provided",
    "",
    "Desired outcome:",
    desiredOutcome || "Not provided",
    "",
    "Evidence / notes:",
    evidence || "Not provided",
    "",
    "Human approval gates:",
    humanGates?.length ? humanGates.map((gate) => `- ${gate}`).join("\n") : "None selected",
    "",
    "Instructions:",
    template?.instructions || "Prepare an audit-ready response, route specialist work as needed, and block if mandatory evidence or human approval is missing.",
  ].join("\n");
}

function secondaryButtonStyle(T) {
  return {
    background: "transparent",
    border: `1px solid ${T?.border || "#2a2a35"}`,
    borderRadius: 6,
    color: T?.textSec || "#999",
    cursor: "pointer",
    fontFamily: T?.font || "sans-serif",
    fontSize: 10,
    fontWeight: 800,
    padding: "7px 9px",
  };
}

function makeClientRef(identity) {
  void identity;
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2);
  return ["dashboard", Date.now(), random].map((part) => encodeURIComponent(part)).join(":");
}
