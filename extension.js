
const Settings = imports.ui.settings;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;

let settings = null;
let sizeChangeEventID = 0;


function logMessage(message, alwaysLog = false) {
    if (alwaysLog || settings.enableLogs) {
        global.log(`[Maximize To Workspace] ${message}`);
    }
}

function unmaximize(shellwm, actor) {
    if (!actor) {
        return;
    }
    let win = actor.get_meta_window();
    let targetWs = win.get_workspace();

    let previousWsIndex = 0;
    if (win._previousWorkspaceIndex !== undefined) {
        previousWsIndex = win._previousWorkspaceIndex;
        delete win._previousWorkspaceIndex;
    }

    let currentTime = global.get_current_time();

    if (targetWs.list_windows().filter(w => !w.is_on_all_workspaces()).length <= 1) {
        Mainloop.timeout_add(500, () => {
            win.change_workspace_by_index(previousWsIndex, false);
            win.activate(currentTime);
            global.screen.remove_workspace(targetWs, currentTime);
        });
    }

    logMessage(`unmaximize: ${win.title} [${win.get_wm_class()}]`);

}

function maximize(shellwm, actor) {
    if (!actor) {
        return;
    }
    let win = actor.get_meta_window();
    win._previousWorkspaceIndex = win.get_workspace().index();

    let currentTime = global.get_current_time();
    let targetWs = global.screen.append_new_workspace(false, currentTime);
    Mainloop.timeout_add(500, () => {
        win.change_workspace(targetWs);
        targetWs.activate(currentTime);
        win.activate(currentTime);
    });

    logMessage(`maximize: ${win.title} [${win.get_wm_class()}]`);
}

function handleResize(shellwm, actor, change) {
    if (change === Meta.SizeChange.MAXIMIZE) {
        maximize(shellwm, actor);
    }
    if (change === Meta.SizeChange.UNMAXIMIZE) {
        unmaximize(shellwm, actor);
    }
}

function SettingsMaximizeToWorkspace(uuid) {
    this._init(uuid);
}

SettingsMaximizeToWorkspace.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);

        this.settings.bindProperty(Settings.BindingDirection.IN, "enableLogs", "enableLogs", function(){
        });
    }
}

function init(metadata) {
    settings = new SettingsMaximizeToWorkspace(metadata.uuid);
}

function enable() {
    logMessage("Enable");
    sizeChangeEventID = global.window_manager.connect("size-change", handleResize);
}

function disable() {
    if (sizeChangeEventID) global.window_manager.disconnect(sizeChangeEventID);
    sizeChangeEventID = 0;
    logMessage("Disable");
}
