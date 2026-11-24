(function (global) {
    "use strict";

    var $ = global.jQuery;
    var config = global.AxialTimesheetApprovalsConfig;

    function bootstrapFailure(message) {
        var root = global.document && global.document.getElementById("timesheet-container");
        var loading = global.document && global.document.getElementById("loadingState");
        var user = global.document && global.document.getElementById("statusApprovalUser");
        if (loading) { loading.style.display = "none"; loading.textContent = ""; }
        if (user) { user.textContent = "Load failed"; }
        if (root) { root.innerHTML = "<div class='error-state'>Timesheet Approvals failed to initialize. " + String(message || "Unknown bootstrap error") + "</div>"; }
        if (global.console && global.console.error) { global.console.error("[Timesheet Approvals bootstrap]", message); }
    }

    if (!$) { bootstrapFailure("jQuery is not available."); return; }
    if (!global.AxialQB || !global.AxialQB.context || !global.AxialQB.logger || !global.AxialQB.quickbase) {
        bootstrapFailure("Shared Axial Quickbase runtime packages did not initialize.");
        return;
    }
    if (!config) {
        bootstrapFailure("Timesheet Approvals configuration did not initialize. Check TimesheetPrivateConfig.js and the approval field mapping.");
        return;
    }
    if (!global.AxialTimesheetApprovalsData || !global.AxialTimesheetApprovalsView) {
        bootstrapFailure("Timesheet Approvals data/view modules did not initialize.");
        return;
    }

    // The URL selects the review workflow. Missing or invalid mode defaults to Payroll.
    // The mode is fixed for the lifetime of this page, not controlled by a dropdown.
    function initialMode() {
        var requested = new URLSearchParams(global.location.search || "").get("mode");
        return String(requested || "").toLowerCase() === "project" ? "project" : "payroll";
    }
    var pageMode = initialMode();
    // The shared context runtime reads AXIAL_PAGE_CONFIG.mode before config.mode.
    // Synchronize it so diagnostics and the visible workflow agree.
    if (global.AXIAL_PAGE_CONFIG) { global.AXIAL_PAGE_CONFIG.mode = pageMode; }
    var context = global.AxialQB.context.create({
        application: "timesheet-approvals", version: config.version,
        allowedModes: ["project", "payroll"], mode: pageMode
    });
    var state = { config: config, context: context, user: null, periods: [], currentIndex: 0,
        view: pageMode, entries: [], selected: {}, isPayrollApprover: false };

    function logger() { return global.AxialQB.logger; }
    function revealPage() {
        // The initial-paint gate is inline in Quickbase page 179's <head>.
        // Release the gate only after the preview CSS and queue initialization finish.
        global.document.documentElement.classList.add("axial-approvals-ready");
    }
    function installPreviewStyles() {
        return new Promise(function (resolve, reject) {
            var base = global.AXIAL_PAGE_CONFIG && global.AXIAL_PAGE_CONFIG.assetBase;
            if (!base) { reject(new Error("Timesheet Approvals preview stylesheet base is missing.")); return; }
            var existing = global.document.getElementById("axial-approvals-preview-style");
            if (existing && existing.dataset.loaded === "true") { resolve(); return; }
            var link = existing || global.document.createElement("link");
            if (!existing) {
                link.id = "axial-approvals-preview-style";
                link.rel = "stylesheet";
                link.href = String(base).replace(/[/]$/, "") + "/assets/css/Timesheet_Approvals.css";
            }
            link.addEventListener("load", function () { link.dataset.loaded = "true"; resolve(); }, { once: true });
            link.addEventListener("error", function () {
                reject(new Error("Timesheet Approvals preview stylesheet failed to load."));
            }, { once: true });
            if (!existing) { global.document.head.appendChild(link); }
        });
    }
    function homeUrl() {
        var appId = String(global.location.pathname || "").split("/").filter(Boolean).pop();
        if (!/^b[a-z0-9]{8}$/i.test(appId)) { throw new Error("Unable to determine the Quickbase application home URL."); }
        return "/db/" + encodeURIComponent(appId) + "?a=td";
    }
    function setBusy(message) { $("#loadingState").text(message || "").toggle(!!message); }
    function matchesAllowedUser(user) {
        return config.payrollApproverUserIds.some(function (value) {
            var test = String(value || "").trim().toLowerCase();
            return test && (test === String(user.id || "").toLowerCase() || test === String(user.login || "").toLowerCase());
        });
    }

    function buildPeriods() {
        var future = Number(config.weekRange.future || 0), past = Number(config.weekRange.past || 0);
        state.periods = [];
        for (var i = -future; i <= past; i++) {
            var start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (7 * i)); start.setDate(start.getDate() - start.getDay());
            var end = new Date(start); end.setDate(end.getDate() + 6);
            state.periods.push({ start: new Date(start), end: end });
        }
        state.currentIndex = future;
    }

    function periodLabel(period) { return period.start.toDateString() + " – " + period.end.toDateString(); }

    function initWeeks() {
        buildPeriods();
        var $selector = $("#weekSelector").empty();
        state.periods.forEach(function (period, index) { $selector.append("<option value='" + index + "'>" + periodLabel(period) + "</option>"); });
        $selector.val(String(state.currentIndex));
    }

    function clearSelection() { state.selected = {}; }

    function reload() {
        setBusy("Loading approval queue…");
        clearSelection();
        return global.AxialTimesheetApprovalsData.loadEntries(state).then(function () {
            setBusy("");
            global.AxialTimesheetApprovalsView.render(state);
        }).catch(function (error) {
            setBusy("");
            logger().error("timesheet.approvals.load.failed", error.message, error.details || {});
            $("#timesheet-container").html("<div class='error-state'>Timesheet approvals could not be loaded. " + String(error.message || "") + " Correlation ID: " + context.correlationId + "</div>");
        });
    }

    function changeWeek(index) {
        index = Math.max(0, Math.min(state.periods.length - 1, index));
        if (index === state.currentIndex) { return; }
        state.currentIndex = index;
        $("#weekSelector").val(String(index));
        reload();
    }

    function approveSelected() {
        var selected = global.AxialTimesheetApprovalsData.selectedEntries(state);
        if (!selected.length) { return; }
        var action = state.view === "payroll" ? "payroll approve" : "approve";
        if (!global.confirm("" + action.charAt(0).toUpperCase() + action.slice(1) + " " + selected.length + " selected Time Entr" + (selected.length === 1 ? "y" : "ies") + "?")) { return; }
        $("#approveSelectedButton").prop("disabled", true).text("Approving…");
        global.AxialTimesheetApprovalsData.approveSelected(state).then(function (count) {
            logger().info("timesheet.approvals.approved", "Timesheet approval completed", { stage: state.view, count: count });
            return reload();
        }).catch(function (error) {
            logger().error("timesheet.approvals.approve.failed", error.message, error.details || {});
            global.alert(error.message + "\n\nCorrelation ID: " + context.correlationId);
            global.AxialTimesheetApprovalsView.render(state);
        });
    }

    function openReturn() {
        if (!global.AxialTimesheetApprovalsData.returnSupported(state)) { return; }
        $("#approvalReturnReason").val("");
        $("#approvalReturnModal").modal();
    }

    function returnSelected() {
        var reason = String($("#approvalReturnReason").val() || "").trim();
        if (!reason) { global.alert("A return reason is required."); return; }
        $("#confirmReturnButton").prop("disabled", true).text("Returning…");
        global.AxialTimesheetApprovalsData.returnSelected(state, reason).then(function (count) {
            logger().info("timesheet.approvals.returned", "Timesheet entries returned for correction", { stage: state.view, count: count });
            $("#approvalReturnModal").modal("hide");
            return reload();
        }).catch(function (error) {
            logger().error("timesheet.approvals.return.failed", error.message, error.details || {});
            global.alert(error.message + "\n\nCorrelation ID: " + context.correlationId);
        }).then(function () { $("#confirmReturnButton").prop("disabled", false).text("Return Selected"); });
    }

    function bind() {
        $("#weekSelector").on("change", function () { changeWeek(parseInt(this.value, 10)); });
        $("#prevWeekBtn").on("click", function () { changeWeek(state.currentIndex + 1); });
        $("#nextWeekBtn").on("click", function () { changeWeek(state.currentIndex - 1); });
        $("#todayBtn").on("click", function () { changeWeek(Number(config.weekRange.future || 0)); });

        $("#approvalStatusFilter,#approvalSearch").on("change input", function () { clearSelection(); global.AxialTimesheetApprovalsView.render(state); });
        $("#approveSelectedButton").on("click", approveSelected);
        $("#returnSelectedButton").on("click", openReturn);
        $("#confirmReturnButton").on("click", returnSelected);
        $("#homeButton").on("click", function () {
            try { global.location.assign(homeUrl()); }
            catch (error) { logger().error("timesheet.approvals.home.failed", error.message); global.alert(error.message); }
        });
    }

    function start() {
        logger().configure({ contextProvider: function () { return context; } });
        logger().installGlobalHandlers();
        // Keep the queue out of view until the preview styling is fully loaded.
        var root = global.document.getElementById("timesheet-container");
        if (root) { root.style.visibility = "hidden"; }
        setBusy("Loading Timesheet Approvals…");
        return installPreviewStyles().then(function () {
            // The old selector may still exist in an earlier Quickbase HTML page.
            // Remove it rather than allowing a visual mode switch without a URL reload.
            $("#approvalView").remove();
            // Show the full timecard by default; filters only narrow the display.
            $("#approvalStatusFilter").val("all");
            initWeeks();
            bind();
            // The styled shell is ready. Reveal it before network-bound Quickbase requests.
            if (root) { root.style.visibility = ""; }
            revealPage();
            setBusy("Loading Timesheet Approvals…");
            return Promise.all([
                global.AxialQB.quickbase.getCurrentUserInfo(config.appToken),
                global.AxialTimesheetApprovalsData.resolveTimeEntriesTable(state)
            ]);
        }).then(function (results) {
            var user = results[0];
            state.user = user;
            context.loggedInUserId = user.id;
            state.isPayrollApprover = matchesAllowedUser(user);
            if (!global.AxialTimesheetApprovalsData.returnSupported(state)) {
                $("#returnSelectedButton").prop("disabled", true).attr("title", "Return workflow requires configured audit fields.");
            }
            return reload();
        }).then(function () {
            revealPage();
        }).catch(function (error) {
            if (root) { root.style.visibility = ""; }
            revealPage();
            setBusy("");
            logger().error("timesheet.approvals.bootstrap.failed", error.message, error.details || {});
            $("#timesheet-container").text("Timesheet approvals could not initialize. " + String(error.message || "") + " Correlation ID: " + context.correlationId).addClass("error-state");
        });
    }

    global.AxialTimesheetApprovals = { state: state, start: start, reload: reload };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
}(window));
