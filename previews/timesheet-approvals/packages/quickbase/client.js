(function (global) {
    "use strict";

    function requireJQuery() {
        if (!global.jQuery) { throw new Error("AxialQB Quickbase client requires jQuery."); }
        return global.jQuery;
    }

    function parseQuickbaseError(xhr, textStatus, errorThrown) {
        return {
            status: xhr && xhr.status,
            statusText: xhr && xhr.statusText,
            textStatus: textStatus,
            errorThrown: String(errorThrown || ""),
            responseText: xhr && xhr.responseText ? String(xhr.responseText).slice(0, 2000) : ""
        };
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
                    var details = parseQuickbaseError(xhr, textStatus, errorThrown);
                    if (global.AxialQB && global.AxialQB.logger) {
                        global.AxialQB.logger.error(
                            options.eventName || "quickbase.request.failed",
                            options.errorMessage || "Quickbase request failed",
                            details
                        );
                    }
                    var error = new Error(options.errorMessage || "Quickbase request failed");
                    error.details = details;
                    reject(error);
                }
            });
        });
    }

    function getCurrentUserInfo(appToken) {
        return request({
            url: "/db/main?a=API_GetUserInfo&apptoken=" + encodeURIComponent(appToken || ""),
            eventName: "quickbase.user.failed",
            errorMessage: "Unable to resolve the logged-in Quickbase user"
        }).then(function (result) {
            var $ = requireJQuery();
            var $xml = $(result.data);
            var $user = $xml.find("user").first();
            var id = $user.attr("id") || "";
            var login = $xml.find("login").first().text() || $user.attr("login") || "";
            var name = $user.find("name").first().text() || $user.attr("name") || login || id;
            if (!id && !login) { throw new Error("Quickbase user response did not include a user identity."); }
            return { id: id, login: login, name: name };
        });
    }

    function getCurrentUser(appToken) {
        return getCurrentUserInfo(appToken).then(function (user) { return user.id; });
    }

    function doQuery(params) {
        var query = [
            "a=API_DoQuery",
            "query=" + encodeURIComponent(params.query || ""),
            "apptoken=" + encodeURIComponent(params.appToken || ""),
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
        var xml = "<qdbapi>"
            + "<records_csv><![CDATA[" + (params.csv || "") + "]]></records_csv>"
            + "<clist>" + params.clist + "</clist>"
            + "<skipfirst>0</skipfirst>"
            + "<apptoken>" + params.appToken + "</apptoken>"
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

    function xmlEscape(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    function editRecord(params) {
        var $ = requireJQuery();
        var xml = "<qdbapi><rid>" + xmlEscape(params.rid) + "</rid>";
        Object.keys(params.fields || {}).forEach(function (fid) {
            if (!fid || params.fields[fid] === undefined || params.fields[fid] === null) { return; }
            xml += "<field fid=\"" + xmlEscape(fid) + "\">" + xmlEscape(params.fields[fid]) + "</field>";
        });
        xml += "<apptoken>" + xmlEscape(params.appToken || "") + "</apptoken></qdbapi>";

        return request({
            method: "POST",
            url: "/db/" + params.dbid,
            data: xml,
            dataType: "xml",
            processData: false,
            contentType: "text/xml",
            headers: { "QUICKBASE-ACTION": "API_EditRecord" },
            eventName: params.eventName || "quickbase.edit.failed",
            errorMessage: params.errorMessage || "Quickbase record update failed"
        }).then(function (result) {
            var code = $(result.data).find("errcode").first().text();
            if (code && code !== "0") {
                var message = $(result.data).find("errtext").first().text() || ("Quickbase error " + code);
                throw new Error(message);
            }
            return result;
        });
    }

    global.AxialQB = global.AxialQB || {};
    global.AxialQB.quickbase = {
        request: request,
        getCurrentUser: getCurrentUser,
        getCurrentUserInfo: getCurrentUserInfo,
        doQuery: doQuery,
        importCsv: importCsv,
        editRecord: editRecord
    };
}(window));
