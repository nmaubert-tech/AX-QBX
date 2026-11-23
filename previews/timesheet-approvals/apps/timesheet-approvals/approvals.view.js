(function (global) {
    "use strict";

    var $ = global.jQuery;
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Presentation state persists across refreshes within the current page session.
    var collapsedEmployees = {};
    var employeeFilters = {};
    var collapsedAll = false;

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

    function employeeKey(entry) { return String(entry.resourceId || entry.resourceName || "Employee"); }
    function employeeFilterValue(key) { return employeeFilters[key] || "all"; }
    function matchesEmployeeFilter(state, entry) {
        var value = employeeFilterValue(employeeKey(entry));
        return value === "all" || (value === "needs" && isEligible(state, entry)) ||
            (value === "approved" && (entry.approved || entry.payrollApproved));
    }
    function renderedEntries(state) {
        return visibleEntries(state).filter(function (entry) { return matchesEmployeeFilter(state, entry); });
    }
    function employeeDailyHours(entries, date) {
        var key = dateKey(date);
        return totalHours(entries.filter(function (entry) { return dateKey(entry.date) === key; }));
    }
    function clearEmployeeSelection(state, key) {
        state.entries.forEach(function (entry) {
            if (employeeKey(entry) === key) { delete state.selected[entry.id]; }
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
        html += "<col class='ts-col-total'></colgroup><thead><tr>";
        var visible = renderedEntries(state), eligible = eligibleEntries(state, visible);
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
        html += "<th>Total</th></tr></thead></table>" +
            "<div class=\'approval-card-toolbar\'><button type=\'button\' id=\'approvalCollapseAll\' aria-label=\'Collapse all employee timecards\'>Collapse All</button>" +
            "<button type=\'button\' id=\'approvalExpandAll\' aria-label=\'Expand all employee timecards\'>Expand All</button>" +
            "<span>Employee filters affect the displayed time entries; daily totals show all loaded entered hours.</span></div></div>";
        return html;
    }

    function approvalStatusLabel(entry) {
        if (entry.payrollApproved && !entry.approved) {
            return {
                text: "Payroll Only",
                tooltip: "Payroll approved; PM approval is not recorded for this time entry.",
                kind: "is-payroll-only"
            };
        }
        if (entry.payrollApproved) {
            return { text: "Approved", tooltip: "Both PM and Payroll approvals are recorded.", kind: "is-approved" };
        }
        if (entry.approved) {
            return { text: "Payroll Review", tooltip: "PM approved; Payroll approval is still required.", kind: "is-payroll-review" };
        }
        return { text: "PM Review", tooltip: "PM approval has not been recorded for this time entry.", kind: "is-pm-review" };
    }

    function approvalStatusIcon(entry) {
        var status = approvalStatusLabel(entry);
        return "<span class='approval-entry-stage " + status.kind + "' title='" + esc(status.tooltip) +
            "' aria-label='" + esc(status.tooltip) + "'>" + esc(status.text) + "</span>";
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
        var primary = row.projectCode;
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
        var key = employee.key, allEntries = state.entries.filter(function (entry) {
            return employeeKey(entry) === key && (state.view !== "project" || entry.projectEligible);
        });
        var shownEntries = employee.entries;
        var collapsed = !!collapsedEmployees[key];
        var period = state.periods[state.currentIndex];
        var filter = employeeFilterValue(key);
        var html = "<section class='project-card approval-employee-card' data-employee-key='" + esc(key) +
            "' data-group-index='" + index + "'>";
        html += "<div class='approval-employee-toolbar'><button type='button' class='approval-employee-toggle' data-employee-key='" + esc(key) +
            "' aria-expanded='" + (!collapsed) + "' aria-label='" + (collapsed ? "Expand " : "Collapse ") +
            esc(employee.resourceName) + " timecard'><span aria-hidden='true'>" + (collapsed ? "&#9656;" : "&#9662;") +
            "</span></button><strong class='approval-employee-name'>" + esc(employee.resourceName) + "</strong>" +
            groupSelection(state, shownEntries, "Select eligible entries for " + employee.resourceName, "approval-group-select", index) +
            "<label class='approval-employee-filter-label'>Show <select class='approval-employee-filter' data-employee-key='" + esc(key) +
            "' aria-label='Filter entries for " + esc(employee.resourceName) + "'>" +
            "<option value='all'" + (filter === "all" ? " selected" : "") + ">All entries</option>" +
            "<option value='needs'" + (filter === "needs" ? " selected" : "") + ">Needs approval</option>" +
            "<option value='approved'" + (filter === "approved" ? " selected" : "") + ">Approved</option>" +
            "</select></label><span class='approval-employee-week-total'>Entered: " + totalHours(allEntries).toFixed(1) + " hrs</span></div>";
        html += "<div class='approval-employee-daily table-responsive'><table class='timesheet-grid approval-daily-table' aria-label='Entered hours by day for " + esc(employee.resourceName) + "'>" +
            "<colgroup><col class='ts-col-code'><col class='ts-col-task'>";
        for (var col = 0; col < 7; col++) { html += "<col class='ts-col-day'>"; }
        html += "<col class='ts-col-total'></colgroup><tbody><tr><th colspan='2' class='approval-daily-label'>Entered hours by day</th>";
        for (var i = 0; i < 7; i++) {
            var d = new Date(period.start); d.setDate(d.getDate() + i);
            html += "<td class='approval-daily-hour ts-col-day' title='" + days[i] + " entered hours'><span class='approval-daily-day'>" + days[i] +
                "</span><strong>" + employeeDailyHours(allEntries, d).toFixed(1) + "</strong></td>";
        }
        html += "<td class='approval-daily-total ts-col-total' title='Total entered hours'>" + totalHours(allEntries).toFixed(1) + "</td></tr></tbody></table></div>";
        html += "<div class='approval-employee-body'" + (collapsed ? " hidden" : "") + ">";
        if (shownEntries.length) { html += tableBody(state, shownEntries); }
        else { html += "<div class='empty-state'>No entries match this employee filter.</div>"; }
        html += "</div></section>";
        return html;
    }

    function render(state) {
        var visible = visibleEntries(state), shown = renderedEntries(state), html = weekHeader(state);
        if (!visible.length) {
            html += "<div class='empty-state'>No time entries match the current approval view.</div>";
        } else {
            // All loaded employees with entries in the current global view retain their
            // timecard even when their independent filter hides every detail row.
            groupEmployees(visible).forEach(function (employee, index) {
                employee.entries = employee.entries.filter(function (entry) { return matchesEmployeeFilter(state, entry); });
                html += employeeCard(state, employee, index);
            });
        }
        $("#timesheet-container").html(html);
        updateStatus(state, shown);
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
        $("#approvalCollapseAll").off("click.approvals").on("click.approvals", function () {
            groupEmployees(visibleEntries(state)).forEach(function (employee) {
                collapsedEmployees[employee.key] = true;
                clearEmployeeSelection(state, employee.key);
            });
            collapsedAll = true;
            render(state);
        });
        $("#approvalExpandAll").off("click.approvals").on("click.approvals", function () {
            groupEmployees(visibleEntries(state)).forEach(function (employee) { collapsedEmployees[employee.key] = false; });
            collapsedAll = false;
            render(state);
        });
        $(".approval-employee-toggle").off("click.approvals").on("click.approvals", function () {
            var key = String($(this).attr("data-employee-key"));
            collapsedEmployees[key] = !collapsedEmployees[key];
            if (collapsedEmployees[key]) { clearEmployeeSelection(state, key); }
            render(state);
        });
        $(".approval-employee-filter").off("change.approvals").on("change.approvals", function () {
            var key = String($(this).attr("data-employee-key"));
            employeeFilters[key] = this.value;
            clearEmployeeSelection(state, key);
            render(state);
        });
        $("#approvalSelectAll").off("change.approvals").on("change.approvals", function () {
            setEntriesSelected(state, renderedEntries(state), this.checked);
            render(state);
        });
        $(".approval-group-select").off("change.approvals").on("change.approvals", function () {
            var index = Number($(this).attr("data-group-index"));
            var groups = groupEmployees(visibleEntries(state));
            if (groups[index]) { setEntriesSelected(state, groups[index].entries.filter(function (entry) { return matchesEmployeeFilter(state, entry); }), this.checked); }
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
            var groups = groupEmployees(visibleEntries(state));
            if (groups[index]) {
                groupRows(groups[index].entries).forEach(function (row) {
                    if (row.key === key) { setEntriesSelected(state, row.entries.filter(function (entry) { return matchesEmployeeFilter(state, entry); }), checked); }
                });
            }
            render(state);
        });
        $(".approval-note").off("click.approvals").on("click.approvals", function () {
            var id = String($(this).data("entryId"));
            var entry = state.entries.filter(function (row) { return String(row.id) === id; })[0];
            if (!entry) { return; }
            // The stored standardNote is the client-facing comment, not an employee note.
            // The modal shell lives in Quickbase page 179, so normalize its label here.
            $("#approvalNoteModal").find("label, strong, span, div, p, small").filter(function () {
                return $(this).children().length === 0 && $(this).text().trim() === "Employee note";
            }).text("Client-facing comment");
            $("#approvalNoteEmployee").text(entry.standardNote || "No client-facing comment.");
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
