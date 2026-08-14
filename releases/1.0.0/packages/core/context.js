(function (global) {
    "use strict";

    function readQuery() {
        var params = {};
        var search = global.location && global.location.search ? global.location.search.substring(1) : "";
        if (!search) { return params; }

        search.split("&").forEach(function (part) {
            if (!part) { return; }
            var pair = part.split("=");
            var key = decodeURIComponent(pair[0] || "");
            var value = decodeURIComponent((pair.slice(1).join("=") || "").replace(/\+/g, " "));
            if (key) { params[key] = value; }
        });
        return params;
    }

    function createContext(config) {
        config = config || {};
        var pageConfig = global.AXIAL_PAGE_CONFIG || {};
        var query = readQuery();
        var allowedModes = pageConfig.allowedModes || config.allowedModes || ["self", "resource"];
        var requestedMode = query.mode || pageConfig.mode || config.mode || "self";
        var mode = allowedModes.indexOf(requestedMode) >= 0 ? requestedMode : "self";

        return {
            application: config.application || pageConfig.application || "unknown",
            version: config.version || pageConfig.version || "0.0.0-dev",
            environment: pageConfig.environment || config.environment || "development",
            pageName: global.location ? global.location.pathname.split("/").pop() : "",
            mode: mode,
            debug: query.debug === "1" || query.debug === "true" || pageConfig.debug === true || config.debug === true,
            requestedResourceId: query.userId || query.resourceId || null,
            loggedInUserId: null,
            selectedResourceId: null,
            selectedResourceName: null,
            weekIndex: null,
            weekStart: null,
            weekEnd: null,
            taskCount: 0,
            entryCount: 0,
            dirtyEntries: 0,
            correlationId: createCorrelationId(config.application || pageConfig.application || "APP")
        };
    }

    function createCorrelationId(prefix) {
        var now = new Date();
        var stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
        var random = Math.random().toString(36).slice(2, 8).toUpperCase();
        return String(prefix || "APP").toUpperCase() + "-" + stamp + "-" + random;
    }

    global.AxialQB = global.AxialQB || {};
    global.AxialQB.context = {
        create: createContext,
        readQuery: readQuery,
        createCorrelationId: createCorrelationId
    };
}(window));
