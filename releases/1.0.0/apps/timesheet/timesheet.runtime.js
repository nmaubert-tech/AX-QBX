(function (global) {
    "use strict";

    function getLogger() {
        return global.AxialQB && global.AxialQB.logger ? global.AxialQB.logger : null;
    }

    function getApplication() {
        return global.AxialTimesheet || null;
    }

    function configureLoggerCompatibility() {
        var logger = getLogger();
        if (logger && !logger.getEntries && logger.getRecords) {
            logger.getEntries = logger.getRecords;
        }
    }

    function downloadDiagnostics() {
        var logger = getLogger();
        if (logger) {
            logger.download("timesheet-diagnostics.json");
        }
    }

    function clearDiagnostics() {
        var logger = getLogger();
        if (logger) {
            logger.clear();
        }
        if (global.jQuery) {
            global.jQuery("#diagnosticsContent").text("");
            global.jQuery("#diagnosticsButton").hide();
        }
    }

    function closeDiagnostics() {
        if (global.jQuery) {
            global.jQuery("#diagnosticsPanel").hide();
        }
    }

    function goHome() {
        if (global.aliasMap && global.aliasMap.app_id) {
            global.location = global.aliasMap.app_id;
            return;
        }
        global.history.back();
    }

    function bindWrapperControls() {
        if (!global.jQuery) { return; }
        var $ = global.jQuery;

        $("#downloadDiagnosticsButton")
            .off("click.axialRuntime")
            .on("click.axialRuntime", downloadDiagnostics);

        $("#clearDiagnosticsButton")
            .off("click.axialRuntime")
            .on("click.axialRuntime", clearDiagnostics);

        $("#closeDiagnosticsButton")
            .off("click.axialRuntime")
            .on("click.axialRuntime", closeDiagnostics);

        $("#homeButton")
            .off("click.axialRuntime")
            .on("click.axialRuntime", goHome);
    }

    configureLoggerCompatibility();
    bindWrapperControls();

    global.addEventListener("beforeunload", function (event) {
        var app = getApplication();
        if (!app || !global.AxialTimesheetView) { return; }
        if (global.AxialTimesheetView.countDirty(app.state) > 0) {
            event.preventDefault();
            event.returnValue = "";
        }
    });

    global.downloadTimesheetDiagnostics = downloadDiagnostics;
    global.clearTimesheetDiagnostics = clearDiagnostics;
}(window));
