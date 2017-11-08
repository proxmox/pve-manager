Ext.define('PVE.qemu.Smbios1InputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.Smbios1InputPanel',

    insideWizard: false,

    smbios1: {},

    onGetValues: function(values) {
	var me = this;

	var params = {
	    smbios1: PVE.Parser.printQemuSmbios1(values)
	};

	return params;
    },

    setSmbios1: function(data) {
	var me = this;

	me.smbios1 = data;
	
	me.setValues(me.smbios1);
    },

    initComponent : function() {
	var me = this;


	me.items = [
	    {
		xtype: 'textfield',
		fieldLabel: 'UUID',
		regex: /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/,
		name: 'uuid'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Manufacturer'),
		regex: /^\S+$/,
		name: 'manufacturer'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Product'),
		regex: /^\S+$/,
		name: 'product'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Version'),
		regex: /^\S+$/,
		name: 'version'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Serial'),
		regex: /^\S+$/,
		name: 'serial'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: 'SKU',
		regex: /^\S+$/,
		name: 'sku'
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Family'),
		regex: /^\S+$/,
		name: 'family'
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.Smbios1Edit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	var ipanel = Ext.create('PVE.qemu.Smbios1InputPanel', {});

	Ext.applyIf(me, {
	    subject: gettext('SMBIOS settings (type1)'),
	    width: 450,
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var i, confid;
		me.vmconfig = response.result.data;
		var value = me.vmconfig.smbios1;
		if (value) {
		    var data = PVE.Parser.parseQemuSmbios1(value);
		    if (!data) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse smbios options');
			me.close();
			return;
		    }
		    ipanel.setSmbios1(data);
		}
	    }
	});
    }
});
