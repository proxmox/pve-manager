Ext.define('PVE.window.Migrate', {
    extend: 'Ext.window.Window',

    resizable: false,

    migrate: function(target, online) {
	var me = this;
	var params = {
	    target: target
	};

	if (me.vmtype === 'qemu') {
	    params.online = online;
	} else {
	    params.restart = online;
	}

	PVE.Utils.API2Request({
	    params: params,
	    url: '/nodes/' + me.nodename + '/' + me.vmtype + '/' + me.vmid + "/migrate",
	    waitMsgTarget: me,
	    method: 'POST',
	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	    success: function(response, options) {
		var upid = response.result.data;

		var win = Ext.create('PVE.window.TaskViewer', { 
		    upid: upid
		});
		win.show();
		me.close();
	    }
	});
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.vmtype) {
	    throw "no VM type specified";
	}

	var running = false;
	var vmrec = PVE.data.ResourceStore.findRecord('vmid', me.vmid,
						      0, false, false, true);
	if (vmrec && vmrec.data && vmrec.data.running) {
	    running = true;
	}

	me.formPanel = Ext.create('Ext.form.Panel', {
	    bodyPadding: 10,
	    border: false,
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
	    },
	    items: [
		{
		    xtype: 'pveNodeSelector',
		    name: 'target',
		    fieldLabel: gettext('Target node'),
		    allowBlank: false,
		    disallowedNodes: [me.nodename],
		    onlineValidator: true
		},
		{
		    xtype: 'pvecheckbox',
		    name: 'online',
		    uncheckedValue: 0,
		    defaultValue: 0,
		    checked: running,
		    fieldLabel: me.vmtype === 'qemu' ? gettext('Online') : gettext('Restart Mode')
		}
	    ]
	});

	var form = me.formPanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: gettext('Migrate'),
	    handler: function() {
		var values = form.getValues();
		me.migrate(values.target, values.online);
	    }
	});

	var helpConfig;
	// fixme:
	// the onlinehelp parser needs
	// that every id is explicitely written
	// can we do this better?
	if (me.vmtype === 'qemu') {
	    helpConfig = {
		onlineHelp: 'qm_migration',
		listenToGlobalEvent: false,
		hidden: false
	    };
	} else {
	    helpConfig = {
		onlineHelp: 'pct_migration',
		listenToGlobalEvent: false,
		hidden: false
	    };
	}

	var helpBtn = Ext.create('PVE.button.Help', helpConfig);

	Ext.apply(me, {
	    title: gettext('Migrate') + ((me.vmtype === 'qemu')?' VM ':' CT ') + me.vmid,
	    width: 350,
	    modal: true,
	    layout: 'auto',
	    border: false,
	    items: [ me.formPanel ],
	    buttons: [ helpBtn, '->', submitBtn ]
	});

	me.callParent();

	me.mon(me.formPanel, 'validitychange', function(fp, isValid) {
	    submitBtn.setDisabled(!isValid);
	});

	me.formPanel.isValid();
    }
});
