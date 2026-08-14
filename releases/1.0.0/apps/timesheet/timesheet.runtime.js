(function (global) {
    "use strict";

    function getLogger() { return global.AxialQB && global.AxialQB.logger ? global.AxialQB.logger : null; }
    function getApplication() { return global.AxialTimesheet || null; }
    function configureLoggerCompatibility() { var logger = getLogger(); if (logger && !logger.getEntries && logger.getRecords) { logger.getEntries = logger.getRecords; } }

    function downloadDiagnostics() {
        var logger = getLogger();
        if (logger && typeof logger.download === "function") { logger.download("timesheet-diagnostics.json"); }
    }

    function clearDiagnostics() {
        var logger = getLogger();
        if (logger && typeof logger.clear === "function") { logger.clear(); }
        if (global.jQuery) { global.jQuery("#diagnosticsContent").text(""); global.jQuery("#diagnosticsButton").hide(); }
    }

    function closeDiagnostics() { if (global.jQuery) { global.jQuery("#diagnosticsPanel").hide(); } }

    function applicationDbid() {
        var parts=(global.location.pathname||"").split("/").filter(function(x){return !!x;});
        var dbIndex=parts.indexOf("db");
        return dbIndex>=0&&parts[dbIndex+1]?parts[dbIndex+1]:"";
    }

    function goHome() {
        var pageConfig = global.AXIAL_PAGE_CONFIG || {};
        var env = global.AXIAL_TIMESHEET_ENV || {};
        var target = pageConfig.homeUrl || env.homeUrl || "";
        if (!target) {
            var dbid = applicationDbid();
            target = dbid ? "/db/" + encodeURIComponent(dbid) : "/";
        }
        global.location.href = target;
    }

    function bindWrapperControls() {
        if (!global.jQuery) { return; }
        var $ = global.jQuery;
        $("#downloadDiagnosticsButton").off("click.axialRuntime").on("click.axialRuntime", downloadDiagnostics);
        $("#clearDiagnosticsButton").off("click.axialRuntime").on("click.axialRuntime", clearDiagnostics);
        $("#closeDiagnosticsButton").off("click.axialRuntime").on("click.axialRuntime", closeDiagnostics);
        $("#homeButton").off("click.axialRuntime").on("click.axialRuntime", goHome);
    }

    configureLoggerCompatibility();
    bindWrapperControls();

    global.addEventListener("keydown", function (event) {
        if (event.ctrlKey && event.altKey && String(event.key || "").toLowerCase() === "d") {
            event.preventDefault();
            downloadDiagnostics();
        }
    });

    global.addEventListener("beforeunload", function (event) {
        var app = getApplication();
        if (!app || !global.AxialTimesheetView) { return; }
        if (global.AxialTimesheetView.countDirty(app.state) > 0) { event.preventDefault(); event.returnValue = ""; }
    });

    global.downloadTimesheetDiagnostics = downloadDiagnostics;
    global.clearTimesheetDiagnostics = clearDiagnostics;
}(window));