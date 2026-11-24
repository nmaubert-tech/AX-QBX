(function (global) {
    "use strict";

    function f(record, id) { return global.jQuery(record).find("f#" + id).text(); }
    function num(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }
    function qbDate(value) {
        if (value == null || String(value).trim() === "") { return null; }
        var raw = String(value).trim(), match, date, year, month, day;
        // Date-only Quickbase timestamps are UTC midnight. Read the UTC calendar
        // components, then create a local date for timesheet column matching.
        if (/^\\d+$/.test(raw)) {
            date = new Date(Number(raw));
            return isNaN(date.getTime()) ? null :
                new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        }
        match = /^(\\d{4})-(\\d{2})-(\\d{2})(?:$|[T ])/.exec(raw);
        if (match) {
            year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);
            date=new Date(year,month-1,day);
            return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?date:null;
        }
        date = new Date(raw);
        return isNaN(date.getTime()) ? null :
            new Date(date.getFullYear(),date.getMonth(),date.getDate());
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
            // Always account for loaded entries, even if a linked Task is missing,
            // inactive, or inaccessible. Such rows are display-only.
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
                state.unresolvedTaskIds=Object.keys(state.entries||{}).filter(function(id) {
                    return !known[id] && (state.entries[id]||[]).length;
                });
                state.unresolvedTaskIds.forEach(function(id) {
                    known[id]=true;
                    rows.push({
                        id:id,taskName:"Unresolved task (read-only)",
                        projectCode:id?"Task ID "+id:"Missing task reference",
                        projectDescription:"Linked Task record unavailable; entered hours are retained for display.",
                        budgetedHours:0,assignedHours:0,remainingHours:0,loadedRemainingHours:0,
                        projectType:"Historical entries",startDate:null,endDate:null,lastEntryDate:null,
                        status:"Unavailable",allowOverbudget:false,allowOvertime:false,historicalOnly:true
                    });
                });
                state.tasks=rows;
                return rows;
            });
        });
    }

    function loadEntries(state) {
        var c = state.config, e = c.fields.entries, resource = state.context.selectedResourceId;
        var entries = {};
        if (!resource || !state.periods.length) { state.entries = entries; return Promise.resolve(entries); }
        // Fetch only the selected week. A multiweek query was unnecessarily large
        // and could return an incomplete selection of the currently visible week.
        var oldest = state.currentPeriod.start.toDateString();
        var newest = state.currentPeriod.end.toDateString();
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