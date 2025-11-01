
const Settings = imports.ui.settings;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Gio = imports.gi.Gio;

let settings = null;
let maximizeToWorkspace = null;

const TIMEOUT = 400;
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
        this._gsettings = new Gio.Settings({ schema: 'org.cinnamon.desktop.wm.preferences' });
    },
    _opened: function (shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        window._maximizeToWorkspaceState = STATE_OPENED;
        window._previousWorkspaceIndex = window.get_workspace().index();
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
    _getFirstEmptyWorkspace: function(window) {
        const workspaceManager = window.get_display().get_workspace_manager();
        const numberOfWorkspaces = workspaceManager.get_n_workspaces();

        for (let i = 0; i < numberOfWorkspaces; ++i) {
            const currentWorkspace = workspaceManager.get_workspace_by_index(i);
            const windowsOnCurrentWorkspace = currentWorkspace.list_windows()
                .filter(w => !w.is_always_on_all_workspaces() && window.get_monitor() === w.get_monitor());
            if (windowsOnCurrentWorkspace.length < 1) {
                return currentWorkspace;
            }
        }

        return null;
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
        let targetWorkspace = this._getFirstEmptyWorkspace(window);
        if ((targetWorkspace === null || targetWorkspace.index() === 0) && !settings.isOpenToExistWorkspace) {
            targetWorkspace = global.screen.append_new_workspace(false, currentTime);
        }

        if (targetWorkspace == null) {
            window._previousWorkspaceIndex = WORKSPACE_IS_UNDEFINED;
            return;
        }
        Mainloop.timeout_add(TIMEOUT, () => {
            logMessage(`maximized (change workspace): ${window.get_id()} [${window.get_wm_class()}]`);
            if (!window || window._maximizeToWorkspaceState !== STATE_MAXIMIZED) return;
            targetWorkspace._workspaceName = window.get_wm_class();
            this.refreshWorkspaceNames();
            window.change_workspace(targetWorkspace);
            targetWorkspace.activate_with_focus(window, currentTime);
        });
    },
    _unmaximize: function(shellwm, actor) {
        if (!actor) {
            return;
        }
        let window = actor.get_meta_window();
        if (window._previousWorkspaceIndex === WORKSPACE_IS_UNDEFINED) {
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
        Mainloop.timeout_add(TIMEOUT, () => {
            logMessage(`unmaximized (change&remove workspace): ${window.get_id()} [${window.get_wm_class()}]`);
            if (
                window._maximizeToWorkspaceState !== STATE_UNMAXIMIZED
                || window._previousWorkspaceIndex === WORKSPACE_IS_UNDEFINED
            ) {
                return;
            }
            let previousWorkspace = global.screen.get_workspace_by_index(previousWorkspaceIndex);
            window.change_workspace(previousWorkspace);
            previousWorkspace.activate_with_focus(window, currentTime);
            if (!settings.isOpenToExistWorkspace) {
                global.screen.remove_workspace(targetWorkspace, currentTime);
            }
            window._previousWorkspaceIndex = WORKSPACE_IS_UNDEFINED;
            this.refreshWorkspaceNames();
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

        Mainloop.timeout_add(TIMEOUT, () => {
            if (window._maximizeToWorkspaceState !== STATE_CLOSED) return;
            let currentTime = global.get_current_time();
            let previousWorkspace = global.screen.get_workspace_by_index(mainWorkspaceIndex);
            previousWorkspace.activate(currentTime);
            logMessage(`closed (remove workspace): ${window.get_id()} [${window.get_wm_class()}]`);

            if (!settings.isOpenToExistWorkspace) {
                global.screen.remove_workspace(currentWorkspace, currentTime);
            }
            this.refreshWorkspaceNames();
        });
    },
    _cleanupEmptyWorkspaces: function() {
        const workspaceManager = global.workspace_manager;
        for (let i = workspaceManager.n_workspaces - 1; i > 0; i--) {
            let ws = workspaceManager.get_workspace_by_index(i);
            if (ws.list_windows().filter(w => !w.is_on_all_workspaces()).length !== 0) {
                continue;
            }
            workspaceManager.remove_workspace(ws, global.get_current_time());
        }
        logMessage(`empty workspaces closed`);
    },
    refreshWorkspaceNames: function () {
        if (!settings.autoRenameWorkspaces) {
            return;
        }
        const workspaceManager = global.workspace_manager;
        const numberOfWorkspaces = workspaceManager.get_n_workspaces();

        let names = [];
        for (let i = 0; i < numberOfWorkspaces; ++i) {
            const currentWorkspace = workspaceManager.get_workspace_by_index(i);
            if (currentWorkspace._workspaceName) {
                names[i] = currentWorkspace._workspaceName;
            } else if (i === 0) {
                names[i] = 'Main';
            } else {
                names[i] = `Workspace ${i + 1}`;
            }
        }

        this._gsettings.set_strv('workspace-names', names);
    },
    enable: function() {
        logMessage("Enable");
        if (settings.autoCleanupWorkspaces) {
            Mainloop.timeout_add(2000, () => {
                this._cleanupEmptyWorkspaces();
                return false;
            });
        }
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
    },
    refresh: function () {
        this.disable();
        this.enable();
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

        this.settings.bindProperty(Settings.BindingDirection.IN, "isOpenToExistWorkspace", "isOpenToExistWorkspace", function() {
            if (!maximizeToWorkspace) {
                return;
            }
            logMessage(`setting isOpenToExistWorkspace toggled`);
            maximizeToWorkspace.refresh();
        });

        this.settings.bindProperty(Settings.BindingDirection.IN, "autoCleanupWorkspaces", "autoCleanupWorkspaces", function() {
        });

        this.settings.bindProperty(Settings.BindingDirection.IN, "autoRenameWorkspaces", "autoRenameWorkspaces", function() {
            if (!maximizeToWorkspace) {
                return;
            }
            logMessage(`setting autoRenameWorkspaces toggled`);
            maximizeToWorkspace.refresh();
            if (!this.autoRenameWorkspaces) {
                let gsettings = new Gio.Settings({ schema: 'org.cinnamon.desktop.wm.preferences' });
                gsettings.set_strv('workspace-names', []);
                return;
            }
            maximizeToWorkspace.refreshWorkspaceNames();
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
