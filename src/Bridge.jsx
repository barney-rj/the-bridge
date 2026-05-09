/**
 * The Bridge — Control Room Dashboard Orchestrator
 *
 * Top-level component that manages mode selection, tab navigation, item selection,
 * action dispatch, and live clock. Renders Header, StatsBar, CommandCrew, TabBar,
 * MainContent (with active panel + detail drawer), Footer, and ActionLauncher.
 *
 * @module Bridge
 * @version 0.1.0
 * @example
 * import { Bridge } from './Bridge';
 * const config = { title: "#THE_BRIDGE", subtitle: "Control Room", modes: [...], data: {...}, ... };
 * <Bridge config={config} />
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { defaultTheme, createTheme } from "./theme";
import { DetailDrawer, ActionLauncher, HelpCallout, HelpIcon, Tooltip, EmptyState } from "./components";
import {
  createBridgeImport,
  decideBridgeApproval,
  fetchBridgeResource,
  fetchBridgeTasks,
  fetchDispatcherIdentity,
  submitBridgeTask
} from "./dispatcherClient";
import {
  EntityGrid, KanbanBoard, CapabilitiesGrid, PatternsGrid,
  IntegrationsGrid, MetricsPanel, ObjectiveStack, TaskBoard,
  OutcomeGrid, QuadrantBalance, DriftDetection, LiveTaskBoard,
  TenantIdentityPanel, ImportReviewPanel, CaseDetailPanel, ApprovalQueuePanel,
  AuditTrailPanel, AdminIntegrationSettingsPanel
} from "./panels";

/**
 * Panel component map — maps panel name strings from config to React components.
 * @type {Object.<string, React.ComponentType>}
 */
const panelMap = {
  EntityGrid, KanbanBoard, CapabilitiesGrid, PatternsGrid,
  IntegrationsGrid, MetricsPanel, ObjectiveStack, TaskBoard,
  OutcomeGrid, QuadrantBalance, DriftDetection, LiveTaskBoard,
  TenantIdentityPanel, ImportReviewPanel, CaseDetailPanel, ApprovalQueuePanel,
  AuditTrailPanel, AdminIntegrationSettingsPanel,
};

/**
 * Bridge — Main orchestrator component
 *
 * @component
 * @param {Object} props
 * @param {BridgeConfig} props.config — Dashboard configuration
 * @returns {React.ReactElement} The rendered dashboard
 */
export function Bridge({ config = {} }) {
  // === Theme Setup ===
  const theme = useMemo(
    () => (config.theme ? createTheme(config.theme) : defaultTheme),
    [config.theme]
  );

  // === State Management ===
  const [mode, setMode] = useState(config.modes?.[0]?.id || "build");
  const [activeTab, setActiveTab] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [time, setTime] = useState(new Date());
  const [taskFilter, setTaskFilter] = useState("all");
  const [expandedTask, setExpandedTask] = useState(null);
  const [dispatcherIdentity, setDispatcherIdentity] = useState(null);
  const [dispatcherStatus, setDispatcherStatus] = useState({
    state: config.dispatcher ? "loading" : "disabled",
    message: config.dispatcher ? "Loading dispatcher identity" : "Dispatcher not configured",
    checkedAt: null,
  });
  const [liveTasks, setLiveTasks] = useState([]);
  const [liveTaskStatus, setLiveTaskStatus] = useState({
    state: config.dispatcher ? "idle" : "disabled",
    message: config.dispatcher ? "Waiting for dispatcher identity" : "Dispatcher not configured",
    checkedAt: null,
  });
  const [appData, setAppData] = useState({});
  const [appStatus, setAppStatus] = useState({
    state: config.dispatcher ? "idle" : "disabled",
    message: config.dispatcher ? "Waiting for dispatcher identity" : "Dispatcher not configured",
    checkedAt: null,
  });
  const [onboardingHidden, setOnboardingHidden] = useState(false);

  // === Live Clock ===
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const refreshLiveTasks = useCallback(async (identityOverride = null) => {
    if (!config.dispatcher) return [];
    const identity = identityOverride || dispatcherIdentity;
    if (!identity) {
      setLiveTaskStatus({
        state: "error",
        message: "Dispatcher identity has not loaded from /me",
        checkedAt: new Date().toISOString(),
      });
      return [];
    }
    setLiveTaskStatus((current) => ({ ...current, state: "loading", message: "Refreshing assignments" }));
    try {
      const tasks = await fetchBridgeTasks(config.dispatcher, identity);
      setLiveTasks(tasks);
      setLiveTaskStatus({
        state: "ok",
        message: `${tasks.length} assignment${tasks.length === 1 ? "" : "s"} loaded`,
        checkedAt: new Date().toISOString(),
      });
      return tasks;
    } catch (error) {
      setLiveTaskStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      });
      return [];
    }
  }, [config.dispatcher, dispatcherIdentity]);

  const refreshAppData = useCallback(async (identityOverride = null) => {
    if (!config.dispatcher) return {};
    const identity = identityOverride || dispatcherIdentity;
    if (!identity) return {};

    setAppStatus((current) => ({ ...current, state: "loading", message: "Refreshing pilot data" }));
    const resources = ["imports", "cases", "approvals", "audit-events", "integrations", "agent-roster"];
    const settled = await Promise.allSettled(resources.map((resource) => fetchBridgeResource(config.dispatcher, resource, { limit: 100 })));
    const next = {};
    const errors = [];

    settled.forEach((result, index) => {
      const resource = resources[index];
      if (result.status === "rejected") {
        errors.push(`${resource}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
        return;
      }
      if (resource === "audit-events") next.auditEvents = normalizeAuditEvents(result.value.audit_events || result.value["audit-events"] || []);
      if (resource === "agent-roster") next.agentRoster = result.value.agents || [];
      if (resource === "imports") next.importReviews = normalizeImports(result.value.imports || [], identity);
      if (resource === "cases") next.cases = normalizeCases(result.value.cases || []);
      if (resource === "approvals") next.approvals = normalizeApprovals(result.value.approvals || []);
      if (resource === "integrations") next.adminIntegrations = result.value.integrations || [];
    });

    setAppData(next);
    setAppStatus({
      state: errors.length ? "error" : "ok",
      message: errors.length ? errors[0] : "Pilot data loaded",
      checkedAt: new Date().toISOString(),
    });
    return next;
  }, [config.dispatcher, dispatcherIdentity]);

  useEffect(() => {
    let cancelled = false;

    async function refreshDispatcher() {
      if (!config.dispatcher) {
        setDispatcherIdentity(null);
        setDispatcherStatus({
          state: "disabled",
          message: "Dispatcher not configured",
          checkedAt: null,
        });
        setLiveTasks([]);
        setLiveTaskStatus({
          state: "disabled",
          message: "Dispatcher not configured",
          checkedAt: null,
        });
        return;
      }

      setDispatcherStatus((current) => ({
        ...current,
        state: "loading",
        message: "Loading dispatcher identity",
      }));
      try {
        const identity = await fetchDispatcherIdentity(config.dispatcher);
        if (cancelled) return;
        setDispatcherIdentity(identity);
        setDispatcherStatus({
          state: "ok",
          message: "Dispatcher identity loaded",
          checkedAt: identity.fetchedAt,
        });
        await Promise.all([refreshLiveTasks(identity), refreshAppData(identity)]);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setDispatcherIdentity(null);
        setLiveTasks([]);
        setAppData({});
        setDispatcherStatus({
          state: "error",
          message,
          checkedAt: new Date().toISOString(),
        });
        setLiveTaskStatus({
          state: "error",
          message: `Identity required before loading assignments: ${message}`,
          checkedAt: new Date().toISOString(),
        });
        setAppStatus({
          state: "error",
          message: `Identity required before loading pilot data: ${message}`,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    setDispatcherIdentity(null);
    setLiveTasks([]);
    setAppData({});
    refreshDispatcher();
    const interval = config.dispatcher
      ? setInterval(refreshDispatcher, config.dispatcher.pollIntervalMs || 15000)
      : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [config.dispatcher]);

  // === Mode Management ===
  const currentModeObj = useMemo(
    () => config.modes?.find((m) => m.id === mode),
    [mode, config.modes]
  );

  // Reset to first tab when mode changes
  useEffect(() => {
    if (currentModeObj?.tabs?.length) {
      setActiveTab(currentModeObj.tabs[0].id);
    }
  }, [mode, currentModeObj]);

  // Default to first tab on mount
  useEffect(() => {
    if (!activeTab && currentModeObj?.tabs?.length) {
      setActiveTab(currentModeObj.tabs[0].id);
    }
  }, []);

  // === Tab Management ===
  const currentTab = useMemo(
    () =>
      currentModeObj?.tabs?.find((t) => t.id === activeTab) ||
      currentModeObj?.tabs?.[0],
    [activeTab, currentModeObj]
  );
  const onboarding = normalizeOnboarding(config.onboarding);

  const mergedData = useMemo(
    () => ({
      ...config.data,
      ...appData,
      tenant: dispatcherIdentity?.tenant || config.data?.tenant,
      branch: dispatcherIdentity?.branch || config.data?.branch,
      requester: dispatcherIdentity?.requester || config.data?.requester,
    }),
    [config.data, appData, dispatcherIdentity]
  );

  // === Handlers ===
  const handleModeToggle = (newModeId) => {
    setMode(newModeId);
    setSelectedItem(null);
    setActionTarget(null);
  };

  const handleTabSelect = (tabId) => {
    setActiveTab(tabId);
    setSelectedItem(null);
    setActionTarget(null);
  };

  const handleItemSelect = (item) => {
    setSelectedItem(item);
  };

  const handleAction = (item) => {
    setActionTarget(item);
    if (config.onAction) {
      config.onAction(item);
    }
  };

  const handleAssignmentSubmit = async (payload) => {
    if (!dispatcherIdentity) {
      throw new Error("Dispatcher identity has not loaded from /bridge-api/me");
    }
    const result = await submitBridgeTask(config.dispatcher, payload, dispatcherIdentity);
    await refreshLiveTasks(dispatcherIdentity);
    return result;
  };

  const handleCreateImport = async (input) => {
    if (!dispatcherIdentity) {
      throw new Error("Dispatcher identity has not loaded from /bridge-api/me");
    }
    const result = await createBridgeImport(config.dispatcher, input);
    await refreshAppData(dispatcherIdentity);
    return result;
  };

  const handleApprovalDecision = async (approvalId, decision, decisionNote = "") => {
    if (!dispatcherIdentity) {
      throw new Error("Dispatcher identity has not loaded from /bridge-api/me");
    }
    const result = await decideBridgeApproval(config.dispatcher, approvalId, decision, decisionNote);
    await refreshAppData(dispatcherIdentity);
    return result;
  };

  const handleActionClose = () => {
    setActionTarget(null);
  };

  const handleDetailDrawerClose = () => {
    setSelectedItem(null);
  };

  // === Render Panel ===
  const PanelComponent = currentTab?.panel ? panelMap[currentTab.panel] : null;

  // === Styles ===
  const styles = {
    container: {
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      backgroundColor: theme.bg,
      color: theme.text,
      fontFamily: theme.font,
      overflow: "hidden",
    },
    header: {
      backgroundColor: theme.bg,
      borderBottom: `1px solid ${theme.border}`,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      zIndex: 100,
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      flex: 1,
    },
    headerTitle: {
      fontSize: "18px",
      fontWeight: 600,
      background: `linear-gradient(90deg, ${currentModeObj?.color || theme.tier.T0}, ${theme.tier.T2})`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      textFillColor: "transparent",
    },
    headerSubtitle: {
      fontSize: "12px",
      color: theme.textSec,
      fontWeight: 400,
    },
    modePills: {
      display: "flex",
      gap: "8px",
    },
    modePill: (isActive) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 12px",
      fontSize: "11px",
      fontWeight: 600,
      border: `1px solid ${isActive ? theme.border : "transparent"}`,
      backgroundColor: isActive ? theme.card : "transparent",
      color: isActive ? theme.text : theme.textSec,
      cursor: "pointer",
      borderRadius: "4px",
      transition: "all 150ms ease",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }),
    headerRight: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      fontSize: "12px",
      color: theme.textSec,
    },
    assignButton: {
      border: `1px solid ${theme.tier.T2}`,
      background: `${theme.tier.T2}22`,
      color: theme.tier.T2,
      borderRadius: 6,
      padding: "7px 10px",
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: theme.font,
      whiteSpace: "nowrap",
    },
    clock: {
      fontFamily: "monospace",
      fontSize: "13px",
    },
    statsBar: {
      backgroundColor: theme.statsBar,
      padding: "8px 16px",
      display: "flex",
      gap: "24px",
      borderBottom: `1px solid ${theme.border}`,
      overflow: "auto",
      whiteSpace: "nowrap",
    },
    statPill: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      fontSize: "11px",
      minWidth: "60px",
    },
    statValue: (color) => ({
      fontSize: "16px",
      fontWeight: 700,
      color: color || theme.tier.T0,
    }),
    statLabel: {
      color: theme.textTert,
      fontSize: "9px",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    },
    crewBar: {
      backgroundColor: theme.card,
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.border}`,
      display: "flex",
      alignItems: "center",
      gap: "16px",
    },
    crewAvatars: {
      display: "flex",
      gap: "8px",
    },
    avatar: (colors) => ({
      width: "32px",
      height: "32px",
      borderRadius: "50%",
      backgroundColor: colors?.[0] || theme.tier.T0,
      color: colors?.[1] || theme.text,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "12px",
      fontWeight: 700,
      border: `1px solid ${theme.border}`,
    }),
    crewInfo: {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
    },
    crewTagline: {
      fontSize: "12px",
      fontWeight: 600,
      color: theme.text,
    },
    crewSubtitle: {
      fontSize: "11px",
      color: theme.textSec,
    },
    tabBar: {
      backgroundColor: theme.bg,
      borderBottom: `1px solid ${theme.border}`,
      display: "flex",
      gap: "0",
      padding: "0 16px",
      overflow: "auto",
      whiteSpace: "nowrap",
    },
    tab: (isActive, color) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "10px 12px",
      fontSize: "12px",
      fontWeight: isActive ? 600 : 500,
      color: isActive ? theme.text : theme.textSec,
      cursor: "pointer",
      borderBottom: isActive ? `2px solid ${color || theme.tier.T0}` : "none",
      backgroundColor: "transparent",
      border: "none",
      transition: "all 150ms ease",
      whiteSpace: "nowrap",
    }),
    mainContent: {
      flex: 1,
      display: "flex",
      gap: "0",
      overflow: "hidden",
      position: "relative",
    },
    panelContainer: {
      flex: 1,
      overflow: "auto",
      padding: "16px",
      backgroundColor: theme.panel,
      position: "relative",
    },
    onboardingActions: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "12px 16px 0",
      backgroundColor: theme.panel,
    },
    footer: {
      backgroundColor: theme.card,
      borderTop: `1px solid ${theme.border}`,
      padding: "8px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: "11px",
      color: theme.textSec,
      minHeight: "32px",
    },
    footerLeft: {
      flex: 1,
    },
    footerCenter: {
      display: "flex",
      gap: "12px",
    },
    indicator: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    statusDot: (status) => {
      const statusColors = {
        active: theme.status.active,
        staged: theme.status.staged,
        planned: theme.status.planned,
      };
      return {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: statusColors[status] || theme.textTert,
      };
    },
    footerRight: {
      flex: 1,
      textAlign: "right",
    },
  };

  // === Keyframes (global styles) ===
  const keyframes = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes scanline {
      0% { transform: translateY(-100%); }
      100% { transform: translateY(100%); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  return (
    <>
      <style>{keyframes}</style>

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerTitle}>{config.title || "#THE_BRIDGE"}</div>
            <div style={styles.headerSubtitle}>
              {config.subtitle || "Control Room"}
            </div>

            <div style={styles.modePills}>
              {config.modes?.map((m) => (
                <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <button
                    style={styles.modePill(m.id === mode)}
                    onClick={() => handleModeToggle(m.id)}
                    aria-label={`${m.label}${m.subtitle ? `: ${m.subtitle}` : ""}`}
                  >
                    {m.label}
                  </button>
                  <HelpIcon help={m.help || m.subtitle} label={`${m.label} help`} theme={theme} />
                </span>
              ))}
            </div>
          </div>

          <div style={styles.headerRight}>
            {config.dispatcher && (
              <button
                style={styles.assignButton}
                onClick={() =>
                  handleAction({
                    id: "new-assignment",
                    name: "New assignment",
                    title: "New assignment",
                    skill: "case",
                    description: "Create a new handoff for the estate-agent team coordinator.",
                  })
                }
              >
                + Assign Work
              </button>
            )}
            <div style={styles.clock}>
              {time.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        </div>

        {/* Stats Bar */}
        {currentModeObj?.stats && currentModeObj.stats.length > 0 && (
          <div style={styles.statsBar}>
            {currentModeObj.stats.map((stat, idx) => (
              <div key={idx} style={styles.statPill}>
                <div style={styles.statValue(stat.color)}>{stat.value}</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <div style={styles.statLabel}>{stat.label}</div>
                  <HelpIcon help={stat.help} label={`${stat.label} help`} theme={theme} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Command Crew */}
        {currentModeObj?.crew && currentModeObj.crew.length > 0 && (
          <div style={styles.crewBar}>
            <div style={styles.crewAvatars}>
              {currentModeObj.crew.map((member) => (
                <Tooltip key={member.letter} content={member.help || `${member.name}${member.role ? `: ${member.role}` : ""}`} theme={theme}>
                  <button type="button" style={{ ...styles.avatar(member.colors), cursor: "help", padding: 0 }} aria-label={`${member.name}${member.role ? `: ${member.role}` : ""}`}>
                    {member.letter}
                  </button>
                </Tooltip>
              ))}
            </div>
            <div style={styles.crewInfo}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <div style={styles.crewTagline}>{currentModeObj.tagline}</div>
                <HelpIcon help={currentModeObj.crewHelp} label="Crew help" theme={theme} />
              </div>
              <div style={styles.crewSubtitle}>{currentModeObj.subtitle}</div>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        {currentModeObj?.tabs && currentModeObj.tabs.length > 0 && (
          <div style={styles.tabBar}>
            {currentModeObj.tabs.map((tab) => (
              <span key={tab.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <button
                  style={styles.tab(tab.id === activeTab, currentModeObj.color)}
                  onClick={() => handleTabSelect(tab.id)}
                >
                  {tab.label}
                </button>
                <HelpIcon help={tab.help} label={`${tab.label} help`} theme={theme} />
              </span>
            ))}
          </div>
        )}

        {onboarding && !onboardingHidden && (
          <div style={styles.onboardingActions}>
            <div style={{ flex: 1 }}>
              <HelpCallout title={onboarding.title} help={onboarding.body} theme={theme} />
            </div>
            <button
              type="button"
              onClick={() => setOnboardingHidden(true)}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                color: theme.textSec,
                cursor: "pointer",
                fontFamily: theme.font,
                fontSize: 10,
                fontWeight: 800,
                marginBottom: 12,
                padding: "7px 9px",
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content */}
        <div style={styles.mainContent}>
          <div style={styles.panelContainer}>
            {(currentModeObj?.help || currentTab?.help) && (
              <HelpCallout
                title={currentTab?.help ? `${currentTab.label} Help` : `${currentModeObj.label} Help`}
                help={currentTab?.help || currentModeObj?.help}
                theme={theme}
              />
            )}
            {PanelComponent ? (
              <PanelComponent
                data={mergedData}
                theme={theme}
                onSelect={handleItemSelect}
                selectedItem={selectedItem}
                onAction={handleAction}
                liveTasks={liveTasks}
                liveTaskStatus={liveTaskStatus}
                dispatcher={config.dispatcher}
                dispatcherIdentity={dispatcherIdentity}
                dispatcherStatus={dispatcherStatus}
                appStatus={appStatus}
                onRefreshTasks={() => refreshLiveTasks()}
                onCreateImport={handleCreateImport}
                onDecideApproval={handleApprovalDecision}
              />
            ) : (
              <EmptyState title="Panel not found" description={currentTab?.panel} theme={theme} />
            )}

            {/* Detail Drawer */}
            {selectedItem && (
              <DetailDrawer
                item={selectedItem}
                onClose={handleDetailDrawerClose}
                onAction={handleAction}
                theme={theme}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div style={styles.footerLeft}>
            {config.footer?.left || "The Bridge"}
          </div>

          <div style={styles.footerCenter}>
            {config.footer?.indicators?.map((ind, idx) => (
              <div key={idx} style={styles.indicator}>
                <div style={styles.statusDot(ind.status)} />
                <span>{ind.label}</span>
                <HelpIcon help={ind.help} label={`${ind.label} help`} theme={theme} />
              </div>
            ))}
          </div>

          <div style={styles.footerRight}>
            {config.footer?.right || "v0.1.0"}
            <HelpIcon help={config.footer?.help} label="Footer help" theme={theme} />
          </div>
        </div>
      </div>

      {/* Action Launcher Overlay */}
      {actionTarget && (
        <ActionLauncher
          item={actionTarget}
          onClose={handleActionClose}
          getStarterPrompt={config.getStarterPrompt}
          actionLabel={config.actionLabel || "Start Session"}
          theme={theme}
          dispatcher={config.dispatcher}
          dispatcherIdentity={dispatcherIdentity}
          dispatcherStatus={dispatcherStatus}
          taskTemplates={config.taskTemplates || []}
          onSubmit={handleAssignmentSubmit}
          help={config.data?.help?.actionLauncher || config.help?.actionLauncher}
        />
      )}
    </>
  );
}

function normalizeImports(imports, identity) {
  return imports.map((entry) => ({
    id: entry.id,
    source: entry.source || "manual_csv",
    name: entry.filename || entry.entity_type || "Manual import",
    status: entry.status || "validated",
    records: entry.row_count || 0,
    exceptions: Array.isArray(entry.exceptions) ? entry.exceptions.length : 0,
    branch: identity?.branch?.name || entry.branch_id,
    summary: `${entry.entity_type || "records"} import`,
    nextAction: entry.status === "validated",
  }));
}

function normalizeCases(cases) {
  return cases.map((entry) => ({
    id: entry.id,
    ref: entry.property_ref || entry.contact_ref || entry.id,
    title: entry.title,
    stage: entry.status || "open",
    priority: entry.priority || "normal",
    client: entry.contact_ref,
    property: entry.property_ref,
    nextMilestone: entry.next_milestone || entry.case_type || entry.type,
    due: entry.due,
    summary: entry.summary,
    risks: entry.risk_flags || [],
  }));
}

function normalizeApprovals(approvals) {
  return approvals.map((entry) => ({
    id: entry.id,
    gate: entry.kind || "approval",
    title: entry.proposed_action || entry.kind || "Approval",
    status: entry.status || "pending",
    caseRef: entry.case_id || entry.task_id || "unlinked",
    approver: entry.decided_by_user_id || entry.decided_by || "human gate",
    due: entry.due,
    reason: entry.policy_reason,
    requester: entry.requester || entry.requester_user_id,
    scope: entry.scope || entry.team_id || entry.use_case_id,
    consequence: entry.consequence || entry.policy_reason,
  }));
}

function normalizeAuditEvents(events) {
  return events.map((entry) => ({
    id: entry.id,
    at: entry.created_at || entry.at,
    action: entry.event_type || entry.action,
    actor: entry.actor_user_id || entry.actor_id || entry.actor,
    target: entry.entity_id || entry.metadata?.case_id || entry.metadata?.task_id || entry.metadata?.approval_id || entry.branch_id,
    status: entry.status || "logged",
    summary: entry.summary || (typeof entry.metadata === "object" ? JSON.stringify(entry.metadata) : ""),
  }));
}

function normalizeOnboarding(onboarding) {
  if (!onboarding) return null;
  if (typeof onboarding === "string") {
    return { title: "Onboarding", body: onboarding };
  }
  return {
    title: onboarding.title || "Onboarding",
    body: onboarding.body || onboarding.description || onboarding.help,
  };
}

export default Bridge;
