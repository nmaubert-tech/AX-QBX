(function (global) {
    "use strict";

    var TOKEN_KEY = "app" + "token";

    function requireJQuery() {
        if (!global.jQuery) { throw new Error("AxialQB Quickbase client requires jQuery."); }
        return global.jQuery;
    }

    function request(options) {
        var $ = requireJQuery();
        options = options || {};
        return new Promise(function (resolve, reject) {
            $.ajax({
                type: options.method || "GET",
                url: options.url,
                data: options.data,
                dataType: options.dataType || "xml",
                processData: options.processData !== false,
                contentType: options.contentType,
                headers: options.headers || {},
                timeout: options.timeout || 45000,
                success: function (data, textStatus, xhr) {
                    resolve({ data: data, textStatus: textStatus, xhr: xhr });
                },
                error: function (xhr, textStatus, errorThrown) {
                    var details = {
                        status: xhr && xhr.status,
                        statusText: xhr && xhr.statusText,
                        textStatus: textStatus,
                        errorThrown: String(errorThrown || ""),
                        responseText: xhr && xhr.responseText ? String(xhr.responseText).slice(0, 2000) : ""
                    };
                    if (global.AxialQB && global.AxialQB.logger) {
                        global.AxialQB.logger.error(options.eventName || "quickbase.request.failed", options.errorMessage || "Quickbase request failed", details);
                    }
                    var error = new Error(options.errorMessage || "Quickbase request failed");
                    error.details = details;
                    reject(error);
                }
            });
        });
    }

    function tokenPair(value) {
        return TOKEN_KEY + "=" + encodeURIComponent(value || "");
    }

    function requireVeilSun() {
        if (!global.QUICKBASE) {
            throw new Error("VeilSun Quickbase utilities are not available.");
        }
        return global.QUICKBASE;
    }

    function getCurrentUser(appToken) {
        var qb = requireVeilSun();
        if (typeof qb.getCurrentUserID !== "function") {
            throw new Error("VeilSun getCurrentUserID is not available.");
        }
        return Promise.resolve(qb.getCurrentUserID(appToken));
    }

    function getAppTables(appToken) {
        var qb = requireVeilSun();
        if (typeof qb.getAppTables !== "function") {
            throw new Error("VeilSun getAppTables is not available.");
        }
        return Promise.resolve(qb.getAppTables(appToken));
    }

    function doQuery(params) {
        var query = [
            "a=API_DoQuery",
            "query=" + encodeURIComponent(params.query || ""),
            tokenPair(params.appToken),
            "clist=" + encodeURIComponent(params.clist || ""),
            "useFids=1",
            "rand=" + Math.random()
        ];
        if (params.slist) { query.push("slist=" + encodeURIComponent(params.slist)); }
        if (params.options) { query.push("options=" + encodeURIComponent(params.options)); }
        return request({
            url: "/db/" + params.dbid + "?" + query.join("&"),
            eventName: params.eventName || "quickbase.query.failed",
            errorMessage: params.errorMessage || "Quickbase query failed"
        });
    }

    function importCsv(params) {
        var tokenTag = "<" + TOKEN_KEY + ">" + (params.appToken || "") + "</" + TOKEN_KEY + ">";
        var xml = "<qdbapi>"
            + "<records_csv><![CDATA[" + (params.csv || "") + "]]></records_csv>"
            + "<clist>" + params.clist + "</clist>"
            + "<skipfirst>0</skipfirst>"
            + tokenTag
            + "</qdbapi>";
        return request({
            method: "POST",
            url: "/db/" + params.dbid,
            data: xml,
            dataType: "xml",
            processData: false,
            contentType: "text/xml",
            headers: { "QUICKBASE-ACTION": "API_ImportFromCSV" },
            eventName: params.eventName || "quickbase.import.failed",
            errorMessage: params.errorMessage || "Quickbase CSV import failed"
        });
    }

    global.AxialQB = global.AxialQB || {};
    global.AxialQB.quickbase = {
        request: request,
        getCurrentUser: getCurrentUser,
        getAppTables: getAppTables,
        doQuery: doQuery,
        importCsv: importCsv
    };
}(window));