(function (global) {
    "use strict";

    var pageConfig = global.AXIAL_PAGE_CONFIG || {};
    var timesheet = global.AXIAL_TIMESHEET_ENV || {};
    var approvals = global.AXIAL_TIMESHEET_APPROVALS_ENV || {};

    function requireObject(name, value) {
        if (!value || typeof value !== "object") { throw new Error("Missing Timesheet Approvals runtime configuration: " + name); }
        return value;
    }

    var tableAliases = requireObject("AXIAL_TIMESHEET_ENV.tableAliases", timesheet.tableAliases);
    var fields = requireObject("AXIAL_TIMESHEET_ENV.fields", timesheet.fields);
    requireObject("AXIAL_TIMESHEET_ENV.fields.entries", fields.entries);
    var lookupFields = requireObject("AXIAL_TIMESHEET_APPROVALS_ENV.entryLookups", approvals.entryLookups);

    global.AxialTimesheetApprovalsConfig = {
        version: pageConfig.version || "1.0.0",
        appToken: timesheet.appToken || "",
        tableAliases: tableAliases,
        fields: fields,
        entryLookups: lookupFields,
        payrollApproverUserIds: approvals.payrollApproverUserIds || [],
        weekRange: approvals.weekRange || { past: 8, future: 1 },
        auditFields: approvals.auditFields || {},
        allowPayrollWithoutPmApproval: approvals.allowPayrollWithoutPmApproval === true
    };
}(window));
