(function (global) {
    "use strict";

    var $ = global.jQuery;
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function esc(value) { return $("<div>").text(value == null ? "" : String(value)).html(); }
    function dateKey(date) {
        return date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-") : "";
    }
    function hours(entry) { return Number(entry.standardHours || 0) + Number(entry.overtimeHours || 0); }
    function totalHours(entries) { return entries.reduce(function (sum, entry) { return sum + hours(entry); }, 0); }
    function regularHours(entries) { return entries.reduce(function (sum, entry) { return sum + Number(entry.standardHours || 0); }, 0); }
    function overtimeHours(entries) { return entries.reduce(function (sum, entry) { return sum + Number(entry.overtimeHours || 0); }, 0); }
    function isEligible(state, entry) { return state.view === "payroll" ? entry.payrollEligible : entry.projectEligible && !entry.approved && !entry.payrollApproved; }

    function visibleEntries(state) {
        var filter = $("#approvalStatusFilter").val() || "needs";
        var search = String($("#approvalSearch").val() || "").toLowerCase().trim();
        return state.entries.filter(function (entry) {
            if (state.view === "project" && !entry.projectEligible) { return false; }
            if (filter === "needs" && !isEligible(state, entry)) { return false; }
            if (filter === "approved" && !entry.approved && !entry.payrollApproved) { return false; }
            if (search) {
                var hay = [entry.resourceName, entry.projectCode, entry.projectDescription, entry.taskName].join(" ").toLowerCase();
                if (hay.indexOf(search) < 0) { return false; }
            }
            return true;
        });
    }

    function groupProjects(entries) {
        var groups = {};
        entries.forEach(function (entry) {
            var key = (entry.projectCode || "No Project") + "|" + (entry.projectDescription || "");
            if (!groups[key]) { groups[key] = { code: entry.projectCode || "No Project", description: entry.projectDescription || "", entries: [] }; }
            groups[key].entries.push(entry);
        });
        return Object.keys(groups).sort().map(function (key) { return groups[key]; });
    }

    function groupEmployees(entries) {
        var groups = {};
        entries.forEach(function (entry) {
            var key = entry.resourceId || entry.resourceName || "Employee";
            if (!groups[key]) { groups[key] = { key: key, resourceName: entry.resourceName || entry.resourceId || "Employee", entries: [] }; }
            groups[key].entries.push(entry);
        });
        return Object.keys(groups).sort(function (a, b) { return groups[a].resourceName.localeCompare(groups[b].resourceName); }).map(function (key) { return groups[key]; });
    }

    function groupRows(entries) {
        var groups = {};
        entries.forEach(function (entry) {
            var key = (entry.resourceId || entry.resourceName) + "|" + entry.taskId;
            if (!groups[key]) {
                groups[key] = {
                    key: key,
                    resourceName: entry.resourceName || entry.resourceId || "Employee",
                    taskName: entry.taskName || "Task",
                    projectCode: entry.projectCode || "No Project",
                    projectDescription: entry.projectDescription || "",
                    entries: []
                };
            }
            groups[key].entries.push(entry);
        });
        return Object.keys(groups).sort(function (a, b) {
            if (groups[a].resourceName !== groups[b].resourceName) { return groups[a].resourceName.localeCompare(groups[b].resourceName); }
            if (groups[a].projectCode !== groups[b].projectCode) { return groups[a].projectCode.localeCompare(groups[b].projectCode); }
            return groups[a].taskName.localeCompare(groups[b].taskName);
        }).map(function (key) { return groups[key]; });
    }

    function weekHeader(state) {
        var p = state.periods[state.currentIndex], html = "<div class='ts-week-header'><table><colgroup>";
        html += "<col class='ts-col-code'><col class='ts-col-task'>";
        for (var c = 0; c < 7; c++) { html += "<col class='ts-col-day'>"; }
        html += "<col class='ts-col-budget'><col class='ts-col-total'></colgroup><thead><tr>";
        html += "<th class='ts-col-code'>Select</th><th class='ts-col-task'>" + (state.view === "payroll" ? "Project / Task" : "Employee / Task") + "</th>";
        for (var i = 0; i < 7; i++) {
            var d = new Date(p.start); d.setDate(d.getDate() + i);
            var classes = (i === 0 || i === 6) ? " weekend-col" : "";
            var today = new Date(); today.setHours(0, 0, 0, 0);
            if (d.getTime() === today.getTime()) { classes += " today-col"; }
            html += "<th class='day-col" + classes + "'><small>" + days[i] + "</small><b>" + d.getDate() + "</b></th>";
        }
        html += "<th>Status</th><th>Total</th></tr></thead></table></div>";
        return html;
    }

    function dayCell(state, row, date, index) {
        var key = dateKey(date), entries = row.entries.filter(function (entry) { return dateKey(entry.date) === key; });
        var classes = (index === 0 || index === 6) ? " weekend-col" : "";
        var today = new Date(); today.setHours(0, 0, 0, 0);
        if (date.getTime() === today.getTime()) { classes += " today-col"; }
        if (!entries.length) { return "<td class='ts-col-day" + classes + "'></td>"; }

        var html = "<td class='ts-col-day" + classes + "'>";
        entries.forEach(function (entry) {
            var eligible = isEligible(state, entry);
            html += "<div class='entry-line'>";
            if (eligible) { html += "<input class='approval-entry-select' type='checkbox' data-entry-id='" + esc(entry.id) + "' " + (state.selected[entry.id] ? "checked" : "") + ">"; }
            if (entry.standardHours) { html += "<strong>" + entry.standardHours.toFixed(1) + "</strong>"; }
            if (entry.overtimeHours) { html += " <span class='label label-default'>OT " + entry.overtimeHours.toFixed(1) + "</span>"; }
            if (entry.standardNote || entry.internalComment) { html += " <button type='button' class='note-btn has-note approval-note' data-entry-id='" + esc(entry.id) + "' title='View notes'>N</button>"; }
            html += "</div>";
        });
        html += "</td>";
        return html;
    }

    function rowHtml(state, row) {
        var p = state.periods[state.currentIndex], eligible = row.entries.filter(function (entry) { return isEligible(state, entry); });
        var selectedAll = eligible.length && eligible.every(function (entry) { return !!state.selected[entry.id]; });
        var allPayroll = row.entries.every(function (entry) { return entry.payrollApproved; });
        var allPm = row.entries.every(function (entry) { return entry.approved || entry.payrollApproved; });
        var rowStatus = allPayroll ? "Payroll" : (allPm ? "PM" : "Pending");
        var primary = state.view === "payroll" ? row.projectCode : row.resourceName;
        var secondary = row.taskName;
        var html = "<tr data-row-key='" + esc(row.key) + "'><td class='ts-col-code'>";
        if (eligible.length) { html += "<input class='approval-row-select' type='checkbox' data-row-key='" + esc(row.key) + "' " + (selectedAll ? "checked" : "") + ">"; }
        html += "</td><td class='ts-col-task'><div class='task-name'>" + esc(primary) + "</div><div class='project-description'>" + esc(secondary) + "</div></td>";
        for (var i = 0; i < 7; i++) { var d = new Date(p.start); d.setDate(d.getDate() + i); html += dayCell(state, row, d, i); }
        html += "<td class='budget-cell'>" + esc(rowStatus) + "</td><td class='task-total'>" + totalHours(row.entries).toFixed(1) + "</td></tr>";
        return html;
    }

    function tableBody(state, entries) {
        var rows = groupRows(entries), html = "<div class='table-responsive'><table class='timesheet-grid'><colgroup><col class='ts-col-code'><col class='ts-col-task'>";
        for (var c = 0; c < 7; c++) { html += "<col class='ts-col-day'>"; }
        html += "<col class='ts-col-budget'><col class='ts-col-total'></colgroup><tbody>";
        rows.forEach(function (row) { html += rowHtml(state, row); });
        html += "</tbody></table></div>";
        return html;
    }

    function projectCard(state, project) {
        var html = "<section class='project-card'>";
        html += "<div class='project-card__header'><strong>" + esc(project.code) + "</strong><span>" + esc(project.description) + " · " + totalHours(project.entries).toFixed(1) + " hrs</span></div>";
        html += tableBody(state, project.entries) + "</section>";
        return html;
    }

    function employeeCard(state, employee) {
        var pmPending = employee.entries.filter(function (entry) { return !entry.approved && !entry.payrollApproved; }).length;
        var html = "<section class='project-card'>";
        html += "<div class='project-card__header'><strong>" + esc(employee.resourceName) + "</strong><span>Regular " + regularHours(employee.entries).toFixed(1) + " · OT " + overtimeHours(employee.entries).toFixed(1) + " · " + pmPending + " PM pending</span></div>";
        html += tableBody(state, employee.entries) + "</section>";
        return html;
    }

    function render(state) {
        var entries = visibleEntries(state), html = weekHeader(state);
        if (!entries.length) {
            html += "<div class='empty-state'>No time entries match the current approval view.</div>";
        } else if (state.view === "payroll") {
            groupEmployees(entries).forEach(function (employee) { html += employeeCard(state, employee); });
        } else {
            groupProjects(entries).forEach(function (project) { html += projectCard(state, project); });
        }
        $("#timesheet-container").html(html);
        updateStatus(state, entries);
        bindRendered(state);
    }

    function updateStatus(state, visible) {
        var selected = global.AxialTimesheetApprovalsData.selectedEntries(state);
        $("#statusQueue").text(visible.length);
        $("#statusSelected").text(selected.length);
        $("#statusSelectedHours").text(totalHours(selected).toFixed(1));
        $("#statusApprovalUser").text(state.user ? (state.user.name || state.user.login || state.user.id) : "");
        $("#approveSelectedButton").prop("disabled", !selected.length).text(state.view === "payroll" ? "Payroll Approve" : "Approve Selected");
        $("#returnSelectedButton").prop("disabled", !selected.length || !global.AxialTimesheetApprovalsData.returnSupported(state));
    }

    function bindRendered(state) {
        $(".approval-entry-select").off("change.approvals").on("change.approvals", function () {
            state.selected[String($(this).data("entryId"))] = this.checked;
            render(state);
        });
        $(".approval-row-select").off("change.approvals").on("change.approvals", function () {
            var key = String($(this).data("rowKey")), checked = this.checked;
            var collections = state.view === "payroll" ? groupEmployees(visibleEntries(state)).map(function (employee) { return employee.entries; }) : groupProjects(visibleEntries(state)).map(function (project) { return project.entries; });
            collections.forEach(function (entries) {
                groupRows(entries).forEach(function (row) {
                    if (row.key !== key) { return; }
                    row.entries.forEach(function (entry) { if (isEligible(state, entry)) { state.selected[entry.id] = checked; } });
                });
            });
            render(state);
        });
        $(".approval-note").off("click.approvals").on("click.approvals", function () {
            var id = String($(this).data("entryId"));
            var entry = state.entries.filter(function (row) { return String(row.id) === id; })[0];
            if (!entry) { return; }
            $("#approvalNoteEmployee").text(entry.standardNote || "No employee note.");
            $("#approvalNoteInternal").text(entry.internalComment || "No internal comment.");
            $("#approvalNoteModal").modal();
        });
    }

    global.AxialTimesheetApprovalsView = {
        render: render,
        visibleEntries: visibleEntries,
        updateStatus: updateStatus
    };
}(window));
