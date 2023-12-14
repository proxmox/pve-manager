// Sencha Touch related things

Proxmox.Utils.toolkit = 'touch';

Ext.Ajax.setDisableCaching(false);

// do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

Ext.Loader.injectScriptElement = (url) => console.warn(`surpressed loading ${url}`);
