(function (global) {
    "use strict";

    var STORAGE_KEY = "axial.qb.clientErrors.v1";
    var MAX_RECORDS = 250;
    var contextProvider = function () { return {}; };
    var remoteSink = null;

    function safeClone(value) {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (e) { return { serializationError: String(e && e.message || e) }; }
    }

    function redact(value) {
        var blocked = /token|authorization|password|secret|records_csv|standard_note|internal_comment/i;
        if (Array.isArray(value)) { return value.map(redact); }
        if (!value || typeof value !== "object") { return value; }

        var copy = {};
        Object.keys(value).forEach(function (key) {
            copy[key] = blocked.test(key) ? "[REDACTED]" : redact(value[key]);
        });
        return copy;
    }

    function readStored() {
        try { return JSON.parse(global.localStorage.getItem(STORAGE_KEY) || "[]"); }
        catch (e) { return []; }
    }

    function writeStored(records) {
        try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS))); }
        catch (e) { /* Logging must never break the host page. */ }
    }

    function record(level, eventName, message, details) {
        var context = safeClone(contextProvider() || {});
        var item = {
            timestamp: new Date().toISOString(),
            level: level,
            event: eventName,
            message: String(message || ""),
            correlationId: context.correlationId || null,
            context: redact(context),
            details: redact(safeClone(details || {})),
            userAgent: global.navigator ? global.navigator.userAgent : ""
        };

        var records = readStored();
        records.push(item);
        writeStored(records);

        if (global.console && typeof global.console[level] === "function") {
            global.console[level]("[AxialQB] " + eventName + ": " + item.message, item);
        } else if (global.console && global.console.log) {
            global.console.log("[AxialQB]", item);
        }

        if (typeof remoteSink === "function") {
            try { remoteSink(item); }
            catch (sinkError) { /* Avoid recursive logging. */ }
        }
        return item;
    }

    function installGlobalHandlers() {
        global.addEventListener("error", function (event) {
            record("error", "window.error", event.message || "Unhandled browser error", {
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
                stack: event.error && event.error.stack
            });
        });

        global.addEventListener("unhandledrejection", function (event) {
            var reason = event.reason || {};
            record("error", "window.unhandledrejection", reason.message || String(reason), {
                stack: reason.stack
            });
        });
    }

    function exportPackage() {
        return {
            exportedAt: new Date().toISOString(),
            currentContext: redact(safeClone(contextProvider() || {})),
            errors: readStored()
        };
    }

    function download(filename) {
        var blob = new Blob([JSON.stringify(exportPackage(), null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename || "axial-qb-diagnostics.json";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    global.AxialQB = global.AxialQB || {};
    global.AxialQB.logger = {
        configure: function (options) {
            options = options || {};
            if (typeof options.contextProvider === "function") { contextProvider = options.contextProvider; }
            if (typeof options.remoteSink === "function") { remoteSink = options.remoteSink; }
        },
        installGlobalHandlers: installGlobalHandlers,
        debug: function (eventName, message, details) { return record("debug", eventName, message, details); },
        info: function (eventName, message, details) { return record("info", eventName, message, details); },
        warn: function (eventName, message, details) { return record("warn", eventName, message, details); },
        error: function (eventName, message, details) { return record("error", eventName, message, details); },
        getRecords: readStored,
        clear: function () { writeStored([]); },
        exportPackage: exportPackage,
        download: download,
        storageKey: STORAGE_KEY
    };
}(window));
