Ext.define('PVE.qemu.StartupInputPanel', {
    extend: 'PVE.panel.InputPanel',

    onGetValues: function(values) {
	var me = this;

	var res = PVE.Parser.printStartup(values);

	if (res === undefined || res === '') {
	    return { 'delete': 'startup' };
	}

	return { startup: res };
    },

    setStartup: function(value) {
	var me = this;

	var startup = PVE.Parser.parseStartup(value);
	if (startup) {
	    me.setValues(startup);
	}
    },

    initComponent : function() {
	var me = this;

	me.items = [
	    {
		xtype: 'textfield',
		name: 'order',
		defaultValue: '',
		emptyText: 'any',
		fieldLabel: gettext('Start/Shutdown order')
	    },
	    {
		xtype: 'textfield',
		name: 'up',
		defaultValue: '',
		emptyText: 'default',
		fieldLabel: gettext('Startup delay')
	    },
	    {
		xtype: 'textfield',
		name: 'down',
		defaultValue: '',
		emptyText: 'default',
		fieldLabel: gettext('Shutdown timeout')
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.StartupEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	var ipanel = Ext.create('PVE.qemu.StartupInputPanel', {});

	Ext.applyIf(me, {
	    subject: gettext('Start/Shutdown order'),
	    fieldDefaults: {
		labelWidth: 120
	    },
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var i, confid;
		me.vmconfig = response.result.data;
		ipanel.setStartup(me.vmconfig.startup);		    
	    }
	});
    }
});
