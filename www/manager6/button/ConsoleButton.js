Ext.define('PVE.button.ConsoleButton', {
    extend: 'Ext.button.Split',
    alias: 'widget.pveConsoleButton',

    consoleType: 'shell', // one of 'shell', 'kvm', 'lxc', 'upgrade'

    consoleName: undefined,

    iconCls: 'fa fa-terminal',

    enableSpice: true,

    nodename: undefined,

    vmid: 0,

    text: gettext('Console'),

    setEnableSpice: function(enable){
	var me = this;

	me.enableSpice = enable;
	me.down('#spicemenu').setDisabled(!enable);
    },

    handler: function() {
	var me = this;
	PVE.Utils.openDefaultConsoleWindow(me.enableSpice, me.consoleType, me.vmid,
					   me.nodename, me.consoleName);
    },

    menu: [
	{
	    xtype:'menuitem',
	    text: 'noVNC',
	    iconCls: 'pve-itype-icon-novnc',
	    type: 'html5',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	},
	{
	    xterm: 'menuitem',
	    itemId: 'spicemenu',
	    text: 'SPICE',
	    type: 'vv',
	    iconCls: 'pve-itype-icon-virt-viewer',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	},
	{
	    text: 'xterm.js',
	    itemId: 'xtermjs',
	    iconCls: 'pve-itype-icon-xtermjs',
	    type: 'xtermjs',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName);
	    }
	}
    ],

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.callParent();
    }
});
