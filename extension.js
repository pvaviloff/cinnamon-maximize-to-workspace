
const Settings = imports.ui.settings;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

let settings = null;
let maximizeToWorkspace = null;


function logMessage(message, alwaysLog = false) {
    if (alwaysLog || settings.enableLogs) {
        global.log(`[Maximize To Workspace] ${message}`);
    }
}

function MaximizeToWorkspace() {
    this._init();
}

MaximizeToWorkspace.prototype = {
    _init: function() {
        this._sizeChangeEventID = 0;
    },
    _handleResize: function(shellwm, actor, change) {
        logMessage("handle resize");
        if (change === Meta.SizeChange.MAXIMIZE) {
            this._maximize(shellwm, actor);
        }
        if (change === Meta.SizeChange.UNMAXIMIZE) {
            this._unmaximize(shellwm, actor);
        }
    },
    _maximize: function(shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        let workspace = window.get_workspace();
        if (
            workspace.index() !== 0
            && workspace.list_windows().filter(w => !w.is_on_all_workspaces()).length === 1
        ) {
            if (window._previousWorkspaceIndex !== undefined) {
                delete window._previousWorkspaceIndex;
            }
            return;
        }
        window._previousWorkspaceIndex = workspace.index();

        let currentTime = global.get_current_time();
        let targetWorkspace = global.screen.append_new_workspace(false, currentTime);
        Mainloop.timeout_add(500, () => {
            window.change_workspace(targetWorkspace);
            targetWorkspace.activate(currentTime);
            window.activate(currentTime);
        });

        logMessage(`maximized: ${window.title} [${window.get_wm_class()}]`);
    },
    _unmaximize: function(shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        if (window._previousWorkspaceIndex === undefined) {
            return;
        }

        let targetWorkspace = window.get_workspace();

        let previousWorkspaceIndex = 0;
        if (window._previousWorkspaceIndex !== undefined) {
            previousWorkspaceIndex = window._previousWorkspaceIndex;
            delete window._previousWorkspaceIndex;
        }

        let currentTime = global.get_current_time();

        if (targetWorkspace.list_windows().filter(w => !w.is_on_all_workspaces()).length <= 1) {
            Mainloop.timeout_add(500, () => {
                window.change_workspace_by_index(previousWorkspaceIndex, false);
                window.activate(currentTime);
                global.screen.remove_workspace(targetWorkspace, currentTime);
            });
        }

        logMessage(`unmaximized: ${window.title} [${window.get_wm_class()}] workspace #${previousWorkspaceIndex}`);
    },
    enable: function() {
        logMessage("Enable");
        this._sizeChangeEventID = global.window_manager.connect("size-change", Lang.bind(this, this._handleResize));
    },
    disable: function() {
        if (this._sizeChangeEventID) global.window_manager.disconnect(this._sizeChangeEventID);
        this._sizeChangeEventID = 0;
        logMessage("Disable");
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
    maximizeToWorkspace = new MaximizeToWorkspace();
}

function enable() {
    maximizeToWorkspace.enable();
}

function disable() {
    maximizeToWorkspace.disable();
}
