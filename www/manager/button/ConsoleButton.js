Ext.define('PVE.button.ConsoleButton', {
    extend: 'Ext.button.Split',
    alias: 'widget.pveConsoleButton',

    consoleType: 'shell', // one of 'shell', 'kvm', 'openvz', 'upgrade'

    consoleName: undefined,

    enableSpice: true,

    nodename: undefined,

    vmid: 0,

    setEnableSpice: function(enable){
	var me = this;

	me.enableSpice = enable;
	me.spiceMenu.setDisabled(!enable);
    },

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.spiceMenu = Ext.create('Ext.menu.Item', {
	    text: 'SPICE',
	    iconCls: 'pve-itype-icon-virt-viewer',
	    handler: function() { 
		PVE.Utils.openConsoleWindow('vv', me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	});

	var vncMenu = Ext.create('Ext.menu.Item', {
	    text: 'VNC',
	    iconCls: 'pve-itype-icon-tigervnc',
	    handler: function() { 
		PVE.Utils.openConsoleWindow('applet', me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	});

	var noVncMenu = Ext.create('Ext.menu.Item', {
	    text: 'noVNC',
	    iconCls: 'pve-itype-icon-novnc',
	    handler: function() { 
		PVE.Utils.openConsoleWindow('html5', me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	});

	Ext.applyIf(me, { text: gettext('Console') });

	Ext.apply(me, {
	    handler: function() {
		PVE.Utils.openDefaultConsoleWindow(me.enableSpice, me.consoleType, me.vmid, 
						   me.nodename, me.consoleName);
	    },
	    menu: new Ext.menu.Menu({
		items: [ noVncMenu, vncMenu, me.spiceMenu ]
	    })
	});

	me.callParent();
    }
});
