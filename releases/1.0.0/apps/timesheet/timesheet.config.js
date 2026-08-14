(function (global) {
    "use strict";

    var pageConfig = global.AXIAL_PAGE_CONFIG || {};
    var environment = pageConfig.timesheetEnvironment || global.AXIAL_TIMESHEET_ENV || {};

    function requireObject(name, value) {
        if (!value || typeof value !== "object") {
            throw new Error("Missing Timesheet runtime configuration: " + name);
        }
        return value;
    }

    var tableAliases = requireObject("tableAliases", environment.tableAliases);
    var fields = requireObject("fields", environment.fields);

    requireObject("fields.tasks", fields.tasks);
    requireObject("fields.entries", fields.entries);
    requireObject("fields.resources", fields.resources);

    /*
     * VeilSun's legacy getAppIds() helper used by the proven R3 timesheet
     * expects a global `apptoken` variable. The value still originates only
     * from the Quickbase-private TimesheetPrivateConfig.js page; it is not
     * embedded in this public runtime.
     */
    global.apptoken = environment.appToken || "";

    global.AxialTimesheetConfig = {
        version: pageConfig.version || "1.0.0",
        appToken: global.apptoken,
        weekRange: environment.weekRange || { past: 4, future: 2 },
        maxDailyHours: Number(environment.maxDailyHours || 8),
        hourIncrement: Number(environment.hourIncrement || 0.25),
        overheadTypes: environment.overheadTypes || ["Overhead"],
        tableAliases: tableAliases,
        fields: fields,
        taskSortFields: environment.taskSortFields || [],
        images: environment.images || {
            standardNoteEmpty: "https://images.quickbase.com/si/16/034-doc_add.png",
            standardNoteFilled: "https://images.quickbase.com/si/16/008-doc_edit.png",
            internalNoteEmpty: "https://images.quickbase.com/si/16/081-message.png",
            internalNoteFilled: "https://images.quickbase.com/si/16/080-file_message.png"
        }
    };
}(window));
