Ext.define('PVE.node.CmdMenu', {
    extend: 'Ext.menu.Menu',
    xtype: 'nodeCmdMenu',

    showSeparator: false,

    items: [
	{
	    text: gettext('Create VM'),
	    itemId: 'createvm',
	    iconCls: 'fa fa-desktop',
	    handler: function() {
		var me = this.up('menu');
		var wiz = Ext.create('PVE.qemu.CreateWizard', {
		    nodename: me.nodename
		});
		wiz.show();
	    }
	},
	{
	    text: gettext('Create CT'),
	    itemId: 'createct',
	    iconCls: 'fa fa-cube',
	    handler: function() {
		var me = this.up('menu');
		var wiz = Ext.create('PVE.lxc.CreateWizard', {
		    nodename: me.nodename
		});
		wiz.show();
	    }
	},
	{ xtype: 'menuseparator' },
	{
	    text: gettext('Bulk Start'),
	    itemId: 'bulkstart',
	    iconCls: 'fa fa-fw fa-play',
	    handler: function() {
		var me = this.up('menu');
		var win = Ext.create('PVE.window.BulkAction', {
		    nodename: me.nodename,
		    title: gettext('Bulk Start'),
		    btnText: gettext('Start'),
		    action: 'startall'
		});
		win.show();
	    }
	},
	{
	    text: gettext('Bulk Stop'),
	    itemId: 'bulkstop',
	    iconCls: 'fa fa-fw fa-stop',
	    handler: function() {
		var me = this.up('menu');
		var win = Ext.create('PVE.window.BulkAction', {
		    nodename: me.nodename,
		    title: gettext('Bulk Stop'),
		    btnText: gettext('Stop'),
		    action: 'stopall'
		});
		win.show();
	    }
	},
	{
	    text: gettext('Bulk Migrate'),
	    itemId: 'bulkmigrate',
	    iconCls: 'fa fa-fw fa-send-o',
	    handler: function() {
		var me = this.up('menu');
		var win = Ext.create('PVE.window.BulkAction', {
		    nodename: me.nodename,
		    title: gettext('Bulk Migrate'),
		    btnText: gettext('Migrate'),
		    action: 'migrateall'
		});
		win.show();
	    }
	},
	{ xtype: 'menuseparator' },
	{
	    text: gettext('Shell'),
	    itemId: 'shell',
	    iconCls: 'fa fa-fw fa-terminal',
	    handler: function() {
		var me = this.up('menu');
		PVE.Utils.openDefaultConsoleWindow(true, 'shell', undefined, me.nodename, undefined);
	    }
	}
    ],

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw 'no nodename specified';
	}

	me.title = gettext('Node') + " '" + me.nodename + "'";
	me.callParent();

	var caps = Ext.state.Manager.get('GuiCap');
	// disable not allowed options
	if (!caps.vms['VM.Allocate']) {
	    me.getComponent('createct').setDisabled(true);
	    me.getComponent('createvm').setDisabled(true);
	}

	if (!caps.nodes['Sys.PowerMgmt']) {
	    me.getComponent('bulkstart').setDisabled(true);
	    me.getComponent('bulkstop').setDisabled(true);
	    me.getComponent('bulkmigrate').setDisabled(true);
	}

	if (!caps.nodes['Sys.Console']) {
	    me.getComponent('shell').setDisabled(true);
	}
    }
});
