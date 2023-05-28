// Sencha Touch related things

Proxmox.Utils.toolkit = 'touch';

Ext.Ajax.setDisableCaching(false);

// do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

Ext.MessageBox = Ext.Msg = {
    alert: (title, message) => console.warn(title, message),
    show: ({ title, message }) => console.warn(title, message),
};

Ext.Loader.injectScriptElement = (url) => console.warn(`surpressed loading ${url}`);
