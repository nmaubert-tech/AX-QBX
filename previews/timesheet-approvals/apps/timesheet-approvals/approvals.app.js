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

    var context = global.AxialQB.context.create({ application: "timesheet-approvals", version: config.version, allowedModes: ["project", "payroll"], mode: "project" });
    var state = { config: config, context: context, user: null, periods: [], currentIndex: 0, view: "project", entries: [], selected: {}, isPayrollApprover: false };

    function logger() { return global.AxialQB.logger; }
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

    function changeView(view) {
        if (view !== "project" && view !== "payroll") { return; }
        state.view = view;
        $("#approvalView").val(view);
        $("#approvalStatusFilter").val("needs");
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
        $("#approvalView").on("change", function () { changeView(this.value); });
        $("#approvalStatusFilter,#approvalSearch").on("change input", function () { clearSelection(); global.AxialTimesheetApprovalsView.render(state); });
        $("#approveSelectedButton").on("click", approveSelected);
        $("#returnSelectedButton").on("click", openReturn);
        $("#confirmReturnButton").on("click", returnSelected);
        $("#homeButton").on("click", function () { if (global.aliasMap && global.aliasMap.app_id) { global.location = global.aliasMap.app_id; } });
    }

    function start() {
        logger().configure({ contextProvider: function () { return context; } });
        logger().installGlobalHandlers();
        initWeeks(); bind(); setBusy("Resolving Quickbase user…");

        global.AxialQB.quickbase.getCurrentUserInfo(config.appToken).then(function (user) {
            state.user = user;
            context.loggedInUserId = user.id;
            state.isPayrollApprover = matchesAllowedUser(user);
            if (!global.AxialTimesheetApprovalsData.returnSupported(state)) {
                $("#returnSelectedButton").prop("disabled", true).attr("title", "Return workflow requires configured audit fields.");
            }
            return reload();
        }).catch(function (error) {
            setBusy("");
            logger().error("timesheet.approvals.bootstrap.failed", error.message, error.details || {});
            $("#timesheet-container").html("<div class='error-state'>Timesheet approvals could not initialize. " + String(error.message || "") + " Correlation ID: " + context.correlationId + "</div>");
        });
    }

    global.AxialTimesheetApprovals = { state: state, start: start, reload: reload };
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", start); } else { start(); }
}(window));
