Ext.define('PVE.button.ConsoleButton', {
    extend: 'Ext.button.Split',
    alias: 'widget.pveConsoleButton',

    consoleType: 'shell', // one of 'shell', 'kvm', 'lxc', 'upgrade', 'cmd'

    cmd: undefined,

    consoleName: undefined,

    iconCls: 'fa fa-terminal',

    enableSpice: true,
    enableXtermjs: true,

    nodename: undefined,

    vmid: 0,

    text: gettext('Console'),

    setEnableSpice: function(enable){
	var me = this;

	me.enableSpice = enable;
	me.down('#spicemenu').setDisabled(!enable);
    },

    setEnableXtermJS: function(enable){
	var me = this;

	me.enableXtermjs = enable;
	me.down('#xtermjs').setDisabled(!enable);
    },

    handler: function() {
	var me = this;
	var consoles = {
	    spice: me.enableSpice,
	    xtermjs: me.enableXtermjs,
	};
	PVE.Utils.openDefaultConsoleWindow(consoles, me.consoleType, me.vmid,
					   me.nodename, me.consoleName, me.cmd);
    },

    menu: [
	{
	    xtype:'menuitem',
	    text: 'noVNC',
	    iconCls: 'pve-itype-icon-novnc',
	    type: 'html5',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName, me.cmd);
	    },
	},
	{
	    xterm: 'menuitem',
	    itemId: 'spicemenu',
	    text: 'SPICE',
	    type: 'vv',
	    iconCls: 'pve-itype-icon-virt-viewer',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName, me.cmd);
	    },
	},
	{
	    text: 'xterm.js',
	    itemId: 'xtermjs',
	    iconCls: 'pve-itype-icon-xtermjs',
	    type: 'xtermjs',
	    handler: function(button) {
		var me = this.up('button');
		PVE.Utils.openConsoleWindow(button.type, me.consoleType, me.vmid, me.nodename, me.consoleName, me.cmd);
	    },
	},
    ],

    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.callParent();
    },
});
