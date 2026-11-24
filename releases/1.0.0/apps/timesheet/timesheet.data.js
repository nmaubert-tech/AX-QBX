(function (global) {
    "use strict";

    function f(record, id) { return global.jQuery(record).find("f#" + id).text(); }
    function num(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }
    function qbDate(value) {
        if (!value) { return null; }
        var d;
        if (/^\d+$/.test(String(value))) {
            d = new Date(parseInt(value, 10));
            if (isNaN(d.getTime())) { return null; }
            d = new Date(d.getTime() + (d.getTimezoneOffset() * 60000));
            d.setHours(0,0,0,0);
            return d;
        }
        d = new Date(value);
        if (isNaN(d.getTime())) { return null; }
        d.setHours(0,0,0,0);
        return d;
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

    function taskFromRecord(state, record) {
        var t = state.config.fields.tasks;
        return {
            id:f(record,t.id), taskName:f(record,t.taskName), projectCode:f(record,t.projectCode),
            projectDescription:f(record,t.projectDescription), budgetedHours:num(f(record,t.budgetedHours)),
            assignedHours:num(f(record,t.assignedHours)), remainingHours:num(f(record,t.remainingHours)),
            loadedRemainingHours:num(f(record,t.remainingHours)),
            projectType:f(record,t.projectType) || "Other",
            startDate:qbDate(f(record,t.startDate)), endDate:qbDate(f(record,t.endDate)),
            lastEntryDate:qbDate(f(record,t.lastEntryDate)), status:f(record,t.status),
            allowOverbudget:f(record,t.allowOverbudget)==="1",
            allowOvertime:f(record,t.allowOvertime)==="1", historicalOnly:false
        };
    }

    function loadTasks(state) {
        var c = state.config, t = c.fields.tasks, resource = state.context.selectedResourceId;
        if (!resource) { state.tasks = []; return Promise.resolve([]); }
        var clist = [t.id,t.taskName,t.projectCode,t.projectDescription,t.budgetedHours,t.assignedHours,t.projectType,t.startDate,t.endDate,t.status,t.remainingHours,t.allowOverbudget,t.lastEntryDate,t.allowOvertime].join(".");
        var query = "{" + t.assignedUser + ".TV.'" + resource + "'}AND{" + t.active + ".EX.'1'}";
        return global.AxialQB.quickbase.doQuery({
            dbid:alias(c.tableAliases.tasks),appToken:c.appToken,query:query,
            clist:clist,slist:(c.taskSortFields||[]).join("."),options:"sortorder-D",
            eventName:"timesheet.tasks.failed"
        }).then(function(result) {
            var rows=[], known={};
            global.jQuery(result.data).find("record").each(function() {
                var task=taskFromRecord(state,this);
                if (!known[task.id]) { known[task.id]=true; rows.push(task); }
            });

            // Entries are loaded before tasks. Rehydrate their referenced tasks,
            // including inactive or unassigned historical tasks, for display only.
            var missing=Object.keys(state.entries||{}).filter(function(id) {
                return id && !known[id] && (state.entries[id]||[]).some(function(e) { return !!e.date; });
            });
            var batches=[];
            for (var i=0;i<missing.length;i+=30) { batches.push(missing.slice(i,i+30)); }
            return batches.reduce(function(chain,ids) {
                return chain.then(function() {
                    var byId="(" + ids.map(function(id) {
                        return "{" + t.id + ".EX.'" + String(id).replace(/'/g,"\\'") + "'}";
                    }).join("OR") + ")";
                    return global.AxialQB.quickbase.doQuery({
                        dbid:alias(c.tableAliases.tasks),appToken:c.appToken,
                        query:byId,clist:clist,eventName:"timesheet.historical.tasks.failed"
                    }).then(function(result) {
                        global.jQuery(result.data).find("record").each(function() {
                            var task=taskFromRecord(state,this);
                            if (!known[task.id]) {
                                task.historicalOnly=true;
                                known[task.id]=true; rows.push(task);
                            }
                        });
                    });
                });
            },Promise.resolve()).then(function() {
                // Never silently discard entries when a referenced task was deleted
                // or the user cannot access its metadata.
                state.unresolvedTaskIds=missing.filter(function(id) { return !known[id]; });
                state.tasks=rows;
                return rows;
            });
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