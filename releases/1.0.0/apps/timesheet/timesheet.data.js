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

    function loadResources(state) {
        var c = state.config, r = c.fields.resources, user = state.context.loggedInUserId;
        var query = "({" + r.manager + ".TV.'" + user + "'}OR{" + r.alternateManager + ".TV.'" + user + "'}OR{" + r.supervisor + ".TV.'" + user + "'}OR{" + r.authorizedUsers + ".HAS.'" + user + "'})AND{" + r.active + ".EQ.'Yes'}";
        return global.AxialQB.quickbase.doQuery({ dbid: alias(c.tableAliases.resources), appToken: c.appToken, query: query, clist: [r.id, r.name, r.active].join("."), slist: r.name, options: "sortorder-A", eventName: "timesheet.resources.failed" }).then(function (result) {
            var rows = [];
            global.jQuery(result.data).find("record").each(function () { rows.push({ id: f(this, r.id), name: f(this, r.name), active: f(this, r.active) }); });
            state.resources = rows;
            return rows;
        });
    }

    function loadTasks(state) {
        var c = state.config, t = c.fields.tasks, resource = state.context.selectedResourceId;
        if (!resource) { state.tasks = []; return Promise.resolve([]); }
        var clist = [t.id,t.taskName,t.projectCode,t.projectDescription,t.budgetedHours,t.assignedHours,t.projectType,t.startDate,t.endDate,t.status,t.remainingHours,t.allowOverbudget,t.lastEntryDate,t.allowOvertime].join(".");
        var query = "{" + t.assignedUser + ".TV.'" + resource + "'}AND{" + t.active + ".EX.'1'}";
        return global.AxialQB.quickbase.doQuery({ dbid: alias(c.tableAliases.tasks), appToken: c.appToken, query: query, clist: clist, slist: (c.taskSortFields || []).join("."), options: "sortorder-D", eventName: "timesheet.tasks.failed" }).then(function (result) {
            var rows = [];
            global.jQuery(result.data).find("record").each(function () {
                rows.push({ id:f(this,t.id), taskName:f(this,t.taskName), projectCode:f(this,t.projectCode), projectDescription:f(this,t.projectDescription), budgetedHours:num(f(this,t.budgetedHours)), assignedHours:num(f(this,t.assignedHours)), remainingHours:num(f(this,t.remainingHours)), loadedRemainingHours:num(f(this,t.remainingHours)), projectType:f(this,t.projectType) || "Other", startDate:qbDate(f(this,t.startDate)), endDate:qbDate(f(this,t.endDate)), lastEntryDate:qbDate(f(this,t.lastEntryDate)), status:f(this,t.status), allowOverbudget:f(this,t.allowOverbudget)==="1", allowOvertime:f(this,t.allowOvertime)==="1" });
            });
            state.tasks = rows;
            return rows;
        });
    }

    function loadEntries(state) {
        var c = state.config, e = c.fields.entries, resource = state.context.selectedResourceId;
        var entries = {};
        if (!resource || !state.periods.length) { state.entries = entries; return Promise.resolve(entries); }
        var oldest = state.periods[state.periods.length - 1].start.toDateString();
        var newest = state.periods[0].end.toDateString();
        var query = "{" + e.resource + ".TV.'" + resource + "'}AND{" + e.date + ".LTE.'" + newest + "'}AND{" + e.date + ".GTE.'" + oldest + "'}";
        var clist = [e.id,e.task,e.standardHours,e.standardNote,e.overtimeHours,e.internalComment,e.date,e.approved,e.payrollApproved,e.resource].join(".");
        return global.AxialQB.quickbase.doQuery({ dbid: alias(c.tableAliases.timeEntries), appToken:c.appToken, query:query, clist:clist, slist:e.task, eventName:"timesheet.entries.failed" }).then(function (result) {
            global.jQuery(result.data).find("record").each(function () {
                var taskId = f(this,e.task), date = qbDate(f(this,e.date));
                if (date) { date.setHours(0,0,0,0); }
                if (!entries[taskId]) { entries[taskId] = []; }
                entries[taskId].push({ id:f(this,e.id), taskId:taskId, standardHours:f(this,e.standardHours), standardNote:f(this,e.standardNote), overtimeHours:f(this,e.overtimeHours), internalComment:f(this,e.internalComment), date:date, approved:f(this,e.approved)==="1", payrollApproved:f(this,e.payrollApproved)==="1", dirty:false });
            });
            state.entries = entries;
            return entries;
        });
    }

    function save(state) {
        var c=state.config,e=c.fields.entries,csv="";
        state.tasks.forEach(function(task){(state.entries[task.id]||[]).forEach(function(entry){
            if(!entry.dirty||entry.approved||entry.payrollApproved){return;}
            var id=entry.id&&String(entry.id).indexOf("new-")!==0?entry.id:"";
            var stdNote=String(entry.standardNote||"").replace(/"/g,'""');
            var comment=String(entry.internalComment||"").replace(/"/g,'""');
            csv += [id,entry.taskId,entry.standardHours||"",'"'+stdNote+'"',entry.overtimeHours||"",'"'+comment+'"',entry.date.getTime()].join(",")+"\n";
        });});
        if(!csv){return Promise.resolve(false);}
        return global.AxialQB.quickbase.importCsv({ dbid:alias(c.tableAliases.timeEntries),appToken:c.appToken,csv:csv, clist:[e.id,e.task,e.standardHours,e.standardNote,e.overtimeHours,e.internalComment,e.date].join("."), eventName:"timesheet.save.failed" }).then(function(){return true;});
    }

    global.AxialTimesheetData={loadResources:loadResources,loadTasks:loadTasks,loadEntries:loadEntries,save:save};
}(window));