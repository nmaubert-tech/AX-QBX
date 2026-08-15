(function (global) {
    "use strict";

    function f(record, id) { return global.jQuery(record).find("f#" + id).text(); }
    function num(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }
    function qbDate(value) {
        if (!value) { return null; }
        if (/^\d+$/.test(String(value))) { return new Date(parseInt(value, 10)); }
        var d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    function alias(name) {
        if (!global.aliasMap || !global.aliasMap[name]) { throw new Error("Missing Quickbase alias: " + name); }
        return global.aliasMap[name];
    }
    function quote(value) { return String(value == null ? "" : value).replace(/'/g, "\\'"); }
    function normalize(value) { return String(value || "").trim().toLowerCase(); }
    function matchesIdentity(value, user) {
        var hay = normalize(value);
        if (!hay || !user) { return false; }
        return (!!user.id && hay.indexOf(normalize(user.id)) >= 0) || (!!user.login && hay.indexOf(normalize(user.login)) >= 0);
    }
    function hasValue(value) { return String(value || "").trim().length > 0; }
    function identityValues(user) {
        var values = user ? [user.login, user.id] : [];
        return values.filter(function (value) { return hasValue(value); }).map(String).filter(function (value, index, all) { return all.indexOf(value) === index; });
    }
    function userFieldClauses(fid, user) {
        return identityValues(user).map(function (identity) { return "{" + fid + ".TV.'" + quote(identity) + "'}"; });
    }

    function selectedPeriod(state) { return state.periods[state.currentIndex]; }

    function baseWeekQuery(state) {
        var e = state.config.fields.entries, p = selectedPeriod(state);
        return "{" + e.date + ".GTE.'" + p.start.toDateString() + "'}AND{" + e.date + ".LTE.'" + p.end.toDateString() + "'}AND({" + e.standardHours + ".GT.'0'}OR{" + e.overtimeHours + ".GT.'0'})";
    }

    function projectScopeQuery(state) {
        var a = state.config.entryLookups;
        var clauses = userFieldClauses(a.projectLead, state.user)
            .concat(userFieldClauses(a.resourceApprover, state.user))
            .concat(userFieldClauses(a.resourceApproverBackup, state.user));
        if (!clauses.length) { throw new Error("The logged-in Quickbase user does not have a usable approval identity."); }
        return "(" + clauses.join("OR") + ")AND" + baseWeekQuery(state);
    }

    function payrollScopeQuery(state) {
        if (state.isPayrollApprover) { return baseWeekQuery(state); }
        var a = state.config.entryLookups;
        var clauses = userFieldClauses(a.resourceApprover, state.user).concat(userFieldClauses(a.resourceApproverBackup, state.user));
        if (!clauses.length) { throw new Error("The logged-in Quickbase user does not have a usable payroll approval identity."); }
        return "(" + clauses.join("OR") + ")AND" + baseWeekQuery(state);
    }

    function clist(state) {
        var e = state.config.fields.entries, a = state.config.entryLookups;
        return [
            e.id, e.task, e.standardHours, e.standardNote, e.overtimeHours, e.internalComment,
            e.date, e.approved, e.payrollApproved, e.resource,
            a.projectCode, a.projectDescription, a.taskName, a.resourceName,
            a.projectLead, a.resourceApprover, a.resourceApproverBackup
        ].filter(Boolean).join(".");
    }

    function parseEntry(state, record) {
        var e = state.config.fields.entries, a = state.config.entryLookups;
        var date = qbDate(f(record, e.date));
        if (date) { date.setHours(0, 0, 0, 0); }
        return {
            id: f(record, e.id),
            taskId: f(record, e.task),
            resourceId: f(record, e.resource),
            resourceName: f(record, a.resourceName),
            projectCode: f(record, a.projectCode),
            projectDescription: f(record, a.projectDescription),
            taskName: f(record, a.taskName),
            projectLead: f(record, a.projectLead),
            resourceApprover: f(record, a.resourceApprover),
            resourceApproverBackup: f(record, a.resourceApproverBackup),
            standardHours: num(f(record, e.standardHours)),
            overtimeHours: num(f(record, e.overtimeHours)),
            standardNote: f(record, e.standardNote),
            internalComment: f(record, e.internalComment),
            date: date,
            approved: f(record, e.approved) === "1",
            payrollApproved: f(record, e.payrollApproved) === "1"
        };
    }

    function isProjectEligible(state, entry) {
        if (hasValue(entry.projectLead)) { return matchesIdentity(entry.projectLead, state.user); }
        return matchesIdentity(entry.resourceApprover, state.user) || matchesIdentity(entry.resourceApproverBackup, state.user);
    }

    function hasPayrollScope(state, entry) {
        return state.isPayrollApprover || matchesIdentity(entry.resourceApprover, state.user) || matchesIdentity(entry.resourceApproverBackup, state.user);
    }

    function isPayrollEligible(state, entry) {
        if (!hasPayrollScope(state, entry) || entry.payrollApproved) { return false; }
        return state.config.allowPayrollWithoutPmApproval || entry.approved;
    }

    function loadEntries(state) {
        var query = state.view === "payroll" ? payrollScopeQuery(state) : projectScopeQuery(state);
        return global.AxialQB.quickbase.doQuery({
            dbid: alias(state.config.tableAliases.timeEntries),
            appToken: state.config.appToken,
            query: query,
            clist: clist(state),
            slist: state.config.entryLookups.projectCode,
            eventName: "timesheet.approvals.entries.failed",
            errorMessage: "Unable to load the timesheet approval queue"
        }).then(function (result) {
            var rows = [];
            global.jQuery(result.data).find("record").each(function () { rows.push(parseEntry(state, this)); });
            rows.forEach(function (entry) {
                entry.projectEligible = isProjectEligible(state, entry);
                entry.payrollEligible = isPayrollEligible(state, entry);
            });
            state.entries = rows;
            return rows;
        });
    }

    function selectedEntries(state) {
        return state.entries.filter(function (entry) { return !!state.selected[entry.id]; });
    }

    function ridQuery(idField, ids) {
        return "(" + ids.map(function (id) { return "{" + idField + ".EX.'" + quote(id) + "'}"; }).join("OR") + ")";
    }

    function recheck(state, entries) {
        if (!entries.length) { return Promise.resolve({}); }
        var e = state.config.fields.entries;
        return global.AxialQB.quickbase.doQuery({
            dbid: alias(state.config.tableAliases.timeEntries), appToken: state.config.appToken,
            query: ridQuery(e.id, entries.map(function (entry) { return entry.id; })),
            clist: [e.id, e.approved, e.payrollApproved, state.config.entryLookups.projectLead, state.config.entryLookups.resourceApprover, state.config.entryLookups.resourceApproverBackup].join("."),
            eventName: "timesheet.approvals.recheck.failed",
            errorMessage: "Unable to verify the selected approval records"
        }).then(function (result) {
            var map = {};
            global.jQuery(result.data).find("record").each(function () {
                map[f(this, e.id)] = {
                    approved: f(this, e.approved) === "1",
                    payrollApproved: f(this, e.payrollApproved) === "1",
                    projectLead: f(this, state.config.entryLookups.projectLead),
                    resourceApprover: f(this, state.config.entryLookups.resourceApprover),
                    resourceApproverBackup: f(this, state.config.entryLookups.resourceApproverBackup)
                };
            });
            return map;
        });
    }

    function auditFields(state, stage) {
        var a = state.config.auditFields || {}, out = {}, now = new Date().toISOString();
        if (stage === "project") {
            if (a.pmApprovedBy) { out[a.pmApprovedBy] = state.user.id || state.user.login; }
            if (a.pmApprovedOn) { out[a.pmApprovedOn] = now; }
        } else {
            if (a.payrollApprovedBy) { out[a.payrollApprovedBy] = state.user.id || state.user.login; }
            if (a.payrollApprovedOn) { out[a.payrollApprovedOn] = now; }
        }
        return out;
    }

    function approveSelected(state) {
        var selected = selectedEntries(state), e = state.config.fields.entries;
        if (!selected.length) { return Promise.resolve(0); }

        return recheck(state, selected).then(function (fresh) {
            selected.forEach(function (entry) {
                var row = fresh[entry.id];
                if (!row) { throw new Error("One or more selected Time Entries no longer exist. Reload the queue."); }
                if (state.view === "project") {
                    var freshProjectEligible = hasValue(row.projectLead) ? matchesIdentity(row.projectLead, state.user) : (matchesIdentity(row.resourceApprover, state.user) || matchesIdentity(row.resourceApproverBackup, state.user));
                    if (!freshProjectEligible || row.approved || row.payrollApproved) { throw new Error("The selected project approval set or approval authority changed after it was loaded. Reload and review it again."); }
                } else {
                    var freshPayrollScope = state.isPayrollApprover || matchesIdentity(row.resourceApprover, state.user) || matchesIdentity(row.resourceApproverBackup, state.user);
                    if (!freshPayrollScope || row.payrollApproved || (!state.config.allowPayrollWithoutPmApproval && !row.approved)) {
                        throw new Error("The selected payroll approval set or approval authority changed after it was loaded. Reload and review it again.");
                    }
                }
            });

            return Promise.all(selected.map(function (entry) {
                var fields = auditFields(state, state.view);
                fields[state.view === "project" ? e.approved : e.payrollApproved] = "1";
                return global.AxialQB.quickbase.editRecord({
                    dbid: alias(state.config.tableAliases.timeEntries), appToken: state.config.appToken,
                    rid: entry.id, fields: fields,
                    eventName: "timesheet.approvals.approve.failed",
                    errorMessage: "Unable to approve Time Entry " + entry.id
                });
            }));
        }).then(function () { return selected.length; });
    }

    function returnSupported(state) {
        var a = state.config.auditFields || {};
        return !!a.returnReason;
    }

    function returnSelected(state, reason) {
        var selected = selectedEntries(state), e = state.config.fields.entries, a = state.config.auditFields || {};
        if (!selected.length) { return Promise.resolve(0); }
        if (!returnSupported(state)) { return Promise.reject(new Error("Return fields are not configured for this Quickbase app.")); }
        if (!String(reason || "").trim()) { return Promise.reject(new Error("A return reason is required.")); }

        return Promise.all(selected.map(function (entry) {
            var fields = {};
            fields[a.returnReason] = String(reason).trim();
            if (a.returnedBy) { fields[a.returnedBy] = state.user.id || state.user.login; }
            if (a.returnedOn) { fields[a.returnedOn] = new Date().toISOString(); }
            fields[e.approved] = "0";
            fields[e.payrollApproved] = "0";
            return global.AxialQB.quickbase.editRecord({
                dbid: alias(state.config.tableAliases.timeEntries), appToken: state.config.appToken,
                rid: entry.id, fields: fields,
                eventName: "timesheet.approvals.return.failed",
                errorMessage: "Unable to return Time Entry " + entry.id
            });
        })).then(function () { return selected.length; });
    }

    global.AxialTimesheetApprovalsData = {
        loadEntries: loadEntries,
        selectedEntries: selectedEntries,
        approveSelected: approveSelected,
        returnSelected: returnSelected,
        returnSupported: returnSupported
    };
}(window));
