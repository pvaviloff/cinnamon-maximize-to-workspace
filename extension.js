
const Settings = imports.ui.settings;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

let settings = null;
let maximizeToWorkspace = null;

const WORKSPACE_IS_UNDEFINED = -1;

const STATE_OPENED = 1;
const STATE_MAXIMIZED = 2;
const STATE_UNMAXIMIZED = 3;
const STATE_CLOSED = 4;

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
        this._openedEventID = 0;
        this._sizeChangeEventID = 0;
        this._closedEventID = 0;
    },
    _opened: function (shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        window._maximizeToWorkspaceState = STATE_OPENED;
        logMessage(`opened: ${window.get_id()} [${window.get_wm_class()}]`);
        if (window.get_maximized() !== Meta.MaximizeFlags.BOTH) return;
        this._maximize(shellwm, actor);
    },
    _handleResize: function(shellwm, actor, change) {
        logMessage("handle resize");
        if (change === Meta.SizeChange.MAXIMIZE) {
            this._maximize(shellwm, actor);
        } else if (change === Meta.SizeChange.UNMAXIMIZE) {
            this._unmaximize(shellwm, actor);
        }
    },
    _maximize: function(shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        logMessage(`maximized: ${window.get_id()} [${window.get_wm_class()}]`);
        let workspace = window.get_workspace();
        if (
            workspace.index() !== 0
            && workspace.list_windows().filter(w => !w.is_on_all_workspaces()).length === 1
        ) {
            window._previousWorkspaceIndex = WORKSPACE_IS_UNDEFINED;
            return;
        }
        window._previousWorkspaceIndex = workspace.index();
        window._maximizeToWorkspaceState = STATE_MAXIMIZED;

        let currentTime = global.get_current_time();
        let targetWorkspace = global.screen.append_new_workspace(false, currentTime);
        Mainloop.timeout_add(500, () => {
            logMessage(`maximized (change workspace): ${window.get_id()} [${window.get_wm_class()}]`);
            if (!window || window._maximizeToWorkspaceState !== STATE_MAXIMIZED) return;
            window.change_workspace(targetWorkspace);
            targetWorkspace.activate(currentTime);
        });
    },
    _unmaximize: function(shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        if (
            window._previousWorkspaceIndex === undefined
            || window._previousWorkspaceIndex === WORKSPACE_IS_UNDEFINED
        ) {
            return;
        }

        let targetWorkspace = window.get_workspace();
        let previousWorkspaceIndex = window._previousWorkspaceIndex;
        window._maximizeToWorkspaceState = STATE_UNMAXIMIZED;
        let currentTime = global.get_current_time();
        logMessage(`unmaximized: ${window.get_id()} [${window.get_wm_class()}] workspace #${previousWorkspaceIndex}`);
        if (targetWorkspace.list_windows().filter(w => !w.is_on_all_workspaces()).length > 1) {
            return;
        }
        Mainloop.timeout_add(500, () => {
            logMessage(`unmaximized (change&remove workspace): ${window.get_id()} [${window.get_wm_class()}]`);
            if (
                window._maximizeToWorkspaceState !== STATE_UNMAXIMIZED
                || window._previousWorkspaceIndex === WORKSPACE_IS_UNDEFINED
            ) {
                return;
            }
            window.change_workspace_by_index(previousWorkspaceIndex, false);
            window.activate(currentTime);
            global.screen.remove_workspace(targetWorkspace, currentTime);
            window._previousWorkspaceIndex = WORKSPACE_IS_UNDEFINED;
        });
    },
    _closed: function (shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        let currentWorkspace = window.get_workspace();
        if (currentWorkspace.index() === 0) {
            return;
        }
        if (currentWorkspace.list_windows().filter(w => !w.is_on_all_workspaces()).length !== 0) {
            return;
        }
        logMessage(`closed: ${window.get_id()} [${window.get_wm_class()}]`);
        window._previousWorkspaceIndex = WORKSPACE_IS_UNDEFINED;
        window._maximizeToWorkspaceState = STATE_CLOSED;
        let mainWorkspaceIndex = 0;

        Mainloop.timeout_add(300, () => {
            if (window._maximizeToWorkspaceState !== STATE_CLOSED) return;
            let currentTime = global.get_current_time();
            let previousWorkspace = global.screen.get_workspace_by_index(mainWorkspaceIndex);
            previousWorkspace.activate(currentTime);
            logMessage(`closed (remove workspace): ${window.get_id()} [${window.get_wm_class()}]`);
            global.screen.remove_workspace(currentWorkspace, currentTime);
        });
    },
    enable: function() {
        logMessage("Enable");
        this._openedEventID = global.window_manager.connect("map", Lang.bind(this, this._opened));
        this._sizeChangeEventID = global.window_manager.connect("size-change", Lang.bind(this, this._handleResize));
        this._closedEventID = global.window_manager.connect("destroy", Lang.bind(this, this._closed));
    },
    disable: function() {
        if (this._openedEventID) {
            global.window_manager.disconnect(this._openedEventID);
            this._openedEventID = 0;
        }
        if (this._sizeChangeEventID) {
            global.window_manager.disconnect(this._sizeChangeEventID);
            this._sizeChangeEventID = 0;
        }
        if (this._closedEventID) {
            global.window_manager.disconnect(this._closedEventID);
            this._closedEventID = 0;
        }
        logMessage("Disable");
    }
}

function SettingsMaximizeToWorkspace(uuid) {
    this._init(uuid);
}

SettingsMaximizeToWorkspace.prototype = {
    _init: function(uuid) {
        this.settings = new Settings.ExtensionSettings(this, uuid);

        this.settings.bindProperty(Settings.BindingDirection.IN, "enableLogs", "enableLogs", function() {
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
