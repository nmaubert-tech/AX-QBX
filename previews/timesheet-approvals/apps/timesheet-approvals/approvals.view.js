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

    function eligibleEntries(state, entries) { return entries.filter(function (entry) { return isEligible(state, entry); }); }
    function setEntriesSelected(state, entries, checked) {
        eligibleEntries(state, entries).forEach(function (entry) {
            if (checked) { state.selected[entry.id] = true; }
            else { delete state.selected[entry.id]; }
        });
    }
    function groupSelection(state, entries, label, className, groupIndex) {
        var eligible = eligibleEntries(state, entries);
        if (!eligible.length) { return ""; }
        var selected = eligible.filter(function (entry) { return !!state.selected[entry.id]; }).length;
        return "<label class='approval-select-group' title='Select eligible entries in this group'>" +
            "<input type='checkbox' class='" + className + "' data-group-index='" + groupIndex + "'" +
            (selected === eligible.length ? " checked" : "") +
            " aria-label='" + esc(label) + "'><span>" + selected + "/" + eligible.length + " selected</span></label>";
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
        html += "<col class='ts-col-total'></colgroup><thead><tr>";
        var visible = visibleEntries(state), eligible = eligibleEntries(state, visible);
        var selected = eligible.filter(function (entry) { return !!state.selected[entry.id]; }).length;
        html += "<th class='ts-col-code'><label class='approval-select-all-label' title='Select all eligible visible entries'>" +
            "<input id='approvalSelectAll' type='checkbox' aria-label='Select all eligible visible time entries'" +
            (eligible.length && selected === eligible.length ? " checked" : "") +
            (!eligible.length ? " disabled" : "") + "><span>All</span></label></th><th class='ts-col-task'>" + (state.view === "payroll" ? "Project / Task" : "Employee / Task") + "</th>";
        for (var i = 0; i < 7; i++) {
            var d = new Date(p.start); d.setDate(d.getDate() + i);
            var classes = (i === 0 || i === 6) ? " weekend-col" : "";
            var today = new Date(); today.setHours(0, 0, 0, 0);
            if (d.getTime() === today.getTime()) { classes += " today-col"; }
            html += "<th class='day-col" + classes + "'><small>" + days[i] + "</small><b>" + d.getDate() + "</b></th>";
        }
        html += "<th>Total</th></tr></thead></table></div>";
        return html;
    }

    function approvalStatusIcon(entry) {
        var status = entry.payrollApproved ? "Payroll approved" : (entry.approved ? "PM approved" : "Pending");
        var kind = entry.payrollApproved ? "is-payroll" : (entry.approved ? "is-pm" : "is-pending");
        // Semantic icon only: the tooltip/ARIA label carry the complete status.
        var glyph = entry.payrollApproved
            ? "<path d='M4 12l5 5L20 6'></path><path d='M4 18l3 3L20 8'></path>"
            : (entry.approved
                ? "<path d='M4 12l5 5L20 6'></path>"
                : "<circle cx='12' cy='12' r='9'></circle><path d='M12 7v5l3 2'></path>");
        return "<span class='approval-entry-status-icon " + kind + "' role='img' title='" + status +
            "' aria-label='" + status + "'><svg viewBox='0 0 24 24' width='16' height='16' fill='none' " +
            "stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' " +
            "aria-hidden='true'>" + glyph + "</svg></span>";
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
            html += "<div class='approval-entry-block'>";
            html += "<div class='approval-entry-hours'>";
            if (entry.standardHours) { html += "<div class='approval-regular-hours'><strong>" + entry.standardHours.toFixed(1) + "</strong><span class='sr-only'> regular hours</span></div>"; }
            if (entry.overtimeHours) { html += "<div class='approval-overtime-hours'><span>OT</span><strong>" + entry.overtimeHours.toFixed(1) + "</strong></div>"; }
            html += "</div><div class='approval-entry-actions'>";
            if (eligible) {
                html += "<input class='approval-entry-select' type='checkbox' data-entry-id='" + esc(entry.id) +
                    "' aria-label='Select time entry " + esc(entry.id) + "'" + (state.selected[entry.id] ? " checked" : "") + ">";
            }
            if (entry.standardNote || entry.internalComment) {
                var noteIcon = entry.standardNote ? "https://images.quickbase.com/si/16/008-doc_edit.png" : "https://images.quickbase.com/si/16/080-file_message.png";
                html += "<button type='button' class='note-btn has-note approval-note' data-entry-id='" + esc(entry.id) +
                    "' title='View time entry notes' aria-label='View time entry notes'><img src='" + noteIcon + "' alt=''></button>";
            }
            html += approvalStatusIcon(entry) + "</div></div>";
        });
        html += "</td>";
        return html;
    }

    function rowHtml(state, row) {
        var p = state.periods[state.currentIndex], eligible = row.entries.filter(function (entry) { return isEligible(state, entry); });
        var selectedAll = eligible.length && eligible.every(function (entry) { return !!state.selected[entry.id]; });
        var primary = state.view === "payroll" ? row.projectCode : row.resourceName;
        var secondary = row.taskName;
        var html = "<tr data-row-key='" + esc(row.key) + "'><td class='ts-col-code'>";
        if (eligible.length) { html += "<input class='approval-row-select' type='checkbox' data-row-key='" + esc(row.key) + "' " + (selectedAll ? "checked" : "") + ">"; }
        html += "</td><td class='ts-col-task'><div class='task-name'>" + esc(primary) + "</div><div class='project-description'>" + esc(secondary) + "</div></td>";
        for (var i = 0; i < 7; i++) { var d = new Date(p.start); d.setDate(d.getDate() + i); html += dayCell(state, row, d, i); }
        html += "<td class='task-total'>" + totalHours(row.entries).toFixed(1) + "</td></tr>";
        return html;
    }

    function tableBody(state, entries) {
        var rows = groupRows(entries), html = "<div class='table-responsive'><table class='timesheet-grid'><colgroup><col class='ts-col-code'><col class='ts-col-task'>";
        for (var c = 0; c < 7; c++) { html += "<col class='ts-col-day'>"; }
        html += "<col class='ts-col-total'></colgroup><tbody>";
        rows.forEach(function (row) { html += rowHtml(state, row); });
        html += "</tbody></table></div>";
        return html;
    }

    function projectCard(state, project, index) {
        var html = "<section class='project-card' data-group-index='" + index + "'>";
        html += "<div class='project-card__header approval-card-header'><div class='approval-card-identity'>" +
            groupSelection(state, project.entries, "Select eligible entries for project " + project.code, "approval-group-select", index) +
            "<strong>" + esc(project.code) + "</strong></div><span class='approval-group-summary'>" +
            esc(project.description) + " · " + totalHours(project.entries).toFixed(1) + " hrs</span></div>";
        html += tableBody(state, project.entries) + "</section>";
        return html;
    }

    function employeeCard(state, employee, index) {
        var pmPending = employee.entries.filter(function (entry) { return !entry.approved && !entry.payrollApproved; }).length;
        var html = "<section class='project-card' data-group-index='" + index + "'>";
        html += "<div class='project-card__header approval-card-header'><div class='approval-card-identity'>" +
            groupSelection(state, employee.entries, "Select eligible time for " + employee.resourceName, "approval-group-select", index) +
            "<strong>" + esc(employee.resourceName) + "</strong></div><span class='approval-group-summary'>Regular " +
            regularHours(employee.entries).toFixed(1) + " · OT " + overtimeHours(employee.entries).toFixed(1) +
            " · " + pmPending + " PM pending</span></div>";
        html += tableBody(state, employee.entries) + "</section>";
        return html;
    }

    function render(state) {
        var entries = visibleEntries(state), html = weekHeader(state);
        if (!entries.length) {
            html += "<div class='empty-state'>No time entries match the current approval view.</div>";
        } else if (state.view === "payroll") {
            groupEmployees(entries).forEach(function (employee, index) { html += employeeCard(state, employee, index); });
        } else {
            groupProjects(entries).forEach(function (project, index) { html += projectCard(state, project, index); });
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
        $("#approvalSelectAll").off("change.approvals").on("change.approvals", function () {
            setEntriesSelected(state, visibleEntries(state), this.checked);
            render(state);
        });
        $(".approval-group-select").off("change.approvals").on("change.approvals", function () {
            var index = Number($(this).attr("data-group-index"));
            var groups = state.view === "payroll" ? groupEmployees(visibleEntries(state)) : groupProjects(visibleEntries(state));
            if (groups[index]) { setEntriesSelected(state, groups[index].entries, this.checked); }
            render(state);
        });
        $(".approval-entry-select").off("change.approvals").on("change.approvals", function () {
            var id = String($(this).attr("data-entry-id"));
            if (this.checked) { state.selected[id] = true; } else { delete state.selected[id]; }
            render(state);
        });
        $(".approval-row-select").off("change.approvals").on("change.approvals", function () {
            var key = String($(this).attr("data-row-key")), checked = this.checked;
            var index = Number($(this).closest(".project-card").attr("data-group-index"));
            var groups = state.view === "payroll" ? groupEmployees(visibleEntries(state)) : groupProjects(visibleEntries(state));
            if (groups[index]) {
                groupRows(groups[index].entries).forEach(function (row) {
                    if (row.key === key) { setEntriesSelected(state, row.entries, checked); }
                });
            }
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
