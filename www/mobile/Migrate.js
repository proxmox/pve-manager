Ext.define('PVE.MigrateBase', {
    extend: 'PVE.Page',

    nodename: undefined,
    vmid: undefined,
    vmtype: undefined, // qemu or lxc

    config: {
	items: [
	    {
		xtype: 'pveTitleBar',
		pveReloadButton: false
	    },
	    { 
		xtype: 'formpanel',
		flex: 1,
		padding: 10,
		items: [
		    {
			xtype: 'fieldset',
			items: [
			    {
				xtype: 'pveNodeSelector',
				placeHolder: gettext('Target node'),
				name: 'target',
				required: true,
			    },
			    {
				xtype: 'checkboxfield',
				name : 'online',
				checked: true,
				label: gettext('Online')
			    }
			]
		    },
		    {
			xtype: 'button',
			itemId: 'migrate',
			ui: 'action',
			text: gettext('Migrate')
		    }
		]
	    }
	]
    },

    initialize: function() {
	var me = this;

	var btn = me.down('#migrate');

	btn.setHandler(function() {
	    var form = this.up('formpanel');
	    var values = form.getValues();
	    
	    if (!values.target) {
		Ext.Msg.alert('Error', 'Please select a target node');
		return;
	    }

	    PVE.Utils.API2Request({
		params: { target: values.target, online: values.online ? 1 : 0 },
		url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid + "/migrate",
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function(response, options) {
		    var upid = response.result.data;
		    var page = 'nodes/'  + me.nodename + '/tasks/' + upid;
		    PVE.Workspace.gotoPage(page);
		}
	    });
	});
    }
});

Ext.define('PVE.QemuMigrate', {
    extend: 'PVE.MigrateBase',

    vmtype: 'qemu',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/qemu\/(\d+)\/migrate$/);
	}
    },

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];
	me.vmid = match[2];

	me.down('titlebar').setTitle(gettext('Migrate') + ': VM ' + me.vmid);

	this.callParent();
    }
});

Ext.define('PVE.LXCMigrate', {
    extend: 'PVE.MigrateBase',

    vmtype: 'lxc',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)\/lxc\/(\d+)\/migrate$/);
	}
    },

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];
	me.vmid = match[2];

	me.down('titlebar').setTitle(gettext('Migrate') + ': CT ' + me.vmid);

	this.callParent();
    }
});
